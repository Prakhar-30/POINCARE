/**
 * An exact TypeScript port of the on-chain detector: `Cusum.sol`,
 * `DirectionalSignal.sol` and `ControlLaw.sol`, plus the step ordering that
 * `PoincareHook._projectDetector` imposes on them.
 *
 * WHY A PORT AND NOT AN APPROXIMATION. The Detector Lab replays the pool's real
 * recorded history under hypothetical parameters, and the only thing that makes
 * such a replay worth looking at is that replaying the *live* parameters
 * reproduces the trace the chain actually emitted. So this file mirrors the
 * Solidity semantics rather than the Solidity intent:
 *
 *   - every quantity is a BigInt in WAD (1e18) fixed point, never a float;
 *   - `mulDiv` floors, like `FullMath.mulDiv`, and is only ever applied to
 *     non-negative magnitudes with the sign re-applied afterwards, exactly as
 *     `DirectionalSignal._decaySigned` does;
 *   - clamps, caps and comparison directions (`>=` vs `>`) are copied verbatim,
 *     because the boundary cases are where a reimplementation silently drifts.
 *
 * ORIENTATION. Everything here is in HOOK orientation: price is reserve1/reserve0
 * (WETH per USDC), so `sPos` is evidence of the hook's "up", which is a FALLING
 * USDC/WETH chart. The UI inverts the label at the boundary via `TREND` in
 * config/contracts.ts; this module never does, so it can be compared against raw
 * event data directly.
 *
 * Ported from src/libraries/{Cusum,DirectionalSignal,ControlLaw}.sol and the
 * detector core of src/PoincareHook.sol. If any of those change, the parity test
 * in detector.test.ts is what should fail first.
 */

export const WAD = 1_000_000_000_000_000_000n;

/**
 * Hook-orientation trend, matching the `Cusum.Trend` enum: 0 None, 1 Up, 2 Down.
 *
 * A const object rather than a TypeScript `enum`, because this project builds
 * with `erasableSyntaxOnly` — an enum emits a runtime value that type-stripping
 * cannot erase. The numeric values still match the on-chain enum exactly, which
 * is what matters when decoding a `DetectorSample` log.
 */
export const HookTrend = { None: 0, Up: 1, Down: 2 } as const;
export type HookTrend = (typeof HookTrend)[keyof typeof HookTrend];

/** `FullMath.mulDiv`: floor((a*b)/d) for non-negative inputs. */
export const mulDiv = (a: bigint, b: bigint, d: bigint): bigint => (a * b) / d;

const abs = (x: bigint): bigint => (x < 0n ? -x : x);

/**
 * The full injected detector configuration, in the same units the hook holds it.
 * `k`, `h`, `sMax` and `clipWad` share one scale: absolute WAD log-return units
 * when `adaptive` is false, σ-units when true (see PoincareConfig).
 */
export type DetectorParams = {
  // detector
  k: bigint;
  h: bigint;
  sMax: bigint;
  lambda: bigint;
  dFloor: bigint;
  adaptive: boolean;
  sigmaFloor: bigint;
  clipWad: bigint;
  // control law
  kappaMin: bigint;
  kappaMax: bigint;
  dMax: bigint;
  // vol fee
  feeGamma: bigint;
  feeCap: bigint;
};

/** The mutable per-pool detector state, mirroring the hook's packed storage. */
export type DetectorState = {
  sPos: bigint;
  sNeg: bigint;
  ewmaNet: bigint;
  ewmaTV: bigint;
  kappa: bigint;
  trend: HookTrend;
};

export const zeroState = (): DetectorState => ({
  sPos: 0n,
  sNeg: 0n,
  ewmaNet: 0n,
  ewmaTV: 0n,
  kappa: 0n,
  trend: HookTrend.None,
});

// ---------------------------------------------------------------------------
// Cusum.sol
// ---------------------------------------------------------------------------

/** `Cusum.updateCapped`: the two-sided recursion, clamped into [0, sMax]. */
export function cusumUpdateCapped(
  sPos: bigint,
  sNeg: bigint,
  r: bigint,
  k: bigint,
  sMax: bigint,
): { sPos: bigint; sNeg: bigint } {
  let p = sPos + (r - k);
  if (p < 0n) p = 0n;
  else if (p > sMax) p = sMax;

  let n = sNeg + (-r - k);
  if (n < 0n) n = 0n;
  else if (n > sMax) n = sMax;

  return { sPos: p, sNeg: n };
}

/** `Cusum.alarm`: which statistic, if any, has crossed `h`. `>=` so hitting h fires. */
export function cusumAlarm(sPos: bigint, sNeg: bigint, h: bigint): HookTrend {
  const up = sPos >= h;
  const down = sNeg >= h;
  if (up && down) return sPos >= sNeg ? HookTrend.Up : HookTrend.Down;
  if (up) return HookTrend.Up;
  if (down) return HookTrend.Down;
  return HookTrend.None;
}

