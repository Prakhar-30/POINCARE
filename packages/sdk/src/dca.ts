import { getAddress, type Address } from "viem";
import { type Side, sideToZeroForOne, zeroForOneToSide } from "./regime.js";
import { BPS, WAD, decimalToWad, toAmount } from "./units.js";

/**
 * Pure DCA logic: building and validating order parameters, and an exact off-chain mirror of
 * PoincareDCA's slice rules. Nothing here touches the network; see dcaClient.ts for that.
 */

/** PoincareDCA.Status, in on-chain enum order. */
export const DCA_STATUS = [
  "ready",
  "unknown",
  "cancelled",
  "filled",
  "expired",
  "not-started",
  "waiting-for-slot",
  "spread-too-high",
  "trend-against",
  "below-limit",
  "paused",
] as const;
export type DcaStatus = (typeof DCA_STATUS)[number];

export const DCA_STATUS_TEXT: Record<DcaStatus, string> = {
  ready: "The next slice can fill now.",
  unknown: "No such order.",
  cancelled: "The order was cancelled; its remaining budget was refunded.",
  filled: "The order is complete.",
  expired: "The deadline passed; the unfilled budget can be refunded to the owner.",
  "not-started": "The order has not reached its start time.",
  "waiting-for-slot": "This slot is already filled; the next slice opens at the next slot.",
  "spread-too-high": "The trend spread on this order's side is above its cap; the slice is held.",
  "trend-against": "A trend runs with this order's side (the side the pool charges); the order is paused until it ends.",
  "below-limit": "The pool price is worse than the order's limit price.",
  paused: "The owner paused the order; no slice fills until it is resumed.",
};

export const statusOf = (code: number): DcaStatus => DCA_STATUS[code] ?? "unknown";

export const MIN_INTERVAL = 60;
export const MAX_SLICES = 10_000;

/** Human-friendly order description. Amounts are in the INPUT token (USDC to buy, WETH to sell). */
export type DcaOrderInput = {
  side: Side;
  /** Total budget. A bigint is base units; a string/number is token units ("1000" = 1000 USDC). */
  amount: string | number | bigint;
  slices: number;
  /** Seconds between slices (>= 60). */
  interval: number;
  /** Unix seconds; omit to start at the block the order is created in. */
  startTime?: number | bigint;
  /** Unix seconds. Defaults to one spare slot after the last planned slice. */
  deadline?: number | bigint;
  /** Alternative to `deadline`: seconds from the start (a TWAP's window). Ignored if `deadline` is set. */
  duration?: number;
  /** Hold a slot while the spread on this side is above this many bps. Default: no cap. */
  maxSpreadBps?: number;
  /** Hold while a trend runs with this side. Default false. */
  pauseOnTrend?: boolean;
  /** Grow later slices to make up skipped slots. Default true. */
  catchUp?: boolean;
  /** Max shortfall vs the in-transaction Lens quote. Default 50 bps. */
  maxSlippageBps?: number;
  /** USDC per WETH: the most a buy pays, or the least a sell accepts. Omit for no limit. */
  limitPrice?: string | number;
  /** Receives every fill. Defaults to the order owner. */
  recipient?: Address;
};

/** PoincareDCA.OrderParams, ready to encode. */
export type DcaOrderParams = {
  zeroForOne: boolean;
  amountIn: bigint;
  slices: number;
  interval: number;
  startTime: bigint;
  deadline: bigint;
  maxSpreadBps: number;
  pauseOnTrend: boolean;
  catchUp: boolean;
  maxSlippageBps: number;
  minPriceWad: bigint;
  recipient: Address;
};

