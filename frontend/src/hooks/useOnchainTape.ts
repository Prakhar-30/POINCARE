import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import { fetchHookSwaps, HOOK_DEPLOY_BLOCK, LOG_RANGE } from "@/lib/onchain";
import type { SwapRow } from "@/lib/db";

const dedupe = (list: SwapRow[]) => {
  const seen = new Set<string>();
  return list.filter((r) => (seen.has(r.tx_hash) ? false : (seen.add(r.tx_hash), true)));
};

/** Estimate a block's timestamp from two anchors (avoids one RPC call per block). */
async function makeTsOf(client: PublicClient, latest: bigint) {
  const refBlock = latest > 5000n ? latest - 5000n : 0n;
  const [a, b] = await Promise.all([client.getBlock({ blockNumber: latest }), client.getBlock({ blockNumber: refBlock })]);
  const latestTs = Number(a.timestamp) * 1000;
  const span = Number(latest - refBlock) || 1;
  const msPerBlock = (Number(a.timestamp - b.timestamp) * 1000) / span || 1000;
  return (block: bigint) => new Date(latestTs - Number(latest - block) * msPerBlock).toISOString();
}

/**
 * This pool's swap history, read directly from on-chain `HookSwap` logs and paged
 * back in <=10k-block windows ("Load more"), down to the hook's deploy block. Live
 * swaps are polled in from the chain head, so it needs no backend at all.
 */
export function useOnchainTape() {
  const client = usePublicClient();
  const [rows, setRows] = useState<SwapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursor = useRef<bigint | null>(null); // next toBlock to page down from
  const headRef = useRef<bigint>(0n); // highest block already shown
  const tsOf = useRef<(b: bigint) => string>(() => new Date().toISOString());

  // initial load — newest non-empty window
  useEffect(() => {
    if (!client) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const latest = await client.getBlockNumber();
      tsOf.current = await makeTsOf(client, latest);
      let to = latest;
      let acc: SwapRow[] = [];
      let hops = 0;
      while (alive && to >= HOOK_DEPLOY_BLOCK && acc.length === 0 && hops < 12) {
        const from = to - LOG_RANGE + 1n > HOOK_DEPLOY_BLOCK ? to - LOG_RANGE + 1n : HOOK_DEPLOY_BLOCK;
        acc = await fetchHookSwaps(client, from, to, tsOf.current);
        to = from - 1n;
        hops++;
      }
      if (!alive) return;
      setRows(acc);
      headRef.current = latest;
      cursor.current = to;
      setHasMore(to >= HOOK_DEPLOY_BLOCK);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [client]);

  // page further back, skipping empty windows (bounded hops per click)
  const loadMore = useCallback(async () => {
    if (!client || loadingMore || !hasMore || cursor.current === null) return;
    setLoadingMore(true);
    let to = cursor.current;
    let found: SwapRow[] = [];
    let hops = 0;
    while (to >= HOOK_DEPLOY_BLOCK && found.length === 0 && hops < 8) {
      const from = to - LOG_RANGE + 1n > HOOK_DEPLOY_BLOCK ? to - LOG_RANGE + 1n : HOOK_DEPLOY_BLOCK;
      found = await fetchHookSwaps(client, from, to, tsOf.current);
      to = from - 1n;
      hops++;
    }
    setRows((prev) => dedupe([...prev, ...found]));
    cursor.current = to;
    setHasMore(to >= HOOK_DEPLOY_BLOCK);
    setLoadingMore(false);
  }, [client, hasMore, loadingMore]);

  // poll the chain head for new swaps and prepend them
  useEffect(() => {
    if (!client) return;
    let alive = true;
    const id = setInterval(async () => {
      const latest = await client.getBlockNumber();
      if (!alive || latest <= headRef.current) return;
      const fresh = await fetchHookSwaps(client, headRef.current + 1n, latest, tsOf.current);
      headRef.current = latest;
      if (fresh.length) setRows((prev) => dedupe([...fresh, ...prev]));
    }, 12000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [client]);

  return { rows, loadMore, hasMore, loading, loadingMore };
}
