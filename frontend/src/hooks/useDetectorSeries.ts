import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import { CONTRACTS } from "@/config/contracts";
import { fetchDetectorSeries, recordDetectorSamples } from "@/lib/db";
import { fetchDetectorSamples, LOG_RANGE, type DetectorPoint } from "@/lib/onchain";

const POLL_MS = 12_000;
const KEEP = 240; // samples kept in memory / plotted
const MAX_HOPS = 12; // getLogs windows per sync cycle (the RPC caps one call at ~10k blocks)

const merge = (prev: DetectorPoint[], next: DetectorPoint[]) => {
  const byBlock = new Map<number, DetectorPoint>();
  for (const p of [...prev, ...next]) byBlock.set(p.block_number, p);
  return [...byBlock.values()].sort((a, b) => a.block_number - b.block_number).slice(-KEEP);
};

/** Scan [from, to] in <=LOG_RANGE windows (the RPC rejects wider calls), bounded to
 *  MAX_HOPS per cycle so a long idle gap converges over a few polls instead of one
 *  giant request. Returns the samples found and how far the scan actually reached. */
async function scanChunked(client: PublicClient, from: bigint, to: bigint) {
  const found: DetectorPoint[] = [];
  let cursor = from;
  for (let hops = 0; cursor <= to && hops < MAX_HOPS; hops++) {
    const end = cursor + LOG_RANGE - 1n < to ? cursor + LOG_RANGE - 1n : to;
    found.push(...(await fetchDetectorSamples(client, cursor, end)));
    cursor = end + 1n;
  }
  return { found, syncedTo: cursor - 1n };
}

/**
 * The detector's real per-block trace (CUSUM evidence, D, sigma, kappa, fee), sourced
 * from the hook's `DetectorSample` event. History comes from the backend mirror (which
 * outlives the RPC's log window); the live edge is read from the chain in chunked
 * windows and written back to the mirror, so whichever client is watching keeps the
 * shared history current even after hours of idle gap.
 */
export function useDetectorSeries() {
  const client = usePublicClient();
  const [points, setPoints] = useState<DetectorPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const headRef = useRef<bigint>(0n); // last chain block already scanned

  useEffect(() => {
    if (!client) return;
    let alive = true;
    let busy = false;

    const sync = async () => {
      if (busy) return; // a long chunked catch-up may outlast the poll interval
      busy = true;
      try {
        const latest = await client.getBlockNumber();
        if (headRef.current === 0n) {
          // First load: backend history, then catch the mirror up from wherever it ends.
          const stored = await fetchDetectorSeries(KEEP);
          if (!alive) return;
          if (stored.length) setPoints(stored); // paint history immediately
          const syncedTo = BigInt(stored.length ? stored[stored.length - 1].block_number : 0);
          let from = syncedTo > 0n ? syncedTo + 1n : CONTRACTS.deployBlock;
          if (from < CONTRACTS.deployBlock) from = CONTRACTS.deployBlock;
          const { found, syncedTo: reached } = await scanChunked(client, from, latest);
          if (!alive) return;
          if (found.length) {
            setPoints((prev) => merge(prev, found));
            void recordDetectorSamples(found);
          }
          headRef.current = reached;
        } else if (latest > headRef.current) {
          const { found, syncedTo: reached } = await scanChunked(client, headRef.current + 1n, latest);
          if (!alive) return;
          if (found.length) {
            setPoints((prev) => merge(prev, found));
            void recordDetectorSamples(found);
          }
          headRef.current = reached;
        }
      } catch (e) {
        console.warn("detector series sync", e);
      } finally {
        busy = false;
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
