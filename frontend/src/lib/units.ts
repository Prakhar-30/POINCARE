import { formatUnits, parseUnits } from "viem";
import { TOKENS, type TokenSym } from "@/config/contracts";

/**
 * All token-amount conversions go through here so the token's actual decimals are
 * used everywhere. Never `parseUnits(x, 18)` or `Number(x) / 1e18` in feature code:
 * the demo tokens happen to be 18-decimals, but real USDC is 6 and a hardcoded 18
 * fails silently (off by 1e12).
 */

/** Human string/number -> wei for a token. Clamps precision to the token's decimals. */
export function toWei(amount: string | number, sym: TokenSym): bigint {
  const d = TOKENS[sym].decimals;
  const s = typeof amount === "number" ? amount.toFixed(d) : amount;
  try {
    // parseUnits rejects excess fractional digits; trim to the token's precision.
    const [int, frac = ""] = s.split(".");
    return parseUnits(frac ? `${int}.${frac.slice(0, d)}` : int || "0", d);
  } catch {
    return 0n;
  }
}

/** Wei -> human number for a token (display only; keep bigint for tx math). */
export function fromWei(wei: bigint, sym: TokenSym): number {
  return Number(formatUnits(wei, TOKENS[sym].decimals));
}

/** The input/output token symbols for a swap direction (currency0 = USDC). */
export function legsOf(zeroForOne: boolean): { inSym: TokenSym; outSym: TokenSym } {
  return zeroForOne ? { inSym: "USDC", outSym: "WETH" } : { inSym: "WETH", outSym: "USDC" };
}

/** WAD (1e18) fixed-point fraction -> number. WAD is the hook's fixed-point scale for
 *  fractions (spread, fee, D), independent of any token's decimals. */
export function fromWad(wad: bigint): number {
  return Number(wad) / 1e18;
}
