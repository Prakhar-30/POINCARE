// Local float model of the on-chain pricing pipeline (a = b = 0 base):
//   effIn   = amountIn * (1 - fee)            (vol-scaled base fee, charged on input)
//   baseOut = constant-product(effIn)
//   out     = baseOut * (1 - spread)          (directional spread, with-trend side only)
//
// EXECUTABLE numbers should come from the PoincareLens (wei-exact; see useQuote) — this
// model is the instant fallback and the source of the COMPARISON fields: what a 0-fee
// constant-product pool and a conventional 0.3%-fee pool would have given for the same
// trade. Those are counterfactuals, so a float model is the right tool for them.

const NORMAL_FEE = 0.003; // 0.3% — the conventional Uniswap pool we compare against

export type Quote = {
  out: number; // what Poincaré gives (after vol fee + directional spread)
  baseOut: number; // what a 0-fee constant-product pool gives
  feeOut: number; // what a 0.3%-fee pool gives
  execPrice: number; // USDC per WETH for this trade
  impact: number; // fraction vs mid
  spread: number; // directional spread applied (fraction)
  fee: number; // vol-scaled base fee applied (fraction)
  withTrend: boolean; // did this trade pay the trend spread
  /** USDC value of the trade (the USDC leg). */
  notionalUsdc: number;
  /** Value (USDC) the directional spread returned to LPs — LVR a normal pool would leak. */
  lvrToLps: number;
  /** Output-token savings vs a 0.3% fee pool (can be negative when with-trend). */
  savedVsFee: number;
};

/**
 * @param r0 USDC reserve (human), r1 WETH reserve (human)
 * @param amountIn human input amount
 * @param zeroForOne true = pay USDC, receive WETH (buy WETH)
 * @param spread directional spread fraction for this direction (from the hook)
 * @param fee vol-scaled base fee fraction (from the hook; 0 on older deployments)
 */
export function quote(r0: number, r1: number, amountIn: number, zeroForOne: boolean, spread: number, fee = 0): Quote {
  const mid = r1 > 0 ? r0 / r1 : 0; // USDC per WETH
  if (!amountIn || amountIn <= 0 || r0 <= 0 || r1 <= 0) {
    return { out: 0, baseOut: 0, feeOut: 0, execPrice: mid, impact: 0, spread, fee, withTrend: spread > 0, notionalUsdc: 0, lvrToLps: 0, savedVsFee: 0 };
  }

  const k = r0 * r1;
  const cpOut = (amt: number) => (zeroForOne ? r1 - k / (r0 + amt) : r0 - k / (r1 + amt));
  const baseOut = cpOut(amountIn);
  const out = cpOut(amountIn * (1 - fee)) * (1 - spread);
  const feeOut = baseOut * (1 - NORMAL_FEE);

  // exec price in USDC/WETH
  const execPrice = zeroForOne ? amountIn / out : out / amountIn;
  const impact = mid > 0 ? Math.abs(execPrice - mid) / mid : 0;

  const notionalUsdc = zeroForOne ? amountIn : amountIn * mid;
  // value the directional spread took (in USDC): output-token * spread, valued in USDC
  const lvrToLps = zeroForOne ? baseOut * spread * mid : baseOut * spread;
  const savedVsFeeOutTok = out - feeOut; // output-token units
  const savedVsFee = zeroForOne ? savedVsFeeOutTok * mid : savedVsFeeOutTok;

  return { out, baseOut, feeOut, execPrice, impact, spread, fee, withTrend: spread > 0, notionalUsdc, lvrToLps, savedVsFee };
}
