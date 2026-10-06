import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ACTIVE_CHAIN_ID, LIVE_CHAIN_IDS, setActiveChain } from "@/config/contracts";
import { TopNav } from "./TopNav";
import { Sidebar, type Tab } from "./Sidebar";
import { WalletGate } from "./WalletGate";
import { Dashboard } from "./screens/Dashboard";
import { Trade } from "./screens/Trade";
import { Pool } from "./screens/Pool";
import { Analytics } from "./screens/Analytics";
import { AppFooter } from "./AppFooter";
import { AnnouncementMarquee } from "@/components/ui/AnnouncementMarquee";
import { WrongNetworkBanner } from "@/components/ui/WrongNetworkBanner";
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
  const [tab, setTabState] = useState<Tab>("dashboard");
  useWalletIdentity();
  useChainSync();

  const setTab = (t: Tab) => {
    setTabState(t);
    window.scrollTo({ top: 0 });
  };

  if (!isConnected) return <WalletGate />;

  return (
    <div className="min-h-screen flex" style={{ background: "var(--app-bg)" }}>
      <Sidebar tab={tab} setTab={setTab} />
      <div className="flex-1 min-w-0 flex flex-col">
        <AnnouncementMarquee />
        <TopNav tab={tab} setTab={setTab} />
        <WrongNetworkBanner />
        <main className="flex-1 w-full mx-auto" style={{ maxWidth: 1320 }}>
          {tab === "dashboard" && <Dashboard />}
          {tab === "trade" && <Trade />}
          {tab === "pool" && <Pool />}
          {tab === "analytics" && <Analytics />}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
