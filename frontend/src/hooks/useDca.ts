import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import type { PublicClient } from "viem";
import { CONTRACTS, EXPLORER, hasDca } from "@/config/contracts";
import {
  UNICHAIN_SEPOLIA,
  allowanceFor,
  buildApproveTx,
  buildCancelTx,
  buildCloseExpiredTx,
  buildCreateOrderTx,
  buildEditParams,
  buildEditTx,
  buildOrderParams,
  buildPauseTx,
  buildResumeTx,
  dcaAbi,
  getOrder,
  formatAmount,
  getOrdersOf,
  orderIdFromReceipt,
  previewSlice,
  withDca,
  type DcaEditInput,
  type DcaOrder,
  type DcaOrderInput,
  type PoincareDeployment,
  type SlicePreview,
  type TxRequest,
} from "@/lib/poincare-sdk";
import { nextNonce, waitForSuccess } from "@/lib/gas";
import { fetchDcaFills, fetchDcaOrders, type DcaOrderDbRow } from "@/lib/db";
import { humanizeError } from "@/lib/errors";
import { useStepper } from "@/hooks/useStepper";
import { useToast } from "@/components/ui/Toast";
import { fmtNum } from "@/lib/format";

/** The SDK deployment for the active chain, or null while PoincareDCA is not deployed. */
export const DCA_DEPLOYMENT: PoincareDeployment | null = hasDca
  ? withDca(
      {
        ...UNICHAIN_SEPOLIA,
        hook: CONTRACTS.hook as `0x${string}`,
        lens: CONTRACTS.lens as `0x${string}`,
        router: CONTRACTS.router as `0x${string}`,
        usdc: CONTRACTS.usdc as `0x${string}`,
        weth: CONTRACTS.weth as `0x${string}`,
      },
      CONTRACTS.dca as `0x${string}`,
      // the shipped deployment's block bounds the recent-fills lookup
      CONTRACTS.dca.toLowerCase() === UNICHAIN_SEPOLIA.dca?.toLowerCase() ? UNICHAIN_SEPOLIA.dcaDeployBlock : undefined,
    )
  : null;

export type DcaOrderWithNext = DcaOrder & { next: SlicePreview };

/** The connected wallet's DCA orders, newest first, each with the contract's verdict on its next fill.
 *  Database first (the dca-keeper index): closed orders come straight from it. The chain is asked
 *  only for open orders' live state and verdict, and for orders the index has not seen yet; with no
 *  index at all (not set up, unreachable) everything falls back to the chain. */
export function useDcaOrders() {
  const { address } = useAccount();
  const publicClient = usePublicClient() as unknown as PublicClient | undefined;
  return useQuery({
    queryKey: ["dcaOrders", address],
    enabled: Boolean(DCA_DEPLOYMENT && address && publicClient),
    refetchInterval: 10_000,
    queryFn: async (): Promise<DcaOrderWithNext[]> => {
      const dep = DCA_DEPLOYMENT!;
      const live = async (id: bigint): Promise<DcaOrderWithNext | null> => {
        const o = await getOrder(publicClient!, dep, id);
        return o ? { ...o, next: await previewSlice(publicClient!, dep, id) } : null;
      };
      const db = await fetchDcaOrders(address!).catch(() => null);
      if (!db) {
        const orders = await getOrdersOf(publicClient!, dep, address!);
        const withNext = await Promise.all(orders.map(async (o) => ({ ...o, next: await previewSlice(publicClient!, dep, o.id) })));
        return withNext.reverse();
      }
      const known = new Set(db.rows.map((r) => BigInt(r.order_id)));
      // last: one call for the ids, to catch orders created since the index last ran
      const ids = await orNull(() => publicClient!.readContract({ address: dep.dca!, abi: dcaAbi, functionName: "ordersOf", args: [address!] }));
      const fresh = (ids ?? []).filter((id) => !known.has(id));
      const open = db.rows.filter((r) => r.status === "open").map((r) => BigInt(r.order_id));
      const chain = (await Promise.all([...open, ...fresh].map(live))).filter((o): o is DcaOrderWithNext => o !== null);
      const byId = new Map<bigint, DcaOrderWithNext>(db.rows.filter((r) => r.status !== "open").map((r) => [BigInt(r.order_id), fromDbRow(r)]));
      for (const o of chain) byId.set(o.id, o);
      return [...byId.values()].sort((x, y) => (x.id > y.id ? -1 : 1));
    },
  });
}

/** One executed DCA slice, for the activity history. */
export type DcaFill = {
  orderId: bigint;
  side: "buy" | "sell";
  amountIn: number;
  amountOut: number;
  /** USDC per WETH. */
  price: number;
  spreadBps: number;
  ts: number;
  txHash: string;
  logIndex: number;
};

/** The wallet's DCA fills, newest first: the database index first; then, last, the recent blocks it
 *  has not indexed yet (public RPCs serve at most 1,000 blocks per log query). */
