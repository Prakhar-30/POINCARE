import { useMemo } from "react";
import { toWad, type DetectorParams } from "@/lib/detector";
import {
  EMPTY_PARITY,
  metricsOf,
  parityOf,
  replay,
  type Parity,
  type ReplayMetrics,
  type ReplayPoint,
} from "@/lib/replay";
import type { ConfigInput } from "@/lib/narrate";
import type { DetectorPoint } from "@/lib/onchain";

/**
 * Build a full `DetectorParams` from the Lab's sliders.
 *
 * Only the detection parameters are adjustable. Everything else is inherited from
 * the deployed configuration, deliberately:
 *
 *  - `clipWad` cannot move, because the recorded returns are already clipped at
 *    the deployed value and a wider clip cannot recover what was discarded;
 *  - `sigmaFloor`, `feeGamma` and `feeCap` are not detection parameters;
 *  - `kappaMin` is clamped under `kappaMax` so the control law's own validity
 *    condition (`kappaMax >= kappaMin`) holds for every slider position.
 */
/**
 * Standing in for a `sigmaFloor` the deployed pool does not have.
 *
 * `PoincareHook`'s constructor requires `sigmaFloor > 0` whenever `adaptive` is
 * set, but a pool deployed in absolute mode can legitimately carry a floor of
 * zero — the current one does. Toggling adaptive in the Lab would then describe a
 * configuration the hook would refuse to deploy, and standardizing by a zero
 * sigma is a division by zero. This floor keeps the replay inside the contract's
 * own validity rule; at roughly a thousandth of a realistic per-block sigma it
 * only ever binds in the degenerate cold-start case it exists for.
 */
const FALLBACK_SIGMA_FLOOR = 1_000_000_000_000n; // 1e-6 in WAD

export function paramsOf(input: ConfigInput, live: DetectorParams): DetectorParams {
  const kappaMax = toWad(input.kappaMax);
  return {
    ...live,
    k: toWad(input.k),
    h: toWad(input.h),
    sMax: toWad(input.sMax),
    lambda: toWad(input.lambda),
    dFloor: toWad(input.dFloor),
    kappaMax,
    kappaMin: live.kappaMin > kappaMax ? kappaMax : live.kappaMin,
    dMax: toWad(input.dMax),
    adaptive: input.adaptive,
    sigmaFloor:
      input.adaptive && live.sigmaFloor === 0n ? FALLBACK_SIGMA_FLOOR : live.sigmaFloor,
  };
}

export type LabReplay = {
  /** The deployed configuration replayed over the same window — the control. */
  live: ReplayPoint[];
  liveMetrics: ReplayMetrics;
  /** The slider configuration replayed over the same window. */
  candidate: ReplayPoint[];
  candidateMetrics: ReplayMetrics;
  /**
   * How closely the live replay reproduces the trace the chain emitted. This is
   * the Lab's correctness claim: if the port were wrong, this would not close.
   */
  parity: Parity;
  ready: boolean;
};

/**
 * Replay the recorded history twice — once under the deployed parameters, once
 * under the candidate — so every comparison is against the same blocks and the
 * same seed, and any difference is attributable to the parameters alone.
 *
 * @param fresh start both replays from a zeroed detector instead of seeding from
 *        the first recorded sample. Honest for "what if it had launched this
 *        way", at the cost of a warm-up of roughly 1/(1−λ) blocks.
 */
export function useLabReplay(
  points: DetectorPoint[],
  liveParams: DetectorParams,
  candidate: ConfigInput,
  fresh: boolean,
): LabReplay {
  return useMemo(() => {
    const ready = points.length >= 2 && liveParams.h > 0n;
    if (!ready) {
      const empty = metricsOf([]);
      return {
        live: [],
        liveMetrics: empty,
        candidate: [],
        candidateMetrics: empty,
        parity: EMPTY_PARITY,
        ready: false,
      };
    }

    const liveLambda = liveParams.lambda;
    const livePts = replay(points, liveParams, liveLambda, fresh);
    const candPts = replay(points, paramsOf(candidate, liveParams), liveLambda, fresh);

    return {
      live: livePts,
      liveMetrics: metricsOf(livePts),
      candidate: candPts,
      candidateMetrics: metricsOf(candPts),
      // Parity is only meaningful against the seeded replay: a fresh replay
      // deliberately discards the chain's starting state.
      parity: fresh ? EMPTY_PARITY : parityOf(livePts, points),
      ready: true,
    };
  }, [points, liveParams, candidate, fresh]);
}
