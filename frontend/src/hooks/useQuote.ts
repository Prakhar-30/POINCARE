import { useReadContract } from "wagmi";
import { CONTRACTS, LENS_ABI, hasLens } from "@/config/contracts";
import { quote, type Quote } from "@/lib/curve";
import { fromWei, legsOf, toWei } from "@/lib/units";
import type { PoolState } from "@/hooks/usePoolState";

export type TradeQuote = Quote & {
  /** Wei-exact output from the PoincareLens (null when the Lens isn't deployed /
   *  the amount is empty). This is the number to build minOut from. */
  outWei: bigint | null;
  /** Where the executable numbers came from. */
  source: "lens" | "local";
};

/**
 * The trade quote. Executable amounts come from the PoincareLens — the same
 * libraries and projection the hook's swap path runs, so the quote matches
 * execution to the wei. The local float model stays as (a) the instant value
 * while the Lens read is in flight, and (b) the source of the comparison fields
 * (vs 0-fee constant-product, vs a 0.3%-fee pool), which are counterfactuals the
 * chain cannot answer.
 */
export function useTradeQuote(s: PoolState, amountIn: string, zeroForOne: boolean): TradeQuote {
  const { inSym } = legsOf(zeroForOne);
  const amt = Number(amountIn) || 0;
  const inWei = amt > 0 ? toWei(amountIn, inSym) : 0n;

  const spread = zeroForOne ? s.spreadZeroForOne : s.spreadOneForZero;
  const local = quote(fromWei(s.r0, "USDC"), fromWei(s.r1, "WETH"), amt, zeroForOne, spread, s.fee);

  const lens = useReadContract({
    address: CONTRACTS.lens as `0x${string}`,
    abi: LENS_ABI,
    functionName: "quoteExactInput",
    args: [zeroForOne, inWei],
    query: { enabled: hasLens && inWei > 0n, refetchInterval: 4000 },
  });

  const outWei = hasLens && typeof lens.data === "bigint" ? lens.data : null;
  if (outWei === null) return { ...local, outWei: null, source: "local" };

  const { outSym } = legsOf(zeroForOne);
  const out = fromWei(outWei, outSym);
  const execPrice = out > 0 ? (zeroForOne ? amt / out : out / amt) : local.execPrice;
  const mid = s.price;
  const impact = mid > 0 && execPrice > 0 ? Math.abs(execPrice - mid) / mid : local.impact;
  return { ...local, out, execPrice, impact, outWei, source: "lens" };
}
