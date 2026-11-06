import { describe, expect, it } from "vitest";
import {
  DCA_STATUS,
  DcaParamError,
  type DcaOrder,
  buildOrderParams,
  limitToMinPriceWad,
  minPriceWadToLimit,
  planSlice,
  progressOf,
  sliceAmount,
  slotInfo,
  statusOf,
  validateOrderParams,
} from "../src/dca.js";
import { WAD } from "../src/units.js";

const NOW = 1_700_000_000n;
const H = 3600;
const E = 10n ** 18n;

function order(over: Partial<DcaOrder> = {}): DcaOrder {
  return {
    id: 1n,
    owner: "0x00000000000000000000000000000000000000a1",
    recipient: "0x00000000000000000000000000000000000000a1",
    side: "buy",
    zeroForOne: true,
    pauseOnTrend: false,
    catchUp: false,
    cancelled: false,
    maxSpreadBps: 10_000,
    maxSlippageBps: 100,
    slices: 4,
    interval: H,
    filled: 0,
    startTime: NOW,
    deadline: NOW + 3n * BigInt(H),
    lastSlotPlusOne: 0n,
    amountIn: 4n * E,
    remaining: 4n * E,
    amountOut: 0n,
    minPriceWad: 0n,
    ...over,
  };
}

describe("status codes", () => {
  it("follow PoincareDCA.Status order", () => {
    expect(DCA_STATUS).toEqual([
      "ready", "unknown", "cancelled", "filled", "expired", "not-started",
      "waiting-for-slot", "spread-too-high", "trend-against", "below-limit",
    ]);
    expect(statusOf(7)).toBe("spread-too-high");
    expect(statusOf(99)).toBe("unknown");
  });
});

describe("buildOrderParams", () => {
  it("fills defaults and converts units", () => {
    const p = buildOrderParams({ side: "buy", amount: "1000", slices: 10, interval: H }, NOW);
    expect(p.zeroForOne).toBe(true);
    expect(p.amountIn).toBe(1000n * E);
    expect(p.startTime).toBe(0n);
    expect(p.deadline).toBe(NOW + 10n * BigInt(H)); // one spare slot after the 10th slice opens
    expect(p.maxSpreadBps).toBe(10_000);
    expect(p.catchUp).toBe(true);
    expect(p.maxSlippageBps).toBe(50);
    expect(p.minPriceWad).toBe(0n);
    expect(p.recipient).toBe("0x0000000000000000000000000000000000000000");
  });

  it("rejects exactly what the contract rejects, with its reason strings", () => {
    const bad = (over: object, reason: string) => {
      const run = () => buildOrderParams({ side: "sell", amount: "1", slices: 4, interval: H, ...over }, NOW);
      expect(run).toThrow(DcaParamError);
      try { run(); } catch (e) { expect((e as DcaParamError).reason).toBe(reason); }
    };
    bad({ slices: 0 }, "slices");
    bad({ slices: 10_001 }, "slices");
    bad({ interval: 59 }, "interval");
    bad({ amount: 3n }, "amountIn below slices");
    bad({ amount: 0n }, "amountIn");
    bad({ deadline: NOW + 2n * BigInt(H) }, "deadline");
    bad({ startTime: NOW - 1n }, "startTime");
    bad({ maxSpreadBps: 10_001 }, "bps");
    bad({ maxSlippageBps: -1 }, "bps");
  });

  it("refuses the DCA contract itself as recipient", () => {
    const dca = "0x00000000000000000000000000000000000000dc";
    const p = buildOrderParams({ side: "buy", amount: "10", slices: 2, interval: H, recipient: dca }, NOW);
    expect(() => validateOrderParams(p, NOW, dca)).toThrow("recipient");
  });
});

describe("limit price", () => {
  it("a buy's max price becomes a floor of WETH per USDC", () => {
    const w = limitToMinPriceWad("buy", "2000");
    expect(w).toBe(WAD * WAD / (2000n * WAD));
    expect(minPriceWadToLimit("buy", w)).toBeCloseTo(2000, 6);
  });
  it("a sell's min price is USDC per WETH directly", () => {
    expect(limitToMinPriceWad("sell", 2500.5)).toBe(25005n * 10n ** 17n);
    expect(minPriceWadToLimit("sell", 0n)).toBeNull();
  });
  it("rejects a zero limit", () => {
    expect(() => limitToMinPriceWad("buy", 0)).toThrow(DcaParamError);
  });
});