export function useDcaFills(orders: DcaOrderWithNext[] | undefined) {
  const { address } = useAccount();
  const publicClient = usePublicClient() as unknown as PublicClient | undefined;
  const ids = (orders ?? []).map((o) => o.id);
  const sideOf = new Map((orders ?? []).map((o) => [o.id, o.side] as const));
  return useQuery({
    queryKey: ["dcaFills", address, ids.map(String).join(",")],
    enabled: Boolean(DCA_DEPLOYMENT && address && publicClient && orders),
    refetchInterval: 15_000,
    queryFn: async (): Promise<DcaFill[]> => {
      const dep = DCA_DEPLOYMENT!;
      const db = (await fetchDcaFills(address!).catch(() => null)) ?? [];
      const fills: DcaFill[] = db.map((r) => ({
        orderId: BigInt(r.order_id), side: r.side, amountIn: Number(r.amount_in), amountOut: Number(r.amount_out), price: Number(r.price),
        spreadBps: r.spread_bps, ts: Date.parse(r.ts), txHash: r.tx_hash, logIndex: r.log_index,
      }));
      if (!ids.length) return fills;
      const head = await orNull(() => publicClient!.getBlockNumber());
      if (head === null) return fills;
      const indexed = BigInt(db.reduce((m, r) => Math.max(m, Number(r.block_number)), 0));
      let from = head > 999n ? head - 999n : 0n;
      if (indexed + 1n > from) from = indexed + 1n;
      if (dep.dcaDeployBlock && dep.dcaDeployBlock > from) from = dep.dcaDeployBlock;
      if (from > head) return fills;
      const logs = await orNull(() => publicClient!.getContractEvents({ address: dep.dca!, abi: dcaAbi, eventName: "SliceExecuted", args: { id: ids }, fromBlock: from, toBlock: head }));
      const seen = new Set(fills.map((f) => `${f.txHash}:${f.logIndex}`));
      const fresh = (logs ?? []).filter((l) => !seen.has(`${l.transactionHash}:${l.logIndex}`));
      const ts = new Map<bigint, number>();
      await Promise.all([...new Set(fresh.map((l) => l.blockNumber))].map(async (bn) => {
        const b = await orNull(() => publicClient!.getBlock({ blockNumber: bn }));
        ts.set(bn, b ? Number(b.timestamp) * 1000 : Date.now());
      }));
      for (const l of fresh) {
        const id = l.args.id!;
        const side = sideOf.get(id) ?? "buy";
        const amountIn = Number(formatAmount(l.args.amountIn!));
        const amountOut = Number(formatAmount(l.args.amountOut!));
        fills.push({
          orderId: id, side, amountIn, amountOut, spreadBps: Number(l.args.spreadBps!),
          price: side === "buy" ? (amountOut > 0 ? amountIn / amountOut : 0) : amountIn > 0 ? amountOut / amountIn : 0,
          ts: ts.get(l.blockNumber) ?? Date.now(), txHash: l.transactionHash, logIndex: l.logIndex,
        });
      }
      return fills.sort((a, b) => b.ts - a.ts);
    },
  });
}

async function orNull<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

/** A decimal from the database (number or string, possibly in exponent form) as 18-decimal units. */
function units(v: string | number): bigint {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  const s = typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? v : n.toFixed(18);
  const [i, d = ""] = s.split(".");
  return BigInt(i) * 10n ** 18n + BigInt((d + "0".repeat(18)).slice(0, 18));
}

/** A closed order from the index, in the shape the plans list renders (no chain call). */
function fromDbRow(r: DcaOrderDbRow): DcaOrderWithNext {
  const amountIn = units(r.amount_in);
  return {
    id: BigInt(r.order_id),
    owner: r.owner as `0x${string}`,
    recipient: r.recipient as `0x${string}`,
    side: r.side,
    zeroForOne: r.side === "buy",
    pauseOnTrend: r.pause_on_trend,
    catchUp: r.catch_up,
    cancelled: r.status === "cancelled",
    paused: r.paused,
    maxSpreadBps: r.max_spread_bps,
    maxSlippageBps: 0,
    slices: Math.max(0, r.slices - r.fills), // with scheduleFilled 0 the list shows fills / r.slices
    interval: r.interval_sec,
    filled: r.fills,
    scheduleFilled: 0,
    startTime: BigInt(Math.floor(Date.parse(r.start_time) / 1000)),
    deadline: BigInt(Math.floor(Date.parse(r.deadline) / 1000)),
    lastSlotPlusOne: 0n,
    amountIn,
    scheduleBudget: amountIn,
    remaining: units(r.remaining),
    amountOut: units(r.amount_out),
    refunded: units(r.refunded),
    minPriceWad: 0n,
    next: { status: r.status === "cancelled" ? "cancelled" : "filled", amountIn: 0n, quoteOut: 0n, minOut: 0n, spreadBps: 0, slot: 0n, nextSlotAt: 0n },
  };
}

/** Create / cancel / refund / pause / resume / edit, with the same step overlay, nonce pinning and
 *  explicit gas as swaps. */
