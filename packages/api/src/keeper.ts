import {
  type DcaStatus,
  type PoincareDeployment,
  buildCloseExpiredTx,
  buildExecuteSliceTx,
  dcaAbi,
  getOpenOrderIds,
  previewSlice,
  requireDca,
  sendTx,
} from "@poincare/sdk";
import type { Hash, PublicClient, WalletClient } from "viem";

export type KeeperRun = {
  keeper: string;
  checked: number;
  executed: { id: bigint; hash: Hash; amountIn: bigint; spreadBps: number }[];
  refunded: { id: bigint; hash: Hash }[];
  held: Partial<Record<DcaStatus, number>>;
  errors: { id: bigint; error: string }[];
  /** Orders left for the next run because this one hit its cap. */
  deferred: number;
};

/**
 * One keeper pass over the open DCA orders. For each order it asks the CONTRACT whether the next
 * slice may fill (canExecute: schedule, spread cap, trend pause, limit price) and sends
 * executeSlice only when the answer is "ready"; expired orders get their budget refunded to their
 * owner. The keeper cannot do anything else: the contract enforces every rule again on chain.
 */
export async function runKeeper(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  deployment: PoincareDeployment;
  /** Cap on transactions per pass (keeps one cron tick short). */
  maxTx?: number;
}): Promise<KeeperRun> {
  const { publicClient, walletClient, deployment } = opts;
  const maxTx = opts.maxTx ?? 20;
  const account = walletClient.account;
  if (!account) throw new Error("keeper wallet has no account");
  const allowed = await publicClient.readContract({ address: requireDca(deployment), abi: dcaAbi, functionName: "isKeeper", args: [account.address] });
  if (!allowed) throw new Error(`${account.address} is not an allowlisted keeper on ${requireDca(deployment)}`);

  const run: KeeperRun = { keeper: account.address, checked: 0, executed: [], refunded: [], held: {}, errors: [], deferred: 0 };
  const ids = await getOpenOrderIds(publicClient, deployment);
  let sent = 0;
  for (const id of ids) {
    run.checked++;
    try {
      const p = await previewSlice(publicClient, deployment, id);
      if (p.status === "ready" || p.status === "expired") {
        if (sent >= maxTx) {
          run.deferred++;
          continue;
        }
        sent++;
        if (p.status === "ready") {
          const r = await sendTx(walletClient, publicClient, buildExecuteSliceTx(deployment, id));
          run.executed.push({ id, hash: r.transactionHash, amountIn: p.amountIn, spreadBps: p.spreadBps });
        } else {
          const r = await sendTx(walletClient, publicClient, buildCloseExpiredTx(deployment, id));
          run.refunded.push({ id, hash: r.transactionHash });
        }
      } else {
        run.held[p.status] = (run.held[p.status] ?? 0) + 1;
      }
    } catch (e) {
      run.errors.push({ id, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
    }
  }
  return run;
}
