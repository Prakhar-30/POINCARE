import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, lightTheme, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/config/wagmi";
import { useTheme } from "./ThemeProvider";
import { RainbowAvatar } from "@/components/ui/WalletAvatar";

// The wallet button in the top bar is the app's nav action, so it takes the same ink as the landing
// page's nav "Launch app": near-black in light mode, near-white in dark. Every other action keeps
// the theme lavender (the wallet gate renders its own .btn-primary).
const rkInk = {
  light: { accentColor: "#17151f", accentColorForeground: "#ffffff" },
  dark: { accentColor: "#f6f3fb", accentColorForeground: "#15131c" },
} as const;

const rkBase = {
  borderRadius: "large",
  fontStack: "system",
  overlayBlur: "small",
} as const;

/**
 * The wallet layer, loaded with /app only: the full wagmi config (connectors) and RainbowKit.
 * It nests inside the read-only provider from `Providers`, so the app's hooks see the wallet
 * config while sharing the same query cache. On mount wagmi reconnects the last wallet from
 * storage, so a returning user stays connected.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider
        theme={theme === "dark" ? darkTheme({ ...rkBase, ...rkInk.dark }) : lightTheme({ ...rkBase, ...rkInk.light })}
        modalSize="compact"
        avatar={RainbowAvatar}
      >
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
