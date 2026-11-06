import { formatUnits, parseUnits } from "viem";
import { TOKEN_DECIMALS } from "./deployments.js";

export const WAD = 10n ** 18n;
export const BPS = 10_000n;

/** A WAD fixed-point value as a JS number (display / ratios only, not for amounts on chain). */
export const fromWad = (x: bigint): number => Number(formatUnits(x, 18));

/** Spread or fee as basis points, rounded UP: the same rounding PoincareDCA applies on chain. */
export const wadToBpsUp = (x: bigint): number => Number((x * BPS + WAD - 1n) / WAD);

/** A decimal string or number (e.g. "2300.5", 0.25) as an exact WAD bigint, without float drift. */
export function decimalToWad(v: string | number): bigint {
  const s = typeof v === "number" ? numberToPlain(v) : v.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a non-negative decimal: ${v}`);
  return parseUnits(s, 18);
}

/** Token amount in base units. A bigint is taken as already in base units. */
export function toAmount(v: string | number | bigint, decimals = TOKEN_DECIMALS): bigint {
  if (typeof v === "bigint") return v;
  const s = typeof v === "number" ? numberToPlain(v) : v.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a non-negative amount: ${v}`);
  return parseUnits(s, decimals);
}

export const formatAmount = (v: bigint, decimals = TOKEN_DECIMALS): string => formatUnits(v, decimals);

/** Number -> plain decimal string (no exponent). Uses the shortest round-trip form (0.1 stays
 *  "0.1", not 0.1000000000000000055), falling back to fixed notation only for exponents. */
function numberToPlain(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error(`not a non-negative finite number: ${n}`);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  const fixed = n.toFixed(18);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") || "0" : fixed;
}
