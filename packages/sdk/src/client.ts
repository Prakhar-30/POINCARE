import { createPublicClient, http, type Address, type PublicClient, type WalletClient } from "viem";
import { unichainSepolia } from "viem/chains";
import { type DcaOrderInput, buildOrderParams } from "./dca.js";
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
      },

      /** Approve (exact amount, if needed) and create; resolves to the new order id. */
      create: async (input: DcaOrderInput): Promise<bigint> => {
        const w = needWallet();
        const txs = await dca.planCreateOrder(publicClient, deployment, owner(), buildOrderParams(input));
        let receipt;
        for (const tx of txs) receipt = await dca.sendTx(w, publicClient, tx);
        return dca.orderIdFromReceipt(deployment, receipt!);
      },
      execute: (id: bigint) => dca.sendTx(needWallet(), publicClient, dca.buildExecuteSliceTx(deployment, id)),
      cancel: (id: bigint) => dca.sendTx(needWallet(), publicClient, dca.buildCancelTx(deployment, id)),
      closeExpired: (id: bigint) => dca.sendTx(needWallet(), publicClient, dca.buildCloseExpiredTx(deployment, id)),
    },
  };
}

export type PoincareClient = ReturnType<typeof createPoincareClient>;
export type { RegimeEvent };
