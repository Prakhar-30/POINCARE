import type { Address } from "viem";
import type { DcaOrderInput } from "./dca.js";
import type { Side } from "./regime.js";
import { toAmount } from "./units.js";

/**
 * Exchange-style plan builders. Centralised exchanges describe DCA in two ways, and users arrive
 * expecting one of them:
 *
 *  - a RECURRING buy: a fixed amount every period, N times (Coinbase, Kraken, Binance Auto-Invest,
 *    OKX recurring buy, Bybit DCA bot);
 *  - a TWAP: one total spread evenly over a duration (Binance Spot TWAP, 5 min to 24 h).
 *
 * Both compile to the same PoincareDCA order. The Poincaré part is the PROTECTION preset: whether
 * a buy may pay the trend spread the pool charges the with-trend side.
 */

export const FREQUENCIES = {
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "4h": 14_400,
  "1d": 86_400,
  "1w": 604_800,
} as const;
export type Frequency = keyof typeof FREQUENCIES;

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  "5m": "Every 5 min",
  "15m": "Every 15 min",
  "1h": "Hourly",
  "4h": "Every 4 hours",
  "1d": "Daily",
  "1w": "Weekly",
};

export const PROTECTIONS = {
  /** Skip a buy while this side pays the trend spread; later buys make it up. The Poincaré default. */
  "spread-guard": { maxSpreadBps: 0, pauseOnTrend: false, catchUp: true },
  /** Also hold while a trend runs with this side, before the spread has even ramped. */
  "trend-pause": { maxSpreadBps: 0, pauseOnTrend: true, catchUp: true },
  /** Buy every period whatever the spread, like a plain recurring buy. */
  "always": { maxSpreadBps: 10_000, pauseOnTrend: false, catchUp: true },
} as const;
export type Protection = keyof typeof PROTECTIONS;

export const PROTECTION_TEXT: Record<Protection, { title: string; detail: string }> = {
  "spread-guard": {
    title: "Spread guard",
    detail: "Never pays the trend spread. A fill that would pay it waits, and later fills catch up so the plan still finishes.",
  },
  "trend-pause": {
    title: "Trend pause",
    detail: "Also waits while a trend runs in your direction, before any spread is charged. Most patient.",
  },
  always: {
    title: "Always fill",
    detail: "Fills every period whatever the spread, like a plain recurring order on an exchange.",
  },
};

type Common = {
  side: Side;
  protection?: Protection;
  /** USDC per WETH: the most a buy pays / the least a sell accepts. */
  limitPrice?: string | number;
  maxSlippageBps?: number;
  /** Unix seconds; omit to start now. */
  startTime?: number | bigint;
  recipient?: Address;
};

/** A fixed amount every period, `count` times. The budget escrowed is amountPerBuy × count. */
export function recurringOrder(r: Common & { amountPerBuy: string | number | bigint; frequency: Frequency | number; count: number }): DcaOrderInput {
  const interval = typeof r.frequency === "number" ? r.frequency : FREQUENCIES[r.frequency];
  const per = toAmount(r.amountPerBuy);
  return {
    side: r.side,
    amount: per * BigInt(Math.max(0, Math.trunc(r.count))),
    slices: r.count,
    interval,
    startTime: r.startTime,
    ...PROTECTIONS[r.protection ?? "spread-guard"],
    limitPrice: r.limitPrice,
    maxSlippageBps: r.maxSlippageBps,
    recipient: r.recipient,
  };
}

/**
 * One total, spread evenly over `durationSec`. Slices default to one every five minutes (2..48);
 * the deadline is the end of the window, so a TWAP never runs past the duration you chose.
 */
export function twapOrder(t: Common & { total: string | number | bigint; durationSec: number; slices?: number }): DcaOrderInput {
  const slices = t.slices ?? twapSlices(t.durationSec);
  const interval = Math.max(60, Math.floor(t.durationSec / slices));
  return {
    side: t.side,
    amount: t.total,
    slices,
    interval,
    startTime: t.startTime,
    duration: t.durationSec,
    ...PROTECTIONS[t.protection ?? "spread-guard"],
    limitPrice: t.limitPrice,
    maxSlippageBps: t.maxSlippageBps,
    recipient: t.recipient,
  };
}

/** Default TWAP slicing: one buy every ~5 minutes, at least 2 and at most 48 buys. */
export function twapSlices(durationSec: number): number {
  return Math.min(48, Math.max(2, Math.round(durationSec / 300)));
}
