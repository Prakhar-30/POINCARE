import type { PublicClient } from "viem";

/**
 * Resolve a gas limit ourselves instead of letting the wallet estimate.
 *
 * Some public RPCs (Unichain Sepolia among them) have a flaky `eth_estimateGas`
 * for hook calls — the node mis-simulates the v4 unlock/settle path and reverts
 * the estimate, so MetaMask refuses to send even though the tx itself is valid
 * (which is why entering a manual limit worked). We try a node estimate with a
 * buffer, and if that throws we fall back to a known-safe constant. Passing an
 * explicit `gas` to `writeContract` makes viem skip the wallet's own estimation.
 *
 * Note: gas limit is only a ceiling — the sender still pays for gas actually used,
 * so a generous fallback costs nothing extra when the call is cheap.
 */
export async function resolveGas(
  publicClient: PublicClient,
  params: Parameters<PublicClient["estimateContractGas"]>[0],
  fallback: bigint,
): Promise<bigint> {
  try {
    const est = await publicClient.estimateContractGas(params);
    const buffered = est + est / 4n; // +25% headroom
    return buffered > fallback ? buffered : fallback; // never below the safe floor
  } catch {
    return fallback;
  }
}

/** Safe fallback gas ceilings, sized from the manual values that worked on-chain. */
export const GAS = {
  approve: 150_000n,
  swap: 3_000_000n,
  addLiquidity: 3_000_000n,
  removeLiquidity: 2_500_000n,
  mint: 200_000n,
} as const;
