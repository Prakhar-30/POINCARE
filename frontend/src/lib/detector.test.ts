/**
 * Parity tests for the off-chain detector port.
 *
 * The Detector Lab's whole claim is that replaying the deployed parameters
 * reproduces what the chain did, so this file's job is to hold the port against
 * the Solidity it mirrors. The vectors below are lifted from the contract suite —
 * `test/Cusum.t.sol`, `test/DirectionalSignal.t.sol`, `test/ControlLaw.t.sol` —
 * with the same constants and the same expected numbers, so a divergence fails
 * here with the same arithmetic the auditors read.
 *
 * If a library changes on-chain, this is what should go red first.
 */

import { describe, expect, it } from "vitest";
import {
  HookTrend,
  WAD,
  controlStep,
  cusumAlarm,
  cusumUpdateCapped,
  rateLimit,
  signalD,
  signalEfficiency,
  signalSigma,
  signalUpdate,
  stepDetector,
  targetKappa,
  toWad,
  volFee,
  zeroState,
  type DetectorParams,
} from "./detector";
import { metricsOf, parityOf, replay, type ReplayPoint } from "./replay";
import trace from "./__fixtures__/unichain-sepolia-trace.json";
import type { DetectorPoint } from "./onchain";

// The constants used by test/Cusum.t.sol.
const K = 1_000_000_000_000_000n; // 1e15, slack
const H = 20_000_000_000_000_000n; // 2e16, threshold
const SMAX = 10n ** 18n; // generous: these vectors never clamp at the top

// test/DirectionalSignal.t.sol.
const LAMBDA = 900_000_000_000_000_000n; // 0.9
const R = 10_000_000_000_000_000n; // a 1% log-return step

/**
 * A repeating path that drifts up but keeps reversing: +1%, +1%, −0.6%.
 *
 * It accumulates CUSUM evidence (net +1.1% per cycle, well clear of the slack)
 * while never being cleanly directional, which is exactly the regime the
 * directional-efficiency gate exists to separate from a real trend.
 */
const DRIFTY_CHOP = [10_000_000_000_000_000n, 10_000_000_000_000_000n, -6_000_000_000_000_000n];
const DRIFTY_CHOP_N = [0.01, 0.01, -0.006];

/** `Cusum.step`: update, then fire-and-reset. Used by the reset/hysteresis vectors. */
function cusumStep(sPos: bigint, sNeg: bigint, r: bigint, k: bigint, h: bigint) {
  const s = cusumUpdateCapped(sPos, sNeg, r, k, SMAX);
  const t = cusumAlarm(s.sPos, s.sNeg, h);
  if (t === HookTrend.Up) s.sPos = 0n;
  else if (t === HookTrend.Down) s.sNeg = 0n;
  return { ...s, trend: t };
}

function stepsToAlarm(r: bigint, k: bigint, h: bigint, maxSteps: number) {
  let sPos = 0n;
  let sNeg = 0n;
  for (let i = 1; i <= maxSteps; i++) {
    const out = cusumStep(sPos, sNeg, r, k, h);
    sPos = out.sPos;
    sNeg = out.sNeg;
    if (out.trend !== HookTrend.None) return { steps: i, dir: out.trend };
  }
  return { steps: 0, dir: HookTrend.None };
}

