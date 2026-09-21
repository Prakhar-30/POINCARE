import type { DetectorPoint } from "@/lib/onchain";
import type { SwapRow } from "@/lib/db";
import { priceOf } from "@/lib/db";

/**
 * Aggregates for the Analytics report, derived from what the pool actually recorded: the
 * per-block detector trace (`DetectorSample` events) and the swap tape.
 *
 * Everything here is measured, never modelled. Where a number cannot be computed from the data
 * on hand it is returned as null and the UI omits the card rather than showing a plausible
 * fiction - which matters more on this page than elsewhere, because it is the page that tells a
 * liquidity provider what the hook did for them.
 */

export type RegimeSplit = { calm: number; up: number; down: number; total: number };

export type FlowSplit = {
  /** Notional that pushed WITH a detected trend, and therefore paid the spread. */
  withTrend: number;
  /** Notional that was counter-trend or in a calm market, and paid nothing extra. */
  free: number;
  withTrendSwaps: number;
  freeSwaps: number;
  /** USDC the LP kept from with-trend flow. */
  captured: number;
};

export type RiskState = {
  /** 0..1, how far the dominant CUSUM statistic has climbed toward the firing threshold. */
  progress: number;
  /** True when D sits below dFloor, so evidence is gated to zero however high it climbs. */
  gated: boolean;
  engaged: boolean;
  level: "calm" | "watching" | "engaged";
  label: string;
  detail: string;
};