export function useDcaActions() {
  const { address } = useAccount();
  const publicClient = usePublicClient() as unknown as PublicClient | undefined;
  const { data: walletClient } = useWalletClient();
  const stepper = useStepper();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  // Block of the latest mined DCA transaction: the next allowance read is pinned to it, so a lagging
  // public-RPC replica cannot report an allowance the previous order already spent.
  const lastBlock = useRef<bigint | undefined>(undefined);

  async function send(tx: TxRequest) {
    const hash = await walletClient!.sendTransaction({
      account: address!,
      chain: walletClient!.chain,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      gas: tx.gas,
      nonce: await nextNonce(publicClient!, address!),
    });
    const receipt = await waitForSuccess(publicClient!, hash);
    if (lastBlock.current === undefined || receipt.blockNumber > lastBlock.current) lastBlock.current = receipt.blockNumber;
    return receipt;
  }

  async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (inFlight.current || !DCA_DEPLOYMENT || !address || !walletClient || !publicClient) return undefined;
    inFlight.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      inFlight.current = false;
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["dcaOrders"] });
    }
  }

  /** Approve exactly the budget (if needed) and open the order. Resolves to the order id. */
  const create = (input: DcaOrderInput) =>
    guarded(async () => {
      const dep = DCA_DEPLOYMENT!;
      const params = buildOrderParams(input);
      const inSym = input.side === "buy" ? "USDC" : "WETH";
      const amount = `${fmtNum(Number(formatAmount(params.amountIn)), inSym === "WETH" ? 4 : 2)} ${inSym}`;
      const needApprove = (await allowanceFor(publicClient!, dep, address!, input.side, lastBlock.current)) < params.amountIn;
      stepper.begin([
        ...(needApprove ? [{ key: "approve", label: `Approve ${amount} for the DCA contract` }] : []),
        { key: "create", label: `Escrow ${amount} · ${params.slices} slices` },
      ]);
      let current = "create";
      try {
        if (needApprove) {
          current = "approve";
          stepper.activate("approve");
          await send(buildApproveTx(dep, input.side, params.amountIn));
          stepper.complete("approve");
        }
        current = "create";
        stepper.activate("create");
        const receipt = await send(buildCreateOrderTx(dep, params));
        stepper.complete("create");
        stepper.finish(`${EXPLORER}/tx/${receipt.transactionHash}`);
        const id = orderIdFromReceipt(dep, receipt);
        toast.success("DCA order created", `Order #${id}: ${amount} over ${params.slices} slices`, `${EXPLORER}/tx/${receipt.transactionHash}`);
        return id;
      } catch (e) {
        const msg = humanizeError(e);
        stepper.fail(current, msg);
        toast.error("DCA order failed", msg);
        return undefined;
      }
    });

  const closeOut = (kind: "cancel" | "refund", id: bigint) =>
    guarded(async () => {
      const dep = DCA_DEPLOYMENT!;
      try {
        const receipt = await send(kind === "cancel" ? buildCancelTx(dep, id) : buildCloseExpiredTx(dep, id));
        toast.success(kind === "cancel" ? "Order cancelled" : "Order refunded", `Order #${id}: the unfilled budget is back in your wallet`, `${EXPLORER}/tx/${receipt.transactionHash}`);
      } catch (e) {
        toast.error(kind === "cancel" ? "Cancel failed" : "Refund failed", humanizeError(e));
      }
    });

  /** Pause / resume / edit: one owner transaction each. Resolves to true once it is mined. */
  const manage = (kind: "pause" | "resume" | "edit", id: bigint, build: (dep: PoincareDeployment) => TxRequest) =>
    guarded(async () => {
      const COPY = {
        pause: ["Plan paused", "No buys until you resume it", "Pause failed"],
        resume: ["Plan resumed", "Buys continue on schedule", "Resume failed"],
        edit: ["Plan updated", "The rest of your budget follows the new schedule", "Edit failed"],
      } as const;
      const [ok, detail, failed] = COPY[kind];
      try {
        const receipt = await send(build(DCA_DEPLOYMENT!));
        toast.success(ok, `Order #${id}: ${detail.toLowerCase()}`, `${EXPLORER}/tx/${receipt.transactionHash}`);
        return true;
      } catch (e) {
        toast.error(failed, humanizeError(e));
        return false;
      }
    });

  return {
    create,
    cancel: (id: bigint) => closeOut("cancel", id),
    refund: (id: bigint) => closeOut("refund", id),
    pause: (id: bigint) => manage("pause", id, (dep) => buildPauseTx(dep, id)),
    resume: (id: bigint) => manage("resume", id, (dep) => buildResumeTx(dep, id)),
    /** Validated like editOrder before anything is signed (throws DcaParamError otherwise). */
    edit: (o: DcaOrder, input: DcaEditInput) => {
      const params = buildEditParams(o, input);
      return manage("edit", o.id, (dep) => buildEditTx(dep, o.id, params));
    },
    busy,
    stepper,
  };
}