describe("Cusum — vectors from test/Cusum.t.sol", () => {
  it("zero drift never fires", () => {
    let s = { sPos: 0n, sNeg: 0n };
    for (let i = 0; i < 1000; i++) s = cusumUpdateCapped(s.sPos, s.sNeg, 0n, K, SMAX);
    expect(s.sPos).toBe(0n);
    expect(s.sNeg).toBe(0n);
    expect(cusumAlarm(s.sPos, s.sNeg, H)).toBe(HookTrend.None);
  });

  it("noise strictly below the slack never accumulates", () => {
    const mag = K - 1n;
    let sPos = 0n;
    let sNeg = 0n;
    for (let i = 0; i < 1000; i++) {
      const out = cusumStep(sPos, sNeg, i % 2 === 0 ? mag : -mag, K, H);
      sPos = out.sPos;
      sNeg = out.sNeg;
    }
    expect(sPos).toBe(0n);
    expect(sNeg).toBe(0n);
  });

  it("positive drift fires Up at step 5", () => {
    // increment per step = r - k = 5e15 - 1e15 = 4e15; 2e16 / 4e15 = 5.
    const { steps, dir } = stepsToAlarm(5_000_000_000_000_000n, K, H, 100);
    expect(steps).toBe(5);
    expect(dir).toBe(HookTrend.Up);
  });

  it("negative drift fires Down at step 5", () => {
    const { steps, dir } = stepsToAlarm(-5_000_000_000_000_000n, K, H, 100);
    expect(steps).toBe(5);
    expect(dir).toBe(HookTrend.Down);
  });

  it("the firing delay is data-dependent: stronger drift fires sooner", () => {
    const slow = stepsToAlarm(5_000_000_000_000_000n, K, H, 100).steps;
    const fast = stepsToAlarm(9_000_000_000_000_000n, K, H, 100).steps;
    expect(slow).toBe(5);
    expect(fast).toBe(3); // ceil(2e16 / 8e15)
    expect(fast).toBeLessThan(slow);
  });

  it("reset-on-fire re-detects after re-accumulation", () => {
    let sPos = 0n;
    let sNeg = 0n;
    const fires: number[] = [];
    for (let i = 1; i <= 12; i++) {
      const out = cusumStep(sPos, sNeg, 5_000_000_000_000_000n, K, H);
      sPos = out.sPos;
      sNeg = out.sNeg;
      if (out.trend === HookTrend.Up) fires.push(i);
    }
    expect(fires).toEqual([5, 10]);
  });

  it("an exact tie breaks to Up", () => {
    expect(cusumAlarm(H, H, H)).toBe(HookTrend.Up);
  });

  it("clamps into [0, sMax]", () => {
    const capped = cusumUpdateCapped(0n, 0n, 10n ** 18n, 0n, 5n * 10n ** 17n);
    expect(capped.sPos).toBe(5n * 10n ** 17n);
    expect(capped.sNeg).toBe(0n);
  });
});

describe("DirectionalSignal — vectors from test/DirectionalSignal.t.sol", () => {
  it("a straight path gives D = 1", () => {
    expect(signalEfficiency(100n * WAD, 100n * WAD)).toBe(WAD);
  });

  it("a round trip gives D = 0", () => {
    expect(signalEfficiency(0n, 100n * WAD)).toBe(0n);
  });

  it("no movement gives D = 0 rather than dividing by zero", () => {
    expect(signalEfficiency(0n, 0n)).toBe(0n);
  });

  it("a half-efficient path gives D = 0.5", () => {
    expect(signalEfficiency(50n * WAD, 100n * WAD)).toBe(WAD / 2n);
  });

  it("clamps when net exceeds total variation", () => {
    expect(signalEfficiency(150n * WAD, 100n * WAD)).toBe(WAD);
  });

  it("a single move is trivially efficient", () => {
    const s = signalUpdate(0n, 0n, R, LAMBDA);
    expect(s.ewmaNet).toBe(R);
    expect(s.ewmaTV).toBe(R);
    expect(signalD(s.ewmaNet, s.ewmaTV)).toBe(WAD);
  });

  it("a sustained one-way drift gives D = 1", () => {
    let s = { ewmaNet: 0n, ewmaTV: 0n };
    for (let i = 0; i < 50; i++) s = signalUpdate(s.ewmaNet, s.ewmaTV, R, LAMBDA);
    expect(signalD(s.ewmaNet, s.ewmaTV)).toBe(WAD);
  });

  it("sigma converges to the constant per-step |r|", () => {
    let s = { ewmaNet: 0n, ewmaTV: 0n };
    for (let i = 0; i < 400; i++) s = signalUpdate(s.ewmaNet, s.ewmaTV, i % 2 === 0 ? R : -R, LAMBDA);
    const sigma = signalSigma(s.ewmaTV, LAMBDA);
    // The Solidity asserts a 1e12 relative tolerance on the same convergence.
    const relError = Number(sigma > R ? sigma - R : R - sigma) / Number(R);
    expect(relError).toBeLessThan(1e-6);
  });

  it("sigma is zero before any return and decays through calm", () => {
    expect(signalSigma(0n, LAMBDA)).toBe(0n);
    let s = signalUpdate(0n, 0n, R, LAMBDA);
    const active = signalSigma(s.ewmaTV, LAMBDA);
    expect(active).toBeGreaterThan(0n);
    for (let i = 0; i < 10; i++) s = signalUpdate(s.ewmaNet, s.ewmaTV, 0n, LAMBDA);
    expect(signalSigma(s.ewmaTV, LAMBDA)).toBeLessThan(active / 2n);
  });
});

