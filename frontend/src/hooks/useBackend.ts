import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { CONTRACTS } from "@/config/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dedupeByTx,
  fetchPoolTotals,
  fetchTape,
  fetchTapePage,
  fetchWalletTotals,
  fetchWalletProfile,
  fetchWalletSwaps,
  fetchLpEvents,
  subscribeSwaps,
  touchWallet,
  type LpEvent,
  type SwapRow,
} from "@/lib/db";

/** ERC20 Transfer(address,address,uint256). The LP share token is the hook's own OpenZeppelin
 *  ERC20, so every deposit's mint is a Transfer from the zero address in its receipt. */
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC = `0x${"0".repeat(64)}`;
const addrTopic = (a: string) => `0x${"0".repeat(24)}${a.toLowerCase().slice(2)}`;

/** Register the connected wallet once per browser session; first sight counts it as
 *  a new user, every later session as a returning one (see v_wallet_totals). */
export function useWalletIdentity() {
  const { address, isConnected } = useAccount();
  useEffect(() => {
    if (!isConnected || !address) return;
    const key = `poincare-touched-${address.toLowerCase()}`;
    if (sessionStorage.getItem(key)) return; // one visit per session, not per page load
    sessionStorage.setItem(key, "1");
    void touchWallet(address);
  }, [isConnected, address]);
}

/** Pool-wide totals (LVR avoided, volume), polled. */
export function usePoolTotals() {
  return useQuery({ queryKey: ["poolTotals"], queryFn: fetchPoolTotals, refetchInterval: 8000 });
}

/** User counts: total / new this week / returning / active 24h. */
export function useWalletTotals() {
  return useQuery({ queryKey: ["walletTotals"], queryFn: fetchWalletTotals, refetchInterval: 30000 });
}

/** Everything the app has recorded for the connected wallet: profile, swaps, liquidity events. */
export function useWalletActivity() {
  const { address } = useAccount();
  const enabled = Boolean(address);
  const addr = address ?? "";
  const profile = useQuery({ queryKey: ["walletProfile", addr], queryFn: () => fetchWalletProfile(addr), enabled, refetchInterval: 60000 });
  const swaps = useQuery({ queryKey: ["walletSwaps", addr], queryFn: () => fetchWalletSwaps(addr), enabled, refetchInterval: 15000 });
  const lp = useQuery({ queryKey: ["walletLp", addr], queryFn: () => fetchLpEvents(addr), enabled, refetchInterval: 15000 });

  // Deposits recorded before the app captured minted shares were stored with shares = 0. The
  // real figure is on chain: read it back from each deposit's receipt. Receipts never change,
  // so each is fetched once.
  const publicClient = usePublicClient();
  const missing = (lp.data ?? []).filter((e) => e.kind === "add" && !(e.shares > 0)).map((e) => e.tx_hash);
  const minted = useQuery({
    queryKey: ["lpMinted", addr, missing],
    enabled: enabled && missing.length > 0 && Boolean(publicClient),
    staleTime: Infinity,
    queryFn: async () => {
      const hook = CONTRACTS.hook.toLowerCase();
      const to = addrTopic(addr);
      const out: Record<string, number> = {};
      await Promise.all(missing.map(async (hash) => {
        try {
          const r = await publicClient!.getTransactionReceipt({ hash: hash as `0x${string}` });
          let sum = 0n;
          for (const log of r.logs) {
            const t = log.topics;
            if (log.address.toLowerCase() === hook && t[0] === TRANSFER_TOPIC && t[1] === ZERO_TOPIC && t[2]?.toLowerCase() === to) sum += BigInt(log.data);
          }
          if (sum > 0n) out[hash] = Number(sum) / 1e18;
        } catch { /* unreachable receipt: the row keeps showing "not recorded" */ }
      }));
      return out;
    },
  });
  const lpEvents: LpEvent[] = (lp.data ?? []).map((e) =>
    e.kind === "add" && !(e.shares > 0) && minted.data?.[e.tx_hash] ? { ...e, shares: minted.data[e.tx_hash] } : e,
  );

  return {
    address,
    profile: profile.data ?? null,
    swaps: swaps.data ?? [],
    lpEvents,
    loading: profile.isLoading || swaps.isLoading || lp.isLoading,
  };
}

/** The live trade tape: seeded by a query, kept fresh by realtime inserts. */
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
    setRows((prev) => dedupeByTx([...prev, ...d]));
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
