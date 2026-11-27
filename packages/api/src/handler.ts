import {
  DCA_STATUS_TEXT,
  DcaNotDeployedError,
  DcaParamError,
  DEFAULT_SWAP_SLIPPAGE_BPS,
  MAX_SWAP_SLIPPAGE_BPS,
  SwapParamError,
  LpParamError,
  type DcaEditInput,
  type DcaOrder,
  type DcaOrderInput,
  type PoincareClient,
  type Side,
  buildEditParams,
  buildEditTx,
  buildOrderParams,
  minPriceWadToLimit,
  planSliceQuoted,
  progressOf,
  spentOf,
  trendOnsets,
  wadToBpsUp,
} from "@poincaretrade/sdk";
import { getAddress, isAddress, type Address } from "viem";
import { HttpError, json } from "./json.js";

/**
 * The Poincaré HTTP API. Stateless: every answer is read from the chain at request time, and
 * every write is returned as an unsigned transaction for the caller's own wallet to sign. The
 * API never holds keys or funds.
 *
 *   GET  /health
 *   GET  /regime                         current regime + plain-English summary
 *   GET  /regime/history?blocks=3000     DetectorSample trace + trend onsets
 *   GET  /quote?side=buy&amount=100      exact-input quote (Lens)
 *   GET  /swap/build?owner=0x..&side=sell&amount=2[&slippageBps=50][&recipient=0x..]
 *                                        unsigned exact approve (if needed) + router swap
 *   GET  /lp/position?owner=0x..         LP shares, pool share and what they redeem for
 *   GET  /lp/add/build?owner=0x..&usdc=100 (or &weth=0.05)[&slippageBps=50]   unsigned deposit
 *   GET  /lp/remove/build?owner=0x..&percent=50 (or &shares=..)[&slippageBps=50] unsigned withdrawal
 *   GET  /dca/orders?owner=0x..          an address's orders with next-fill status
 *   GET  /dca/orders/:id                 one order + the contract's verdict on its next fill
 *   POST /dca/plan                       validate an order and preview its first fill
 *   POST /dca/tx/create                  unsigned approve + createOrder ({ owner, ...order })
 *   POST /dca/tx/execute|cancel|close-expired   unsigned tx ({ id })
 *   POST /dca/tx/pause|resume            unsigned tx ({ id }); 409 if already in that state
 *   POST /dca/tx/edit                    unsigned editOrder ({ id, slices?, intervalSec?, ... })
 */
