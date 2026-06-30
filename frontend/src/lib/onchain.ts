import { encodeAbiParameters, keccak256, parseAbiItem, type PublicClient } from "viem";
import { CONTRACTS } from "@/config/contracts";
import type { SwapRow } from "@/lib/db";

/**
 * On-chain swap history for THIS pool, read straight from the hook's `HookSwap`
 * event — no backend, no contract change. The native PoolManager `Swap` event is
 * empty for a custom-curve hook (it bypasses native accounting), but the hook emits
 * `HookSwap(poolId, sender, amount0, amount1, fee0, fee1)` on every swap, where
 * amount0=currency0 (USDC), amount1=currency1 (WETH), positive=input / negative=output.
 *
 * The public RPC caps `eth_getLogs` at 10k blocks per call, so deep history is read
 * by paging in <=10k-block windows (see useOnchainTape).
 */

export const HOOK_SWAP_EVENT = parseAbiItem(
  "event HookSwap(bytes32 indexed poolId, address indexed sender, int128 amount0, int128 amount1, uint128 hookLPfeeAmount0, uint128 hookLPfeeAmount1)",
);

/** PoolId = keccak256(abi.encode(PoolKey)) — derived, verified against on-chain logs. */
export const POOL_ID = keccak256(
  encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
    [
      CONTRACTS.currency0 as `0x${string}`,
      CONTRACTS.currency1 as `0x${string}`,
      CONTRACTS.fee,
      CONTRACTS.tickSpacing,
      CONTRACTS.hook as `0x${string}`,
    ],
  ),
) as `0x${string}`;

/** Block the hook was deployed at — the floor for log paging on Unichain Sepolia. */
export const HOOK_DEPLOY_BLOCK = 55886685n;

/** Window width per getLogs call — under the RPC's 10k-block cap, with margin. */
export const LOG_RANGE = 9000n;

type TsOf = (block: bigint) => string;

/** Fetch + decode HookSwap logs in [fromBlock, toBlock], returned newest-first. */
export async function fetchHookSwaps(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
  tsOf: TsOf,
): Promise<SwapRow[]> {
  const logs = await client.getLogs({
    address: CONTRACTS.hook as `0x${string}`,
    event: HOOK_SWAP_EVENT,
    args: { poolId: POOL_ID },
    fromBlock,
    toBlock,
  });

  const rows = logs.map((l): SwapRow => {
    const a0 = l.args.amount0 as bigint; // currency0 = USDC
    const a1 = l.args.amount1 as bigint; // currency1 = WETH
    const buy = a0 > 0n; // USDC in -> buying WETH
    const usdc = Number(buy ? a0 : -a0) / 1e18;
    const weth = Number(buy ? -a1 : a1) / 1e18;
    return {
      tx_hash: l.transactionHash,
      block_number: Number(l.blockNumber),
      ts: tsOf(l.blockNumber ?? 0n),
      trader: ((l.args.sender as string) ?? "").toLowerCase(),
      zero_for_one: buy,
      side: buy ? "buy_weth" : "sell_weth",
      amount_in: buy ? usdc : weth,
      amount_out: buy ? weth : usdc,
      price: weth > 0 ? usdc / weth : 0,
      notional_usdc: usdc,
      kappa: 0,
      trend: "none",
      spread_frac: 0,
      with_trend: false,
      lvr_captured_usdc: 0,
    };
  });

  return rows.reverse(); // getLogs is ascending; we want newest-first
}
