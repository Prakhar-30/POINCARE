import { useReadContracts } from "wagmi";
import { CONTRACTS, HOOK_ABI, TREND, type TrendLabel } from "@/config/contracts";
import { fromWei, fromWad } from "@/lib/units";

const hook = { address: CONTRACTS.hook as `0x${string}`, abi: HOOK_ABI } as const;

export type PoolState = {
  /** USDC reserve (currency0), raw wei */
  r0: bigint;
  /** WETH reserve (currency1), raw wei */
  r1: bigint;
  /** USDC per WETH */
  price: number;
  kappa: number; // WAD fraction -> number (e.g. 0.03)
  trend: TrendLabel;
  directionalEfficiency: number; // 0..1
  /** Spread a USDC->WETH swap pays this block (projected when available). */
  spreadZeroForOne: number;
  /** Spread a WETH->USDC swap pays this block (projected when available). */
  spreadOneForZero: number;
  /** Live volatility estimate σ̂ (per-block log-return units). 0 on pre-2026-07 hooks. */
  sigma: number;
  /** Vol-scaled base fee in force (fraction). 0 on pre-2026-07 hooks. */
  fee: number;
  loading: boolean;
};

/** Live read of the deployed PoincareHook on Unichain Sepolia. Polls every block-ish.
 *  Reads that the deployed hook doesn't support yet (older deployment) fail soft and
 *  fall back: previewSpread -> effectiveSpread, sigma/fee -> 0. */
export function usePoolState(): PoolState {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...hook, functionName: "reserves" },
      { ...hook, functionName: "kappa" },
      { ...hook, functionName: "trend" },
      { ...hook, functionName: "directionalEfficiency" },
      { ...hook, functionName: "effectiveSpread", args: [true] },
      { ...hook, functionName: "effectiveSpread", args: [false] },
      { ...hook, functionName: "previewSpread", args: [true] },
      { ...hook, functionName: "previewSpread", args: [false] },
      { ...hook, functionName: "sigmaWad" },
      { ...hook, functionName: "currentFeeWad" },
    ],
    query: { refetchInterval: 4000 },
  });

  const reserves = data?.[0]?.result as readonly [bigint, bigint] | undefined;
  const r0 = reserves?.[0] ?? 0n;
  const r1 = reserves?.[1] ?? 0n;
  const price = r1 > 0n ? fromWei(r0, "USDC") / fromWei(r1, "WETH") : 0;

  const kappaRaw = (data?.[1]?.result as bigint) ?? 0n;
  const trendIdx = Number((data?.[2]?.result as number | bigint) ?? 0);
  const dRaw = (data?.[3]?.result as bigint) ?? 0n;

  // Prefer the this-block projection; fall back to the stored spread on older hooks.
  const previewZ = data?.[6]?.result as readonly [bigint, bigint] | undefined;
  const previewO = data?.[7]?.result as readonly [bigint, bigint] | undefined;
  const sZ = previewZ?.[0] ?? ((data?.[4]?.result as bigint) ?? 0n);
  const sO = previewO?.[0] ?? ((data?.[5]?.result as bigint) ?? 0n);
  const feeWad = previewZ?.[1] ?? ((data?.[9]?.result as bigint) ?? 0n);

  return {
    r0,
    r1,
    price,
    kappa: fromWad(kappaRaw),
    trend: TREND[trendIdx] ?? "none",
    directionalEfficiency: fromWad(dRaw),
    spreadZeroForOne: fromWad(sZ),
    spreadOneForZero: fromWad(sO),
    sigma: fromWad((data?.[8]?.result as bigint) ?? 0n),
    fee: fromWad(feeWad),
    loading: isLoading,
  };
}
