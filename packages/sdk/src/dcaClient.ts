import {
  encodeFunctionData,
  parseEventLogs,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { dcaAbi } from "./abi/dca.js";
import { erc20Abi } from "./abi/erc20.js";
import { type DcaOrder, type DcaOrderParams, type DcaStatus, statusOf, toDcaOrder } from "./dca.js";
import { type PoincareDeployment, requireDca } from "./deployments.js";
import type { Side } from "./regime.js";

/**
 * Explicit gas limits. Testnet eth_estimateGas mis-simulates calls that run through the hook,
 * so every transaction the SDK builds carries a limit with headroom instead of relying on it.
 */
export const DCA_GAS = {
  approve: 80_000n,
  createOrder: 450_000n,
  executeSlice: 1_500_000n,
  cancel: 200_000n,
  closeExpired: 200_000n,
} as const;

/** An unsigned transaction: send it from any wallet. */
export type TxRequest = { to: Address; data: Hex; value: bigint; gas: bigint; description: string };

/** What PoincareDCA.canExecute reports for an order right now. */
export type SlicePreview = {
  status: DcaStatus;
  amountIn: bigint;
  quoteOut: bigint;
  minOut: bigint;
  spreadBps: number;
  slot: bigint;
  nextSlotAt: bigint;
};

const inputToken = (dep: PoincareDeployment, side: Side): Address => (side === "buy" ? dep.usdc : dep.weth);

// ---------------------------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------------------------

export async function getOrder(client: PublicClient, dep: PoincareDeployment, id: bigint): Promise<DcaOrder | null> {
  const o = await client.readContract({ address: requireDca(dep), abi: dcaAbi, functionName: "getOrder", args: [id] });
  if (o.owner === "0x0000000000000000000000000000000000000000") return null;
  return toDcaOrder(id, o);
}

export async function getOrdersOf(client: PublicClient, dep: PoincareDeployment, owner: Address): Promise<DcaOrder[]> {
  const ids = await client.readContract({ address: requireDca(dep), abi: dcaAbi, functionName: "ordersOf", args: [owner] });
  const orders = await Promise.all(ids.map((id) => getOrder(client, dep, id)));
  return orders.filter((o): o is DcaOrder => o !== null);
}

/** Every open order id, paging through openOrders. */
export async function getOpenOrderIds(client: PublicClient, dep: PoincareDeployment, pageSize = 200n): Promise<bigint[]> {
  const dca = requireDca(dep);
  const total = await client.readContract({ address: dca, abi: dcaAbi, functionName: "openOrderCount" });
  const ids: bigint[] = [];
  for (let off = 0n; off < total; off += pageSize) {
    ids.push(...(await client.readContract({ address: dca, abi: dcaAbi, functionName: "openOrders", args: [off, pageSize] })));
  }
  return ids;
}

/** The contract's own verdict on the next slice (spread, trend, limit, schedule). */
export async function previewSlice(client: PublicClient, dep: PoincareDeployment, id: bigint): Promise<SlicePreview> {
  const p = await client.readContract({ address: requireDca(dep), abi: dcaAbi, functionName: "canExecute", args: [id] });
  return {
    status: statusOf(p.status),
    amountIn: p.amountIn,
    quoteOut: p.quoteOut,
    minOut: p.minOut,
    spreadBps: Number(p.spreadBps),
    slot: p.slot,
    nextSlotAt: p.nextSlotAt,
  };
}

export async function allowanceFor(client: PublicClient, dep: PoincareDeployment, owner: Address, side: Side): Promise<bigint> {
  return client.readContract({ address: inputToken(dep, side), abi: erc20Abi, functionName: "allowance", args: [owner, requireDca(dep)] });
}

// ---------------------------------------------------------------------------------------------
// unsigned transactions
// ---------------------------------------------------------------------------------------------

/** Approve exactly the order budget (never an unlimited allowance). */
export function buildApproveTx(dep: PoincareDeployment, side: Side, amount: bigint): TxRequest {
  return {
    to: inputToken(dep, side),
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [requireDca(dep), amount] }),
    value: 0n,
    gas: DCA_GAS.approve,
    description: `Approve ${side === "buy" ? "USDC" : "WETH"} for the DCA contract`,
  };
}

