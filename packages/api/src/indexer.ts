import { type DcaOrder, type PoincareDeployment, dcaAbi, formatAmount, getOrder, requireDca, spentOf } from "@poincare/sdk";
import type { PublicClient } from "viem";

/** One slice fill, as stored in public.dca_fills (amounts in human units, 18-decimal tokens). */
export type DcaFillRow = {
  dca: string;
  order_id: number;
  owner: string;
  side: "buy" | "sell";
  slot: number;
  amount_in: string;
  amount_out: string;
  /** USDC per WETH at execution. */
  price: number;
  spread_bps: number;
  block_number: number;
  ts: string;
  tx_hash: string;
  log_index: number;
};

/** An order's latest state, as stored in public.dca_orders. */
export type DcaOrderRow = {
  dca: string;
  order_id: number;
  owner: string;
  recipient: string;
  side: "buy" | "sell";
  status: "open" | "completed" | "refunded" | "cancelled";
  paused: boolean;
  amount_in: string;
  spent: string;
  remaining: string;
  refunded: string;
  amount_out: string;
  fills: number;
  slices: number;
  interval_sec: number;
  start_time: string;
  deadline: string;
  max_spread_bps: number;
  pause_on_trend: boolean;
  catch_up: boolean;
  created_block: number | null;
  updated_block: number;
};

export type IndexRun = { fromBlock: bigint; toBlock: bigint; fills: DcaFillRow[]; orders: DcaOrderRow[] };

const lower = (a: string) => a.toLowerCase();
const iso = (unixSec: bigint) => new Date(Number(unixSec) * 1000).toISOString();

export function statusOfRow(o: Pick<DcaOrder, "cancelled" | "remaining" | "refunded">): DcaOrderRow["status"] {
  if (o.cancelled) return "cancelled";
  if (o.remaining > 0n) return "open";
  return o.refunded > 0n ? "refunded" : "completed";
}

export function orderRow(dca: string, o: DcaOrder, updatedBlock: bigint, createdBlock: bigint | null): DcaOrderRow {
  return {
    dca: lower(dca),
    order_id: Number(o.id),
    owner: lower(o.owner),
    recipient: lower(o.recipient),
    side: o.side,
    status: statusOfRow(o),
    paused: o.paused,
    amount_in: formatAmount(o.amountIn),
    spent: formatAmount(spentOf(o)),
    remaining: formatAmount(o.remaining),
    refunded: formatAmount(o.refunded),
    amount_out: formatAmount(o.amountOut),
    fills: o.filled,
    slices: o.filled - o.scheduleFilled + o.slices,
    interval_sec: o.interval,
    start_time: iso(o.startTime),
    deadline: iso(o.deadline),
    max_spread_bps: o.maxSpreadBps,
    pause_on_trend: o.pauseOnTrend,
    catch_up: o.catchUp,
    created_block: createdBlock === null ? null : Number(createdBlock),
    updated_block: Number(updatedBlock),
  };
}

/**
 * Read every PoincareDCA event in [fromBlock, fromBlock + maxChunks * chunk) (capped at the head),
 * in `chunk`-block pages because public RPCs cap eth_getLogs at 1,000 blocks. Returns one row per
 * fill and the latest state of every order an event touched; the caller stores them and moves its
 * cursor to `toBlock`. Order state only changes through these events, so touched orders suffice.
 */
export async function indexDca(opts: {
  publicClient: PublicClient;
  deployment: PoincareDeployment;
  fromBlock: bigint;
  maxChunks?: number;
  chunk?: bigint;
}): Promise<IndexRun> {
  const { publicClient, deployment } = opts;
  const dca = requireDca(deployment);
  const chunk = opts.chunk ?? 1_000n;
  const head = await publicClient.getBlockNumber();
  const fromBlock = opts.fromBlock;
  if (fromBlock > head) return { fromBlock, toBlock: fromBlock - 1n, fills: [], orders: [] };
  const last = fromBlock + chunk * BigInt(opts.maxChunks ?? 10) - 1n;
  const toBlock = last < head ? last : head;

  const logs = [];
  for (let from = fromBlock; from <= toBlock; from += chunk) {
    const to = from + chunk - 1n < toBlock ? from + chunk - 1n : toBlock;
    logs.push(...(await publicClient.getContractEvents({ address: dca, abi: dcaAbi, fromBlock: from, toBlock: to })));
  }

  const touched = new Map<bigint, bigint | null>(); // id -> created block, if created in range
  for (const l of logs) {
    const id = (l.args as { id?: bigint }).id;
    if (id === undefined) continue; // KeeperSet, OwnershipTransferred, ...
    if (!touched.has(id)) touched.set(id, null);
    if (l.eventName === "OrderCreated") touched.set(id, l.blockNumber);
  }
  const orders = new Map<bigint, DcaOrder>();
  await Promise.all([...touched.keys()].map(async (id) => {
    const o = await getOrder(publicClient, deployment, id);
    if (o) orders.set(id, o);
  }));

  const sliceLogs = logs.filter((l) => l.eventName === "SliceExecuted");
  const blockTs = new Map<bigint, bigint>();
  await Promise.all([...new Set(sliceLogs.map((l) => l.blockNumber))].map(async (b) => {
    blockTs.set(b, (await publicClient.getBlock({ blockNumber: b })).timestamp);
  }));

  const fills: DcaFillRow[] = [];
  for (const l of sliceLogs) {
    const a = l.args as { id: bigint; slot: bigint; amountIn: bigint; amountOut: bigint; spreadBps: bigint };
    const o = orders.get(a.id);
    if (!o) continue;
    const inN = Number(formatAmount(a.amountIn));
    const outN = Number(formatAmount(a.amountOut));
    fills.push({
      dca: lower(dca),
      order_id: Number(a.id),
      owner: lower(o.owner),
      side: o.side,
      slot: Number(a.slot),
      amount_in: formatAmount(a.amountIn),
      amount_out: formatAmount(a.amountOut),
      price: o.side === "buy" ? (outN > 0 ? inN / outN : 0) : inN > 0 ? outN / inN : 0,
      spread_bps: Number(a.spreadBps),
      block_number: Number(l.blockNumber),
      ts: iso(blockTs.get(l.blockNumber) ?? 0n),
      tx_hash: l.transactionHash,
      log_index: l.logIndex,
    });
  }

  return {
    fromBlock,
    toBlock,
    fills,
    orders: [...orders.values()].map((o) => orderRow(dca, o, toBlock, touched.get(o.id) ?? null)),
  };
}
