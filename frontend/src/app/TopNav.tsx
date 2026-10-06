import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import { Mark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon } from "@/components/ui/Icon";
import { RegimePill } from "@/components/ui/Regime";
import { usePoolState } from "@/hooks/usePoolState";
import { fmtUsd } from "@/lib/format";
import { TABS, type Tab } from "./Sidebar";

export type { Tab } from "./Sidebar";

/** Top bar: page title + live pool context on the left, theme and wallet on the right.
 *  Below `lg` it also carries the logo and a scrollable tab row (the sidebar is hidden). */
export function TopNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const s = usePoolState();
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <header className="sticky top-0 z-40" style={{ background: "var(--nav-bg)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-7" style={{ minHeight: 60 }}>
        <Link to="/" className="lg:hidden shrink-0" aria-label="Poincaré home">
          <Mark size={28} />
        </Link>
        <h1 className="m-0 truncate" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-.01em", color: "var(--text)" }}>
          {current.title}
        </h1>
        <span className="num hidden md:inline truncate" style={{ fontSize: 12, color: "var(--muted)" }}>
          WETH / USDC{s.price > 0 ? ` · ${fmtUsd(s.price)}` : ""}
        </span>

        <div className="ml-auto flex items-center gap-2 sm:gap-2.5 min-w-0">
          <span className="hidden sm:inline-flex">
            <RegimePill trend={s.trend} loading={s.loading} />
          </span>
          <ThemeToggle />
          <ConnectButton showBalance={false} accountStatus={{ smallScreen: "avatar", largeScreen: "address" }} chainStatus="icon" />
        </div>
      </div>

      {/* tab row for phones and tablets */}
      <nav aria-label="App" className="lg:hidden flex gap-1 overflow-x-auto no-scrollbar px-3 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="side-link shrink-0"
            style={{ width: "auto", height: 36 }}
            aria-current={t.id === tab ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
