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
    )
  : null;

export type DcaOrderWithNext = DcaOrder & { next: SlicePreview };

/** The connected wallet's DCA orders, newest first, each with the contract's verdict on its next fill. */
export function useDcaOrders() {
  const { address } = useAccount();
  const publicClient = usePublicClient() as unknown as PublicClient | undefined;
  return useQuery({
    queryKey: ["dcaOrders", address],
    enabled: Boolean(DCA_DEPLOYMENT && address && publicClient),
    refetchInterval: 10_000,
    queryFn: async (): Promise<DcaOrderWithNext[]> => {
      const dep = DCA_DEPLOYMENT!;
      const orders = await getOrdersOf(publicClient!, dep, address!);
      const withNext = await Promise.all(orders.map(async (o) => ({ ...o, next: await previewSlice(publicClient!, dep, o.id) })));
      return withNext.reverse();
    },
  });
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
