import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { readConfig } from "@/config/chains";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5_000 } },
});

/**
 * What every page needs: theme, toasts, the query cache and a read-only chain connection. The
 * wallet layer (connectors, RainbowKit) is in `AppProviders`, which loads with /app only.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    // reducedMotion="user": framer-motion drops transform animations when the OS asks for less motion.
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={readConfig} reconnectOnMount={false}>
            {children}
          </WagmiProvider>
        </QueryClientProvider>
      </ToastProvider>
    </ThemeProvider>
    </MotionConfig>
  );
}
