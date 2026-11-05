import { Link } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { CHAIN_NAME } from "@/config/contracts";
import { Mark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { MOD } from "./CommandMenu";

export type Tab = "dashboard" | "trade" | "pool" | "analytics";

export const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "trade", label: "Trade", icon: "swap" },
  { id: "pool", label: "Pool", icon: "pool" },
  { id: "analytics", label: "Analytics", icon: "analytics" },
];

export function TopNav({ tab, setTab, openMenu }: { tab: Tab; setTab: (t: Tab) => void; openMenu: () => void }) {
  const mobile = useIsMobile();
  return (
    <header
      className="sticky top-0 z-50 flex items-center gap-2 sm:gap-6 px-3 sm:px-6"
      style={{
        height: 64,
        borderBottom: "1px solid var(--nav-border)",
        background: "var(--nav-bg)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Link to="/" className="shrink-0 rounded-xl" aria-label="Poincaré home">
        <div className="flex items-center gap-3">
          <Mark size={34} decorative />
          <span className="font-display text-text hidden sm:block" style={{ fontWeight: 700, fontSize: 19, letterSpacing: ".5px" }}>
            Poincaré
          </span>
        </div>
      </Link>

      <nav aria-label="App sections" className="shrink-0">
        <ul className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--nav-pill)" }}>
          {TABS.map((t, i) => {
            const active = t.id === tab;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={active ? "page" : undefined}
                  aria-label={t.label}
                  aria-keyshortcuts={String(i + 1)}
                  title={`${t.label} (${i + 1})`}
                  className="nav-tab relative flex items-center gap-2 rounded-xl px-3 sm:px-3.5 text-[13px] font-bold"
                  style={{ minHeight: 40, color: active ? "var(--lav-ink)" : "var(--text-3)" }}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-xl"
                      style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon name={t.icon} size={16} aria-hidden="true" />
                    <span className="hidden md:block">{t.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
        <div
          className="hidden lg:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ color: "var(--text-3)", background: "var(--surface)", border: "1px solid var(--nav-border)" }}
        >
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--lav)" }} />
          {CHAIN_NAME}
        </div>
        {/* the command menu's trigger doubles as its shortcut hint */}
        <button type="button" onClick={openMenu} aria-label="Open command menu" aria-keyshortcuts="Control+K Meta+K"
          className="btn btn-secondary btn-sm hidden lg:inline-flex" style={{ gap: 6, color: "var(--text-3)", boxShadow: "none" }}>
          <Icon name="target" size={14} aria-hidden="true" />
          Commands <kbd className="kbd">{MOD} K</kbd>
        </button>
        <ThemeToggle />
        <ConnectButton label={mobile ? "Connect" : "Connect wallet"} showBalance={false} accountStatus="avatar" chainStatus="icon" />
      </div>
    </header>
  );
}