describe("ControlLaw — vectors from test/ControlLaw.t.sol", () => {
  // The `_cfg()` used throughout the Solidity suite.
  const cfg = {
    h: 20_000_000_000_000_000n, // 2e16
    sMax: 100_000_000_000_000_000n, // 1e17
    kappaMin: 0n,
    kappaMax: 200_000_000_000_000_000n, // 2e17
    dMax: 10_000_000_000_000_000n, // 1e16
  } as DetectorParams;

  it("below or at the threshold, kappa is kappa_min", () => {
    expect(targetKappa(0n, cfg)).toBe(0n);
    expect(targetKappa(20_000_000_000_000_000n, cfg)).toBe(0n);
  });

  it("at or above sMax, kappa is kappa_max", () => {
    expect(targetKappa(100_000_000_000_000_000n, cfg)).toBe(cfg.kappaMax);
    expect(targetKappa(500_000_000_000_000_000n, cfg)).toBe(cfg.kappaMax);
  });

  it("the midpoint of the ramp gives half the asymmetry", () => {
    expect(targetKappa(60_000_000_000_000_000n, cfg)).toBe(100_000_000_000_000_000n);
  });

  it("rate-limits a rise to dMax", () => {
    expect(controlStep(0n, 100_000_000_000_000_000n, cfg)).toBe(10_000_000_000_000_000n);
  });

  it("reaches kappa_max under sustained saturated evidence", () => {
    let k = 0n;
    for (let i = 0; i < 100; i++) k = controlStep(k, cfg.sMax, cfg);
    expect(k).toBe(cfg.kappaMax);
  });

  it("decays back to kappa_min by at most dMax per step", () => {
    expect(controlStep(cfg.kappaMax, 0n, cfg)).toBe(cfg.kappaMax - cfg.dMax);
    let k = cfg.kappaMax;
    for (let i = 0; i < 100; i++) k = controlStep(k, 0n, cfg);
    expect(k).toBe(cfg.kappaMin);
  });

  it("rateLimit never overshoots the target", () => {
    expect(rateLimit(0n, 5n, 100n)).toBe(5n);
    expect(rateLimit(100n, 0n, 5n)).toBe(95n);
    expect(rateLimit(3n, 0n, 5n)).toBe(0n); // floors at zero rather than underflowing
  });

  it("volFee is proportional then capped", () => {
    expect(volFee(0n, 5n * 10n ** 17n, 10n ** 16n)).toBe(0n);
    expect(volFee(10n ** 16n, 0n, 10n ** 16n)).toBe(0n);
    expect(volFee(4n * 10n ** 15n, 5n * 10n ** 17n, 10n ** 16n)).toBe(2n * 10n ** 15n);
    expect(volFee(10n ** 17n, 5n * 10n ** 17n, 10n ** 16n)).toBe(10n ** 16n);
  });
});

describe("toWad", () => {
  it("does not lose the low digits to float multiplication", () => {
    // 0.0001 * 1e18 is 100000000000000.02 in IEEE754; the string path is exact.
    expect(toWad(0.0001)).toBe(100_000_000_000_000n);
    expect(toWad(0.07)).toBe(70_000_000_000_000_000n);
    expect(toWad(-0.0001)).toBe(-100_000_000_000_000n);
    expect(toWad(0)).toBe(0n);
    expect(toWad(1)).toBe(WAD);
  });
});

