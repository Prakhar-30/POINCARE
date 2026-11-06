import { describe, expect, it } from "vitest";
import { createPoincareClient } from "../src/client.js";

/**
 * Read-only checks against the live Unichain Sepolia deployment. Network-dependent, so they
 * only run with `pnpm test:live` (vitest --mode live).
 */
const live = (import.meta as unknown as { env: { MODE?: string } }).env.MODE === "live";

describe.skipIf(!live)("live Unichain Sepolia (read-only)", () => {
  const poincare = createPoincareClient();

  it("reads a coherent regime", async () => {
    const r = await poincare.regime();
    expect(r.price).toBeGreaterThan(100);
    expect(r.price).toBeLessThan(100_000);
    expect(["none", "up", "down"]).toContain(r.trend);
    expect(r.kappaMax).toBeGreaterThan(0);
    // the charged side, when there is one, is the with-trend side
    if (r.chargedSide) expect(r.chargedSide).toBe(r.withTrendSide);
  }, 30_000);

  it("quotes both sides and the spread follows the regime", async () => {
    const [r, buy, sell] = await Promise.all([poincare.regime(), poincare.quote("buy", "100"), poincare.quote("sell", "0.05")]);
    expect(buy.amountOut).toBeGreaterThan(0n);
    expect(sell.amountOut).toBeGreaterThan(0n);
    expect(buy.price).toBeGreaterThan(sell.price); // the bid-ask straddles the mid
    expect(buy.spread > 0).toBe(r.spread.buy > 0);
    expect(sell.spread > 0).toBe(r.spread.sell > 0);
  }, 30_000);

  it("reads the detector trace", async () => {
    const head = await poincare.publicClient.getBlockNumber();
    const samples = await poincare.history(head - 5_000n, head);
    for (const s of samples) expect(s.price).toBeGreaterThan(0);
  }, 60_000);
});
