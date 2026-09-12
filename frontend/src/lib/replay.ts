/**
 * Replays the pool's recorded detector history under hypothetical parameters.
 *
 * The input is the real `DetectorSample` trace the hook emitted (one row per
 * sampled block, mirrored into `detector_samples`), and specifically its `r`
 * column: the clipped log-return the detector actually consumed that block. That
 * series is a property of the MARKET, not of the configuration, so it can be
 * re-fed to a differently-tuned detector to ask "what would this pool have done
 * with these parameters instead?".
 *
 * Two honest limits, surfaced in the UI rather than buried here:
 *
 *  1. `r` is recorded post-clip. Replaying with a SMALLER `clipWad` re-clips
 *     correctly; a LARGER one cannot recover returns the live hook already
 *     clipped, so the Lab holds `clipWad` at the deployed value.
 *  2. The EWMA accumulators are not in the event, so the replay seeds them by
 *     inverting the recorded `σ̂` and `D` at the first sample (see `seedFrom`).
 *     The inversion is exact for `ewmaTV`, and exact up to the SIGN of `ewmaNet`,
 *     which is inferred from the first return. EWMA decay means any seed error
 *     washes out within a few effective windows.
 *
 * Everything downstream of the seed is the exact on-chain arithmetic
 * (see detector.ts), so replaying the LIVE parameters reproduces the recorded
 * trace — which is what `parityOf` measures and the Lab shows.
 */

import type { TrendLabel } from "@/config/contracts";
import type { DetectorPoint } from "@/lib/onchain";
import {
  HookTrend,
  WAD,
  fromWad,
  mulDiv,
  signalSigma,
  stepDetector,
  toWad,
  zeroState,
  type DetectorParams,
  type DetectorState,
} from "@/lib/detector";

/** One replayed block. Shape-compatible with `DetectorPoint` so the charts can
 *  render a replay and the real trace with the same code. */
export type ReplayPoint = DetectorPoint & {
  /** The detector crossed `h` this block (post D-gate). */
  firing: boolean;
  /** Evidence after the D-gate, in statistic units. */
  gated: number;
  /** The D-gate held evidence back this block despite a non-zero statistic. */
  gateBlocked: boolean;
  /** Exact replayed state, so the parity check never compares rounded views. */
  sPosWad: bigint;
  sNegWad: bigint;
  kappaWad: bigint;
};

/** A contiguous stretch of blocks where the curve was leaning. */
export type LeanEpisode = {
  startBlock: number;
  endBlock: number;
  blocks: number;
  peakKappa: number;
  trend: TrendLabel;
};

export type ReplayMetrics = {
  blocks: number;
  /** Rising edges of the firing condition: how often the detector declared a trend. */
  firings: number;
  /** Blocks where the curve leaned (κ > 0). */
  leanBlocks: number;
  /** Share of the window spent leaning. */
  dutyCycle: number;
  /** Blocks per firing over this window — the empirical run-length, the quantity
   *  ARL₀ targets. Only comparable between configs on the SAME window. */
  blocksPerFiring: number | null;
  peakKappa: number;
  /** Mean κ over the blocks where it was non-zero. */
  meanLeanKappa: number;
  /** Blocks where the statistic was past `h` but the D-gate suppressed it. */
  gateSaves: number;
  episodes: LeanEpisode[];
};

/** UI trend label -> hook-orientation enum. The recorded label is already
 *  inverted for the chart (see `TREND` in config/contracts), so this inverts back. */
const hookTrendOf = (t: TrendLabel): HookTrend =>
  t === "down" ? HookTrend.Up : t === "up" ? HookTrend.Down : HookTrend.None;

/** Hook-orientation enum -> UI trend label. */
const uiTrendOf = (t: HookTrend): TrendLabel =>
  t === HookTrend.Up ? "down" : t === HookTrend.Down ? "up" : "none";

type RawWadFields = NonNullable<DetectorPoint["wad"]>;

/**
 * Read one field of a recorded sample as an exact WAD integer.
 *
 * Prefers the verbatim event value (`wad`, from migration 004) and falls back to
 * re-widening the charting float. The fallback is accurate to about fifteen
 * significant digits, which is invisible on a chart and visible in the parity
 * badge — which is the point of keeping the two paths distinguishable.
 */
