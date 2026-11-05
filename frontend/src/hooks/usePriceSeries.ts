import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchPriceBefore, fetchPriceSeries, priceOf, type PricePoint } from "@/lib/db";

export const PRICE_WINDOWS = [
  { key: "1H", ms: 3_600_000 },
  { key: "24H", ms: 86_400_000 },
  { key: "7D", ms: 7 * 86_400_000 },
  { key: "30D", ms: 30 * 86_400_000 },
  { key: "All", ms: Infinity },
] as const;
export type PriceWindowKey = (typeof PRICE_WINDOWS)[number]["key"];

export type ChartTrade = { t: number; p: number; buy: boolean; weth: number; usdc: number };

export type PriceSeries = {
  /** Trades inside the window, oldest first, thinned to at most MAX_POINTS. */
  trades: ChartTrade[];
  /** Price carried into the window from the last trade before it; null if there was none. */
  open: number | null;
  /** Window bounds in ms. `end` is now; `start` is now − window (or the first trade, for All). */
  start: number;
  end: number;
  /** True when "All" hit the row cap, so it starts later than the pool's first trade. */
  truncated: boolean;
};

const LIMIT = 5000;
const MAX_POINTS = 400; // plotting resolution

const toTrade = (r: PricePoint): ChartTrade | null => {
  const t = r.ts ? Date.parse(r.ts) : NaN;
  const p = priceOf(r);
  if (!Number.isFinite(t) || !(p > 0)) return null;
  const buy = r.side === "buy_weth";
  return { t, p, buy, weth: buy ? r.amount_out : r.amount_in, usdc: buy ? r.amount_in : r.amount_out };
};

/**
 * Keeps the closing trade of each time bucket, so a dense window thins evenly across time
 * (not across row count) and the newest trade - the price the header shows - survives exactly.
 */
function thin(trades: ChartTrade[], start: number, end: number): ChartTrade[] {
  if (trades.length <= MAX_POINTS) return trades;
  const width = Math.max(1, (end - start) / MAX_POINTS);
  const out: ChartTrade[] = [];
  let bucket = -1;
  for (const tr of trades) {
    const b = Math.floor((tr.t - start) / width);
    if (b === bucket) out[out.length - 1] = tr;
    else {
      out.push(tr);
      bucket = b;
    }
  }
  return out;
}

/**
 * Price history for a window that ends NOW (wall clock), not at the newest trade.
 *
 * An AMM's price only moves when someone trades, so a quiet window is a flat line at the last
 * price, not an empty chart - and the price the window opens at is the last trade before it,
 * fetched separately, so the change shown is measured from the true opening price.
 */
export function usePriceSeries(windowKey: PriceWindowKey) {
  const win = PRICE_WINDOWS.find((w) => w.key === windowKey) ?? PRICE_WINDOWS[4];
  const q = useQuery({
    queryKey: ["priceSeries", win.key],
    queryFn: async (): Promise<PriceSeries> => {
      const end = Date.now();
      if (win.ms === Infinity) {
        const rows = await fetchPriceSeries(null, LIMIT);
        const trades = rows.map(toTrade).filter((x): x is ChartTrade => x !== null).sort((a, b) => a.t - b.t);
        const start = trades[0]?.t ?? end;
        return { trades: thin(trades, start, end), open: null, start, end, truncated: rows.length >= LIMIT };
      }
      const start = end - win.ms;
      const since = new Date(start).toISOString();
      const [rows, before] = await Promise.all([fetchPriceSeries(since, LIMIT), fetchPriceBefore(since)]);
      const trades = rows.map(toTrade).filter((x): x is ChartTrade => x !== null).sort((a, b) => a.t - b.t);
      const open = before ? toTrade(before)?.p ?? null : null;
      return { trades: thin(trades, start, end), open, start, end, truncated: rows.length >= LIMIT };
    },
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  return { series: q.data ?? null, loading: q.isLoading, fetching: q.isFetching };
}