export function buildCreateOrderTx(dep: PoincareDeployment, p: DcaOrderParams): TxRequest {
  return {
    to: requireDca(dep),
    data: encodeFunctionData({
      abi: dcaAbi,
      functionName: "createOrder",
      args: [{
        zeroForOne: p.zeroForOne,
        amountIn: p.amountIn,
        slices: p.slices,
        interval: p.interval,
        startTime: p.startTime,
        deadline: p.deadline,
        maxSpreadBps: p.maxSpreadBps,
        pauseOnTrend: p.pauseOnTrend,
        catchUp: p.catchUp,
        maxSlippageBps: p.maxSlippageBps,
        minPriceWad: p.minPriceWad,
        recipient: p.recipient,
      }],
    }),
    value: 0n,
    gas: DCA_GAS.createOrder,
    description: `Create a DCA order (${p.slices} slices)`,
  };
}

const simple = (fn: "executeSlice" | "cancel" | "closeExpired", label: string) => (dep: PoincareDeployment, id: bigint): TxRequest => ({
  to: requireDca(dep),
  data: encodeFunctionData({ abi: dcaAbi, functionName: fn, args: [id] }),
  value: 0n,
  gas: DCA_GAS[fn],
  description: `${label} DCA order #${id}`,
});

/** Fill the current slot's slice. Only a keeper or the order's owner may send it. */
export const buildExecuteSliceTx = simple("executeSlice", "Fill a slice of");
/** Cancel and refund. Only the order's owner may send it. */
export const buildCancelTx = simple("cancel", "Cancel");
/** After the deadline, refund the unfilled budget to the owner. Anyone may send it. */
export const buildCloseExpiredTx = simple("closeExpired", "Refund expired");

/** Everything a wallet must sign to open this order: an approval if needed, then the order. */
export async function planCreateOrder(
  client: PublicClient,
  dep: PoincareDeployment,
  owner: Address,
  p: DcaOrderParams,
): Promise<TxRequest[]> {
  const side: Side = p.zeroForOne ? "buy" : "sell";
  const allowance = await allowanceFor(client, dep, owner, side);
  return [...(allowance < p.amountIn ? [buildApproveTx(dep, side, p.amountIn)] : []), buildCreateOrderTx(dep, p)];
}

// ---------------------------------------------------------------------------------------------
// sending
// ---------------------------------------------------------------------------------------------

export class TxRevertedError extends Error {
  constructor(readonly hash: Hash) {
    super(`transaction ${hash} reverted`);
    this.name = "TxRevertedError";
  }
}

/** Send one TxRequest with its explicit gas, wait for it, and fail loudly on a revert. */
export async function sendTx(
  wallet: WalletClient,
  client: PublicClient,
  tx: TxRequest,
  opts: { account?: Account | Address; chain?: Chain } = {},
): Promise<TransactionReceipt> {
  const account = opts.account ?? wallet.account;
  if (!account) throw new Error("the wallet client has no account");
  const hash = await wallet.sendTransaction({
    account,
    chain: opts.chain ?? wallet.chain ?? null,
    to: tx.to,
    data: tx.data,
    value: tx.value,
    gas: tx.gas,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new TxRevertedError(hash);
  return receipt;
}

/** The order id from a createOrder receipt. */
export function orderIdFromReceipt(dep: PoincareDeployment, receipt: TransactionReceipt): bigint {
  const dca = requireDca(dep).toLowerCase();
  const logs = parseEventLogs({ abi: dcaAbi, eventName: "OrderCreated", logs: receipt.logs.filter((l) => l.address.toLowerCase() === dca) });
  if (!logs.length) throw new Error("no OrderCreated event in this receipt");
  return logs[0].args.id;
}