export function createApiHandler(opts: { poincare: PoincareClient; now?: () => number; basePath?: string }) {
  const { poincare } = opts;
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const base = opts.basePath ?? "/poincare-api";

  const routes: Array<[method: string, pattern: RegExp, run: (m: RegExpMatchArray, url: URL, body: any) => Promise<unknown>]> = [
    ["GET", /^\/?$/, async () => ({ name: "poincare-api", docs: "GET /regime, /regime/history, /quote, /swap/build, /lp/position, /lp/add/build, /lp/remove/build, /dca/orders; POST /dca/plan, /dca/tx/*" })],
    ["GET", /^\/health$/, async () => {
      const block = await poincare.publicClient.getBlockNumber();
      return { ok: true, chainId: poincare.deployment.chainId, block, dca: poincare.deployment.dca ?? null };
    }],
    ["GET", /^\/regime$/, async () => {
      const r = await poincare.regime();
      return { summary: summarize(r), regime: r };
    }],
    ["GET", /^\/regime\/history$/, async (_m, url) => {
      const blocks = intParam(url, "blocks", 3000, 100, 20_000);
      const head = await poincare.publicClient.getBlockNumber();
      const from = head > BigInt(blocks) ? head - BigInt(blocks) : 0n;
      const samples = await poincare.history(from, head);
      return { fromBlock: from, toBlock: head, sampleCount: samples.length, onsets: trendOnsets(samples), samples };
    }],
    ["GET", /^\/quote$/, async (_m, url) => {
      const side = sideParam(url.searchParams.get("side"));
      const amount = amountParam(url.searchParams.get("amount"));
      return poincare.quote(side, amount);
    }],
    ["GET", /^\/swap\/build$/, async (_m, url) => {
      const owner = addressParam(url.searchParams.get("owner"), "owner");
      const side = sideParam(url.searchParams.get("side"));
      const amount = amountParam(url.searchParams.get("amount"));
      const slippageBps = url.searchParams.has("slippageBps") ? intParam(url, "slippageBps", DEFAULT_SWAP_SLIPPAGE_BPS, 0, MAX_SWAP_SLIPPAGE_BPS) : undefined;
      const r = url.searchParams.get("recipient");
      const recipient = r === null ? undefined : addressParam(r, "recipient");
      return poincare.swap.plan(owner, side, amount, { slippageBps, recipient, now: now() });
    }],
    ["GET", /^\/lp\/position$/, async (_m, url) => poincare.lp.position(addressParam(url.searchParams.get("owner"), "owner"))],
    ["GET", /^\/lp\/add\/build$/, async (_m, url) => {
      const owner = addressParam(url.searchParams.get("owner"), "owner");
      const u = url.searchParams.get("usdc"), w = url.searchParams.get("weth");
      const slippageBps = url.searchParams.has("slippageBps") ? intParam(url, "slippageBps", DEFAULT_SWAP_SLIPPAGE_BPS, 0, MAX_SWAP_SLIPPAGE_BPS) : undefined;
      return poincare.lp.planAdd(owner, { usdc: u === null ? undefined : amountParam(u), weth: w === null ? undefined : amountParam(w) }, { slippageBps, now: now() });
    }],
    ["GET", /^\/lp\/remove\/build$/, async (_m, url) => {
      const owner = addressParam(url.searchParams.get("owner"), "owner");
      const pct = url.searchParams.get("percent"), sh = url.searchParams.get("shares");
      if (pct !== null && !(DECIMAL.test(pct) && Number(pct) > 0 && Number(pct) <= 100)) throw new HttpError(400, "percent must be in (0, 100]");
      if (sh !== null && !/^\d+$/.test(sh)) throw new HttpError(400, "shares must be a whole number of base units");
      const slippageBps = url.searchParams.has("slippageBps") ? intParam(url, "slippageBps", DEFAULT_SWAP_SLIPPAGE_BPS, 0, MAX_SWAP_SLIPPAGE_BPS) : undefined;
      return poincare.lp.planRemove(owner, { percent: pct === null ? undefined : Number(pct), shares: sh === null ? undefined : BigInt(sh) }, { slippageBps, now: now() });
    }],
    ["GET", /^\/dca\/orders$/, async (_m, url) => {
      const owner = addressParam(url.searchParams.get("owner"), "owner");
      const orders = await poincare.dca.ordersOf(owner);
      const views = await Promise.all(orders.slice(-100).map(async (o) => ({ ...view(o), nextFill: (await poincare.dca.preview(o.id)).status })));
      return { owner, count: orders.length, orders: views };
    }],
    ["GET", /^\/dca\/orders\/(\d+)$/, async (m) => {
      const id = BigInt(m[1]);
      const o = await poincare.dca.order(id);
      if (!o) throw new HttpError(404, `no DCA order #${id}`);
      const next = await poincare.dca.preview(id);
      return { order: view(o), nextFill: { ...next, meaning: DCA_STATUS_TEXT[next.status] } };
    }],
    ["POST", /^\/dca\/plan$/, async (_m, _u, body) => {
      const input = orderInput(body);
      const t = now();
      const p = buildOrderParams(input, t);
      const start = p.startTime === 0n ? BigInt(t) : p.startTime;
      const r = await poincare.regime();
      const first = await planSliceQuoted(
        {
          id: 0n, owner: "0x0000000000000000000000000000000000000000", recipient: p.recipient, side: input.side,
          zeroForOne: p.zeroForOne, pauseOnTrend: p.pauseOnTrend, catchUp: p.catchUp, cancelled: false, paused: false,
          maxSpreadBps: p.maxSpreadBps, maxSlippageBps: p.maxSlippageBps, slices: p.slices, interval: p.interval,
          filled: 0, startTime: start, deadline: p.deadline, lastSlotPlusOne: 0n, amountIn: p.amountIn,
          remaining: p.amountIn, amountOut: 0n, minPriceWad: p.minPriceWad, scheduleBudget: p.amountIn, scheduleFilled: 0, refunded: 0n,
        },
        { now: BigInt(t), spreadBps: wadToBpsUp(input.side === "buy" ? r.raw.spreadBuy : r.raw.spreadSell), trendWithSide: r.withTrendSide === input.side },
        async (amountIn) => (await poincare.quote(input.side, amountIn)).amountOut,
      );
      return { params: p, deadline: p.deadline, firstFillNow: { status: first.status, meaning: DCA_STATUS_TEXT[first.status] }, regime: summarize(r) };
    }],
    ["POST", /^\/dca\/tx\/create$/, async (_m, _u, body) => {
      const owner = addressParam(body?.owner, "owner");
      return { owner, transactions: await poincare.dca.build.create(owner, orderInput(body)) };
    }],
    ["POST", /^\/dca\/tx\/execute$/, async (_m, _u, body) => {
      const id = idParam(body?.id);
      const p = await poincare.dca.preview(id);
      if (p.status !== "ready") throw new HttpError(409, `not fillable now: ${p.status}. ${DCA_STATUS_TEXT[p.status]}`);
      return { transactions: [poincare.dca.build.execute(id)] };
    }],
    ["POST", /^\/dca\/tx\/cancel$/, async (_m, _u, body) => {
      const id = idParam(body?.id);
      await openOrder(id);
      return { transactions: [poincare.dca.build.cancel(id)] };
    }],
    ["POST", /^\/dca\/tx\/close-expired$/, async (_m, _u, body) => {
      const id = idParam(body?.id);
      const o = await openOrder(id);
      if (BigInt(now()) <= o.deadline) throw new HttpError(409, `order #${id} has not expired yet (deadline ${o.deadline})`);
      return { transactions: [poincare.dca.build.closeExpired(id)] };
    }],
    ["POST", /^\/dca\/tx\/pause$/, async (_m, _u, body) => {
      const id = idParam(body?.id);
      const o = await openOrder(id);
      if (o.paused) throw new HttpError(409, `order #${id} is already paused`);
      return { transactions: [poincare.dca.build.pause(id)] };
    }],
    ["POST", /^\/dca\/tx\/resume$/, async (_m, _u, body) => {
      const id = idParam(body?.id);
      const o = await openOrder(id);
      if (!o.paused) throw new HttpError(409, `order #${id} is not paused`);
      return { transactions: [poincare.dca.build.resume(id)] };
    }],
    ["POST", /^\/dca\/tx\/edit$/, async (_m, _u, body) => {
      const id = idParam(body?.id);
      const o = await openOrder(id);
      return { transactions: [buildEditTx(poincare.deployment, id, buildEditParams(o, editInput(body), now()))] };
    }],
  ];

  async function openOrder(id: bigint): Promise<DcaOrder> {
    const o = await poincare.dca.order(id);
    if (!o) throw new HttpError(404, `no DCA order #${id}`);
    if (o.cancelled || o.remaining === 0n) throw new HttpError(409, `order #${id} is closed`);
    return o;
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { headers: { ...corsOnly() } });
    const url = new URL(req.url);
    // Supabase serves the function at /functions/v1/<name>/...; route on what follows the name.
    const at = url.pathname.indexOf(base);
    const path = (at >= 0 ? url.pathname.slice(at + base.length) : url.pathname).replace(/\/+$/, "") || "/";
    let body: unknown;
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        return json({ error: "body must be JSON" }, 400);
      }
    }
    for (const [method, pattern, run] of routes) {
      const m = path.match(pattern);
      if (!m) continue;
      if (req.method !== method) return json({ error: `${req.method} not allowed here` }, 405);
      try {
        return json(await run(m, url, body));
      } catch (e) {
        return errorResponse(e);
      }
    }
    return json({ error: `no route ${path}` }, 404);
  };
}

