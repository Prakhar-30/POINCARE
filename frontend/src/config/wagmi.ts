import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { unichainSepolia, monadTestnet } from "wagmi/chains";
import { http, type Config } from "wagmi";
import type { Chain } from "viem";
import { ACTIVE_CHAIN_ID, LIVE_CHAIN_IDS } from "./contracts";

// Injected wallets work without a WalletConnect project id; set one in .env to
// enable WalletConnect / mobile wallets (https://cloud.reown.com).
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "POINCARE_DEV_PLACEHOLDER";

// Only chains with a live Poincaré deployment are offered; the active chain leads so
// RainbowKit connects to it by default (see contracts.ts for the reload-on-switch model).
const ALL_CHAINS: Chain[] = [unichainSepolia, monadTestnet];
const live = ALL_CHAINS.filter((c) => LIVE_CHAIN_IDS.includes(c.id));
live.sort((a, b) => (a.id === ACTIVE_CHAIN_ID ? -1 : 0) - (b.id === ACTIVE_CHAIN_ID ? -1 : 0));

export const wagmiConfig: Config = getDefaultConfig({
  appName: "Poincaré",
  projectId,
  chains: live as [Chain, ...Chain[]],
  transports: {
    [unichainSepolia.id]: http("https://sepolia.unichain.org"),
    [monadTestnet.id]: http("https://testnet-rpc.monad.xyz"),
  },
  ssr: false,
});

export const ACTIVE_CHAIN = live[0];
