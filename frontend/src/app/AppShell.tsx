import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ACTIVE_CHAIN_ID, LIVE_CHAIN_IDS, setActiveChain } from "@/config/contracts";
import { TopNav, type Tab } from "./TopNav";
import { WalletGate } from "./WalletGate";
import { Dashboard } from "./screens/Dashboard";
import { Trade } from "./screens/Trade";
import { Pool } from "./screens/Pool";
import { Analytics } from "./screens/Analytics";
import { AppFooter } from "./AppFooter";
import { AnnouncementMarquee } from "@/components/ui/AnnouncementMarquee";
import { useWalletIdentity } from "@/hooks/useBackend";

/** The config layer binds to one chain per page load; when the wallet lands on another
 *  live chain, persist that choice and reload so every module-level capture follows. */
function useChainSync() {
  const { chain } = useAccount();
  useEffect(() => {
    if (chain && chain.id !== ACTIVE_CHAIN_ID && LIVE_CHAIN_IDS.includes(chain.id)) {
      setActiveChain(chain.id);
    }
  }, [chain?.id]);
}

export function AppShell() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("dashboard");
  useWalletIdentity();
  useChainSync();

  if (!isConnected) return <WalletGate />;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--app-bg)", backgroundAttachment: "fixed" }}>
      <TopNav tab={tab} setTab={setTab} />
      <AnnouncementMarquee />
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
