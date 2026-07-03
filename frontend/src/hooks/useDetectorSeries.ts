import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { CONTRACTS } from "@/config/contracts";
import { fetchDetectorSeries, recordDetectorSamples } from "@/lib/db";
import { fetchDetectorSamples, LOG_RANGE, type DetectorPoint } from "@/lib/onchain";

const POLL_MS = 12_000;
const KEEP = 240; // samples kept in memory / plotted

const merge = (prev: DetectorPoint[], next: DetectorPoint[]) => {
  const byBlock = new Map<number, DetectorPoint>();
  for (const p of [...prev, ...next]) byBlock.set(p.block_number, p);
  return [...byBlock.values()].sort((a, b) => a.block_number - b.block_number).slice(-KEEP);
};

/**
 * The detector's real per-block trace (CUSUM evidence, D, sigma, kappa, fee), sourced
 * from the hook's `DetectorSample` event. History comes from the backend mirror (which
 * outlives the RPC's log window); the live edge is read from the chain and written back
 * to the mirror, so whichever client is watching keeps the shared history current.
 * Empty on deployments that predate the event — callers show an empty state.
 */
export function useDetectorSeries() {
  const client = usePublicClient();
  const [points, setPoints] = useState<DetectorPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const headRef = useRef<bigint>(0n); // last chain block already read

  useEffect(() => {
    if (!client) return;
    let alive = true;

    const sync = async () => {
      try {
        const latest = await client.getBlockNumber();
        if (headRef.current === 0n) {
          // First load: backend history + one chain window from wherever the mirror ends.
          const stored = await fetchDetectorSeries(KEEP);
          const syncedTo = BigInt(stored.length ? stored[stored.length - 1].block_number : 0);
          let from = syncedTo > 0n ? syncedTo + 1n : latest - LOG_RANGE + 1n;
          if (from < CONTRACTS.deployBlock) from = CONTRACTS.deployBlock;
          if (from > latest) from = latest;
          const fresh = await fetchDetectorSamples(client, from, latest);
          if (!alive) return;
          setPoints(merge(stored, fresh));
          void recordDetectorSamples(fresh);
        } else if (latest > headRef.current) {
          const fresh = await fetchDetectorSamples(client, headRef.current + 1n, latest);
          if (!alive) return;
          if (fresh.length) {
            setPoints((prev) => merge(prev, fresh));
            void recordDetectorSamples(fresh);
          }
        }
        headRef.current = latest;
      } catch (e) {
        console.warn("detector series sync", e);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void sync();
    const id = setInterval(sync, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [client]);

  return { points, loading };
}

export type { DetectorPoint };
