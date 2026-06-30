import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPoolTotals, fetchTape, fetchTapePage, subscribeSwaps, upsertWallet, type SwapRow } from "@/lib/db";

/** Remember the connected wallet across sessions. */
export function useWalletIdentity() {
  const { address, isConnected } = useAccount();
  useEffect(() => {
    if (isConnected && address) void upsertWallet(address);
  }, [isConnected, address]);
}

/** Pool-wide totals (LVR avoided, volume) — polled. */
export function usePoolTotals() {
  return useQuery({ queryKey: ["poolTotals"], queryFn: fetchPoolTotals, refetchInterval: 8000 });
}

/** The live trade tape — seeded by a query, kept fresh by realtime inserts. */
export function useTape(limit = 24) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tape", limit], queryFn: () => fetchTape(limit) });

  useEffect(() => {
    const unsub = subscribeSwaps((row) => {
      qc.setQueryData<SwapRow[]>(["tape", limit], (prev = []) => [row, ...prev].slice(0, limit));
      void qc.invalidateQueries({ queryKey: ["poolTotals"] });
    });
    return unsub;
  }, [qc, limit]);

  return q;
}

/** Paginated tape for "view entire history": loads `pageSize` newest, then more on
 *  demand, and prepends live inserts in real time. Newest data is effectively the
 *  on-chain head (every confirmed swap is recorded the moment it lands); older pages
 *  come from the backend index, so history survives RPC log-retention limits. */
export function usePagedTape(pageSize = 20) {
  const [rows, setRows] = useState<SwapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offset = useRef(0);

  const dedupe = (list: SwapRow[]) => {
    const seen = new Set<string>();
    return list.filter((r) => (seen.has(r.tx_hash) ? false : (seen.add(r.tx_hash), true)));
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void fetchTapePage(pageSize, 0).then((d) => {
      if (!alive) return;
      setRows(d);
      offset.current = d.length;
      setHasMore(d.length === pageSize);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const d = await fetchTapePage(pageSize, offset.current);
    setRows((prev) => dedupe([...prev, ...d]));
    offset.current += d.length;
    setHasMore(d.length === pageSize);
    setLoadingMore(false);
  }, [hasMore, loadingMore, pageSize]);

  useEffect(() => {
    const unsub = subscribeSwaps((row) => {
      setRows((prev) => (prev.some((r) => r.tx_hash === row.tx_hash) ? prev : [row, ...prev]));
      offset.current += 1;
    });
    return unsub;
  }, []);

  return { rows, loadMore, hasMore, loading, loadingMore };
}
