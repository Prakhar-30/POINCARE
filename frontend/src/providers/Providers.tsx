import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, lightTheme, darkTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "@/config/wagmi";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5_000 } },
});

// RainbowKit owns the wallet list and connect flow; we only skin it to the app's tokens.
const rkBase = {
  accentColorForeground: "#ffffff",
  borderRadius: "medium",
  fontStack: "system",
  overlayBlur: "small",
} as const;
const rkFonts = { body: '"Geist", ui-sans-serif, system-ui, sans-serif' };
const rkLight = { ...lightTheme({ ...rkBase, accentColor: "#5b54b8" }), fonts: rkFonts };
const rkDark = { ...darkTheme({ ...rkBase, accentColor: "#6f68c8" }), fonts: rkFonts };

function RainbowKitThemed({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <RainbowKitProvider
      theme={theme === "dark" ? rkDark : rkLight}
      modalSize="wide"
      appInfo={{ appName: "Poincaré", learnMoreUrl: "https://github.com/Prakhar-30/POINCARE" }}
    >
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitThemed>{children}</RainbowKitThemed>
          </QueryClientProvider>
        </WagmiProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