export type PoolAnalytics = {
  samples: number;
  regime: RegimeSplit;
  /** Share of sampled blocks on which kappa was non-zero. */
  engagedFrac: number;
  meanKappaWhenEngaged: number;
  maxKappa: number;
  meanSigma: number;
  /** Longest unbroken run of sampled blocks with a trend declared. */
  longestRun: number;
  flow: FlowSplit;
  /** Cumulative LVR captured, oldest → newest, for the savings curve. */
  savings: { t: number; v: number }[];
  risk: RiskState;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Classified by what the pool DID, which is kappa, not by the `trend` label.
 *
 * The label is deliberately sticky: it stays set while kappa ramps back down, so the hook knows
 * which side a decaying spread belongs to. Counting labels therefore reports a pool that was in
 * a trend 100% of the time while kappa was engaged on barely half of it - two numbers that
 * contradict each other on the same screen. A block where nothing is being charged is a calm
 * block as far as anyone reading this page is concerned.
 */
export function regimeSplitOf(points: DetectorPoint[]): RegimeSplit {
  const r: RegimeSplit = { calm: 0, up: 0, down: 0, total: points.length };
  for (const p of points) {
    if (p.kappa <= 0) r.calm++;
    else if (p.trend === "up") r.up++;
    else if (p.trend === "down") r.down++;
    else r.calm++;
  }
  return r;
}

/** Longest unbroken stretch of sampled blocks actually being charged a spread. */
export function longestRunOf(points: DetectorPoint[]): number {
  let best = 0;
  let cur = 0;
  for (const p of points) {
    if (p.kappa <= 0) cur = 0;
    else cur++;
    if (cur > best) best = cur;
  }
  return best;
}

export function flowSplitOf(rows: SwapRow[]): FlowSplit {
  const f: FlowSplit = { withTrend: 0, free: 0, withTrendSwaps: 0, freeSwaps: 0, captured: 0 };
  for (const t of rows) {
    const notional = t.notional_usdc || 0;
    if (t.with_trend && (t.kappa || 0) > 0) {
      f.withTrend += notional;
      f.withTrendSwaps++;
    } else {
      f.free += notional;
      f.freeSwaps++;
    }
    f.captured += t.lvr_captured_usdc || 0;
  }
  return f;
}

/** Cumulative LVR captured over the tape, oldest first, thinned for plotting. */
export function savingsCurveOf(rows: SwapRow[], maxPoints = 90): { t: number; v: number }[] {
  const asc = [...rows].reverse(); // the tape arrives newest-first
  const out: { t: number; v: number }[] = [];
  let acc = 0;
  asc.forEach((t, i) => {
    acc += t.lvr_captured_usdc || 0;
    out.push({ t: i, v: acc });
  });
  if (out.length <= maxPoints) return out;
  const step = out.length / maxPoints;
  const thin: { t: number; v: number }[] = [];
  for (let i = 0; i < maxPoints; i++) thin.push(out[Math.floor(i * step)]);
  thin.push(out[out.length - 1]);
  return thin;
}

/**
 * The live risk read, which is the one thing on this page a liquidity provider might act on.
 *
 * "watching" is the state worth naming: evidence is climbing but has not fired, which is
 * precisely when a naive dashboard shows "calm" and the pool is about to start leaning.
 */
export function riskOf(args: {
  sPos: number;
  sNeg: number;
  threshold: number;
  d: number;
  dFloor: number;
  kappa: number;
}): RiskState {
  const { sPos, sNeg, threshold, d, dFloor, kappa } = args;
  const evidence = Math.max(sPos, sNeg);
  const progress = threshold > 0 ? clamp01(evidence / threshold) : 0;
  const gated = d < dFloor;
  const engaged = kappa > 0;

  if (engaged) {
    return {
      progress,
      gated,
      engaged,
      level: "engaged",
      label: "Leaning",
      detail:
        "A trend is confirmed. Flow pushing with it pays the spread; everything else trades at the pool price.",
    };
  }
  if (progress >= 0.6) {
    return {
      progress,
      gated,
      engaged,
      level: "watching",
      label: gated ? "Building, but gated" : "Building",
      detail: gated
        ? "Evidence is climbing, but directional efficiency is below the floor, so the move is being read as chop and nothing is charged."
        : "Evidence is climbing toward the threshold. If it crosses, the pool starts charging the side pushing into the move.",
    };
  }
  return {
    progress,
    gated,
    engaged,
    level: "calm",
    label: "Calm",
    detail: "No sustained direction. Both sides trade at the plain constant-product price.",
  };
}

export function analyticsOf(
  points: DetectorPoint[],
  rows: SwapRow[],
  cfg: { h: number; dFloor: number },
): PoolAnalytics {
  const regime = regimeSplitOf(points);
  const engaged = points.filter((p) => p.kappa > 0);
  const last = points[points.length - 1];

  return {
    samples: points.length,
    regime,
    engagedFrac: points.length ? engaged.length / points.length : 0,
    meanKappaWhenEngaged: engaged.length
      ? engaged.reduce((a, p) => a + p.kappa, 0) / engaged.length
      : 0,
    maxKappa: points.reduce((a, p) => (p.kappa > a ? p.kappa : a), 0),
    meanSigma: points.length ? points.reduce((a, p) => a + p.sigma, 0) / points.length : 0,
    longestRun: longestRunOf(points),
    flow: flowSplitOf(rows),
    savings: savingsCurveOf(rows),
    risk: riskOf({
      sPos: last?.s_pos ?? 0,
      sNeg: last?.s_neg ?? 0,
      threshold: cfg.h,
      d: last?.d ?? 0,
      dFloor: cfg.dFloor,
      kappa: last?.kappa ?? 0,
    }),
  };
}

/**
 * What the same flow would have cost on a plain constant-product pool with no spread.
 *
 * This is deliberately NOT a claim that the LP would be down by this much: it is the value the
 * hook charged to with-trend flow which an unprotected pool would simply have handed to whoever
 * was taking the other side. Stated that way it is a measurement; stated as "losses avoided" it
 * would be a projection, and the difference matters.
 */
export function counterfactualOf(rows: SwapRow[]) {
  let charged = 0;
  let withTrendNotional = 0;
  for (const t of rows) {
    if (t.with_trend && (t.spread_frac || 0) > 0) {
      charged += (t.notional_usdc || 0) * t.spread_frac;
      withTrendNotional += t.notional_usdc || 0;
    }
  }
  return { charged, withTrendNotional };
}

/** Largest single swap the pool leaned against, for the report's concrete example. */
export function biggestLeanOf(rows: SwapRow[]): SwapRow | null {
  let best: SwapRow | null = null;
  for (const t of rows) {
    if (!t.with_trend || (t.kappa || 0) <= 0) continue;
    if (!best || (t.notional_usdc || 0) > (best.notional_usdc || 0)) best = t;
  }
  return best;
}

export { priceOf };

// ---------------------------------------------------------------------------------------
// Aggregates over the HISTORIC tape, for the column and donut charts.
//
// These answer questions the live gauges cannot: which direction the retained value actually
// came from, whether the pool charges near its cap or nowhere near it, and how activity is
// distributed over time rather than right now.

export type DayBucket = { day: string; volume: number; captured: number; swaps: number };

/** Volume, value kept and swap count per calendar day, oldest first. */
export function dailyActivityOf(rows: SwapRow[], maxDays = 14): DayBucket[] {
  const by = new Map<string, DayBucket>();
  for (const t of rows) {
    if (!t.ts) continue;
    const day = String(t.ts).slice(0, 10);
    const b = by.get(day) ?? { day, volume: 0, captured: 0, swaps: 0 };
    b.volume += t.notional_usdc || 0;
    b.captured += t.lvr_captured_usdc || 0;
    b.swaps += 1;
    by.set(day, b);
  }
  const all = [...by.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  return all.slice(-maxDays);
}

export type Slice = { label: string; value: number; color: string };

/**
 * Where the retained value came from, by the direction that was running.
 *
 * Worth splitting because an LP's intuition is usually that a hook like this earns in
 * downtrends. Whether that holds for a given pool is a question about its flow, not its design,
 * and this is the chart that answers it.
 */
export function capturedByTrendOf(rows: SwapRow[]): Slice[] {
  let up = 0;
  let down = 0;
  for (const t of rows) {
    if (!t.with_trend || (t.lvr_captured_usdc || 0) <= 0) continue;
    if (t.trend === "up") up += t.lvr_captured_usdc;
    else if (t.trend === "down") down += t.lvr_captured_usdc;
  }
  return [
    { label: "Up-trend", value: up, color: "var(--up)" },
    { label: "Down-trend", value: down, color: "var(--down)" },
  ].filter((s) => s.value > 0);
}

/** Notional split by which way the swap went, regardless of whether it paid. */
export function sideSplitOf(rows: SwapRow[]): Slice[] {
  let buy = 0;
  let sell = 0;
  for (const t of rows) {
    if (t.side === "buy_weth") buy += t.notional_usdc || 0;
    else sell += t.notional_usdc || 0;
  }
  return [
    { label: "Bought WETH", value: buy, color: "var(--lav)" },
    { label: "Sold WETH", value: sell, color: "var(--honey)" },
  ].filter((s) => s.value > 0);
}

export type Bucket = { label: string; n: number; frac: number };

/**
 * Distribution of the spread actually charged, as a share of the cap.
 *
 * The useful read is whether the pool lives near its ceiling or rarely approaches it. A pool
 * pinned at 100% of the cap is one whose cap is doing the work rather than its detector.
 */
export function kappaHistogramOf(rows: SwapRow[], kappaMax: number): Bucket[] {
  const edges = [0.2, 0.4, 0.6, 0.8, 1.0001];
  const labels = ["0–20%", "20–40%", "40–60%", "60–80%", "80–100%"];
  const counts = new Array(edges.length).fill(0);
  let total = 0;
  for (const t of rows) {
    const k = t.kappa || 0;
    if (!t.with_trend || k <= 0 || kappaMax <= 0) continue;
    const frac = k / kappaMax;
    const i = edges.findIndex((e) => frac < e);
    counts[i < 0 ? edges.length - 1 : i] += 1;
    total += 1;
  }
  return labels.map((label, i) => ({
    label,
    n: counts[i],
    frac: total ? counts[i] / total : 0,
  }));
}
