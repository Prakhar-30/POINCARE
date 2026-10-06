import type { TrendLabel } from "@/config/contracts";

export type Regime = { label: string; short: string; color: string; bg: string };

/** One mapping from the hook's trend label to how the UI names and colours it. */
export function regimeOf(trend: TrendLabel | string): Regime {
  if (trend === "up") return { label: "Up-trend", short: "Up-trend", color: "var(--up-deep)", bg: "var(--change-up-bg)" };
  if (trend === "down") return { label: "Down-trend", short: "Down-trend", color: "var(--down-deep)", bg: "var(--change-down-bg)" };
  return { label: "Calm", short: "Calm", color: "var(--lav-deep)", bg: "var(--lav-soft)" };
}

/** Compact status pill for the detector regime, used in the top bar and panel headers. */
export function RegimePill({ trend, loading }: { trend: TrendLabel | string; loading?: boolean }) {
  const r = regimeOf(trend);
  return (
    <span className="pill" style={{ color: r.color, background: r.bg }} title="Detector regime">
      <span className="anim-pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor" }} />
      {loading ? "Reading…" : r.short}
    </span>
  );
}