const exact = (p: DetectorPoint, field: keyof RawWadFields, float: number): bigint => {
  const raw = p.wad?.[field];
  return raw !== undefined && raw !== null ? BigInt(raw) : toWad(float);
};

/**
 * Reconstruct the detector state at a recorded sample.
 *
 * `σ̂ = ewmaTV·(WAD−λ)/WAD` inverts exactly to `ewmaTV = σ̂·WAD/(WAD−λ)`, and
 * `D = |ewmaNet|/ewmaTV` gives the magnitude of `ewmaNet`. Only its sign is
 * unrecoverable from the event, so it is taken from the sign of that block's
 * return — the term that dominates the accumulator right after it is folded in.
 *
 * @param liveLambda the λ the pool was DEPLOYED with, which is what produced the
 *        recorded σ̂. A what-if λ must not be used to invert it.
 */
export function seedFrom(sample: DetectorPoint, liveLambda: bigint): DetectorState {
  const sigma = exact(sample, "sigma", sample.sigma);
  const ewmaTV = liveLambda < WAD ? mulDiv(sigma, WAD, WAD - liveLambda) : 0n;
  const mag = mulDiv(exact(sample, "d", sample.d), ewmaTV, WAD);
  const ewmaNet = sample.r < 0 ? -mag : mag;

  return {
    sPos: exact(sample, "s_pos", sample.s_pos),
    sNeg: exact(sample, "s_neg", sample.s_neg),
    ewmaNet,
    ewmaTV,
    kappa: exact(sample, "kappa", sample.kappa),
    trend: hookTrendOf(sample.trend),
  };
}

/**
 * Replay `samples` under `params`.
 *
 * The first sample seeds the state and is echoed unchanged (nothing is known
 * about what came before it); every later sample is re-derived from its recorded
 * return. Pass `fresh` to start from a zeroed detector instead — the honest view
 * of "what if this pool had launched with these parameters", at the cost of a
 * warm-up of roughly `1/(1−λ)` blocks.
 */
export function replay(
  samples: DetectorPoint[],
  params: DetectorParams,
  liveLambda: bigint,
  fresh = false,
): ReplayPoint[] {
  if (samples.length === 0) return [];

  let state = fresh ? zeroState() : seedFrom(samples[0], liveLambda);
  const first = samples[0];

  const out: ReplayPoint[] = [
    {
      ...first,
      s_pos: fromWad(state.sPos),
      s_neg: fromWad(state.sNeg),
      kappa: fromWad(state.kappa),
      sigma: fromWad(signalSigma(state.ewmaTV, params.lambda)),
      trend: uiTrendOf(state.trend),
      firing: false,
      gated: 0,
      gateBlocked: false,
      sPosWad: state.sPos,
      sNegWad: state.sNeg,
      kappaWad: state.kappa,
    },
  ];

  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    const step = stepDetector(state, exact(s, "r", s.r), params);
    state = step.state;

    const statistic = step.state.sPos >= step.state.sNeg ? step.state.sPos : step.state.sNeg;

    out.push({
      block_number: s.block_number,
      price: s.price,
      r: fromWad(step.r),
      s_pos: fromWad(step.state.sPos),
      s_neg: fromWad(step.state.sNeg),
      d: fromWad(step.d),
      sigma: fromWad(step.sigma),
      kappa: fromWad(step.kappa),
      trend: uiTrendOf(step.trend),
      fee: fromWad(step.fee),
      firing: step.firing,
      gated: fromWad(step.gatedEvidence),
      gateBlocked: step.gatedEvidence === 0n && statistic >= params.h,
      sPosWad: step.state.sPos,
      sNegWad: step.state.sNeg,
      kappaWad: step.kappa,
    });
  }

  return out;
}

