/**
 * `record` — the only write path the tape should have.
 *
 * Today the browser inserts `swaps`, `lp_events` and `detector_samples` rows directly with the
 * public anon key, so anyone holding that key (it ships in the bundle) can write a row for a
 * trade that never happened and move every aggregate the site shows, the landing page's
 * "Kept for LPs" headline included. This function takes the write path server-side and makes
 * each row prove itself against the chain before it is stored:
 *
 *  - swap / lp: the transaction must exist, have succeeded, have been sent by the wallet the
 *    row names, and carry a log from an allowed hook. Token legs are re-read from the
 *    receipt's ERC-20 Transfer logs, so the stored amounts are the chain's, not the caller's.
 *    The spread figures come from the hook's own DetectorSample log in the same receipt, and
 *    the LVR estimate is capped by what that spread could have charged.
 *  - samples: the caller sends only a block range; the function reads the DetectorSample logs
 *    for that range itself. A caller cannot supply a sample, only ask for a sync.
 *
 * Once this is deployed and the client calls it (see migration_007), the anon INSERT policies
 * are dropped and the tables become read-only to the public.
 *
 * Deploy:
 *   supabase functions deploy record --no-verify-jwt
 *   supabase secrets set RECORD_ALLOWED_HOOKS=0x89a520e7faed35cb6f89b0040f5bc5ade035aa88
 *   supabase secrets set RECORD_USDC=0x1b4034d6c443eff3d2e9051a08147ef9ed8ebc70 RECORD_WETH=0x26b5d554c8118f247d5fa8a469ff3a3d3084a449
 *     # optional: RECORD_RPC_URL=https://<dedicated provider>,https://sepolia.unichain.org
 *     #   (comma-separated, tried in turn; defaults to the public Unichain Sepolia RPC alone)
 *     # optional: RECORD_ALLOWED_ORIGINS=https://www.poincaretrade.in,https://poincaretrade.in,https://poincare-beta.vercel.app
 *     #   (the site's own domain, its apex, and the project's Vercel domain; poincare.vercel.app belongs to someone else)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { decodeEventLog, parseAbiItem, type Hex } from "https://esm.sh/viem@2.21.19";

// One or more RPC URLs, comma-separated, tried in turn: put a dedicated provider first and the
// public endpoint after it, so an outage of either one only slows recording down.
const PUBLIC_RPC = "https://sepolia.unichain.org";
const RPCS = (Deno.env.get("RECORD_RPC_URL") ?? PUBLIC_RPC).split(",").map((s) => s.trim()).filter(Boolean);
if (RPCS.length === 0) RPCS.push(PUBLIC_RPC);
const HOOKS = new Set((Deno.env.get("RECORD_ALLOWED_HOOKS") ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean));
const USDC = (Deno.env.get("RECORD_USDC") ?? "").toLowerCase();
const WETH = (Deno.env.get("RECORD_WETH") ?? "").toLowerCase();
const ORIGINS = (Deno.env.get("RECORD_ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** Largest block range one `samples` call may scan (the public RPC caps getLogs near here). */
const MAX_RANGE = 1000n;

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const DETECTOR_SAMPLE = parseAbiItem(
  "event DetectorSample(uint256 blockNumber, uint256 priceWad, int256 r, int256 sPos, int256 sNeg, uint256 dWad, uint256 sigmaWad, uint256 kappaWad, uint8 trend, uint256 feeWad)",
);
// Cusum.Trend runs on the hook's internal price, the inverse of the USDC-per-WETH price the UI
// charts, so the hook's Up is a falling chart: the same inversion the frontend applies.
const TREND_UI = ["none", "down", "up"] as const;

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false },
});

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  // With no allow-list configured the function answers any origin, which is what the anon key
  // already permits today; setting RECORD_ALLOWED_ORIGINS narrows it to the real site.
  const allow = ORIGINS.length === 0 ? "*" : ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

const isHash = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
const isAddr = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const wad = (v: bigint) => Number(v) / 1e18;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One JSON-RPC call with a timeout and exponential backoff, rotating through RECORD_RPC_URL.
 * The public RPC is load-balanced and a replica can lag a fresh block, so "null" for a receipt
 * is retried, not believed.
 */
