import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { CONTRACTS, HOOK_ABI } from "@/config/contracts";
import type { DetectorParams } from "@/lib/detector";

const hook = { address: CONTRACTS.hook as `0x${string}`, abi: HOOK_ABI } as const;
const WAD = 1e18;

export type DetectorConfig = {
  k: number; // CUSUM slack (noise floor), WAD log-return
  h: number; // CUSUM threshold
  sMax: number; // statistic cap / κ saturation level
  kappaMin: number;
  kappaMax: number; // security cap on asymmetry
  dMax: number; // max spread (κ -> spread ceiling)
  lambda: number; // EWMA decay
  dFloor: number; // directional-efficiency floor to engage
  effWindow: number; // implied effective window N = 1/(1-λ)
  lastSampledBlock: number;
  /** True when the detector standardizes its increments by the live σ̂ (v2 mode). */
  adaptive: boolean;
  /**
   * The same configuration in exact WAD integers, ready to feed the off-chain
   * detector port. The float fields above are for display; anything that has to
   * reproduce on-chain arithmetic must use this.
   */
  params: DetectorParams;
  loading: boolean;
};

/** Zeroed params, so consumers can render before the reads land without a null check. */
const EMPTY_PARAMS: DetectorParams = {
  k: 0n,
  h: 0n,
  sMax: 0n,
  lambda: 0n,
  dFloor: 0n,
  adaptive: false,
  sigmaFloor: 0n,
  clipWad: 0n,
  kappaMin: 0n,
  kappaMax: 0n,
  dMax: 0n,
  feeGamma: 0n,
  feeCap: 0n,
};

/** Read the immutable detector/curve parameters the hook was deployed with. */
export function useDetectorConfig(): DetectorConfig {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...hook, functionName: "k" },
      { ...hook, functionName: "thresholdH" },
      { ...hook, functionName: "sMax" },
      { ...hook, functionName: "kappaMin" },
      { ...hook, functionName: "kappaMax" },
      { ...hook, functionName: "dMax" },
      { ...hook, functionName: "lambda" },
      { ...hook, functionName: "dFloor" },
      { ...hook, functionName: "lastSampledBlock" },
      { ...hook, functionName: "adaptive" },
      { ...hook, functionName: "sigmaFloor" },
      { ...hook, functionName: "clipWad" },
      { ...hook, functionName: "feeGamma" },
      { ...hook, functionName: "feeCap" },
    ],
    query: { refetchInterval: 12000 },
  });

  return useMemo(() => {
    const wad = (i: number) => (data?.[i]?.result as bigint | undefined) ?? 0n;
    const num = (i: number) => Number(wad(i)) / WAD;
    const lambda = num(6);
    const adaptive = Boolean(data?.[9]?.result ?? false);

    // An older deployment predates these getters; a reverted read comes back
    // undefined, so the params fall back to zero and the Lab degrades to
    // read-only rather than replaying against a half-read configuration.
    const params: DetectorParams = data
      ? {
          k: wad(0),
          h: wad(1),
          sMax: wad(2),
          lambda: wad(6),
          dFloor: wad(7),
          adaptive,
          sigmaFloor: wad(10),
          clipWad: wad(11),
          kappaMin: wad(3),
          kappaMax: wad(4),
          dMax: wad(5),
          feeGamma: wad(12),
          feeCap: wad(13),
        }
      : EMPTY_PARAMS;

    return {
      k: num(0),
      h: num(1),
      sMax: num(2),
      kappaMin: num(3),
      kappaMax: num(4),
      dMax: num(5),
      lambda,
      dFloor: num(7),
      effWindow: lambda < 1 && lambda > 0 ? 1 / (1 - lambda) : 0,
      lastSampledBlock: Number(wad(8)),
      adaptive,
      params,
      loading: isLoading,
    };
  }, [data, isLoading]);
}
