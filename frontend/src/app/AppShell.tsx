import { useState } from "react";
import { useAccount } from "wagmi";
import { TopNav, type Tab } from "./TopNav";
import { WalletGate } from "./WalletGate";
import { Dashboard } from "./screens/Dashboard";
import { Trade } from "./screens/Trade";
import { ComingTogether } from "./screens/Placeholder";
import { useWalletIdentity } from "@/hooks/useBackend";

export function AppShell() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("dashboard");
  useWalletIdentity();

  if (!isConnected) return <WalletGate />;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", backgroundAttachment: "fixed" }}>
      <TopNav tab={tab} setTab={setTab} />
      {tab === "dashboard" && <Dashboard />}
      {tab === "trade" && <Trade />}
      {tab === "pool" && <ComingTogether title="Pool" blurb="Add / remove liquidity, your position and the live bonding curve land here next." />}
      {tab === "analytics" && <ComingTogether title="Analytics" blurb="The Brain deep-dive, detector config and the manipulation-cost story land here next." />}
    </div>
  );
}
