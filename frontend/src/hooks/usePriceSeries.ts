import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchPriceSeries, type PricePoint } from "@/lib/db";

export const PRICE_WINDOWS = [
  { key: "1H", ms: 3_600_000 },
  { key: "24H", ms: 86_400_000 },
  { key: "5D", ms: 5 * 86_400_000 },
  { key: "All", ms: Infinity },
] as const;
export type PriceWindowKey = (typeof PRICE_WINDOWS)[number]["key"];

const MAX_POINTS = 400; // plotting resolution; stride-downsample anything denser

/**
 * Windowed price history from the backend — the FULL recorded history for the selected
 * window, independent of how much of the trade tape is loaded on screen. Keeps the
 * previous window's data while the next one loads so switching doesn't flash empty.
 */
export function usePriceSeries(windowKey: PriceWindowKey) {
  const win = PRICE_WINDOWS.find((w) => w.key === windowKey) ?? PRICE_WINDOWS[3];
  const q = useQuery({
    queryKey: ["priceSeries", win.key],
    queryFn: async (): Promise<PricePoint[]> => {
      const since = win.ms === Infinity ? null : new Date(Date.now() - win.ms).toISOString();
      const rows = await fetchPriceSeries(since);
      if (rows.length <= MAX_POINTS) return rows;
      const stride = Math.ceil(rows.length / MAX_POINTS);
      // keep the newest point exactly; stride from the end backwards
      const out: PricePoint[] = [];
      for (let i = rows.length - 1; i >= 0; i -= stride) out.push(rows[i]);
      return out.reverse();
    },
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  return { rows: q.data ?? [], loading: q.isLoading, fetching: q.isFetching };
}