export class DcaParamError extends Error {
  /** The same reason string PoincareDCA reverts with. */
  readonly reason: string;
  constructor(reason: string, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = "DcaParamError";
    this.reason = reason;
  }
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Limit price (USDC per WETH) -> PoincareDCA.minPriceWad (output per 1 input, WAD).
 * A buy pays USDC and receives WETH, so its floor is WETH per USDC = 1 / price.
 */
export function limitToMinPriceWad(side: Side, limitPrice: string | number): bigint {
  const p = decimalToWad(limitPrice);
  if (p === 0n) throw new DcaParamError("limitPrice", "must be above zero");
  return side === "buy" ? (WAD * WAD) / p : p;
}

/** The inverse of limitToMinPriceWad, for display. */
export function minPriceWadToLimit(side: Side, minPriceWad: bigint): number | null {
  if (minPriceWad === 0n) return null;
  const v = side === "buy" ? (WAD * WAD) / minPriceWad : minPriceWad;
  return Number(v) / 1e18;
}

/** Build PoincareDCA.OrderParams from a human description, validated like the contract. */
export function buildOrderParams(input: DcaOrderInput, nowSec: number | bigint = Math.floor(Date.now() / 1000)): DcaOrderParams {
  const now = BigInt(nowSec);
  const startTime = input.startTime === undefined ? 0n : BigInt(input.startTime);
  const effectiveStart = startTime === 0n ? now : startTime;
  const slices = input.slices;
  const interval = input.interval;
  const deadline =
    input.deadline !== undefined
      ? BigInt(input.deadline)
      : input.duration !== undefined
        ? effectiveStart + BigInt(Math.max(0, Math.trunc(input.duration)))
        : effectiveStart + BigInt(Math.max(0, slices)) * BigInt(interval);
  const p: DcaOrderParams = {
    zeroForOne: sideToZeroForOne(input.side),
    amountIn: toAmount(input.amount),
    slices,
    interval,
    startTime,
    deadline,
    maxSpreadBps: input.maxSpreadBps ?? 10_000,
    pauseOnTrend: input.pauseOnTrend ?? false,
    catchUp: input.catchUp ?? true,
    maxSlippageBps: input.maxSlippageBps ?? 50,
    minPriceWad: input.limitPrice === undefined ? 0n : limitToMinPriceWad(input.side, input.limitPrice),
    recipient: input.recipient ? getAddress(input.recipient) : ZERO,
  };
  validateOrderParams(p, now);
  return p;
}

/** PoincareDCA._validate, with the same reason strings. `dca` rejects the contract as recipient. */
export function validateOrderParams(p: DcaOrderParams, nowSec: bigint, dca?: Address): void {
  const start = p.startTime === 0n ? nowSec : p.startTime;
  if (p.amountIn <= 0n) throw new DcaParamError("amountIn");
  if (!Number.isInteger(p.slices) || p.slices <= 0 || p.slices > MAX_SLICES) throw new DcaParamError("slices", `1..${MAX_SLICES}`);
  if (p.amountIn < BigInt(p.slices)) throw new DcaParamError("amountIn below slices");
  if (!Number.isInteger(p.interval) || p.interval < MIN_INTERVAL) throw new DcaParamError("interval", `at least ${MIN_INTERVAL}s`);
  if (start < nowSec) throw new DcaParamError("startTime", "in the past");
  if (!inBps(p.maxSpreadBps) || !inBps(p.maxSlippageBps)) throw new DcaParamError("bps", "0..10000");
  if (dca && p.recipient.toLowerCase() === dca.toLowerCase()) throw new DcaParamError("recipient");
  const lastPlanned = start + BigInt(p.slices - 1) * BigInt(p.interval);
  if (p.deadline <= lastPlanned) throw new DcaParamError("deadline", "every slice must open before the deadline");
}

const inBps = (v: number) => Number.isInteger(v) && v >= 0 && v <= 10_000;

/** An order as PoincareDCA.getOrder returns it, plus derived fields. */
export type DcaOrder = {
  id: bigint;
  owner: Address;
  recipient: Address;
  side: Side;
  zeroForOne: boolean;
  pauseOnTrend: boolean;
  catchUp: boolean;
  cancelled: boolean;
  paused: boolean;
  maxSpreadBps: number;
  maxSlippageBps: number;
  /** Planned fills of the CURRENT schedule. */
  slices: number;
  interval: number;
  /** Fills over the order's life. */
  filled: number;
  /** Fills in the current schedule (resets when the order is edited). */
  scheduleFilled: number;
  startTime: bigint;
  deadline: bigint;
  lastSlotPlusOne: bigint;
  /** Total deposited; never changes. */
  amountIn: bigint;
  /** What the current schedule spreads (amountIn, then the remainder at each edit). */
  scheduleBudget: bigint;
  remaining: bigint;
  amountOut: bigint;
  minPriceWad: bigint;
};

export function toDcaOrder(id: bigint, o: Omit<DcaOrder, "id" | "side">): DcaOrder {
  return { ...o, id, side: zeroForOneToSide(o.zeroForOne) };
}

/** Slot geometry: which slot `now` is in, the last slot before the deadline, the next opening. */
export function slotInfo(o: Pick<DcaOrder, "startTime" | "interval" | "deadline">, now: bigint) {
  const interval = BigInt(o.interval);
  // the last slot opening strictly before the deadline (a slot AT the deadline has no window)
  const lastSlot = o.deadline > o.startTime ? (o.deadline - o.startTime - 1n) / interval : 0n;
  let slot = now >= o.startTime ? (now - o.startTime) / interval : 0n;
  if (slot > lastSlot) slot = lastSlot; // only at the deadline instant itself
  const next = o.startTime + (slot + 1n) * interval;
  return { slot, lastSlot, nextSlotAt: now < o.startTime ? o.startTime : next < o.deadline ? next : 0n };
}

/** PoincareDCA._sliceAmount. */
export function sliceAmount(o: Pick<DcaOrder, "scheduleBudget" | "remaining" | "slices" | "scheduleFilled" | "catchUp">, slot: bigint, lastSlot: bigint): bigint {
  const base = o.scheduleBudget / BigInt(o.slices);
  let amt = base;
  if (o.catchUp) {
    const slotsLeft = lastSlot - slot + 1n;
    const even = (o.remaining + slotsLeft - 1n) / slotsLeft;
    if (even > amt) amt = even;
  }
  if (o.scheduleFilled + 1 >= o.slices || amt > o.remaining) amt = o.remaining;
  return amt;
}

/** What PoincareDCA.editOrder takes: a new schedule and rules for the REMAINING budget. */
export type DcaEditParams = {
  slices: number;
  interval: number;
  startTime: bigint;
  deadline: bigint;
  maxSpreadBps: number;
  pauseOnTrend: boolean;
  catchUp: boolean;
  maxSlippageBps: number;
  minPriceWad: bigint;
};

/** Human-friendly edit. Anything omitted keeps the order's current value. */
export type DcaEditInput = {
  slices?: number;
  interval?: number;
  startTime?: number | bigint;
  deadline?: number | bigint;
  /** Alternative to `deadline`: seconds from the new start. */
  duration?: number;
  maxSpreadBps?: number;
  pauseOnTrend?: boolean;
  catchUp?: boolean;
  maxSlippageBps?: number;
  /** USDC per WETH; `null` removes the limit. */
  limitPrice?: string | number | null;
};

/**
 * Edit params validated exactly like PoincareDCA.editOrder: the remaining budget is re-planned
 * from the new start. The deadline defaults to one spare slot after the last new slice.
 */
export function buildEditParams(o: DcaOrder, input: DcaEditInput, nowSec: number | bigint = Math.floor(Date.now() / 1000)): DcaEditParams {
  const now = BigInt(nowSec);
  if (o.cancelled || o.remaining === 0n) throw new DcaParamError("closed", "the order is no longer open");
  const slices = input.slices ?? o.slices;
  const interval = input.interval ?? o.interval;
  const startTime = input.startTime === undefined ? 0n : BigInt(input.startTime);
  const start = startTime === 0n ? now : startTime;
  const deadline =
    input.deadline !== undefined
      ? BigInt(input.deadline)
      : input.duration !== undefined
        ? start + BigInt(Math.max(0, Math.trunc(input.duration)))
        : start + BigInt(Math.max(0, slices)) * BigInt(interval);
  const p: DcaEditParams = {
    slices,
    interval,
    startTime,
    deadline,
    maxSpreadBps: input.maxSpreadBps ?? o.maxSpreadBps,
    pauseOnTrend: input.pauseOnTrend ?? o.pauseOnTrend,
    catchUp: input.catchUp ?? o.catchUp,
    maxSlippageBps: input.maxSlippageBps ?? o.maxSlippageBps,
    minPriceWad:
      input.limitPrice === undefined ? o.minPriceWad : input.limitPrice === null ? 0n : limitToMinPriceWad(o.side, input.limitPrice),
  };
  // same schedule rules as createOrder, with the remaining budget as the budget
  validateOrderParams(
    {
      zeroForOne: o.zeroForOne, amountIn: o.remaining, slices: p.slices, interval: p.interval, startTime: p.startTime,
      deadline: p.deadline, maxSpreadBps: p.maxSpreadBps, pauseOnTrend: p.pauseOnTrend, catchUp: p.catchUp,
      maxSlippageBps: p.maxSlippageBps, minPriceWad: p.minPriceWad, recipient: o.recipient,
    },
    now,
  );
  return p;
}

export type SlicePlan = {
  status: DcaStatus;
  amountIn: bigint;
  /** Only when `quoteOut` was supplied and the time/spread/trend checks passed. */
  minOut: bigint;
  slot: bigint;
  nextSlotAt: bigint;
};

/**
 * PoincareDCA._preview without the chain reads: supply the spread this block (bps, rounded up),
 * whether a trend runs with the order's side, and optionally the Lens quote for the slice.
 */
export function planSlice(
  o: DcaOrder,
  ctx: { now: bigint; spreadBps: number; trendWithSide: boolean; quoteOut?: bigint },
): SlicePlan {
  const plan: SlicePlan = { status: "ready", amountIn: 0n, minOut: 0n, slot: 0n, nextSlotAt: 0n };
  const done = (status: DcaStatus) => ({ ...plan, status });
  if (o.cancelled) return done("cancelled");
  if (o.remaining === 0n) return done("filled");
  if (ctx.now > o.deadline) return done("expired");
  if (o.paused) return done("paused");
  if (ctx.now < o.startTime) return { ...done("not-started"), nextSlotAt: o.startTime };

  const { slot, lastSlot, nextSlotAt } = slotInfo(o, ctx.now);
  plan.slot = slot;
  plan.nextSlotAt = nextSlotAt;
  plan.amountIn = sliceAmount(o, slot, lastSlot);
  if (o.lastSlotPlusOne > slot) return done("waiting-for-slot");
  if (ctx.spreadBps > o.maxSpreadBps) return done("spread-too-high");
  if (o.pauseOnTrend && ctx.trendWithSide) return done("trend-against");
  if (ctx.quoteOut === undefined) return plan;

  const limitOut = o.minPriceWad === 0n ? 0n : (plan.amountIn * o.minPriceWad + WAD - 1n) / WAD;
  if (ctx.quoteOut < limitOut) return done("below-limit");
  const slipOut = (ctx.quoteOut * (BPS - BigInt(o.maxSlippageBps))) / BPS;
  plan.minOut = limitOut > slipOut ? limitOut : slipOut;
  return plan;
}

/** Fraction of the budget filled so far (0..1). */
export const progressOf = (o: Pick<DcaOrder, "amountIn" | "remaining">): number =>
  o.amountIn === 0n ? 0 : Number(((o.amountIn - o.remaining) * 10_000n) / o.amountIn) / 10_000;
