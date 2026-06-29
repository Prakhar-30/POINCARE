import { useReadContracts } from "wagmi";
import { CONTRACTS, HOOK_ABI, TREND, type TrendLabel } from "@/config/contracts";

const hook = { address: CONTRACTS.hook as `0x${string}`, abi: HOOK_ABI } as const;

export type PoolState = {
  /** USDC reserve (currency0), 18-dec raw */
  r0: bigint;
  /** WETH reserve (currency1), 18-dec raw */
  r1: bigint;
  /** USDC per WETH = r0 / r1 */
  price: number;
  kappa: number; // WAD fraction -> number (e.g. 0.03)
  trend: TrendLabel;
  directionalEfficiency: number; // 0..1
  spreadZeroForOne: number; // WAD fraction
  spreadOneForZero: number;
  loading: boolean;
};

const WAD = 1e18;

/** Live read of the deployed PoincareHook on Unichain Sepolia. Polls every block-ish. */
export function usePoolState(): PoolState {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...hook, functionName: "reserves" },
      { ...hook, functionName: "kappa" },
      { ...hook, functionName: "trend" },
      { ...hook, functionName: "directionalEfficiency" },
      { ...hook, functionName: "effectiveSpread", args: [true] },
      { ...hook, functionName: "effectiveSpread", args: [false] },
    ],
    query: { refetchInterval: 4000 },
  });

  const reserves = data?.[0]?.result as readonly [bigint, bigint] | undefined;
  const r0 = reserves?.[0] ?? 0n;
  const r1 = reserves?.[1] ?? 0n;
  const price = r1 > 0n ? Number(r0) / Number(r1) : 0;

  const kappaRaw = (data?.[1]?.result as bigint) ?? 0n;
  const trendIdx = Number((data?.[2]?.result as number | bigint) ?? 0);
  const dRaw = (data?.[3]?.result as bigint) ?? 0n;
  const sZ = (data?.[4]?.result as bigint) ?? 0n;
  const sO = (data?.[5]?.result as bigint) ?? 0n;

  return {
    r0,
    r1,
    price,
    kappa: Number(kappaRaw) / WAD,
    trend: TREND[trendIdx] ?? "none",
    directionalEfficiency: Number(dRaw) / WAD,
    spreadZeroForOne: Number(sZ) / WAD,
    spreadOneForZero: Number(sO) / WAD,
    loading: isLoading,
  };
}
