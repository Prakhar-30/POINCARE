// Historical replay: drive a live Poincaré pool through the repo's real Binance
// ETH/USDC closes (analysis/simulation/realdata/eth_usdc_4h.csv, downsampled to
// daily), via real router swaps, one per block, so every step also produces an on-chain
// DetectorSample. Each swap and each detector sample is mirrored to Supabase so the app
// has deep history immediately.
//
//   PK=0x.. [CHAIN=unichain] [DRY=1] [STRIDE=6] node replay.mjs
//
// Addresses come from ../deployments/<chain>.json (the deploy scripts' output);
// Supabase creds are read from ./.env (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseUnits, formatEther, defineChain, decodeEventLog, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CHAINS = {
  unichain: { id: 1301, name: "Unichain Sepolia", rpc: "https://sepolia.unichain.org", symbol: "ETH", depFile: "unichain-sepolia.json", router: "0x9cD2b0a732dd5e023a5539921e0FD1c30E198Dba" },
};
const CH = CHAINS[process.env.CHAIN || "unichain"];
if (!CH) { console.error(`unknown CHAIN '${process.env.CHAIN}'`); process.exit(1); }
const RPC = process.env.RPC || CH.rpc;
const DRY = process.env.DRY === "1";
const STRIDE = Number(process.env.STRIDE || "6"); // 6 x 4h candles = daily
const PK = process.env.PK?.startsWith("0x") ? process.env.PK : `0x${process.env.PK}`;

