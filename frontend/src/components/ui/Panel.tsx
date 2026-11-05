import type { CSSProperties, ReactNode } from "react";

/**
 * The exchange-panel vocabulary shared by Dashboard, Pool and Analytics: one header for every
 * panel, so titles, controls and dividers line up across a grid, and one stat strip, so headline
 * figures read as a row of hairline-split cells rather than a pile of separate cards.
 */

export function PanelHead({ id, title, children, style }: { id: string; title: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3" style={{ minHeight: 54, borderBottom: "1px solid var(--divider)", ...style }}>
      <h2 id={id} className="font-display flex items-center gap-2.5" style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>{title}</h2>
      {children}
    </div>
  );
}

/** Cells split by 1px hairlines: two per row on phones, `cols` across from 1024px up. */
export function StatStrip({ cols, children, label }: { cols: string; children: ReactNode; label?: string }) {
  return (
    <dl className="stat-strip" aria-label={label} style={{ ["--cols" as string]: cols }}>
      {children}
    </dl>
  );
}

export function StatCell({
  label, value, sub, ink, tone, title,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  ink?: string;
  /** "good" tints the cell green: reserved for the value the hook kept for LPs. */
  tone?: "good";
  title?: string;
}) {
  return (
    <div className="min-w-0" data-tone={tone} title={title}>
      <dt style={{ fontSize: 12, fontWeight: 700, color: tone ? "var(--green-label)" : "var(--muted)" }}>{label}</dt>
      <dd>
        <div className="font-display truncate" style={{ fontSize: "clamp(17px, 4.6vw, 21px)", fontWeight: 800, color: ink ?? "var(--text)", lineHeight: 1.3 }}>{value}</div>
        {sub && <div className="truncate" style={{ fontSize: 12, color: tone ? "var(--green-sub)" : "var(--text-3)", marginTop: 2 }}>{sub}</div>}
      </dd>
    </div>
  );
}

/** Small source badge. Live, historical and app-usage figures must never read alike. */
const TAGS = {
  live: { label: "Live", color: "var(--up-ink)", bg: "var(--green-bg)", dot: "var(--up)" },
  backtest: { label: "Backtest", color: "var(--lav-ink)", bg: "var(--lav-soft)", dot: "var(--lav)" },
  usage: { label: "Usage", color: "var(--text-3)", bg: "var(--surface-2)", dot: "var(--faint)" },
  preview: { label: "What-if", color: "var(--honey-ink)", bg: "var(--warn-bg)", dot: "var(--honey)" },
} as const;
export type SourceKind = keyof typeof TAGS;

export function SourceTag({ kind }: { kind: SourceKind }) {
  const t = TAGS[kind];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ fontSize: 12, fontWeight: 700, color: t.color, background: t.bg, fontFamily: "var(--font-sans)" }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: t.dot }} />
      {t.label}
    </span>
  );
}

/** Compact segmented control for panel headers. */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { id: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg seg-sm" role="group" aria-label={label} style={{ padding: 2 }}>
      {options.map((o) => (
        <button key={o.id} type="button" className="seg-item" style={{ whiteSpace: "nowrap" }} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