describe("stepDetector — the hook's composition order", () => {
  const params: DetectorParams = {
    k: K,
    h: H,
    sMax: 10n ** 18n,
    lambda: LAMBDA,
    dFloor: 0n,
    adaptive: false,
    sigmaFloor: 1n,
    clipWad: 10n ** 17n,
    kappaMin: 0n,
    kappaMax: 50_000_000_000_000_000n,
    dMax: 10_000_000_000_000_000n,
    feeGamma: 0n,
    feeCap: 0n,
  };

  it("clips the increment at clipWad", () => {
    const out = stepDetector(zeroState(), 10n ** 18n, params);
    expect(out.r).toBe(params.clipWad);
    expect(out.inc).toBe(params.clipWad);
  });

  it("the D-gate suppresses evidence on a path that is not directional enough", () => {
    // A net-positive path that keeps reversing: the CUSUM accumulates, but any
    // sign reversal in the window makes |net| strictly less than total variation,
    // so D is strictly below 1 and a floor of 1.0 can never be satisfied. That
    // makes this deterministic rather than dependent on where D happens to land.
    const gated: DetectorParams = { ...params, dFloor: WAD };
    let state = zeroState();
    let maxKappa = 0n;
    for (let i = 0; i < 21; i++) {
      const out = stepDetector(state, DRIFTY_CHOP[i % 3], gated);
      state = out.state;
      if (out.kappa > maxKappa) maxKappa = out.kappa;
    }
    // The statistic climbs past the threshold; the gate is what keeps it off the
    // curve. Checked across every step, not just the last: a lean that opened and
    // closed inside the loop would still be a gate failure.
    expect(state.sPos).toBeGreaterThan(H);
    expect(maxKappa).toBe(0n);
  });

  it("without a gate, a sustained drift leans the curve", () => {
    let state = zeroState();
    for (let i = 0; i < 20; i++) state = stepDetector(state, 5_000_000_000_000_000n, params).state;
    expect(state.kappa).toBeGreaterThan(0n);
    expect(state.trend).toBe(HookTrend.Up);
  });

  it("survives a zero sigma in adaptive mode instead of dividing by zero", () => {
    // The hook's constructor requires sigmaFloor > 0 whenever adaptive is set, so
    // this state is unreachable on-chain -- but the Lab can ask for adaptive on a
    // pool deployed in absolute mode with a zero floor, and a BigInt division by
    // zero throws rather than degrading. A cold start is the reachable path: the
    // accumulators are empty, so the sigma estimate is exactly zero.
    const degenerate: DetectorParams = { ...params, adaptive: true, sigmaFloor: 0n };
    expect(() => stepDetector(zeroState(), R, degenerate)).not.toThrow();

    const out = stepDetector(zeroState(), R, degenerate);
    expect(out.inc).toBe(0n); // no scale means no evidence
    expect(out.kappa).toBe(0n);
  });

  it("adaptive mode standardizes the increment by sigma", () => {
    const adaptive: DetectorParams = {
      ...params,
      adaptive: true,
      sigmaFloor: 10n ** 15n,
      clipWad: 5n * WAD, // 5 sigma
    };
    // With a cold sigma the floor applies: inc = r / sigmaFloor, in sigma units.
    const out = stepDetector(zeroState(), 10n ** 15n, adaptive);
    expect(out.inc).toBe(WAD); // exactly one sigma
  });

  it("holds the trend label while kappa ramps down", () => {
    let state = zeroState();
    for (let i = 0; i < 30; i++) state = stepDetector(state, 5_000_000_000_000_000n, params).state;
    expect(state.trend).toBe(HookTrend.Up);

    // Evidence stops; kappa must decay without the label flipping under it.
    const quiet: DetectorParams = { ...params, dFloor: WAD };
    const before = state.kappa;
    state = stepDetector(state, 0n, quiet).state;
    expect(state.kappa).toBeLessThan(before);
    expect(state.trend).toBe(HookTrend.Up);
  });
});