// ---------------------------------------------------------------------------
// DirectionalSignal.sol
// ---------------------------------------------------------------------------

/** `DirectionalSignal._decaySigned`: a*lambda/WAD, sign-preserving. */
const decaySigned = (a: bigint, lambda: bigint): bigint => {
  if (a === 0n) return 0n;
  const scaled = mulDiv(abs(a), lambda, WAD);
  return a < 0n ? -scaled : scaled;
};

/** `DirectionalSignal.update`: decay both accumulators, then fold in `r`. */
export function signalUpdate(
  ewmaNet: bigint,
  ewmaTV: bigint,
  r: bigint,
  lambda: bigint,
): { ewmaNet: bigint; ewmaTV: bigint } {
  return {
    ewmaNet: decaySigned(ewmaNet, lambda) + r,
    ewmaTV: mulDiv(ewmaTV, lambda, WAD) + abs(r),
  };
}

/** `DirectionalSignal.efficiency`: D = |net| / totalVariation, clamped into [0, WAD]. */
export function signalEfficiency(absNet: bigint, totalVariation: bigint): bigint {
  if (totalVariation === 0n) return 0n;
  if (absNet >= totalVariation) return WAD;
  return mulDiv(absNet, WAD, totalVariation);
}

/** `DirectionalSignal.signal`: current directional efficiency D. */
export const signalD = (ewmaNet: bigint, ewmaTV: bigint): bigint =>
  signalEfficiency(abs(ewmaNet), ewmaTV);

/** `DirectionalSignal.sigmaWad`: the EW mean absolute return, σ̂. */
export const signalSigma = (ewmaTV: bigint, lambda: bigint): bigint =>
  mulDiv(ewmaTV, WAD - lambda, WAD);

// ---------------------------------------------------------------------------
// ControlLaw.sol
// ---------------------------------------------------------------------------

/** `ControlLaw.targetKappa`: linear ramp from κ_min at h to κ_max at sMax. */
export function targetKappa(s: bigint, p: DetectorParams): bigint {
  if (s <= p.h) return p.kappaMin;
  if (s >= p.sMax) return p.kappaMax;
  const span = p.sMax - p.h;
  const into = s - p.h;
  return p.kappaMin + mulDiv(p.kappaMax - p.kappaMin, into, span);
}

/** `ControlLaw.rateLimit`: move `prev` toward `target` by at most `dMax`. */
export function rateLimit(prev: bigint, target: bigint, dMax: bigint): bigint {
  if (target > prev) {
    const up = prev + dMax;
    return target < up ? target : up;
  }
  const down = prev > dMax ? prev - dMax : 0n;
  return target > down ? target : down;
}

/** `ControlLaw.step`: ramp, rate-limit, then clamp back into [κ_min, κ_max]. */
export function controlStep(prevKappa: bigint, s: bigint, p: DetectorParams): bigint {
  let kappa = rateLimit(prevKappa, targetKappa(s, p), p.dMax);
  if (kappa < p.kappaMin) kappa = p.kappaMin;
  else if (kappa > p.kappaMax) kappa = p.kappaMax;
  return kappa;
}

/** `ControlLaw.volFee`: min(γ·σ̂, feeCap). */
export function volFee(sigma: bigint, feeGamma: bigint, feeCap: bigint): bigint {
  const fee = mulDiv(feeGamma, sigma, WAD);
  return fee > feeCap ? feeCap : fee;
}

// ---------------------------------------------------------------------------
// PoincareHook._projectDetector: the step that composes the three libraries
// ---------------------------------------------------------------------------

/** One detector step's observable output, alongside the state it produced. */
export type StepResult = {
  state: DetectorState;
  /** The clipped log-return actually consumed (hook orientation). */
  r: bigint;
  /** What the CUSUM ate: `r`, or `r/σ̂` in adaptive mode. */
  inc: bigint;
  d: bigint;
  sigma: bigint;
  kappa: bigint;
  trend: HookTrend;
  fee: bigint;
  /** Evidence after the D-gate; 0 means the move was not directional enough. */
  gatedEvidence: bigint;
  /** True when the gated evidence is at or past `h` — the detector is firing. */
  firing: boolean;
};

/**
 * One detector step, in the exact order `PoincareHook._projectDetector` runs it.
 *
 * The ordering is load-bearing and easy to get wrong, so it is spelled out:
 * σ̂ is read from the state BEFORE this sample is folded in (so a sample is never
 * standardized or clipped by itself), the signal accumulators are folded with the
 * CLIPPED return, and the D-gate is applied to the POST-fold D.
 *
 * @param rRaw the unclipped log-return for this block, hook orientation.
 */
