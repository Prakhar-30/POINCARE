#!/usr/bin/env node
/**
 * poincare-mcp: the Poincaré MCP server over stdio.
 *
 * Environment (all optional):
 *   POINCARE_RPC_URL       RPC endpoint (default: the public Unichain Sepolia RPC)
 *   POINCARE_DCA_ADDRESS   PoincareDCA address override (default: the SDK's live deployment)
 *   POINCARE_PRIVATE_KEY   YOUR key, for tools called with send=true. Without it, every write
 *                          tool returns unsigned transactions and nothing is ever sent.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { UNICHAIN_SEPOLIA, createPoincareClient, sendTx, withDca } from "@poincaretrade/sdk";
import { createPublicClient, createWalletClient, getAddress, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unichainSepolia } from "viem/chains";
import { createServer, type Signer } from "./server.js";

const rpcUrl = process.env.POINCARE_RPC_URL || UNICHAIN_SEPOLIA.rpcUrl;
const dcaAddress = process.env.POINCARE_DCA_ADDRESS;
const deployment = dcaAddress ? withDca(UNICHAIN_SEPOLIA, getAddress(dcaAddress)) : UNICHAIN_SEPOLIA;

const publicClient = createPublicClient({ chain: unichainSepolia, transport: http(rpcUrl) }) as PublicClient;
const poincare = createPoincareClient({ deployment, publicClient });

let signer: Signer | undefined;
const pk = process.env.POINCARE_PRIVATE_KEY?.trim();
if (pk) {
  const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
  const wallet = createWalletClient({ account, chain: unichainSepolia, transport: http(rpcUrl) });
  signer = { address: account.address, send: (tx) => sendTx(wallet, publicClient, tx) };
}

const server = createServer({ poincare, signer });
await server.connect(new StdioServerTransport());
// stdout carries the protocol; status goes to stderr
console.error(`poincare-mcp ready on ${deployment.name}${signer ? ` (signing as ${signer.address})` : " (read + unsigned txs only)"}`);
