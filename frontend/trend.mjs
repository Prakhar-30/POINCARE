// Drive a sustained, monotonic price trend so the CUSUM detector fires: directional
// efficiency D climbs past dFloor, S+ (or S-) accumulates past threshold h, trend
// flips, and kappa engages (rate-limited). Reads the detector after every swap and
// records each to Supabase. Secrets via env / repo files, never hardcoded.
//   PK=0x.. [STEP=0.02] [UP=14] [DOWN=14] node trend.mjs
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseUnits, formatEther, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://sepolia.unichain.org";
const PK = process.env.PK?.startsWith("0x") ? process.env.PK : `0x${process.env.PK}`;
const STEP = Number(process.env.STEP || "0.022"); // target price move per swap
const UP = Number(process.env.UP || "22");
const DOWN = Number(process.env.DOWN || "22");

// addresses from the deploy output; Supabase creds from the app's own .env
const dep = JSON.parse(fs.readFileSync(new URL("../deployments/unichain-sepolia.json", import.meta.url), "utf8"));
const env = Object.fromEntries(
  fs.readFileSync(new URL("./.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SB_URL = env.VITE_SUPABASE_URL;
const SB_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

const C = {
  hook: dep.poincareHook,
  router: "0x9cD2b0a732dd5e023a5539921e0FD1c30E198Dba",
  usdc: dep.usdc,
  weth: dep.weth,
  fee: Number(dep.fee),
  tickSpacing: Number(dep.tickSpacing),
};
if (dep.currency0.toLowerCase() !== C.usdc.toLowerCase()) {
  console.error("ABORT: currency0 != USDC in this deployment.");
  process.exit(1);
}
const POOL_KEY = { currency0: C.usdc, currency1: C.weth, fee: C.fee, tickSpacing: C.tickSpacing, hooks: C.hook };
const HOOK_LC = C.hook.toLowerCase();
const TREND = ["none", "up", "down"];

const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
];
const v = (n, t = "uint256") => ({ type: "function", name: n, stateMutability: "view", inputs: [], outputs: [{ type: t }] });
const HOOK = [
  { type: "function", name: "reserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  v("kappa"), v("trend", "uint8"), v("directionalEfficiency"),
  { type: "function", name: "effectiveSpread", stateMutability: "view", inputs: [{ type: "bool" }], outputs: [{ type: "uint256" }] },
];
const ROUTER = [
  { type: "function", name: "swapExactTokensForTokens", stateMutability: "payable",
    inputs: [
      { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "zeroForOne", type: "bool" },
      { name: "poolKey", type: "tuple", components: [
        { name: "currency0", type: "address" }, { name: "currency1", type: "address" }, { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }] },
      { name: "hookData", type: "bytes" }, { name: "receiver", type: "address" }, { name: "deadline", type: "uint256" }],
    outputs: [{ type: "int256" }] },
];

const chain = defineChain({ id: 1301, name: "Unichain Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(PK);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

// This RPC serves a stale pending nonce for a second or two after a send, so letting viem
// fetch one per transaction makes every rapid follow-up revert with "nonce too low". Track it
// locally instead: seed from the chain once, then hand out and bump our own.
let nonce = null;
async function nextNonce() {
  if (nonce === null) nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
  return nonce++;
}
/** Send with our own nonce, resyncing once if the chain disagrees (a tx landed out of band). */
async function send(req) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await wallet.writeContract({ ...req, nonce: await nextNonce() });
    } catch (e) {
      const m = e.shortMessage || e.message || "";
      if (attempt === 0 && /nonce/i.test(m)) { nonce = null; continue; } // resync and retry once
      throw e;
    }
  }
}
const hook = { address: C.hook, abi: HOOK };
const erc = (a) => ({ address: a, abi: ERC20 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reserves() { const [r0, r1] = await pub.readContract({ ...hook, functionName: "reserves" }); return [Number(r0) / 1e18, Number(r1) / 1e18]; }
async function detector() {
  const [k, t, d, sZ, sO] = await Promise.all([
    pub.readContract({ ...hook, functionName: "kappa" }),
    pub.readContract({ ...hook, functionName: "trend" }),
    pub.readContract({ ...hook, functionName: "directionalEfficiency" }),
    pub.readContract({ ...hook, functionName: "effectiveSpread", args: [true] }),
    pub.readContract({ ...hook, functionName: "effectiveSpread", args: [false] }),
  ]);
  return { kappa: Number(k) / 1e18, trend: TREND[Number(t)], D: Number(d) / 1e18, spreadBuy: Number(sZ) / 1e18, spreadSell: Number(sO) / 1e18 };
}
async function record(row) {
  if (!SB_URL || !SB_KEY) return;
  const post = (body) =>
    fetch(`${SB_URL}/rest/v1/swaps`, { method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify(body) });
  try {
    let res = await post({ ...row, hook: HOOK_LC });
    if (!res.ok && res.status !== 409) res = await post(row); // pre-migration_002 schema
    if (!res.ok && res.status !== 409) console.warn("supabase swaps:", res.status);
  } catch (e) { console.warn("supabase", e.message); }
}

let totalGasWei = 0n, swaps = 0, firstFire = null, lastBlock = 0n;

// the detector samples at most once per block, so every swap must land in a fresh block
async function waitNextBlock() {
  let b = await pub.getBlockNumber();
  while (b <= lastBlock) { await sleep(300); b = await pub.getBlockNumber(); }
  return b;
}

async function step(buy) {
  await waitNextBlock();
  let [R0, R1] = await reserves();
  const k = R0 * R1, price = R0 / R1;
  const target = buy ? price * (1 + STEP) : price * (1 - STEP);
  const zeroForOne = buy; // buy WETH = USDC(c0) -> WETH(c1)
  const amountIn = buy ? Math.sqrt(target * k) - R0 : Math.sqrt(k / target) - R1;
  if (!(amountIn > 1e-4)) return false;
  const tokenOut = buy ? C.weth : C.usdc;
  const balBefore = await pub.readContract({ ...erc(tokenOut), functionName: "balanceOf", args: [account.address] });
  const amountInWei = parseUnits(amountIn.toFixed(18), 18);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
  let hash;
  try {
    hash = await send({ address: C.router, abi: ROUTER, functionName: "swapExactTokensForTokens",
      args: [amountInWei, 0n, zeroForOne, POOL_KEY, "0x", account.address, deadline], gas: 3000000n });
  } catch (e) { console.warn(`  swap failed:`, e.shortMessage || e.message); return false; }
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  totalGasWei += rcpt.gasUsed * rcpt.effectiveGasPrice;
  lastBlock = rcpt.blockNumber; // next swap must wait for a block beyond this one
  if (rcpt.status !== "success") { console.warn(`  swap #${swaps + 1} reverted`); return false; }
  const balAfter = await pub.readContract({ ...erc(tokenOut), functionName: "balanceOf", args: [account.address] });
  const out = Number(balAfter - balBefore) / 1e18;
  swaps++;

  const det = await detector();
  const [nR0, nR1] = await reserves();
  const np = nR0 / nR1;
  const usdc = buy ? amountIn : out, weth = buy ? out : amountIn;
  const spread = buy ? det.spreadBuy : det.spreadSell;
  const withTrend = spread > 0;
  if (withTrend && firstFire === null) firstFire = swaps;
  const lvr = withTrend ? (buy ? out * spread * np : out * spread) : 0;

  await record({
    tx_hash: hash, block_number: Number(rcpt.blockNumber), trader: account.address.toLowerCase(),
    zero_for_one: zeroForOne, side: buy ? "buy_weth" : "sell_weth",
    amount_in: amountIn, amount_out: out > 0 ? out : weth, price: weth > 0 ? usdc / weth : np, notional_usdc: usdc,
    kappa: det.kappa, trend: det.trend, spread_frac: spread, with_trend: withTrend, lvr_captured_usdc: lvr,
    ts: new Date().toISOString(),
  });

  const flag = withTrend ? "  <== LEANING (with-trend spread!)" : det.trend !== "none" ? "  <- trend latched" : "";
  console.log(
    `#${String(swaps).padStart(2)} ${buy ? "BUY " : "SELL"} price ${np.toFixed(2).padStart(8)}  ` +
    `D=${(det.D * 100).toFixed(1).padStart(5)}%  trend=${det.trend.padEnd(4)}  ` +
    `kappa=${(det.kappa * 100).toFixed(2).padStart(5)}%  spread=${(spread * 100).toFixed(3)}%${flag}`,
  );
  return true;
}

/** Land exactly `n` successful swaps, so a transient RPC failure doesn't eat a trend step. */
async function steps(buy, n) {
  let done = 0;
  for (let tries = 0; done < n && tries < n * 4; tries++) {
    if (await step(buy)) done++;
  }
  if (done < n) console.warn(`  only ${done}/${n} steps landed`);
}

async function main() {
  console.log(`trend driver: account ${account.address}`);
  const nativeStart = await pub.getBalance({ address: account.address });
  const d0 = await detector(); const [r0, r1] = await reserves();
  console.log(`start: price ${(r0 / r1).toFixed(2)}  D=${(d0.D * 100).toFixed(1)}%  trend=${d0.trend}  kappa=${(d0.kappa * 100).toFixed(2)}%`);
  console.log(`thresholds: dFloor=50%  h=0.005  k=0.001  kappaMax=10%  | step=${(STEP * 100).toFixed(1)}%/swap\n`);

  // ensure the router can pull both legs
  const BIG = parseUnits("100000000", 18);
  for (const t of [C.usdc, C.weth]) {
    const al = await pub.readContract({ ...erc(t), functionName: "allowance", args: [account.address, C.router] });
    if (al < BIG / 2n) { const h = await send({ ...erc(t), functionName: "approve", args: [C.router, BIG], gas: 120000n }); await pub.waitForTransactionReceipt({ hash: h }); }
  }

  console.log(`=== PHASE 1: sustained UP-trend (${UP} buys) ===`);
  await steps(true, UP);

  console.log(`\n=== PHASE 2: sustained DOWN-trend (${DOWN} sells) ===`);
  await steps(false, DOWN);

  const det = await detector(); const [fr0, fr1] = await reserves();
  const nativeEnd = await pub.getBalance({ address: account.address });
  console.log(`\n===== DONE =====`);
  console.log(`swaps: ${swaps}  | first with-trend lean at swap #${firstFire ?? "none"}`);
  console.log(`final: price ${(fr0 / fr1).toFixed(2)}  D=${(det.D * 100).toFixed(1)}%  trend=${det.trend}  kappa=${(det.kappa * 100).toFixed(2)}%  spreadBuy=${(det.spreadBuy * 100).toFixed(3)}%  spreadSell=${(det.spreadSell * 100).toFixed(3)}%`);
  console.log(`gas spent: ${formatEther(totalGasWei)} ETH | native used: ${formatEther(nativeStart - nativeEnd)} ETH | remaining: ${formatEther(nativeEnd)} ETH`);
}
main().catch((e) => { console.error(e); process.exit(1); });
