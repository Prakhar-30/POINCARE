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

/**
 * Top bar. What it carries depends on the room it has, so nothing is ever pushed off-screen:
 *   phones (<640)      logo · theme · wallet; the tabs move to the bottom bar (BottomNav)
 *   tablets (640-1023) icon tabs
 *   1024+              labelled tabs
 *   1280+              command-menu trigger and chain chip
 * The wallet button is never allowed to shrink or wrap: it is the one control every screen needs.
 */
export function TopNav({ tab, setTab, openMenu }: { tab: Tab; setTab: (t: Tab) => void; openMenu: () => void }) {
  const mobile = useIsMobile();
  return (
    <header
      className="sticky top-0 z-50 flex items-center gap-2 sm:gap-4 lg:gap-6 px-3 sm:px-6"
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
          <span className="font-display text-text hidden lg:block" style={{ fontWeight: 700, fontSize: 19, letterSpacing: ".5px" }}>
            Poincaré
          </span>
        </div>
      </Link>

      {!mobile && (
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
                    className="nav-tab relative flex items-center gap-2 rounded-xl px-3 lg:px-3.5 text-[13px] font-bold"
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
                      <span className="hidden lg:block">{t.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
        <div
          className="hidden xl:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
          style={{ color: "var(--text-3)", background: "var(--surface)", border: "1px solid var(--nav-border)" }}
        >
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--lav)" }} />
          {CHAIN_NAME}
        </div>
        {/* Wrapped: .btn sets its own display, which would override a `hidden` utility on the button itself. */}
        <div className="hidden xl:block">
          {/* the command menu's trigger doubles as its shortcut hint */}
          <button type="button" onClick={openMenu} aria-label="Open command menu" aria-keyshortcuts="Control+K Meta+K"
            className="btn btn-secondary btn-sm" style={{ gap: 6, color: "var(--text-3)", boxShadow: "none" }}>
            <Icon name="target" size={14} aria-hidden="true" />
            Commands <kbd className="kbd">{MOD} K</kbd>
          </button>
        </div>
        <ThemeToggle />
        <div className="shrink-0 whitespace-nowrap">
          <ConnectButton label={mobile ? "Connect" : "Connect wallet"} showBalance={false} accountStatus="avatar" chainStatus={mobile ? "none" : "icon"} />
        </div>
      </div>
    </header>
  );
}

/** Phones: the four sections as a thumb-reach tab bar, fixed above the home indicator. */
export function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav aria-label="App sections" className="bottom-nav">
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? "page" : undefined}
                className="bottom-nav-item"
              >
                <span className="bottom-nav-icon">
                  {active && (
                    <motion.span
                      layoutId="bottom-nav-pill"
                      className="absolute inset-0 rounded-full"
                      style={{ background: "var(--lav-soft)" }}
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Icon name={t.icon} size={20} aria-hidden="true" className="relative" />
                </span>
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