async function rpc<T>(method: string, params: unknown[], wantNonNull = false): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(RPCS[attempt % RPCS.length], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.json();
      if (body.error) throw new Error(`${method}: ${body.error.message ?? "rpc error"}`);
      if (wantNonNull && body.result == null) throw new Error(`${method}: not found yet`);
      return body.result as T;
    } catch (e) {
      last = e;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw last instanceof Error ? last : new Error(`${method} failed`);
}

type RpcLog = { address: string; topics: Hex[]; data: Hex; blockNumber: Hex };
type Receipt = { status: Hex; from: string; blockNumber: Hex; logs: RpcLog[] };

/** The receipt, its sender and block time, provided the tx succeeded and touched an allowed hook. */
async function verifiedReceipt(hash: Hex) {
  const r = await rpc<Receipt>("eth_getTransactionReceipt", [hash], true);
  if (r.status !== "0x1") throw new Error("transaction reverted");
  const hookLog = r.logs.find((l) => HOOKS.has(l.address.toLowerCase()));
  if (!hookLog) throw new Error("transaction did not touch this pool");
  const block = await rpc<{ timestamp: Hex }>("eth_getBlockByNumber", [r.blockNumber, false], true);
  return {
    receipt: r,
    hook: hookLog.address.toLowerCase(),
    from: r.from.toLowerCase(),
    blockNumber: Number(BigInt(r.blockNumber)),
    ts: new Date(Number(BigInt(block.timestamp)) * 1000).toISOString(),
  };
}

/** Net token legs for `wallet` in this receipt, from ERC-20 Transfer logs (18-decimal tokens). */
function legs(logs: RpcLog[], wallet: string) {
  const out = { usdcIn: 0, usdcOut: 0, wethIn: 0, wethOut: 0 };
  for (const log of logs) {
    const token = log.address.toLowerCase();
    if (token !== USDC && token !== WETH) continue;
    let ev;
    try { ev = decodeEventLog({ abi: [TRANSFER], data: log.data, topics: log.topics as [Hex, ...Hex[]] }); } catch { continue; }
    const v = wad(ev.args.value as bigint);
    const from = (ev.args.from as string).toLowerCase(), to = (ev.args.to as string).toLowerCase();
    if (token === USDC) { if (from === wallet) out.usdcIn += v; if (to === wallet) out.usdcOut += v; }
    else { if (from === wallet) out.wethIn += v; if (to === wallet) out.wethOut += v; }
  }
  return out;
}

function sampleIn(logs: RpcLog[], hook: string) {
  for (const log of logs) {
    if (log.address.toLowerCase() !== hook) continue;
    try { return decodeEventLog({ abi: [DETECTOR_SAMPLE], data: log.data, topics: log.topics as [Hex, ...Hex[]] }).args; } catch { /* other hook events */ }
  }
  return null;
}

async function recordSwap(hash: Hex) {
  const v = await verifiedReceipt(hash);
  const l = legs(v.receipt.logs, v.from);
  const zeroForOne = l.usdcIn > 0 && l.wethOut > 0;
  const oneForZero = l.wethIn > 0 && l.usdcOut > 0;
  if (zeroForOne === oneForZero) throw new Error("not a single USDC/WETH swap by the sender");

  const amountIn = zeroForOne ? l.usdcIn : l.wethIn;
  const amountOut = zeroForOne ? l.wethOut : l.usdcOut;
  const notional = zeroForOne ? amountIn : amountOut;
  const price = zeroForOne ? amountIn / amountOut : amountOut / amountIn;

  const s = sampleIn(v.receipt.logs, v.hook);
  const kappa = s ? wad(s.kappaWad as bigint) : 0;
  const trend = s ? TREND_UI[Number(s.trend)] ?? "none" : "none";
  // with-trend in UI terms: buying WETH pushes the chart up, selling pushes it down
  const withTrend = kappa > 0 && ((zeroForOne && trend === "up") || (!zeroForOne && trend === "down"));
  const spread = withTrend ? kappa : 0;
  // what the spread charged on this trade's size: the upper bound of the LVR it kept for LPs
  const lvr = spread > 0 ? notional * spread : 0;

  const { error } = await admin.from("swaps").insert({
    tx_hash: hash.toLowerCase(), block_number: v.blockNumber, ts: v.ts, trader: v.from, hook: v.hook,
    zero_for_one: zeroForOne, side: zeroForOne ? "buy_weth" : "sell_weth",
    amount_in: amountIn, amount_out: amountOut, price, notional_usdc: notional,
    kappa, trend, spread_frac: spread, with_trend: withTrend, lvr_captured_usdc: lvr,
  });
  if (error && error.code !== "23505") throw new Error(`store: ${error.message}`);
  return { stored: !error, duplicate: error?.code === "23505" };
}

