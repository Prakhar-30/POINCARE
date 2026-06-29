import { useState } from "react";
import { useAccount } from "wagmi";
import { TopNav, type Tab } from "./TopNav";
import { WalletGate } from "./WalletGate";
import { Dashboard } from "./screens/Dashboard";
import { Trade } from "./screens/Trade";
import { Pool } from "./screens/Pool";
import { Analytics } from "./screens/Analytics";
import { AppFooter } from "./AppFooter";
import { useWalletIdentity } from "@/hooks/useBackend";

export function AppShell() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("dashboard");
  useWalletIdentity();

  if (!isConnected) return <WalletGate />;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--app-bg)", backgroundAttachment: "fixed" }}>
      <TopNav tab={tab} setTab={setTab} />
      <div className="flex-1">
        {tab === "dashboard" && <Dashboard />}
        {tab === "trade" && <Trade />}
        {tab === "pool" && <Pool />}
        {tab === "analytics" && <Analytics />}
      </div>
      <AppFooter />
    </div>
  );
}
