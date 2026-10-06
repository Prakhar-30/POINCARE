import { Link } from "react-router-dom";
import { CHAIN_NAME } from "@/config/contracts";
import { Mark } from "@/components/brand/Logo";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useFaucet } from "@/hooks/useSwap";

export type Tab = "dashboard" | "trade" | "pool" | "analytics";

export const TABS: { id: Tab; label: string; title: string; icon: IconName }[] = [
  { id: "dashboard", label: "Overview", title: "Overview", icon: "dashboard" },
  { id: "trade", label: "Swap", title: "Swap", icon: "swap" },
  { id: "pool", label: "Liquidity", title: "Liquidity", icon: "pool" },
  { id: "analytics", label: "Analytics", title: "Pool report", icon: "analytics" },
];

/** Desktop navigation. Below `lg` the top bar carries the tabs instead. */
export function Sidebar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const faucet = useFaucet();
  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen"
      style={{ width: "var(--sidebar-w)", background: "var(--surface)", borderRight: "1px solid var(--border)", padding: "20px 14px" }}
    >
      <Link to="/" className="flex items-center gap-2.5" style={{ padding: "0 8px 22px", color: "var(--text)" }}>
        <Mark size={28} />
        <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-.01em" }}>Poincaré</span>
      </Link>

      <nav aria-label="App" className="flex flex-col gap-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="side-link" aria-current={t.id === tab ? "page" : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={18} />
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2.5" style={{ padding: "14px 8px 0", borderTop: "1px solid var(--divider)" }}>
        <span className="lbl">Network</span>
        <span className="num flex items-center gap-2" style={{ fontSize: 12, color: "var(--text-2)" }}>
          <span className="anim-pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--up)" }} />
          {CHAIN_NAME}
        </span>
        <button
          type="button"
          onClick={() => faucet.mint()}
          disabled={faucet.minting}
          className="text-left"
          style={{ fontSize: 12.5, fontWeight: 500, color: "var(--lav-deep)", cursor: faucet.minting ? "default" : "pointer" }}
        >
          {faucet.minting ? "Sending test tokens…" : "Get test tokens →"}
        </button>
      </div>
    </aside>
  );
}
