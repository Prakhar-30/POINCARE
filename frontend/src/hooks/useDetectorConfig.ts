import { useReadContracts } from "wagmi";
import { CONTRACTS, HOOK_ABI } from "@/config/contracts";

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
  loading: boolean;
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
    ],
    query: { refetchInterval: 12000 },
  });

  const num = (i: number) => Number((data?.[i]?.result as bigint | undefined) ?? 0n) / WAD;
  const lambda = num(6);

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
    lastSampledBlock: Number((data?.[8]?.result as bigint | undefined) ?? 0n),
    loading: isLoading,
  };
}
