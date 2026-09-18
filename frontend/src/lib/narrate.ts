/**
 * The facts handed to the narrator, and the deterministic narration used when the
 * model is unavailable.
 *
 * The fallback is not a placeholder. Generation is metered by a free tier and can
 * fail, cool down, or simply not be configured, and a panel that explains the
 * detector is worth most exactly when someone is watching it live. So every
 * narration path has a local, rule-based answer that is always correct if less
 * fluent, and the UI marks which one it is showing.
 */

import type { DetectorConfig } from "@/hooks/useDetectorConfig";
import type { DetectorPoint } from "@/lib/onchain";
import { fmtPct } from "@/lib/format";

/** The numbers behind "what is the pool doing right now". */
export type RegimeFacts = {
  trend: string;
  kappaPct: number;
  kappaMaxPct: number;
  dPct: number;
  dFloorPct: number;
  sigmaPct: number;
  feePct: number;
  evidence: number;
  threshold: number;
  progressToThresholdPct: number;
  gateBlocking: boolean;
  adaptive: boolean;
  blocksInWindow: number;
  leanBlocksInWindow: number;
  priceChangePctInWindow: number;
};

/** The dominant CUSUM statistic and how far it has climbed toward firing. */
export function evidenceOf(p: DetectorPoint | undefined) {
  const evidence = p ? Math.max(p.s_pos, p.s_neg) : 0;
  return { evidence };
}

export function regimeFactsOf(
  points: DetectorPoint[],
  cfg: DetectorConfig,
): RegimeFacts | null {
  const last = points[points.length - 1];
  if (!last) return null;

  const { evidence } = evidenceOf(last);
  const first = points[0];
  const priceChange =
    first && first.price > 0 ? (last.price - first.price) / first.price : 0;

  return {
    trend: last.trend,
    kappaPct: last.kappa * 100,
    kappaMaxPct: cfg.kappaMax * 100,
    dPct: last.d * 100,
    dFloorPct: cfg.dFloor * 100,
    sigmaPct: last.sigma * 100,
    feePct: last.fee * 100,
    evidence,
    threshold: cfg.h,
    progressToThresholdPct: cfg.h > 0 ? Math.min(999, (evidence / cfg.h) * 100) : 0,
    gateBlocking: last.d < cfg.dFloor && evidence >= cfg.h,
    adaptive: cfg.adaptive,
    blocksInWindow: points.length,
    leanBlocksInWindow: points.filter((p) => p.kappa > 0).length,
    priceChangePctInWindow: priceChange * 100,
  };
}

// ---------------------------------------------------------------------------
// deterministic fallbacks
// ---------------------------------------------------------------------------

export function fallbackRegime(f: RegimeFacts): string {
  const parts: string[] = [];

  if (f.kappaPct > 0) {
    const side = f.trend === "up" ? "buying WETH" : "selling WETH";
    parts.push(
      `The detector has confirmed a ${f.trend}-trend, so the pool is charging ${f.kappaPct.toFixed(2)}% to flow ${side} — the side pushing price further along the trend — while the other side trades at the base price.`,
    );
  } else if (f.gateBlocking) {
    parts.push(
      `The CUSUM statistic is past its threshold, but directional efficiency is ${f.dPct.toFixed(0)}%, under the ${f.dFloorPct.toFixed(0)}% floor, so the move is being read as chop and the evidence is gated to zero.`,
    );
  } else if (f.progressToThresholdPct > 50) {
    parts.push(
      `Evidence is building — the leading CUSUM statistic is ${f.progressToThresholdPct.toFixed(0)}% of the way to the firing threshold — but it has not crossed yet, so the curve is still symmetric.`,
    );
  } else {
    parts.push(
      `The pool is calm: the CUSUM statistics sit at ${f.progressToThresholdPct.toFixed(0)}% of the firing threshold, so both sides quote the same deep constant-product curve with no spread.`,
    );
  }

  parts.push(
    `Realized volatility is ${f.sigmaPct.toFixed(3)}% per sampled block, which sets the base fee at ${f.feePct.toFixed(3)}%.`,
  );

  if (f.leanBlocksInWindow > 0 && f.kappaPct === 0) {
    parts.push(
      `The curve leaned on ${f.leanBlocksInWindow} of the last ${f.blocksInWindow} sampled blocks and has since ramped back to symmetric.`,
    );
  }

  return parts.join(" ");
}

/** Short label used in the UI for how the current narration was produced. */
export const sourceLabel = (cached: boolean, model: string | null) =>
  model ? `${model}${cached ? " · cached" : ""}` : "computed locally";

/** Formats a spread/percentage consistently with the rest of the app. */
export const pct = (frac: number, dp = 2) => fmtPct(frac, dp);
