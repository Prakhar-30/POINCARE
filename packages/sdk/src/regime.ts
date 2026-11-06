import type { PublicClient } from "viem";
import { hookAbi } from "./abi/hook.js";
import { lensAbi } from "./abi/lens.js";
import type { PoincareDeployment } from "./deployments.js";
import { WAD, fromWad } from "./units.js";

// ---------------------------------------------------------------------------------------------
// Orientation. The hook's detector runs on its own price, token1 per token0 = WETH per USDC.
// Everything this SDK returns is in MARKET orientation instead, USDC per WETH, the price charts
// show: a hook "Up" trend is a falling market. This file is the one place that inversion lives.
// ---------------------------------------------------------------------------------------------

/** Cusum.Trend as the hook stores it: 0 None, 1 Up, 2 Down (hook orientation). */
export type HookTrend = 0 | 1 | 2;
/** Trend of the USDC-per-WETH market price. */
export type MarketTrend = "none" | "up" | "down";
/** buy = pay USDC for WETH (zeroForOne); sell = pay WETH for USDC. */
export type Side = "buy" | "sell";

export const sideToZeroForOne = (side: Side): boolean => side === "buy";
export const zeroForOneToSide = (zeroForOne: boolean): Side => (zeroForOne ? "buy" : "sell");

export function marketTrend(t: HookTrend | number): MarketTrend {
  return t === 1 ? "down" : t === 2 ? "up" : "none";
}

/**
 * The side a trend makes "with-trend": the side the hook charges its spread on once kappa
 * ramps. Mirrors PoincareHook._spreadGiven: hook Up is pushed by oneForZero (sells of WETH),
 * hook Down by zeroForOne (buys of WETH). In market terms: buyers push an up-trend, sellers a
 * down-trend.
 */
export function withTrendSide(t: HookTrend | number): Side | null {
  return t === 1 ? "sell" : t === 2 ? "buy" : null;
}

// ---------------------------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------------------------

/**
 * calm: no confirmed trend and little evidence; building: evidence past 60% of the threshold
 * but nothing charged yet; engaged: a trend is confirmed and the with-trend side pays a spread.
 * The same classification the app shows.
 */
export type RegimeLevel = "calm" | "building" | "engaged";

export type Regime = {
  /** Block the snapshot was read at. */
  blockNumber: bigint;
  /** Mid price, USDC per WETH (spread- and fee-free). */
  price: number;
  trend: MarketTrend;
  level: RegimeLevel;
  /** Directional efficiency is below its floor: moves read as chop, nothing will be charged. */
  gated: boolean;
  /** CUSUM evidence in market orientation, and its progress toward the threshold (0..1). */
  evidence: { up: number; down: number; threshold: number; progress: number };
  /** The side pushing with the detected trend (it pays the spread once kappa > 0). */
  withTrendSide: Side | null;
  /** The side charged right now, if any. */
  chargedSide: Side | null;
  /** Spread each side pays in THIS block (the hook's own projection), fraction (0.05 = 5%). */
  spread: { buy: number; sell: number };
  kappa: number;
  kappaMax: number;
  /** Volatility-scaled base fee, fraction. */
  fee: number;
  sigma: number;
  directionalEfficiency: number;
  dFloor: number;
  /** Raw on-chain values for integrators that want exact WADs. */
  raw: {
    hookTrend: HookTrend;
    sPos: bigint;
    sNeg: bigint;
    thresholdH: bigint;
    kappa: bigint;
    spreadBuy: bigint;
    spreadSell: bigint;
    feeWad: bigint;
    midPriceWad: bigint;
  };
};

export function classify(progress: number, kappa: number): RegimeLevel {
  if (kappa > 0) return "engaged";
  if (progress >= 0.6) return "building";
  return "calm";
}

/** Read the regime the next swap of this block would see (hook.previewDetector / previewSpread). */
export async function readRegime(client: PublicClient, dep: PoincareDeployment, opts: { blockNumber?: bigint } = {}): Promise<Regime> {
  const at = opts.blockNumber ?? (await client.getBlockNumber());
  const hook = { address: dep.hook, abi: hookAbi } as const;
  const [snap, buy, sell, thresholdH, dFloor, kappaMax, mid] = await Promise.all([
    client.readContract({ ...hook, functionName: "previewDetector", blockNumber: at }),
    client.readContract({ ...hook, functionName: "previewSpread", args: [true], blockNumber: at }),
    client.readContract({ ...hook, functionName: "previewSpread", args: [false], blockNumber: at }),
    client.readContract({ ...hook, functionName: "thresholdH", blockNumber: at }),
    client.readContract({ ...hook, functionName: "dFloor", blockNumber: at }),
    client.readContract({ ...hook, functionName: "kappaMax", blockNumber: at }),
    client.readContract({ address: dep.lens, abi: lensAbi, functionName: "midPriceWad", blockNumber: at }),
  ]);
  return toRegime(at, snap, buy, sell, thresholdH, dFloor, kappaMax, mid);
}