// config from repo files, never stale vs the deployment
const dep = JSON.parse(fs.readFileSync(new URL(`../deployments/${CH.depFile}`, import.meta.url), "utf8"));
const env = Object.fromEntries(
  fs.readFileSync(new URL("./.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SB_URL = env.VITE_SUPABASE_URL;
const SB_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

const C = {
  hook: dep.poincareHook,
  router: dep.router || CH.router,
  usdc: dep.usdc,
  weth: dep.weth,
  currency0: dep.currency0,
  currency1: dep.currency1,
  fee: Number(dep.fee),
  tickSpacing: Number(dep.tickSpacing),
};
// The whole script (and the frontend) assumes currency0 = USDC. The deploy sorts by
// address, so verify instead of hoping.
if (C.currency0.toLowerCase() !== C.usdc.toLowerCase()) {
  console.error("ABORT: currency0 != USDC in this deployment: orientation assumptions would be wrong.");
  process.exit(1);
}
const POOL_KEY = { currency0: C.currency0, currency1: C.currency1, fee: C.fee, tickSpacing: C.tickSpacing, hooks: C.hook };
const HOOK_LC = C.hook.toLowerCase();
const TREND_UI = ["none", "down", "up"]; // hook price is WETH/USDC = inverse of UI chart

const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
];
const HOOK = [
  { type: "function", name: "reserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "kappa", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "trend", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
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
const DETECTOR_SAMPLE = parseAbiItem(
  "event DetectorSample(uint256 blockNumber, uint256 priceWad, int256 r, int256 sPos, int256 sNeg, uint256 dWad, uint256 sigmaWad, uint256 kappaWad, uint8 trend, uint256 feeWad)",
);

const chain = defineChain({ id: CH.id, name: CH.name, nativeCurrency: { name: CH.symbol, symbol: CH.symbol, decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(PK);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

const erc = (a) => ({ address: a, abi: ERC20 });
const hook = { address: C.hook, abi: HOOK };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wad = (x) => Number(x) / 1e18;

async function readReserves() {
  const [r0, r1] = await pub.readContract({ ...hook, functionName: "reserves" });
  return [wad(r0), wad(r1)];
}

/** Daily closes from the repo's real Binance file. */
function loadDaily() {
  const lines = fs.readFileSync(new URL("../analysis/simulation/realdata/eth_usdc_4h.csv", import.meta.url), "utf8")
    .trim().split("\n").slice(1);
  const rows = lines.map((l) => { const [t, p] = l.split(","); return { day: t.slice(0, 10), t, p: Number(p) }; });
  const out = [];
  for (let i = 0; i < rows.length; i += STRIDE) out.push(rows[i]);
  return out;
}

async function sb(table, row) {
  if (!SB_URL || !SB_KEY) return;
  const post = (body) =>
    fetch(`${SB_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify(body),
    });
  try {
    let res = await post(row);
    // If migration_002 has not been run yet the `hook` column (or the detector_samples
    // table) does not exist; degrade to the legacy shape rather than losing the row.
    if (!res.ok && res.status !== 409 && "hook" in row) {
      const { hook: _hook, ...legacy } = row;
      res = await post(legacy);
    }
    if (!res.ok && res.status !== 409) console.warn(`supabase ${table}:`, res.status, (await res.text()).slice(0, 120));
  } catch (e) { console.warn(`supabase ${table}:`, e.message); }
}

/** Mirror the DetectorSample the swap's block emitted (if any) straight from the receipt. */
async function mirrorDetectorSample(rcpt, ts) {
  for (const log of rcpt.logs) {
    if (log.address.toLowerCase() !== HOOK_LC) continue;
    let ev;
    try { ev = decodeEventLog({ abi: [DETECTOR_SAMPLE], data: log.data, topics: log.topics }); } catch { continue; }
    const a = ev.args;
    const priceHook = wad(a.priceWad);
    await sb("detector_samples", {
      hook: HOOK_LC,
      block_number: Number(a.blockNumber),
      ts,
      price: priceHook > 0 ? 1 / priceHook : 0,
      r: wad(a.r),
      s_pos: wad(a.sPos),
      s_neg: wad(a.sNeg),
      d: wad(a.dWad),
      sigma: wad(a.sigmaWad),
      kappa: wad(a.kappaWad),
      trend: TREND_UI[Number(a.trend)] ?? "none",
      fee: wad(a.feeWad),
    });
    return { sPos: wad(a.sPos), sNeg: wad(a.sNeg), d: wad(a.dWad) };
  }
  return null;
}

// the detector samples at most once per block, so every swap must land in a fresh block
let lastBlock = 0n;
async function waitNextBlock() {
  let b = await pub.getBlockNumber();
  while (b <= lastBlock) { await sleep(250); b = await pub.getBlockNumber(); }
}

async function main() {
  if (!C.router) { console.error("no router for this chain (deployment json missing `router`)"); process.exit(1); }
  console.log(`replay ${DRY ? "(DRY RUN)" : "(LIVE)"} on ${CH.name}: account ${account.address}: hook ${C.hook}`);
  const nativeStart = await pub.getBalance({ address: account.address });
  console.log(`native ${CH.symbol}:`, formatEther(nativeStart));

  const daily = loadDaily();
  let [R0, R1] = await readReserves();
  const startPrice = R0 / R1;
  const scale = startPrice / daily[0].p;
  const targets = daily.map((d) => ({ day: d.day, target: d.p * scale }));
  console.log(`pool start ${startPrice.toFixed(2)} USDC/WETH · ${daily.length} daily points (${daily[0].day} → ${daily[daily.length - 1].day}) · scale ${scale.toFixed(4)}`);

  if (!DRY) {
    const BIG = parseUnits("500000000", 18);
    for (const t of [C.usdc, C.weth]) {
      const h = await wallet.writeContract({ ...erc(t), functionName: "mint", args: [account.address, BIG], gas: 300000n });
      await pub.waitForTransactionReceipt({ hash: h });
      const h2 = await wallet.writeContract({ ...erc(t), functionName: "approve", args: [C.router, BIG], gas: 200000n });
      await pub.waitForTransactionReceipt({ hash: h2 });
    }
    console.log("minted + approved both legs");
  }

  let totalGasWei = 0n, swaps = 0, lvrTotal = 0, volTotal = 0, fires = 0, dryVol = 0;
  for (let i = 1; i < targets.length; i++) {
    if (!DRY) await waitNextBlock();
    [R0, R1] = DRY ? simReserves(R0, R1) : await readReserves();
    const k = R0 * R1;
    const price = R0 / R1;
    const target = targets[i].target;
    let zeroForOne, amountIn;
    if (target > price) { amountIn = Math.sqrt(target * k) - R0; zeroForOne = true; } // buy WETH with USDC
    else { amountIn = Math.sqrt(k / target) - R1; zeroForOne = false; }               // sell WETH for USDC

    const baseOut = zeroForOne ? R1 - k / (R0 + amountIn) : R0 - k / (R1 + amountIn);
    const notionalUsdc = zeroForOne ? amountIn : amountIn * price;
    if (!(amountIn > 1e-4)) continue;

    if (DRY) {
      dryVol += notionalUsdc; swaps++;
      simReserves._next = zeroForOne ? [R0 + amountIn, R1 - baseOut] : [R0 - baseOut, R1 + amountIn];
      continue;
    }

    const tokenOut = zeroForOne ? C.weth : C.usdc;
    const spread = wad(await pub.readContract({ ...hook, functionName: "effectiveSpread", args: [zeroForOne] }));
    const amountInWei = parseUnits(amountIn.toFixed(18), 18);
    const balBefore = await pub.readContract({ ...erc(tokenOut), functionName: "balanceOf", args: [account.address] });
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

    let hash;
    try {
      hash = await wallet.writeContract({ address: C.router, abi: ROUTER, functionName: "swapExactTokensForTokens",
        args: [amountInWei, 0n, zeroForOne, POOL_KEY, "0x", account.address, deadline], gas: 3000000n });
    } catch (e) { console.warn(`swap ${i} (${targets[i].day}) failed:`, e.shortMessage || e.message); continue; }
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    totalGasWei += rcpt.gasUsed * rcpt.effectiveGasPrice;
    lastBlock = rcpt.blockNumber;
    if (rcpt.status !== "success") { console.warn(`swap ${i} reverted`); continue; }

    const balAfter = await pub.readContract({ ...erc(tokenOut), functionName: "balanceOf", args: [account.address] });
    const out = wad(balAfter - balBefore);
    const kappa = wad(await pub.readContract({ ...hook, functionName: "kappa" }));
    const trendIdx = Number(await pub.readContract({ ...hook, functionName: "trend" }));
    const execPrice = out > 0 ? (zeroForOne ? amountIn / out : out / amountIn) : price;
    const lvr = zeroForOne ? baseOut * spread * price : baseOut * spread;
    if (spread > 0) fires++;
    lvrTotal += lvr; volTotal += notionalUsdc; swaps++;

    const ts = new Date(targets[i].day + "T12:00:00Z").toISOString();
    await sb("swaps", {
      tx_hash: hash, block_number: Number(rcpt.blockNumber), trader: account.address.toLowerCase(), hook: HOOK_LC,
      zero_for_one: zeroForOne, side: zeroForOne ? "buy_weth" : "sell_weth",
      amount_in: amountIn, amount_out: out > 0 ? out : baseOut, price: execPrice, notional_usdc: notionalUsdc,
      kappa, trend: TREND_UI[trendIdx], spread_frac: spread, with_trend: spread > 0,
      lvr_captured_usdc: lvr, ts,
    });
    await mirrorDetectorSample(rcpt, ts);

    if (swaps % 10 === 0) {
      const [nr0, nr1] = await readReserves();
      console.log(`  ${swaps}/${targets.length - 1} · ${targets[i].day} · price ${(nr0 / nr1).toFixed(0)} · kappa ${(kappa * 100).toFixed(2)}% · gas ${formatEther(totalGasWei)} ${CH.symbol} · LVR $${lvrTotal.toFixed(2)}`);
    }
  }

  if (DRY) { console.log(`DRY: would do ~${swaps} swaps, total notional ~$${dryVol.toLocaleString()}`); return; }

  const nativeEnd = await pub.getBalance({ address: account.address });
  const [fr0, fr1] = await readReserves();
  console.log("\n===== REPLAY COMPLETE =====");
  console.log(`swaps executed : ${swaps} (with-trend leans: ${fires})`);
  console.log(`total notional : $${volTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  console.log(`LVR captured for LPs : $${lvrTotal.toFixed(2)}`);
  console.log(`gas spent : ${formatEther(totalGasWei)} ${CH.symbol} (remaining ${formatEther(nativeEnd)})`);
  console.log(`final pool price : ${(fr0 / fr1).toFixed(2)} USDC/WETH`);
}

// dry-run reserve simulation carry
function simReserves(r0, r1) { const n = simReserves._next; simReserves._next = null; return n || [r0, r1]; }

main().catch((e) => { console.error(e); process.exit(1); });
