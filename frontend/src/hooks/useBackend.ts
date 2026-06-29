import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPoolTotals, fetchTape, subscribeSwaps, upsertWallet, type SwapRow } from "@/lib/db";

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
