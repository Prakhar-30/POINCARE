import type { Hash, PublicClient, TransactionReceipt } from "viem";

/**
 * Wait for a transaction and REJECT it if it reverted.
 *
 * `waitForTransactionReceipt` resolves for any mined transaction, successful or
 * not, so awaiting it alone treats a revert as a success. That matters more here
 * than on most chains: we deliberately pass an explicit `gas` to every write (see
 * `resolveGas`), which skips the wallet simulation that would normally catch a
 * failing call before it is ever sent. A reverted swap therefore reaches the chain,
 * and without this check the app would report it as confirmed, invent an execution
 * price from a zero balance change, and write the phantom trade to the shared tape.
 */
export async function waitForSuccess(publicClient: PublicClient, hash: Hash): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("Transaction reverted on chain. Nothing was executed; you were only charged gas.");
  }
  return receipt;
}

/**
 * Resolve a gas limit ourselves instead of letting the wallet estimate.
 *
 * Some public RPCs (Unichain Sepolia among them) have a flaky `eth_estimateGas`
 * for hook calls: the node mis-simulates the v4 unlock/settle path and reverts
 * the estimate, so MetaMask refuses to send even though the tx itself is valid
 * (which is why entering a manual limit worked). Try a node estimate with a
 * buffer; if that throws, fall back to a known-safe constant. Passing an
 * explicit `gas` to `writeContract` makes viem skip the wallet's own estimation.
 *
 * A gas limit is only a ceiling; the sender still pays for gas actually used,
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
  mint: 400_000n,
} as const;

/**
 * The account's next nonce, read from the node's pending state and passed explicitly
 * to every write. MetaMask keeps its own nonce cache, and on Unichain Sepolia that
 * cache goes stale when transactions are sent back-to-back (approve -> swap, or the
 * two faucet mints): the wallet reuses a nonce, the node rejects it, and the user
 * sees "nonce out of sync" that even resetting the activity tab doesn't reliably fix.
 * Pinning the nonce from the node sidesteps the wallet's cache entirely.
 */
export async function nextNonce(publicClient: PublicClient, address: `0x${string}`): Promise<number> {
  return publicClient.getTransactionCount({ address, blockTag: "pending" });
}