async function recordLp(hash: Hex, kind: unknown, shares: unknown) {
  if (kind !== "add" && kind !== "remove") throw new Error("bad kind");
  const v = await verifiedReceipt(hash);
  const l = legs(v.receipt.logs, v.from);
  const amount0 = kind === "add" ? l.usdcIn : l.usdcOut;
  const amount1 = kind === "add" ? l.wethIn : l.wethOut;
  if (amount0 <= 0 && amount1 <= 0) throw new Error("no liquidity legs for the sender");
  // LP shares are the hook's own ERC-20; take the caller's figure only when it is a sane number
  const sh = typeof shares === "number" && Number.isFinite(shares) && shares >= 0 && shares < 1e15 ? shares : 0;
  const s = sampleIn(v.receipt.logs, v.hook);
  const price = s ? 1 / Math.max(1e-18, wad(s.priceWad as bigint)) : 0;

  const { error } = await admin.from("lp_events").insert({
    tx_hash: hash.toLowerCase(), ts: v.ts, wallet: v.from, hook: v.hook, kind,
    shares: sh, amount0, amount1, value_usdc: price > 0 ? amount0 + amount1 * price : amount0,
  });
  if (error && error.code !== "23505") throw new Error(`store: ${error.message}`);
  return { stored: !error, duplicate: error?.code === "23505" };
}

async function syncSamples(hook: unknown, fromBlock: unknown, toBlock: unknown) {
  if (!isAddr(hook) || !HOOKS.has(hook.toLowerCase())) throw new Error("hook not allowed");
  const from = BigInt(Number(fromBlock)), to = BigInt(Number(toBlock));
  if (from <= 0n || to < from || to - from >= MAX_RANGE) throw new Error("bad range");
  const logs = await rpc<RpcLog[]>("eth_getLogs", [{
    address: hook, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`,
  }]);
  const rows = [];
  for (const log of logs) {
    let a;
    try { a = decodeEventLog({ abi: [DETECTOR_SAMPLE], data: log.data, topics: log.topics as [Hex, ...Hex[]] }).args; } catch { continue; }
    const ph = wad(a.priceWad as bigint);
    rows.push({
      hook: hook.toLowerCase(), block_number: Number(a.blockNumber), price: ph > 0 ? 1 / ph : 0,
      r: wad(a.r as bigint), s_pos: wad(a.sPos as bigint), s_neg: wad(a.sNeg as bigint), d: wad(a.dWad as bigint),
      sigma: wad(a.sigmaWad as bigint), kappa: wad(a.kappaWad as bigint), trend: TREND_UI[Number(a.trend)] ?? "none",
      fee: wad(a.feeWad as bigint),
    });
  }
  if (rows.length) {
    const { error } = await admin.from("detector_samples").upsert(rows, { onConflict: "hook,block_number", ignoreDuplicates: true });
    if (error) throw new Error(`store: ${error.message}`);
  }
  return { stored: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);
  if (HOOKS.size === 0 || !USDC || !WETH) return json(req, { error: "not configured" }, 503);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: "invalid json" }, 400); }

  try {
    switch (body.kind) {
      case "swap":
        if (!isHash(body.tx_hash)) return json(req, { error: "bad tx_hash" }, 400);
        return json(req, await recordSwap(body.tx_hash));
      case "lp":
        if (!isHash(body.tx_hash)) return json(req, { error: "bad tx_hash" }, 400);
        return json(req, await recordLp(body.tx_hash, body.lp_kind, body.shares));
      case "samples":
        return json(req, await syncSamples(body.hook, body.from_block, body.to_block));
      default:
        return json(req, { error: "unknown kind" }, 400);
    }
  } catch (e) {
    // a verification failure is the caller's problem (422); everything else is ours (502)
    const msg = e instanceof Error ? e.message : String(e);
    const verify = /reverted|did not touch|not a single|no liquidity|not allowed|bad /.test(msg);
    return json(req, { error: msg.slice(0, 160) }, verify ? 422 : 502);
  }
});
