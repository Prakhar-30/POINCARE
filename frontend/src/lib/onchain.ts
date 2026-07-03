import { encodeAbiParameters, keccak256, parseAbiItem, type PublicClient } from "viem";
import { CONTRACTS, TREND, type TrendLabel } from "@/config/contracts";
import { fromWei, fromWad } from "@/lib/units";
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

/** Block the hook was deployed at — the floor for log paging (kept with the addresses). */
export const HOOK_DEPLOY_BLOCK = CONTRACTS.deployBlock;

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
    const usdc = fromWei(buy ? a0 : -a0, "USDC");
    const weth = fromWei(buy ? -a1 : a1, "WETH");
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

// ---------------------------------------------------------------------------
// DetectorSample — the hook's per-block detector trace (deployments >= July 2026)
// ---------------------------------------------------------------------------

export const DETECTOR_SAMPLE_EVENT = parseAbiItem(
  "event DetectorSample(uint256 blockNumber, uint256 priceWad, int256 r, int256 sPos, int256 sNeg, uint256 dWad, uint256 sigmaWad, uint256 kappaWad, uint8 trend, uint256 feeWad)",
);

/** One decoded detector sample — the full state of the brain at one block. */
export type DetectorPoint = {
  block_number: number;
  /** UI price, USDC per WETH (the on-chain priceWad is WETH/USDC — inverted here). */
  price: number;
  /** Clipped log-return the detector consumed (hook orientation). */
  r: number;
  s_pos: number;
  s_neg: number;
  d: number;
  sigma: number;
  kappa: number;
  /** UI trend label (hook orientation inverted to match the chart; see TREND). */
  trend: TrendLabel;
  fee: number;
};

/** Fetch + decode DetectorSample logs in [fromBlock, toBlock], ascending by block. */
export async function fetchDetectorSamples(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<DetectorPoint[]> {
  const logs = await client.getLogs({
    address: CONTRACTS.hook as `0x${string}`,
    event: DETECTOR_SAMPLE_EVENT,
    fromBlock,
    toBlock,
  });

  return logs.map((l) => {
    const priceWad = fromWad(l.args.priceWad as bigint); // WETH per USDC (hook orientation)
    return {
      block_number: Number(l.args.blockNumber as bigint),
      price: priceWad > 0 ? 1 / priceWad : 0,
      r: fromWad(l.args.r as bigint),
      s_pos: fromWad(l.args.sPos as bigint),
      s_neg: fromWad(l.args.sNeg as bigint),
      d: fromWad(l.args.dWad as bigint),
      sigma: fromWad(l.args.sigmaWad as bigint),
      kappa: fromWad(l.args.kappaWad as bigint),
      trend: TREND[Number(l.args.trend)] ?? "none",
      fee: fromWad(l.args.feeWad as bigint),
    };
  });
}
