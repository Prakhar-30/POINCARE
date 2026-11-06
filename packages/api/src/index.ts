import { UNICHAIN_SEPOLIA, createPoincareClient, withDca } from "@poincare/sdk";
import { createPublicClient, createWalletClient, getAddress, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unichainSepolia } from "viem/chains";
import { createApiHandler } from "./handler.js";
import { runKeeper } from "./keeper.js";
import { indexDca } from "./indexer.js";

export { createApiHandler } from "./handler.js";
export { runKeeper, type KeeperRun } from "./keeper.js";
export { indexDca, orderRow, statusOfRow, type DcaFillRow, type DcaOrderRow, type IndexRun } from "./indexer.js";
export { json, jsonSafe, CORS_HEADERS, HttpError } from "./json.js";

function deploymentFor(dcaAddress?: string) {
  // the shipped deployment keeps its DCA deploy block (the indexer's starting point)
  if (!dcaAddress || getAddress(dcaAddress) === UNICHAIN_SEPOLIA.dca) return UNICHAIN_SEPOLIA;
  return withDca(UNICHAIN_SEPOLIA, getAddress(dcaAddress));
}

/** The API request handler, wired to the live deployment. Used by the `poincare-api` edge function. */
export function makeApi(env: { rpcUrl?: string; dcaAddress?: string; basePath?: string }) {
  const deployment = deploymentFor(env.dcaAddress);
  const publicClient = createPublicClient({ chain: unichainSepolia, transport: http(env.rpcUrl || deployment.rpcUrl) }) as PublicClient;
  return createApiHandler({ poincare: createPoincareClient({ deployment, publicClient }), basePath: env.basePath });
}

/** One keeper pass with the keeper's key. Used by the `dca-keeper` edge function. */
export function makeKeeper(env: { rpcUrl?: string; dcaAddress: string; privateKey: string; maxTx?: number }) {
  const deployment = deploymentFor(env.dcaAddress);
  const rpc = env.rpcUrl || deployment.rpcUrl;
  const pk = env.privateKey.trim();
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  const publicClient = createPublicClient({ chain: unichainSepolia, transport: http(rpc) }) as PublicClient;
  const walletClient = createWalletClient({ account, chain: unichainSepolia, transport: http(rpc) });
  return () => runKeeper({ publicClient, walletClient, deployment, maxTx: env.maxTx });
}

/** The DCA indexer for the dca-keeper edge function: events from a cursor, in 1,000-block pages. */
export function makeIndexer(env: { rpcUrl?: string; dcaAddress?: string; maxChunks?: number }) {
  const deployment = deploymentFor(env.dcaAddress);
  const publicClient = createPublicClient({ chain: unichainSepolia, transport: http(env.rpcUrl || deployment.rpcUrl) }) as PublicClient;
  return {
    deployment,
    /** Where a fresh index starts: the DCA deploy block of the shipped deployment, if it is this one. */
    startBlock: deployment.dcaDeployBlock ?? 0n,
    run: (fromBlock: bigint) => indexDca({ publicClient, deployment, fromBlock, maxChunks: env.maxChunks }),
  };
}
