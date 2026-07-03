import { useAccount, useReadContracts } from "wagmi";
import { CONTRACTS, ERC20_ABI } from "@/config/contracts";
import { fromWei } from "@/lib/units";

export function useBalances() {
  const { address } = useAccount();
  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { address: CONTRACTS.usdc as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"] },
      { address: CONTRACTS.weth as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"] },
    ],
    query: { enabled: Boolean(address), refetchInterval: 6000 },
  });
  return {
    usdc: fromWei((data?.[0]?.result as bigint) ?? 0n, "USDC"),
    weth: fromWei((data?.[1]?.result as bigint) ?? 0n, "WETH"),
    refetch,
    isLoading,
  };
}
