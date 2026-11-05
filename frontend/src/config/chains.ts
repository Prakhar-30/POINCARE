import { unichainSepolia } from "wagmi/chains";
import { createConfig, http, type Config } from "wagmi";
import type { Chain } from "viem";
import { ACTIVE_CHAIN_ID, LIVE_CHAIN_IDS } from "./contracts";

// Only chains with a live Poincaré deployment are offered; the active chain leads so
// RainbowKit connects to it by default (see contracts.ts for the reload-on-switch model).
const ALL_CHAINS: Chain[] = [unichainSepolia];
export const LIVE_CHAINS = ALL_CHAINS.filter((c) => LIVE_CHAIN_IDS.includes(c.id));
LIVE_CHAINS.sort((a, b) => (a.id === ACTIVE_CHAIN_ID ? -1 : 0) - (b.id === ACTIVE_CHAIN_ID ? -1 : 0));

export const TRANSPORTS = {
  [unichainSepolia.id]: http("https://sepolia.unichain.org"),
};

/**
 * Read-only config for the public pages: the same chains and RPC as the wallet config, but no
 * connectors, so the landing page never downloads wallet SDKs. `storage: null` keeps it from
 * touching wagmi's persisted connection state, which belongs to the wallet config and is what
 * lets a returning user land in /app already connected.
 */
export const readConfig: Config = createConfig({
  chains: LIVE_CHAINS as [Chain, ...Chain[]],
  transports: TRANSPORTS,
  connectors: [],
  storage: null,
  ssr: false,
});
