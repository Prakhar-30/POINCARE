import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { ACTIVE_CHAIN_ID, LIVE_CHAIN_IDS, setActiveChain } from "@/config/contracts";
import { TopNav, BottomNav, TABS, type Tab } from "./TopNav";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { WalletGate } from "./WalletGate";
import { Dashboard } from "./screens/Dashboard";
import { Trade } from "./screens/Trade";
import { Pool } from "./screens/Pool";
import { Analytics } from "./screens/Analytics";
import { AppFooter } from "./AppFooter";
import { CommandMenu } from "./CommandMenu";
import { AnnouncementMarquee } from "@/components/ui/AnnouncementMarquee";
import { WrongNetworkBanner } from "@/components/ui/WrongNetworkBanner";
import { useFlushPendingRecords, useWalletIdentity } from "@/hooks/useBackend";
import { track } from "@/lib/telemetry";

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

/** One `wallet_connected` event per session: the chain id only, never the address. */
function useConnectedEvent() {
  const { isConnected, chain } = useAccount();
  useEffect(() => {
    if (!isConnected) return;
    try {
      if (sessionStorage.getItem("poincare-connected-tracked")) return;
      sessionStorage.setItem("poincare-connected-tracked", "1");
    } catch { /* storage blocked: still record it once for this page */ }
    track("wallet_connected", { chain_id: chain?.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);
}

/** The open tab lives in the URL (#/app?tab=trade) so refresh, Back/Forward and shared links all
 *  land on the same screen. Anything unrecognised falls back to the dashboard. */
function useTabParam(): [Tab, (t: Tab) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab = TABS.some((t) => t.id === raw) ? (raw as Tab) : "dashboard";
  const setTab = (t: Tab) => {
    if (t === tab) return;
    // instant switch: a cross-fade here read as lag
    setParams(t === "dashboard" ? {} : { tab: t });
    window.scrollTo({ top: 0 });
  };
  return [tab, setTab];
}

export function AppShell() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useTabParam();
  const [menu, setMenu] = useState(false);
  const mobile = useIsMobile();
  useWalletIdentity();
  useFlushPendingRecords();
  useChainSync();
  useConnectedEvent();

  if (!isConnected) return <WalletGate />;

  return (
    <div className="app-shell min-h-screen flex flex-col" style={{ background: "var(--app-bg)", backgroundAttachment: "fixed" }}>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>
        Skip to content
      </a>
      <TopNav tab={tab} setTab={setTab} openMenu={() => setMenu(true)} />
      <CommandMenu setTab={setTab} open={menu} setOpen={setMenu} />
      <WrongNetworkBanner />
      <AnnouncementMarquee />
      <main id="main" tabIndex={-1} className="flex-1 mx-auto w-full" style={{ maxWidth: 1600, outline: "none" }} aria-labelledby="screen-title">
        <h1 id="screen-title" className="sr-only">{TABS.find((t) => t.id === tab)?.label}</h1>
        {tab === "dashboard" && <Dashboard />}
        {tab === "trade" && <Trade />}
        {tab === "pool" && <Pool />}
        {tab === "analytics" && <Analytics />}
      </main>
      <AppFooter />
      {mobile && <BottomNav tab={tab} setTab={setTab} />}
    </div>
  );
}
