import { createPublicClient, http, type Address, type PublicClient, type TransactionReceipt, type WalletClient } from "viem";
import { unichainSepolia } from "viem/chains";
import { type DcaEditInput, type DcaOrderInput, buildEditParams, buildOrderParams } from "./dca.js";
import * as dca from "./dcaClient.js";
import { type PoincareDeployment, UNICHAIN_SEPOLIA } from "./deployments.js";
import { quoteExactInput } from "./quote.js";
import { type Regime, type RegimeEvent, type Side, readRegime, regimeHistory, watchRegime } from "./regime.js";
import { toAmount } from "./units.js";

export type PoincareClientOptions = {
  deployment?: PoincareDeployment;
  /** Overrides the deployment's public RPC. */
  rpcUrl?: string;
  /** Bring your own viem public client instead. */
  publicClient?: PublicClient;
  /** Needed only for the write helpers (create / cancel / execute / refund). */
  walletClient?: WalletClient;
};

/**
 * One object with everything: regime reads and watching, quotes, and DCA orders. Reads need no
 * wallet. Writes go through `walletClient` when one is given; every write also exists as an
 * unsigned `build*` transaction for wallets and agents that sign elsewhere.
 */
export function createPoincareClient(opts: PoincareClientOptions = {}) {
  const deployment = opts.deployment ?? UNICHAIN_SEPOLIA;
  const publicClient =
    opts.publicClient ??
    (createPublicClient({ chain: unichainSepolia, transport: http(opts.rpcUrl ?? deployment.rpcUrl) }) as PublicClient);
  const wallet = opts.walletClient;

  const needWallet = (): WalletClient => {
    if (!wallet) throw new Error("this call sends a transaction: pass walletClient to createPoincareClient");
    return wallet;
  };
  // Block of this client's latest mined transaction: reads that decide the next transaction are
  // pinned to it, so a lagging RPC replica cannot answer from before it (see allowanceFor).
  let lastBlock: bigint | undefined;
  const send = async (tx: dca.TxRequest): Promise<TransactionReceipt> => {
    const r = await dca.sendTx(needWallet(), publicClient, tx);
    if (lastBlock === undefined || r.blockNumber > lastBlock) lastBlock = r.blockNumber;
    return r;
  };
  const owner = (): Address => {
    const a = needWallet().account?.address;
    if (!a) throw new Error("the wallet client has no account");
    return a;
  };

  return {
    deployment,
    publicClient,

    /** The regime the next swap of this block would see. */
    regime: (): Promise<Regime> => readRegime(publicClient, deployment),
    /** Report regime changes (trend started/ended/flipped, evidence building, spread engaged/released). */
    watchRegime: (h: Parameters<typeof watchRegime>[2]): (() => void) => watchRegime(publicClient, deployment, h),
    /** The hook's DetectorSample trace for a block range. */
    history: (fromBlock: bigint, toBlock?: bigint) => regimeHistory(publicClient, deployment, { fromBlock, toBlock }),
    /** Exact-input quote; `amount` in input-token units (USDC to buy, WETH to sell). */
    quote: (side: Side, amount: string | number | bigint) => quoteExactInput(publicClient, deployment, side, toAmount(amount)),

    dca: {
      order: (id: bigint) => dca.getOrder(publicClient, deployment, id),
      ordersOf: (address: Address) => dca.getOrdersOf(publicClient, deployment, address),
      openOrderIds: () => dca.getOpenOrderIds(publicClient, deployment),
      preview: (id: bigint) => dca.previewSlice(publicClient, deployment, id),
      params: (input: DcaOrderInput) => buildOrderParams(input),

      /** Unsigned transactions, for any signer. */
      build: {
        create: (from: Address, input: DcaOrderInput) => dca.planCreateOrder(publicClient, deployment, from, buildOrderParams(input)),
        execute: (id: bigint) => dca.buildExecuteSliceTx(deployment, id),
        cancel: (id: bigint) => dca.buildCancelTx(deployment, id),
        closeExpired: (id: bigint) => dca.buildCloseExpiredTx(deployment, id),
        pause: (id: bigint) => dca.buildPauseTx(deployment, id),
        resume: (id: bigint) => dca.buildResumeTx(deployment, id),
        /** Reads the order, validates the edit like the contract, builds editOrder. */
        edit: async (id: bigint, input: DcaEditInput) => {
          const o = await dca.getOrder(publicClient, deployment, id);
          if (!o) throw new Error(`no DCA order #${id}`);
          return dca.buildEditTx(deployment, id, buildEditParams(o, input));
        },
      },

      /** Approve (exact amount, if needed) and create; resolves to the new order id. */
      create: async (input: DcaOrderInput): Promise<bigint> => {
        const txs = await dca.planCreateOrder(publicClient, deployment, owner(), buildOrderParams(input), { atBlock: lastBlock });
        let receipt;
        for (const tx of txs) receipt = await send(tx);
        return dca.orderIdFromReceipt(deployment, receipt!);
      },
      execute: (id: bigint) => send(dca.buildExecuteSliceTx(deployment, id)),
      cancel: (id: bigint) => send(dca.buildCancelTx(deployment, id)),
      closeExpired: (id: bigint) => send(dca.buildCloseExpiredTx(deployment, id)),
      pause: (id: bigint) => send(dca.buildPauseTx(deployment, id)),
      resume: (id: bigint) => send(dca.buildResumeTx(deployment, id)),
      edit: async (id: bigint, input: DcaEditInput) => {
        const o = await dca.getOrder(publicClient, deployment, id);
        if (!o) throw new Error(`no DCA order #${id}`);
        return send(dca.buildEditTx(deployment, id, buildEditParams(o, input)));
      },
    },
  };
}

export type PoincareClient = ReturnType<typeof createPoincareClient>;
export type { RegimeEvent };