describe("slice schedule (mirrors PoincareDCA._sliceAmount)", () => {
  it("even shares without catch-up", () => {
    const o = order({ filled: 1, remaining: 3n * E, lastSlotPlusOne: 1n });
    expect(sliceAmount(o, 3n, 3n)).toBe(1n * E);
  });

  it("catch-up spreads what is left over the slots left", () => {
    const o = order({ catchUp: true, filled: 1, remaining: 3n * E, lastSlotPlusOne: 1n });
    expect(sliceAmount(o, 2n, 3n)).toBe(15n * 10n ** 17n); // 3 over 2 slots
    expect(sliceAmount(o, 3n, 3n)).toBe(3n * E); // final slot takes it all
  });

  it("the last planned slice takes the rounding remainder", () => {
    const o = order({ amountIn: 10n, remaining: 4n, slices: 3, filled: 2 });
    expect(sliceAmount(o, 2n, 3n)).toBe(4n);
  });

  it("slot geometry", () => {
    const o = order();
    expect(slotInfo(o, NOW)).toEqual({ slot: 0n, lastSlot: 3n, nextSlotAt: NOW + BigInt(H) });
    expect(slotInfo(o, NOW + 3n * BigInt(H)).nextSlotAt).toBe(0n); // no slot after the last
    expect(slotInfo({ ...o, startTime: NOW + 10n }, NOW).nextSlotAt).toBe(NOW + 10n);
  });
});

describe("planSlice (mirrors PoincareDCA._preview)", () => {
  const ctx = { now: NOW, spreadBps: 0, trendWithSide: false };

  it("checks in the contract's order", () => {
    expect(planSlice(order({ cancelled: true }), ctx).status).toBe("cancelled");
    expect(planSlice(order({ remaining: 0n }), ctx).status).toBe("filled");
    expect(planSlice(order(), { ...ctx, now: NOW + 3n * BigInt(H) + 1n }).status).toBe("expired");
    expect(planSlice(order({ startTime: NOW + 5n }), ctx).status).toBe("not-started");
    expect(planSlice(order({ lastSlotPlusOne: 1n }), ctx).status).toBe("waiting-for-slot");
    expect(planSlice(order({ maxSpreadBps: 100 }), { ...ctx, spreadBps: 101 }).status).toBe("spread-too-high");
    expect(planSlice(order({ maxSpreadBps: 100 }), { ...ctx, spreadBps: 100 }).status).toBe("ready");
    expect(planSlice(order({ pauseOnTrend: true }), { ...ctx, trendWithSide: true }).status).toBe("trend-against");
    expect(planSlice(order({ pauseOnTrend: false }), { ...ctx, trendWithSide: true }).status).toBe("ready");
  });

  it("spread is checked before the trend pause", () => {
    const o = order({ pauseOnTrend: true, maxSpreadBps: 0 });
    expect(planSlice(o, { ...ctx, spreadBps: 50, trendWithSide: true }).status).toBe("spread-too-high");
  });

  it("limit and slippage floors", () => {
    const quote = 4n * 10n ** 14n; // 0.0004 WETH for 1 USDC
    const tight = order({ minPriceWad: 5n * 10n ** 14n }); // wants 0.0005 per USDC
    expect(planSlice(tight, { ...ctx, quoteOut: quote }).status).toBe("below-limit");
    const loose = order({ minPriceWad: 1n * 10n ** 14n, maxSlippageBps: 100 });
    const p = planSlice(loose, { ...ctx, quoteOut: quote * E / 10n ** 18n });
    expect(p.status).toBe("ready");
    expect(p.amountIn).toBe(1n * E);
    expect(p.minOut).toBe(quote * 99n / 100n); // slippage floor above the loose limit
  });

  it("progress", () => {
    expect(progressOf(order({ remaining: 1n * E }))).toBe(0.75);
  });
});