describe("replay", () => {
  /** A recorded trace shaped like the rows `detector_samples` stores. */
  const sample = (block: number, r: number): DetectorPoint => ({
    block_number: block,
    price: 3000,
    r,
    s_pos: 0,
    s_neg: 0,
    d: 0,
    sigma: 0,
    kappa: 0,
    trend: "none",
    fee: 0,
  });

  const params: DetectorParams = {
    k: K,
    h: H,
    sMax: 10n ** 18n,
    lambda: LAMBDA,
    dFloor: 0n,
    adaptive: false,
    sigmaFloor: 1n,
    clipWad: 10n ** 17n,
    kappaMin: 0n,
    kappaMax: 50_000_000_000_000_000n,
    dMax: 10_000_000_000_000_000n,
    feeGamma: 0n,
    feeCap: 0n,
  };

  it("echoes the seed block and derives every later one", () => {
    const points = [sample(1, 0), sample(2, 0.005), sample(3, 0.005)];
    const out = replay(points, params, LAMBDA);
    expect(out).toHaveLength(3);
    expect(out[0].block_number).toBe(1);
    expect(out[2].s_pos).toBeGreaterThan(0);
  });

  it("a lower threshold fires at least as often as a higher one", () => {
    const points = [sample(0, 0), ...Array.from({ length: 40 }, (_, i) => sample(i + 1, 0.004))];
    const patient = metricsOf(replay(points, params, LAMBDA));
    const twitchy = metricsOf(replay(points, { ...params, h: H / 4n }, LAMBDA));
    expect(twitchy.firings).toBeGreaterThanOrEqual(patient.firings);
    expect(twitchy.leanBlocks).toBeGreaterThanOrEqual(patient.leanBlocks);
  });

  it("the D-gate is what keeps a reversing path off the curve", () => {
    // Enough net drift to drive the CUSUM past h, but reversing often enough that
    // the move is not cleanly directional. Without the gate the curve leans on it;
    // with the gate it never does.
    const path = [sample(0, 0), ...Array.from({ length: 60 }, (_, i) => sample(i + 1, DRIFTY_CHOP_N[i % 3]))];
    const ungated = metricsOf(replay(path, { ...params, dFloor: 0n }, LAMBDA));
    const gated = metricsOf(replay(path, { ...params, dFloor: WAD }, LAMBDA));
    expect(ungated.leanBlocks).toBeGreaterThan(0);
    expect(gated.leanBlocks).toBe(0);
    expect(gated.gateSaves).toBeGreaterThan(0);
  });

  it("metrics count firing edges, not firing blocks", () => {
    const exactZero = { sPosWad: 0n, sNegWad: 0n, kappaWad: 0n };
    const at = (block: number, firing: boolean): ReplayPoint => ({
      ...sample(block, 0),
      firing,
      gated: firing ? 1 : 0,
      gateBlocked: false,
      ...exactZero,
    });
    expect(metricsOf([at(1, false), at(2, true), at(3, true), at(4, false), at(5, true)]).firings).toBe(2);
  });

  it("carries the verbatim event integers through to the parity check", () => {
    // A row with `wad` must be replayed from those exact integers, not from the
    // charting float, which is what makes zero-wei parity achievable at all.
    const withWad: DetectorPoint = {
      ...sample(1, 0.01),
      wad: {
        r: "10000000000000001", // a value no float64 round-trip would preserve
        s_pos: "0",
        s_neg: "0",
        d: "0",
        sigma: "0",
        kappa: "0",
        fee: "0",
      },
    };
    const out = replay([sample(0, 0), withWad], params, LAMBDA);
    // r - k = 10000000000000001 - 1e15 = 9000000000000001 wei, exactly.
    expect(out[1].sPosWad).toBe(9_000_000_000_000_001n);
  });
});

describe("parity against the live Unichain Sepolia deployment", () => {
  /**
   * A verbatim capture of the real `DetectorSample` logs and the configuration
   * the hook was deployed with. This is the test the whole Lab rests on: given
   * the returns the chain actually saw and the parameters it actually ran, the
   * off-chain port must land on the chain's own numbers, exactly.
   *
   * Re-capture with the snippet in analysis/../frontend README if the demo pool
   * is ever redeployed; a mismatch here means the port has drifted from the
   * contracts, not that the fixture is stale.
   */
  const wad = (v: string) => BigInt(v);
  const liveParams: DetectorParams = {
    k: wad(trace.config.k),
    h: wad(trace.config.thresholdH),
    sMax: wad(trace.config.sMax),
    lambda: wad(trace.config.lambda),
    dFloor: wad(trace.config.dFloor),
    adaptive: trace.config.adaptive === "true",
    sigmaFloor: wad(trace.config.sigmaFloor),
    clipWad: wad(trace.config.clipWad),
    kappaMin: wad(trace.config.kappaMin),
    kappaMax: wad(trace.config.kappaMax),
    dMax: wad(trace.config.dMax),
    feeGamma: wad(trace.config.feeGamma),
    feeCap: wad(trace.config.feeCap),
  };
  const samples = trace.samples as DetectorPoint[];

  it("reproduces the recorded trace to the wei", () => {
    const parity = parityOf(replay(samples, liveParams, liveParams.lambda), samples);

    expect(parity.compared).toBe(samples.length - 1);
    expect(parity.exactInputs).toBe(true);
    expect(parity.maxEvidenceDriftWei).toBe(0n);
    expect(parity.maxKappaDriftWei).toBe(0n);
    expect(parity.trendsMatch).toBe(true);
  });

  it("the captured window actually exercises the detector", () => {
    // A parity check over a flat, never-firing window would prove nothing.
    const m = metricsOf(replay(samples, liveParams, liveParams.lambda));
    expect(m.firings).toBeGreaterThan(0);
    expect(m.leanBlocks).toBeGreaterThan(0);
    expect(m.peakKappa).toBeGreaterThan(0);
  });

  it("a lower threshold leans more over the same real blocks", () => {
    const base = metricsOf(replay(samples, liveParams, liveParams.lambda));
    const twitchy = metricsOf(
      replay(samples, { ...liveParams, h: liveParams.h / 4n }, liveParams.lambda),
    );
    expect(twitchy.leanBlocks).toBeGreaterThanOrEqual(base.leanBlocks);
  });
});
