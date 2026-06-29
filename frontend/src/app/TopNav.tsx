import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { Mark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon, type IconName } from "@/components/ui/Icon";

export type Tab = "dashboard" | "trade" | "pool" | "analytics";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "trade", label: "Trade", icon: "swap" },
  { id: "pool", label: "Pool", icon: "pool" },
  { id: "analytics", label: "Analytics", icon: "analytics" },
];

export function TopNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div
      className="sticky top-0 z-50 flex items-center gap-2.5 sm:gap-6 px-3 sm:px-6"
      style={{
        height: 64,
        borderBottom: "1px solid var(--nav-border)",
        background: "var(--nav-bg)",
        backdropFilter: "blur(12px)",
      }}
    >
      <a href="/" className="shrink-0">
        <div className="flex items-center gap-3">
          <Mark size={34} />
          <span className="font-display text-text hidden sm:block" style={{ fontWeight: 700, fontSize: 19, letterSpacing: ".5px" }}>
            Poincaré
          </span>
        </div>
      </a>

      <div className="flex gap-1 rounded-2xl p-1 shrink-0" style={{ background: "var(--nav-pill)" }}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-[13px] font-bold"
              style={{ color: active ? "var(--lav-deep)" : "var(--text-3)", transition: "color .2s ease" }}
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
                <Icon name={t.icon} size={15} />
                <span className="hidden md:block">{t.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
        <div
          className="hidden lg:flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ color: "var(--text-3)", background: "var(--surface)", border: "1px solid var(--nav-border)" }}
        >
          <span className="anim-pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--lav)" }} />
          Unichain Sepolia
        </div>
        <ThemeToggle />
        <ConnectButton showBalance={false} accountStatus="avatar" chainStatus="none" />
      </div>
    </div>
  );
}
