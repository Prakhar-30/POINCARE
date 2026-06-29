import { useTape } from "@/hooks/useBackend";

/**
 * Real signal for the oscilloscope: signed log-returns of the price of every swap
 * recorded so far (oldest -> newest), normalized to roughly [-1, 1] so they plot at
 * the same amplitude as the synthetic tail. Empty until at least two swaps exist.
 */
export function useSignalSeries(limit = 48): number[] {
  const tape = useTape(limit).data ?? [];
  const prices = [...tape].reverse().map((r) => r.price).filter((p) => p > 0);
  if (prices.length < 2) return [];

  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) rets.push(Math.log(prices[i] / prices[i - 1]));

  const maxAbs = Math.max(1e-6, ...rets.map((r) => Math.abs(r)));
  return rets.map((r) => Math.max(-1, Math.min(1, (r / maxAbs) * 0.72)));
}
