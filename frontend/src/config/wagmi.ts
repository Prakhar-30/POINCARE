import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { unichainSepolia } from "wagmi/chains";
import { http } from "wagmi";

// Injected wallets work without a WalletConnect project id; set one in .env to
// enable WalletConnect / mobile wallets (https://cloud.reown.com).
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "POINCARE_DEV_PLACEHOLDER";

export const wagmiConfig = getDefaultConfig({
  appName: "Poincaré",
  projectId,
  chains: [unichainSepolia],
  transports: {
    [unichainSepolia.id]: http("https://sepolia.unichain.org"),
  },
  ssr: false,
});

export const ACTIVE_CHAIN = unichainSepolia;
