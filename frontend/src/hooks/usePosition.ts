import { useAccount, useReadContracts } from "wagmi";
import { CONTRACTS, HOOK_ABI } from "@/config/contracts";

const hook = { address: CONTRACTS.hook as `0x${string}`, abi: HOOK_ABI } as const;
const ZERO = "0x0000000000000000000000000000000000000000";

export type Position = {
  shares: number; // user LP shares (human)
  supply: number; // total LP supply (human)
  sharePct: number; // 0..1 of the pool the user owns
  underlying0: number; // USDC the shares redeem for
  underlying1: number; // WETH the shares redeem for
  valueUsdc: number; // position value in USDC (both legs)
  poolValueUsdc: number; // whole-pool value in USDC
  price: number; // USDC per WETH
  r0: number; // USDC reserve
  r1: number; // WETH reserve
  loading: boolean;
  refetch: () => void;
};

/** Live LP position read from the hook's own ERC20 share token + reserves. */
export function usePosition(): Position {
  const { address } = useAccount();
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...hook, functionName: "reserves" },
      { ...hook, functionName: "totalSupply" },
      { ...hook, functionName: "balanceOf", args: [(address ?? ZERO) as `0x${string}`] },
    ],
    query: { refetchInterval: 6000 },
  });

  const reserves = data?.[0]?.result as readonly [bigint, bigint] | undefined;
  const r0 = Number(reserves?.[0] ?? 0n) / 1e18;
  const r1 = Number(reserves?.[1] ?? 0n) / 1e18;
  const supply = Number((data?.[1]?.result as bigint) ?? 0n) / 1e18;
  const shares = Number((data?.[2]?.result as bigint) ?? 0n) / 1e18;

  const price = r1 > 0 ? r0 / r1 : 0;
  const sharePct = supply > 0 ? shares / supply : 0;
  const underlying0 = sharePct * r0;
  const underlying1 = sharePct * r1;
  const valueUsdc = underlying0 + underlying1 * price;
  const poolValueUsdc = r0 + r1 * price;

  return { shares, supply, sharePct, underlying0, underlying1, valueUsdc, poolValueUsdc, price, r0, r1, loading: isLoading, refetch };
}