/** Summary statistics over a replayed (or recorded) series. */
export function metricsOf(points: ReplayPoint[]): ReplayMetrics {
  const blocks = points.length;
  const empty: ReplayMetrics = {
    blocks,
    firings: 0,
    leanBlocks: 0,
    dutyCycle: 0,
    blocksPerFiring: null,
    peakKappa: 0,
    meanLeanKappa: 0,
    gateSaves: 0,
    episodes: [],
  };
  if (blocks === 0) return empty;

  let firings = 0;
  let leanBlocks = 0;
  let gateSaves = 0;
  let peakKappa = 0;
  let leanKappaSum = 0;
  let wasFiring = false;

  const episodes: LeanEpisode[] = [];
  let open: LeanEpisode | null = null;

  for (const p of points) {
    if (p.firing && !wasFiring) firings++;
    wasFiring = p.firing;
    if (p.gateBlocked) gateSaves++;

    if (p.kappa > 0) {
      leanBlocks++;
      leanKappaSum += p.kappa;
      peakKappa = Math.max(peakKappa, p.kappa);
      if (!open) {
        open = {
          startBlock: p.block_number,
          endBlock: p.block_number,
          blocks: 0,
          peakKappa: 0,
          trend: p.trend,
        };
      }
      open.endBlock = p.block_number;
      open.blocks++;
      if (p.kappa > open.peakKappa) {
        open.peakKappa = p.kappa;
        open.trend = p.trend;
      }
    } else if (open) {
      episodes.push(open);
      open = null;
    }
  }
  if (open) episodes.push(open);

  return {
    blocks,
    firings,
    leanBlocks,
    dutyCycle: leanBlocks / blocks,
    blocksPerFiring: firings > 0 ? blocks / firings : null,
    peakKappa,
    meanLeanKappa: leanBlocks > 0 ? leanKappaSum / leanBlocks : 0,
    gateSaves,
    episodes,
  };
}

export type Parity = {
  /** Samples compared (the seed block is excluded — it is an input, not a result). */
  compared: number;
  /** Largest absolute deviation on either CUSUM statistic, in wei of the statistic. */
  maxEvidenceDriftWei: bigint;
  /** Largest absolute deviation on κ, in wei. */
  maxKappaDriftWei: bigint;
  /** True when every block's trend label matched the recorded one. */
  trendsMatch: boolean;
  /** True when every compared block carried verbatim event integers (migration 004). */
  exactInputs: boolean;
};

export const EMPTY_PARITY: Parity = {
  compared: 0,
  maxEvidenceDriftWei: 0n,
  maxKappaDriftWei: 0n,
  trendsMatch: true,
  exactInputs: true,
};

/**
 * Compare a replay against the trace the chain actually emitted.
 *
 * Run with the LIVE parameters, this is the Lab's correctness proof: the replay
 * has to land back on the recorded numbers, or the port is wrong. Where the
 * verbatim event integers are available the comparison is exact and the drift
 * should be zero wei; where it falls back to the charting floats, a few hundred
 * wei of round-trip error is expected and `exactInputs` says so.
 *
 * The comparison runs in WAD integers rather than on the replay's float view, so
 * it cannot be fooled by both sides losing the same digits.
 */
export function parityOf(replayed: ReplayPoint[], recorded: DetectorPoint[]): Parity {
  let maxEvidenceDriftWei = 0n;
  let maxKappaDriftWei = 0n;
  let trendsMatch = true;
  let exactInputs = true;
  let compared = 0;

  const absOf = (x: bigint) => (x < 0n ? -x : x);
  const maxOf = (a: bigint, b: bigint) => (a > b ? a : b);

  const byBlock = new Map(recorded.map((p) => [p.block_number, p]));
  for (const p of replayed.slice(1)) {
    const actual = byBlock.get(p.block_number);
    if (!actual) continue;
    compared++;
    if (!actual.wad) exactInputs = false;

    maxEvidenceDriftWei = maxOf(
      maxEvidenceDriftWei,
      maxOf(
        absOf(p.sPosWad - exact(actual, "s_pos", actual.s_pos)),
        absOf(p.sNegWad - exact(actual, "s_neg", actual.s_neg)),
      ),
    );
    maxKappaDriftWei = maxOf(
      maxKappaDriftWei,
      absOf(p.kappaWad - exact(actual, "kappa", actual.kappa)),
    );
    if (p.trend !== actual.trend) trendsMatch = false;
  }

  return { compared, maxEvidenceDriftWei, maxKappaDriftWei, trendsMatch, exactInputs };
}