function corsOnly() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
}

function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  if (e instanceof DcaParamError) return json({ error: e.message, reason: e.reason }, 400);
  if (e instanceof SwapParamError || e instanceof LpParamError) return json({ error: e.message }, 400);
  if (e instanceof DcaNotDeployedError) return json({ error: "The DCA contract is not configured on this API (POINCARE_DCA_ADDRESS)." }, 503);
  const msg = e instanceof Error ? e.message : String(e);
  return json({ error: `upstream: ${msg.slice(0, 200)}` }, 502);
}

// ---------------------------------------------------------------------------------------------

function summarize(r: Awaited<ReturnType<PoincareClient["regime"]>>): string {
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  const trend = r.trend === "none" ? "no confirmed trend" : `confirmed ${r.trend}-trend`;
  const charge = r.chargedSide ? `${r.chargedSide === "buy" ? "buys" : "sells"} pay ${pct(r.spread[r.chargedSide])}` : "no side pays a spread";
  return `${trend}; ${charge}; evidence ${Math.round(r.evidence.progress * 100)}%; mid ${r.price.toFixed(2)} USDC/WETH.`;
}

function view(o: DcaOrder) {
  return {
    ...o,
    spent: spentOf(o),
    progress: progressOf(o),
    limitPrice: minPriceWadToLimit(o.side, o.minPriceWad),
    tokenIn: o.side === "buy" ? "USDC" : "WETH",
    tokenOut: o.side === "buy" ? "WETH" : "USDC",
  };
}

