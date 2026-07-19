import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import { fetchHookSwaps, HOOK_DEPLOY_BLOCK, LOG_RANGE } from "@/lib/onchain";
import { dedupeByTx, fetchTapePage, type SwapRow } from "@/lib/db";

const PAGE = 20;

/** Estimate a block's timestamp from two anchors (avoids one RPC call per block). */
async function makeTsOf(client: PublicClient, latest: bigint) {
  const refBlock = latest > 5000n ? latest - 5000n : 0n;
  const [a, b] = await Promise.all([client.getBlock({ blockNumber: latest }), client.getBlock({ blockNumber: refBlock })]);
  const latestTs = Number(a.timestamp) * 1000;
  const span = Number(latest - refBlock) || 1;
  const msPerBlock = (Number(a.timestamp - b.timestamp) * 1000) / span || 1000;
  return (block: bigint) => new Date(latestTs - Number(latest - block) * msPerBlock).toISOString();
}

const byNewest = (a: SwapRow, b: SwapRow) =>
  (b.block_number ?? 0) - (a.block_number ?? 0) || new Date(b.ts ?? 0).getTime() - new Date(a.ts ?? 0).getTime();

/**
 * Hybrid tape for this pool: history is paged from the backend index (which outlives
 * RPC log retention), while the chain is only read over one bounded recent window
 * (<= LOG_RANGE blocks) plus incremental head polling for the live edge. Backend rows
 * win dedupe (they carry kappa/trend/spread the raw log doesn't).
 */
export function useOnchainTape() {
  const client = usePublicClient();
  const [rows, setRows] = useState<SwapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offset = useRef(0);
  const headRef = useRef<bigint>(0n); // highest block already scanned
  const tsOf = useRef<(b: bigint) => string>(() => new Date().toISOString());

  // initial load: backend page + the most recent on-chain window, merged
  useEffect(() => {
    if (!client) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const latest = await client.getBlockNumber();
      tsOf.current = await makeTsOf(client, latest);
      const from = latest - LOG_RANGE + 1n > HOOK_DEPLOY_BLOCK ? latest - LOG_RANGE + 1n : HOOK_DEPLOY_BLOCK;
      const [stored, recent] = await Promise.all([
        fetchTapePage(PAGE, 0),
        fetchHookSwaps(client, from, latest, tsOf.current).catch(() => [] as SwapRow[]),
      ]);
      if (!alive) return;
      setRows(dedupeByTx([...stored, ...recent]).sort(byNewest));
      offset.current = stored.length;
      headRef.current = latest;
      setHasMore(stored.length === PAGE);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [client]);

  // deeper history comes from the backend only
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const page = await fetchTapePage(PAGE, offset.current);
    offset.current += page.length;
    setRows((prev) => dedupeByTx([...prev, ...page]).sort(byNewest));
    setHasMore(page.length === PAGE);
    setLoadingMore(false);
  }, [hasMore, loadingMore]);

  // live edge: poll only the blocks since the last scan
  useEffect(() => {
    if (!client) return;
    let alive = true;
    const id = setInterval(async () => {
      if (headRef.current === 0n) return;
      const latest = await client.getBlockNumber().catch(() => 0n);
      if (!alive || latest <= headRef.current) return;
      const fresh = await fetchHookSwaps(client, headRef.current + 1n, latest, tsOf.current).catch(() => [] as SwapRow[]);
      headRef.current = latest;
      if (fresh.length) setRows((prev) => dedupeByTx([...fresh, ...prev]).sort(byNewest));
    }, 12000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [client]);

  return { rows, loadMore, hasMore, loading, loadingMore };
}