export function stepDetector(prev: DetectorState, rRaw: bigint, p: DetectorParams): StepResult {
  // σ̂ as of the previous sample: what the clip and the standardization use.
  const sigmaBefore = signalSigma(prev.ewmaTV, p.lambda);

  let r = rRaw;
  let inc: bigint;
  if (p.adaptive) {
    const sigmaEff = sigmaBefore < p.sigmaFloor ? p.sigmaFloor : sigmaBefore;
    const rCap = mulDiv(p.clipWad, sigmaEff, WAD);
    if (r > rCap) r = rCap;
    else if (r < -rCap) r = -rCap;
    inc = r >= 0n ? mulDiv(r, WAD, sigmaEff) : -mulDiv(-r, WAD, sigmaEff);
  } else {
    const rCap = p.clipWad;
    if (r > rCap) r = rCap;
    else if (r < -rCap) r = -rCap;
    inc = r;
  }

  const sig = signalUpdate(prev.ewmaNet, prev.ewmaTV, r, p.lambda);
  const d = signalD(sig.ewmaNet, sig.ewmaTV);
  const sigma = signalSigma(sig.ewmaTV, p.lambda);

  const cs = cusumUpdateCapped(prev.sPos, prev.sNeg, inc, p.k, p.sMax);

  // The dominant statistic is the candidate direction; ties break to Up, as on-chain.
  const dir = cs.sPos >= cs.sNeg ? HookTrend.Up : HookTrend.Down;
  const evidence = cs.sPos >= cs.sNeg ? cs.sPos : cs.sNeg;

  // The directional-efficiency gate: asymmetry engages only on a genuinely
  // directional move, otherwise zero evidence is fed so kappa ramps back down.
  const gatedEvidence = d >= p.dFloor ? evidence : 0n;

  const kappa = controlStep(prev.kappa, gatedEvidence, p);

  // Only re-label on live evidence, so the label keeps matching the side kappa was
  // built for while it ramps down.
  const trend = gatedEvidence > 0n ? dir : prev.trend;

  return {
    state: { sPos: cs.sPos, sNeg: cs.sNeg, ewmaNet: sig.ewmaNet, ewmaTV: sig.ewmaTV, kappa, trend },
    r,
    inc,
    d,
    sigma,
    kappa,
    trend,
    fee: volFee(sigma, p.feeGamma, p.feeCap),
    gatedEvidence,
    firing: gatedEvidence >= p.h,
  };
}

/** The spread a swap pays under a given state: κ on the with-trend side, 0 otherwise. */
export function spreadGiven(kappa: bigint, trend: HookTrend, zeroForOne: boolean): bigint {
  if (kappa === 0n) return 0n;
  const withTrend =
    (trend === HookTrend.Up && !zeroForOne) || (trend === HookTrend.Down && zeroForOne);
  return withTrend ? kappa : 0n;
}

// ---------------------------------------------------------------------------
// float <-> WAD boundary
// ---------------------------------------------------------------------------

/**
 * The shortest decimal string that round-trips to `x`, with any exponent expanded.
 *
 * `toString()` gives the shortest round-tripping form ("0.07"), which is the
 * value the user actually means. `toFixed(18)` does NOT: it prints the float's
 * true binary expansion, so `(0.07).toFixed(18)` is "0.070000000000000007" and a
 * parameter would arrive seven wei away from the intended one. The only cost of
 * `toString()` is that it switches to exponent form below 1e-6, which this
 * expands by hand rather than round-tripping back through a float.
 */
function decimalStringOf(x: number): string {
  const s = x.toString();
  const e = s.indexOf("e");
  if (e < 0) return s;

  const mantissa = s.slice(0, e);
  const exp = Number(s.slice(e + 1));
  const neg = mantissa.startsWith("-");
  const mm = neg ? mantissa.slice(1) : mantissa;
  const dot = mm.indexOf(".");
  const intPart = dot < 0 ? mm : mm.slice(0, dot);
  const fracPart = dot < 0 ? "" : mm.slice(dot + 1);
  const digits = intPart + fracPart;
  const point = intPart.length + exp;

  let out: string;
  if (point <= 0) out = `0.${"0".repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits + "0".repeat(point - digits.length);
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  return neg ? `-${out}` : out;
}

/**
 * Convert a decimal number to WAD without the float multiplication that would
 * lose the low digits (`0.0001 * 1e18` is not exactly `1e14`). Digits past the
 * eighteenth are truncated, which rounds a magnitude down — the same direction
 * `FullMath.mulDiv` floors.
 */
export function toWad(n: number): bigint {
  if (!Number.isFinite(n)) return 0n;
  const neg = n < 0;
  const [int, frac = ""] = decimalStringOf(Math.abs(n)).split(".");
  const v = BigInt(int || "0") * WAD + BigInt(`${frac}${"0".repeat(18)}`.slice(0, 18));
  return neg ? -v : v;
}

/** WAD -> number, for display and charting only; never feed this back into the engine. */
export const fromWad = (v: bigint): number => Number(v) / 1e18;
