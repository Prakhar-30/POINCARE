import { describe, expect, it } from "vitest";
import { DcaParamError, buildOrderParams } from "../src/dca.js";
import { FREQUENCIES, PROTECTIONS, recurringOrder, twapOrder, twapSlices } from "../src/plans.js";

const NOW = 1_700_000_000n;
const E = 10n ** 18n;

describe("recurringOrder (Coinbase / Kraken / Binance Auto-Invest style)", () => {
  it("amount per buy x count, one spare period before the deadline", () => {
    const p = buildOrderParams(recurringOrder({ side: "buy", amountPerBuy: "100", frequency: "1h", count: 10 }), NOW);
    expect(p.amountIn).toBe(1000n * E);
    expect(p.slices).toBe(10);
    expect(p.interval).toBe(3600);
    expect(p.deadline).toBe(NOW + 10n * 3600n);
    // spread guard by default
    expect(p.maxSpreadBps).toBe(0);
    expect(p.pauseOnTrend).toBe(false);
    expect(p.catchUp).toBe(true);
  });

  it("protection presets", () => {
    const pause = buildOrderParams(recurringOrder({ side: "sell", amountPerBuy: "0.1", frequency: "1d", count: 3, protection: "trend-pause" }), NOW);
    expect(pause).toMatchObject({ maxSpreadBps: 0, pauseOnTrend: true, zeroForOne: false });
    const always = buildOrderParams(recurringOrder({ side: "buy", amountPerBuy: 5, frequency: 300, count: 2, protection: "always" }), NOW);
    expect(always.maxSpreadBps).toBe(10_000);
    expect(always.interval).toBe(300);
    expect(Object.keys(PROTECTIONS)).toEqual(["spread-guard", "trend-pause", "always"]);
  });

  it("a plan the contract would reject is rejected with its reason", () => {
    expect(() => buildOrderParams(recurringOrder({ side: "buy", amountPerBuy: "1", frequency: "1h", count: 0 }), NOW)).toThrow(DcaParamError);
  });

  it("frequencies are in seconds and respect the contract minimum", () => {
    for (const s of Object.values(FREQUENCIES)) expect(s).toBeGreaterThanOrEqual(60);
  });
});

describe("twapOrder (Binance Spot TWAP style)", () => {
  it("spreads a total over the window and never runs past it", () => {
    const p = buildOrderParams(twapOrder({ side: "sell", total: "1", durationSec: 4 * 3600 }), NOW);
    expect(p.slices).toBe(48);
    expect(p.interval).toBe(300);
    expect(p.amountIn).toBe(E);
    expect(p.deadline).toBe(NOW + 4n * 3600n);
    expect(BigInt(p.slices - 1) * BigInt(p.interval)).toBeLessThan(BigInt(4 * 3600));
  });

  it("short windows keep at least two buys at the 60 s minimum", () => {
    expect(twapSlices(300)).toBe(2);
    const p = buildOrderParams(twapOrder({ side: "buy", total: "500", durationSec: 120 }), NOW);
    expect(p.slices).toBe(2);
    expect(p.interval).toBe(60);
    expect(p.deadline).toBe(NOW + 120n);
  });

  it("an explicit start shifts the window", () => {
    const p = buildOrderParams(twapOrder({ side: "buy", total: "500", durationSec: 3600, startTime: NOW + 600n }), NOW);
    expect(p.startTime).toBe(NOW + 600n);
    expect(p.deadline).toBe(NOW + 600n + 3600n);
  });
});