const DECIMAL = /^\d+(\.\d+)?$/;

function sideParam(v: unknown): Side {
  if (v === "buy" || v === "sell") return v;
  throw new HttpError(400, "side must be buy or sell");
}

function amountParam(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return String(v);
  if (typeof v === "string" && DECIMAL.test(v) && Number(v) > 0) return v;
  throw new HttpError(400, "amount must be a positive decimal, e.g. \"100\"");
}

function addressParam(v: unknown, name: string): Address {
  if (typeof v === "string" && isAddress(v, { strict: false })) return getAddress(v);
  throw new HttpError(400, `${name} must be an 0x address`);
}

function idParam(v: unknown): bigint {
  if ((typeof v === "number" && Number.isInteger(v) && v > 0) || (typeof v === "string" && /^\d+$/.test(v) && v !== "0")) return BigInt(v);
  throw new HttpError(400, "id must be a positive integer");
}

function intParam(url: URL, name: string, dflt: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return dflt;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${name} must be an integer in ${min}..${max}`);
  return n;
}

const optInt = (v: unknown, name: string): number | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number" && Number.isInteger(v)) return v;
  throw new HttpError(400, `${name} must be an integer`);
};
const optBool = (v: unknown, name: string): boolean | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "boolean") return v;
  throw new HttpError(400, `${name} must be true or false`);
};

/** Request body -> DcaEditInput. Omitted fields keep the order's current value. */
function editInput(body: any): DcaEditInput {
  const lp = body?.limitPrice;
  if (lp !== undefined && lp !== null && !(typeof lp === "string" && DECIMAL.test(lp))) {
    throw new HttpError(400, "limitPrice must be a decimal string (USDC per WETH), or null to remove it");
  }
  return {
    slices: optInt(body.slices, "slices"),
    interval: optInt(body.intervalSec, "intervalSec"),
    startTime: optInt(body.startTime, "startTime"),
    deadline: optInt(body.deadline, "deadline"),
    duration: optInt(body.durationSec, "durationSec"),
    maxSpreadBps: optInt(body.maxSpreadBps, "maxSpreadBps"),
    pauseOnTrend: optBool(body.pauseOnTrend, "pauseOnTrend"),
    catchUp: optBool(body.catchUp, "catchUp"),
    maxSlippageBps: optInt(body.maxSlippageBps, "maxSlippageBps"),
    limitPrice: lp,
  };
}

/** Request body -> DcaOrderInput, with strict types (the SDK then validates like the contract). */
function orderInput(body: any): DcaOrderInput {
  if (!body || typeof body !== "object") throw new HttpError(400, "body must be an object");
  const slices = optInt(body.slices, "slices");
  const intervalSec = optInt(body.intervalSec, "intervalSec");
  if (slices === undefined) throw new HttpError(400, "slices is required");
  if (intervalSec === undefined) throw new HttpError(400, "intervalSec is required");
  if (body.limitPrice !== undefined && !(typeof body.limitPrice === "string" && DECIMAL.test(body.limitPrice))) {
    throw new HttpError(400, "limitPrice must be a decimal string (USDC per WETH)");
  }
  return {
    side: sideParam(body.side),
    amount: amountParam(body.amount),
    slices,
    interval: intervalSec,
    startTime: optInt(body.startTime, "startTime"),
    deadline: optInt(body.deadline, "deadline"),
    maxSpreadBps: optInt(body.maxSpreadBps, "maxSpreadBps"),
    pauseOnTrend: optBool(body.pauseOnTrend, "pauseOnTrend"),
    catchUp: optBool(body.catchUp, "catchUp"),
    maxSlippageBps: optInt(body.maxSlippageBps, "maxSlippageBps"),
    limitPrice: body.limitPrice,
    recipient: body.recipient === undefined ? undefined : addressParam(body.recipient, "recipient"),
  };
}
