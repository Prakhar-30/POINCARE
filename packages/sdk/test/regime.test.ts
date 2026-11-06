import { describe, expect, it } from "vitest";
import { classify, diffRegime, marketTrend, toRegime, trendOnsets, withTrendSide, type DetectorSample } from "../src/regime.js";

const W = 10n ** 18n;

/** A regime from raw hook values: hookTrend 0 None, 1 Up (market down), 2 Down (market up). */
function regime(over: { block?: bigint; hookTrend?: number; sPos?: bigint; sNeg?: bigint; kappa?: bigint; buy?: bigint; sell?: bigint; d?: bigint } = {}) {
  return toRegime(
    over.block ?? 100n,
    { sPos: over.sPos ?? 0n, sNeg: over.sNeg ?? 0n, d: over.d ?? (9n * W) / 10n, sigma: W / 100n, kappa: over.kappa ?? 0n, trend: over.hookTrend ?? 0 },
    [over.buy ?? 0n, (3n * W) / 1000n],
    [over.sell ?? 0n, (3n * W) / 1000n],
    5n * 10n ** 15n, // thresholdH 0.005
    W / 2n, // dFloor 0.5
    W / 20n, // kappaMax 5%
    W * W / (2000n * W), // mid: 2000 USDC per WETH, stored as WETH per USDC
  );
}

describe("orientation", () => {
  it("hook trend -> market trend is inverted", () => {
    expect(marketTrend(0)).toBe("none");
    expect(marketTrend(1)).toBe("down");
    expect(marketTrend(2)).toBe("up");
  });

  it("with-trend side matches PoincareHook._spreadGiven", () => {
    // hook Up is pushed by oneForZero (selling WETH); hook Down by zeroForOne (buying WETH)
    expect(withTrendSide(1)).toBe("sell");
    expect(withTrendSide(2)).toBe("buy");
    expect(withTrendSide(0)).toBeNull();
  });

  it("price is USDC per WETH and evidence is market-oriented", () => {
    const r = regime({ sNeg: 4n * 10n ** 15n });
    expect(r.price).toBeCloseTo(2000, 9);
    expect(r.evidence.up).toBeCloseTo(0.004, 12); // hook sNeg = rising market
    expect(r.evidence.down).toBe(0);
    expect(r.evidence.progress).toBeCloseTo(0.8, 12);
  });
});

describe("classification (same as the app)", () => {
  it("engaged > building > calm", () => {
    expect(classify(0, 0.01)).toBe("engaged");
    expect(classify(0.6, 0)).toBe("building");
    expect(classify(0.59, 0)).toBe("calm");
  });

  it("charged side comes from this block's spread", () => {
    const r = regime({ hookTrend: 1, kappa: W / 25n, sell: W / 25n });
    expect(r.trend).toBe("down");
    expect(r.level).toBe("engaged");
    expect(r.chargedSide).toBe("sell");
    expect(r.withTrendSide).toBe("sell");
    expect(r.spread.sell).toBeCloseTo(0.04, 12);
  });

  it("gated below the efficiency floor", () => {
    expect(regime({ d: W / 4n }).gated).toBe(true);
  });
});

describe("diffRegime", () => {
  it("reports a trend onset and the spread engaging", () => {
    const calm = regime({ block: 1n });
    const building = regime({ block: 2n, sNeg: 4n * 10n ** 15n });
    const confirmed = regime({ block: 3n, hookTrend: 2, sNeg: 6n * 10n ** 15n });
    const charging = regime({ block: 4n, hookTrend: 2, kappa: W / 100n, buy: W / 100n });

    expect(diffRegime(calm, building).map((e) => e.type)).toEqual(["evidence-building"]);
    const started = diffRegime(building, confirmed);
    expect(started[0]).toMatchObject({ type: "trend-started", trend: "up", withTrendSide: "buy" });
    expect(diffRegime(confirmed, charging)).toEqual([{ type: "spread-engaged", side: "buy", spread: 0.01, blockNumber: 4n }]);
  });

  it("reports the end, a flip and the spread releasing", () => {
    const up = regime({ hookTrend: 2, kappa: W / 100n, buy: W / 100n });
    const down = regime({ hookTrend: 1 });
    const none = regime({ hookTrend: 0 });
    expect(diffRegime(up, down).map((e) => e.type)).toEqual(["trend-flipped", "spread-released"]);
    expect(diffRegime(down, none)[0]).toMatchObject({ type: "trend-ended", previous: "down" });
  });

  it("a trend already running on the first snapshot is reported once", () => {
    expect(diffRegime(null, regime({ hookTrend: 1 }))[0]).toMatchObject({ type: "trend-started", trend: "down" });
  });
});

describe("trendOnsets", () => {
  it("finds starts, flips and ends in a sample series", () => {
    const s = (b: bigint, trend: DetectorSample["trend"]): DetectorSample => ({
      blockNumber: b, price: 2000, trend, evidenceUp: 0, evidenceDown: 0, kappa: 0, directionalEfficiency: 0, sigma: 0, fee: 0,
    });
    const onsets = trendOnsets([s(1n, "none"), s(2n, "up"), s(3n, "up"), s(4n, "down"), s(5n, "none")]);
    expect(onsets.map((o) => [o.blockNumber, o.type, o.trend])).toEqual([
      [2n, "start", "up"],
      [4n, "flip", "down"],
      [5n, "end", "none"],
    ]);
  });
});