type Snap = { sPos: bigint; sNeg: bigint; d: bigint; sigma: bigint; kappa: bigint; trend: number };

/** Pure assembly of a Regime from raw reads (exported for tests and custom transports). */
export function toRegime(
  blockNumber: bigint,
  snap: Snap,
  buy: readonly [bigint, bigint],
  sell: readonly [bigint, bigint],
  thresholdH: bigint,
  dFloor: bigint,
  kappaMax: bigint,
  midPriceWad: bigint,
): Regime {
  const hookTrend = snap.trend as HookTrend;
  const h = thresholdH > 0n ? fromWad(thresholdH) : 0;
  // hook sPos accumulates RISING WETH-per-USDC returns = a falling market, and vice versa
  const up = fromWad(snap.sNeg > 0n ? snap.sNeg : 0n);
  const down = fromWad(snap.sPos > 0n ? snap.sPos : 0n);
  const progress = h > 0 ? Math.min(1, Math.max(up, down) / h) : 0;
  const kappa = fromWad(snap.kappa);
  const spreadBuy = buy[0];
  const spreadSell = sell[0];
  return {
    blockNumber,
    price: midPriceWad > 0n ? fromWad((WAD * WAD) / midPriceWad) : 0,
    trend: marketTrend(hookTrend),
    level: classify(progress, kappa),
    gated: snap.d < dFloor,
    evidence: { up, down, threshold: h, progress },
    withTrendSide: withTrendSide(hookTrend),
    chargedSide: spreadBuy > 0n ? "buy" : spreadSell > 0n ? "sell" : null,
    spread: { buy: fromWad(spreadBuy), sell: fromWad(spreadSell) },
    kappa,
    kappaMax: fromWad(kappaMax),
    fee: fromWad(buy[1]),
    sigma: fromWad(snap.sigma),
    directionalEfficiency: fromWad(snap.d),
    dFloor: fromWad(dFloor),
    raw: {
      hookTrend,
      sPos: snap.sPos,
      sNeg: snap.sNeg,
      thresholdH,
      kappa: snap.kappa,
      spreadBuy,
      spreadSell,
      feeWad: buy[1],
      midPriceWad,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Onsets: what changed between two snapshots
// ---------------------------------------------------------------------------------------------

export type RegimeEvent =
  | { type: "trend-started"; trend: "up" | "down"; withTrendSide: Side; blockNumber: bigint }
  | { type: "trend-ended"; previous: "up" | "down"; blockNumber: bigint }
  | { type: "trend-flipped"; from: "up" | "down"; to: "up" | "down"; withTrendSide: Side; blockNumber: bigint }
  | { type: "evidence-building"; direction: "up" | "down"; progress: number; gated: boolean; blockNumber: bigint }
  | { type: "spread-engaged"; side: Side; spread: number; blockNumber: bigint }
  | { type: "spread-released"; side: Side; blockNumber: bigint };

/**
 * Turn two consecutive snapshots into the events an integrator acts on. A trend "starts" when
 * the detector confirms one (data-dependent CUSUM crossing, not a fixed block count); the spread
 * "engages" when kappa has ramped enough that the with-trend side actually pays.
 */
export function diffRegime(prev: Regime | null, next: Regime): RegimeEvent[] {
  const ev: RegimeEvent[] = [];
  const at = next.blockNumber;
  const before = prev?.trend ?? "none";
  if (before === "none" && next.trend !== "none") {
    ev.push({ type: "trend-started", trend: next.trend, withTrendSide: next.withTrendSide!, blockNumber: at });
  } else if (before !== "none" && next.trend === "none") {
    ev.push({ type: "trend-ended", previous: before, blockNumber: at });
  } else if (before !== "none" && next.trend !== "none" && before !== next.trend) {
    ev.push({ type: "trend-flipped", from: before, to: next.trend, withTrendSide: next.withTrendSide!, blockNumber: at });
  }

  const wasBuilding = prev ? prev.level === "building" : false;
  if (next.level === "building" && !wasBuilding) {
    ev.push({
      type: "evidence-building",
      direction: next.evidence.up >= next.evidence.down ? "up" : "down",
      progress: next.evidence.progress,
      gated: next.gated,
      blockNumber: at,
    });
  }

  for (const side of ["buy", "sell"] as const) {
    const was = prev ? prev.spread[side] > 0 : false;
    const is = next.spread[side] > 0;
    if (!was && is) ev.push({ type: "spread-engaged", side, spread: next.spread[side], blockNumber: at });
    if (was && !is) ev.push({ type: "spread-released", side, blockNumber: at });
  }
  return ev;
}

/**
 * Poll the regime every new block and report changes. Returns an unsubscribe function.
 * The first snapshot is reported through `onRegime` and diffed against nothing, so a trend
 * already in progress is reported as `trend-started` once.
 */
export function watchRegime(
  client: PublicClient,
  dep: PoincareDeployment,
  handlers: {
    onEvent?: (e: RegimeEvent, regime: Regime) => void;
    onRegime?: (regime: Regime) => void;
    onError?: (err: unknown) => void;
    pollingInterval?: number;
  },
): () => void {
  let prev: Regime | null = null;
  let busy = false;
  return client.watchBlockNumber({
    emitOnBegin: true,
    pollingInterval: handlers.pollingInterval ?? 4_000,
    onError: handlers.onError,
    onBlockNumber: async (blockNumber) => {
      if (busy) return; // skip a block rather than queue reads behind a slow RPC
      busy = true;
      try {
        const next = await readRegime(client, dep, { blockNumber });
        handlers.onRegime?.(next);
        for (const e of diffRegime(prev, next)) handlers.onEvent?.(e, next);
        prev = next;
      } catch (err) {
        handlers.onError?.(err);
      } finally {
        busy = false;
      }
    },
  });
}

// ---------------------------------------------------------------------------------------------
// History: the hook's own DetectorSample trace
// ---------------------------------------------------------------------------------------------

export type DetectorSample = {
  blockNumber: bigint;
  /** USDC per WETH at the sample. */
  price: number;
  trend: MarketTrend;
  /** Evidence in market orientation. */
  evidenceUp: number;
  evidenceDown: number;
  kappa: number;
  directionalEfficiency: number;
  sigma: number;
  fee: number;
};

const detectorSampleEvent = hookAbi.find((x) => x.type === "event" && x.name === "DetectorSample")!;

/**
 * DetectorSample logs between two blocks, oldest first, in market orientation. Queried in
 * `chunk`-block windows (the public RPC caps eth_getLogs ranges).
 */
export async function regimeHistory(
  client: PublicClient,
  dep: PoincareDeployment,
  opts: { fromBlock: bigint; toBlock?: bigint; chunk?: bigint },
): Promise<DetectorSample[]> {
  const to = opts.toBlock ?? (await client.getBlockNumber());
  const chunk = opts.chunk ?? 1000n;
  const out: DetectorSample[] = [];
  for (let from = opts.fromBlock; from <= to; from += chunk) {
    const end = from + chunk - 1n > to ? to : from + chunk - 1n;
    const logs = await client.getLogs({ address: dep.hook, event: detectorSampleEvent, fromBlock: from, toBlock: end });
    for (const l of logs) {
      const a = l.args as {
        blockNumber: bigint; priceWad: bigint; sPos: bigint; sNeg: bigint; dWad: bigint;
        sigmaWad: bigint; kappaWad: bigint; trend: number; feeWad: bigint;
      };
      out.push({
        blockNumber: a.blockNumber,
        price: a.priceWad > 0n ? fromWad((WAD * WAD) / a.priceWad) : 0,
        trend: marketTrend(a.trend),
        evidenceUp: fromWad(a.sNeg > 0n ? a.sNeg : 0n),
        evidenceDown: fromWad(a.sPos > 0n ? a.sPos : 0n),
        kappa: fromWad(a.kappaWad),
        directionalEfficiency: fromWad(a.dWad),
        sigma: fromWad(a.sigmaWad),
        fee: fromWad(a.feeWad),
      });
    }
  }
  return out;
}

export type TrendOnset = { blockNumber: bigint; type: "start" | "end" | "flip"; trend: MarketTrend; price: number };

/** Where trends began, ended or flipped in a sample series. */
export function trendOnsets(samples: DetectorSample[]): TrendOnset[] {
  const out: TrendOnset[] = [];
  let prev: MarketTrend = "none";
  for (const s of samples) {
    if (s.trend !== prev) {
      const type = prev === "none" ? "start" : s.trend === "none" ? "end" : "flip";
      out.push({ blockNumber: s.blockNumber, type, trend: s.trend, price: s.price });
      prev = s.trend;
    }
  }
  return out;
}
