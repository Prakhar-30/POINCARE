import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import type { Config } from "wagmi";
import type { Chain } from "viem";
import { LIVE_CHAINS, TRANSPORTS } from "./chains";

// The full wallet config (RainbowKit's connectors: MetaMask SDK, WalletConnect, Coinbase, ...).
// Only the app's lazily loaded provider imports it, so none of the connector code ships with
// the landing page, which reads the chain through `readConfig` (chains.ts) instead.

// Injected wallets work without a WalletConnect project id; set one in .env to
// enable WalletConnect / mobile wallets (https://cloud.reown.com).
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "POINCARE_DEV_PLACEHOLDER";

export const wagmiConfig: Config = getDefaultConfig({
  appName: "Poincaré",
  projectId,
  chains: LIVE_CHAINS as [Chain, ...Chain[]],
  transports: TRANSPORTS,
  ssr: false,
});
