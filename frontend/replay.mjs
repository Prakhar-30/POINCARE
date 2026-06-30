// One-off historical replay: drive the live Poincaré pool through the last ~3 months
// of ETH/USD (downsampled to daily), via real router swaps. Tracks gas + records each
// swap to Supabase. Key + secrets are passed via env, never hardcoded.
//
//   PK=0x.. SUPABASE_URL=.. SUPABASE_KEY=.. [DRY=1] node replay.mjs
import { createPublicClient, createWalletClient, http, parseUnits, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

const RPC = "https://sepolia.unichain.org";
const DRY = process.env.DRY === "1";
const PK = process.env.PK?.startsWith("0x") ? process.env.PK : `0x${process.env.PK}`;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

const C = {
  hook: "0x8dBcb4eA2855faC53237fA5Fc607Ccd16E47aA88",
  router: "0x9cD2b0a732dd5e023a5539921e0FD1c30E198Dba",
  usdc: "0x414e989a41638735F2Efe5b6d4c4AD826A918823", // currency0
  weth: "0x5B150f01CfBd968b4E7A6bFD5FC8eb3870A3C512", // currency1
  fee: 0x800000,
  tickSpacing: 60,
};
const POOL_KEY = { currency0: C.usdc, currency1: C.weth, fee: C.fee, tickSpacing: C.tickSpacing, hooks: C.hook };
const TREND = ["none", "up", "down"];

const ERC20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
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

const chain = defineChain({ id: 1301, name: "Unichain Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(PK);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

const erc = (a) => ({ address: a, abi: ERC20 });
const hook = { address: C.hook, abi: HOOK };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readReserves() {
  const [r0, r1] = await pub.readContract({ ...hook, functionName: "reserves" });
  return [Number(r0) / 1e18, Number(r1) / 1e18];
}

async function fetchDaily() {
  const res = await fetch("https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=90");
  const { prices } = await res.json();
  const byDay = {};
  for (const [ts, p] of prices) byDay[new Date(ts).toISOString().slice(0, 10)] = { p, ts };
  const days = Object.keys(byDay).sort();
  return days.map((d) => ({ day: d, p: byDay[d].p }));
}

async function recordSwap(row) {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/swaps`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
  } catch (e) { console.warn("supabase", e.message); }
}

async function main() {
  console.log(`replay ${DRY ? "(DRY RUN)" : "(LIVE)"} — account ${account.address}`);
  const nativeStart = await pub.getBalance({ address: account.address });
  console.log("native ETH:", formatEther(nativeStart));

  const daily = await fetchDaily();
  let [R0, R1] = await readReserves();
  const startPrice = R0 / R1;
  const scale = startPrice / daily[0].p;
  const targets = daily.map((d) => ({ day: d.day, target: d.p * scale }));
  console.log(`pool start price ${startPrice.toFixed(2)} USDC/WETH · ${daily.length} daily points · scale ${scale.toFixed(4)}`);
  console.log(`scaled target range ${Math.min(...targets.map(t=>t.target)).toFixed(0)} .. ${Math.max(...targets.map(t=>t.target)).toFixed(0)}`);

  if (!DRY) {
    // big one-time mint + router approvals for both legs
    const BIG = parseUnits("200000000", 18);
    for (const t of [C.usdc, C.weth]) {
      const h = await wallet.writeContract({ ...erc(t), functionName: "mint", args: [account.address, BIG], gas: 200000n });
      await pub.waitForTransactionReceipt({ hash: h });
      const h2 = await wallet.writeContract({ ...erc(t), functionName: "approve", args: [C.router, BIG], gas: 200000n });
      await pub.waitForTransactionReceipt({ hash: h2 });
    }
    console.log("minted + approved both legs");
  }

  let totalGasWei = 0n, swaps = 0, lvrTotal = 0, volTotal = 0, fires = 0, dryVol = 0;
  for (let i = 1; i < targets.length; i++) {
    [R0, R1] = DRY ? simReserves(R0, R1) : await readReserves();
    const k = R0 * R1;
    const price = R0 / R1;
    const target = targets[i].target;
    let zeroForOne, amountIn;
    if (target > price) { amountIn = Math.sqrt(target * k) - R0; zeroForOne = true; } // buy WETH with USDC
    else { amountIn = Math.sqrt(k / target) - R1; zeroForOne = false; }               // sell WETH for USDC
    if (!(amountIn > 1e-4)) continue;

    const baseOut = zeroForOne ? R1 - k / (R0 + amountIn) : R0 - k / (R1 + amountIn);
    const notionalUsdc = zeroForOne ? amountIn : amountIn * price;

    if (DRY) {
      dryVol += notionalUsdc; swaps++;
      simReserves._next = zeroForOne ? [R0 + amountIn, R1 - baseOut] : [R0 - baseOut, R1 + amountIn];
      continue;
    }

    const tokenOut = zeroForOne ? C.weth : C.usdc;
    const spreadRaw = await pub.readContract({ ...hook, functionName: "effectiveSpread", args: [zeroForOne] });
    const spread = Number(spreadRaw) / 1e18;
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

    const balAfter = await pub.readContract({ ...erc(tokenOut), functionName: "balanceOf", args: [account.address] });
    const out = Number(balAfter - balBefore) / 1e18;
    const kappaRaw = await pub.readContract({ ...hook, functionName: "kappa" });
    const trendIdx = Number(await pub.readContract({ ...hook, functionName: "trend" }));
    // executed USDC/WETH price from the legs; guard against a 0/raced balance delta
    const execPrice = out > 0 ? (zeroForOne ? amountIn / out : out / amountIn) : price;
    const lvr = zeroForOne ? baseOut * spread * price : baseOut * spread;
    if (spread > 0) fires++;
    lvrTotal += lvr; volTotal += notionalUsdc; swaps++;

    await recordSwap({
      tx_hash: hash, block_number: Number(rcpt.blockNumber), trader: account.address.toLowerCase(),
      zero_for_one: zeroForOne, side: zeroForOne ? "buy_weth" : "sell_weth",
      amount_in: amountIn, amount_out: out > 0 ? out : baseOut, price: execPrice, notional_usdc: notionalUsdc,
      kappa: Number(kappaRaw) / 1e18, trend: TREND[trendIdx], spread_frac: spread, with_trend: spread > 0,
      lvr_captured_usdc: lvr, ts: new Date(targets[i].day + "T12:00:00Z").toISOString(),
    });

    if (swaps % 10 === 0) console.log(`  ${swaps} swaps · ${targets[i].day} · price→${(R0 / R1).toFixed(0)} · gas ${formatEther(totalGasWei)} ETH · LVR $${lvrTotal.toFixed(2)}`);
    await sleep(150);
  }

  if (DRY) { console.log(`DRY: would do ~${swaps} swaps, total notional ~$${(dryVol).toLocaleString()}`); return; }

  const nativeEnd = await pub.getBalance({ address: account.address });
  const [fr0, fr1] = await readReserves();
  console.log("\n===== REPLAY COMPLETE =====");
  console.log(`swaps executed : ${swaps}`);
  console.log(`detector-spread swaps (with-trend) : ${fires}`);
  console.log(`total notional : $${volTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  console.log(`LVR captured for LPs : $${lvrTotal.toFixed(2)}`);
  console.log(`gas spent : ${formatEther(totalGasWei)} ETH`);
  console.log(`native ETH used (incl mint/approve) : ${formatEther(nativeStart - nativeEnd)} ETH`);
  console.log(`native ETH remaining : ${formatEther(nativeEnd)} ETH`);
  console.log(`final pool price : ${(fr0 / fr1).toFixed(2)} USDC/WETH (reserves ${fr0.toFixed(0)} USDC / ${fr1.toFixed(2)} WETH)`);
}

// dry-run reserve simulation carry
function simReserves(r0, r1) { const n = simReserves._next; simReserves._next = null; return n || [r0, r1]; }

main().catch((e) => { console.error(e); process.exit(1); });
