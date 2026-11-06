import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { RegimeSplit, FlowSplit, RiskState, Slice, DayBucket, Bucket } from "@/lib/analytics";
import type { SwapRow } from "@/lib/db";
import { useWidth } from "@/hooks/useWidth";
import { fmtUsd, fmtPct } from "@/lib/format";

/**
 * The Analytics page's own charts. Hand-rolled SVG rather than a charting dependency: these are
 * a handful of small, fixed shapes, and a library would cost more bundle than it saves in code.
 *
 * Each one renders an empty state rather than a misleading zero when there is no data yet. The
 * testnet pool can genuinely have no swaps, and a savings curve flat at $0 reads as "the hook
 * saved nothing" rather than "nothing has happened".
 */

function Empty({ label, height }: { label: string; height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-md"
      style={{
        height,
        background: "var(--surface-2)",
        border: "1px dashed var(--border)",
        fontSize: 12,
        color: "var(--muted)",
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

/** How the sampled blocks divided between calm, up-trend and down-trend. */
export function RegimeBar({ split }: { split: RegimeSplit }) {
  if (!split.total) return <Empty label="Waiting for detector samples" height={86} />;
  const seg = [
    { k: "calm", n: split.calm, c: "var(--lav)", label: "Calm" },
    { k: "up", n: split.up, c: "var(--up)", label: "Up-trend" },
    { k: "down", n: split.down, c: "var(--down)", label: "Down-trend" },
  ].filter((s) => s.n > 0);

  return (
    <div>
      <div className="flex rounded-md overflow-hidden" style={{ height: 30 }}>
        {seg.map((s) => (
          <div
            key={s.k}
            title={`${s.label}: ${s.n} blocks`}
            style={{ width: `${(s.n / split.total) * 100}%`, background: s.c, opacity: 0.85 }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
        {seg.map((s) => (
          <span key={s.k} className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.c, display: "inline-block" }} />
            {s.label}
            <b style={{ color: "var(--text-2)" }}>{Math.round((s.n / split.total) * 100)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Who actually paid: with-trend flow versus everyone else. */
export function FlowSplitChart({ flow }: { flow: FlowSplit }) {
  const total = flow.withTrend + flow.free;
  if (total <= 0) return <Empty label="No swaps recorded yet" height={104} />;
  const pct = (flow.withTrend / total) * 100;

  return (
    <div className="flex flex-col gap-3">
      <Row
        label="Paid the spread"
        sub={`${flow.withTrendSwaps} swap${flow.withTrendSwaps === 1 ? "" : "s"} · pushed with a detected trend`}
        value={fmtUsd(flow.withTrend, { dp: 0 })}
        frac={pct / 100}
        color="var(--honey)"
        ink="var(--honey-ink)"
      />
      <Row
        label="Paid nothing extra"
        sub={`${flow.freeSwaps} swap${flow.freeSwaps === 1 ? "" : "s"} · counter-trend or calm market`}
        value={fmtUsd(flow.free, { dp: 0 })}
        frac={1 - pct / 100}
        color="var(--up)"
        ink="var(--up-ink)"
      />
      <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.55, margin: 0 }}>
        {pct < 50
          ? `Most volume — ${(100 - pct).toFixed(0)}% — was never charged a spread. That is the design working: the haircut is aimed, not broadcast.`
          : `${pct.toFixed(0)}% of volume pushed into a detected trend and paid the spread. A symmetric fee would have charged the other ${(100 - pct).toFixed(0)}% too.`}
      </p>
    </div>
  );
}

function Row({ label, sub, value, frac, color, ink }: { label: string; sub: string; value: string; frac: number; color: string; ink: string }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1" style={{ fontSize: 12 }}>
        <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{label}</span>
        <span className="font-display" style={{ color: ink, fontWeight: 650 }}>{value}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--track)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(2, frac * 100)}%`, background: color, borderRadius: 4 }} />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

/** The live risk read: how close the detector is to firing, and whether the gate is holding it. */
export function RiskMeter({ risk, dPct, dFloorPct }: { risk: RiskState; dPct: number; dFloorPct: number }) {
  const tone =
    risk.level === "engaged" ? "var(--honey-deep)" : risk.level === "watching" ? "var(--lav-deep)" : "var(--up-deep)";
  const toneInk =
    risk.level === "engaged" ? "var(--honey-ink)" : risk.level === "watching" ? "var(--lav-ink)" : "var(--up-ink)";
  const bg =
    risk.level === "engaged" ? "rgba(217,140,0,.13)" : risk.level === "watching" ? "var(--lav-soft)" : "var(--green-bg)";

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span
          className="rounded-full px-3 py-1.5"
          style={{ fontSize: 12, fontWeight: 650, color: toneInk, background: bg }}
        >
          {risk.label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>
          evidence {Math.round(risk.progress * 100)}% of threshold
        </span>
      </div>

      <div style={{ height: 10, borderRadius: 5, background: "var(--track)", overflow: "hidden", position: "relative" }}>
        <div style={{ height: "100%", width: `${Math.max(2, risk.progress * 100)}%`, background: tone, borderRadius: 5 }} />
      </div>

      <div className="flex justify-between mt-1.5" style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
        <span>no evidence</span>
        <span>threshold h · fires here</span>
      </div>

      <div className="mt-3.5 rounded-md p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <div className="flex justify-between mb-1.5" style={{ fontSize: 12 }}>
          <span style={{ color: "var(--text-3)", fontWeight: 600 }}>directional efficiency D</span>
          <span style={{ fontWeight: 650, color: risk.gated ? "var(--down-ink)" : "var(--up-ink)" }}>
            {fmtPct(dPct)} {risk.gated ? "· below floor" : "· above floor"}
          </span>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: "var(--track)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, dPct * 100)}%`, background: risk.gated ? "var(--down)" : "var(--up)", borderRadius: 4 }} />
          <div style={{ position: "absolute", left: `${Math.min(100, dFloorPct * 100)}%`, top: -2, bottom: -2, width: 2, background: "var(--text-2)" }} />
        </div>
        <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55, margin: "8px 0 0" }}>{risk.detail}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Historic-tape charts: the merged value timeline, and a stacked split bar.

const dayFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const stampFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const regimeColor = (t: SwapRow) =>
  t.kappa > 0 && t.trend === "up" ? "var(--up)" : t.kappa > 0 && t.trend === "down" ? "var(--down)" : "var(--lav)";

function regimeText(t: SwapRow) {
  if (t.with_trend && t.kappa > 0 && t.trend !== "none") return `pushed with the ${t.trend}-trend, charged ${fmtPct(t.spread_frac)}`;
  if (t.kappa > 0 && t.trend !== "none") return `against the ${t.trend}-trend, no spread`;
  return "calm market, no spread";
}

/**
 * One time axis for three readings that used to be three charts: each swap's size (columns),
 * the value kept for LPs accumulating across the range (line), and whether the pool was leaning
 * when the swap arrived (the strip underneath). Seeing them together is the point: what the LP
 * keeps tracks *when* flow arrived, not how much of it there was.
 *
 * Inspectable by pointer and by keyboard (focus, then ← → Home End), with the reading in a live
 * region below the plot rather than a hover-only tooltip; `asTable` swaps the plot for a per-day
 * table carrying the same figures.
 */
export function ValueTimeline({
  rows,
  days,
  asTable,
  emptyLabel,
  height = 210,
}: {
  /** Swaps in the selected range, oldest first. */
  rows: SwapRow[];
  days: DayBucket[];
  asTable: boolean;
  emptyLabel: string;
  height?: number;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  // Measured, not a fixed viewBox: a fixed aspect letterboxes the plot at a fixed height.
  const [wrapRef, measuredW] = useWidth<HTMLDivElement>();
  const readoutId = useId();
  const gradId = useId();
  const n = rows.length;

  const cum = useMemo(() => {
    let acc = 0;
    return rows.map((t) => (acc += t.lvr_captured_usdc || 0));
  }, [rows]);

  // One always-mounted wrapper, so the width observer attaches whichever view renders first.
  return <div ref={wrapRef}>{body()}</div>;

  function body() {
  if (n < 1) return <Empty label={emptyLabel} height={height} />;

  if (asTable) {
    return (
      // Same footprint as the chart it replaces: the rows scroll, the panel does not grow.
      <div className="overflow-auto rounded-md" tabIndex={0} aria-label="Per-day table, scrollable"
        style={{ border: "1px solid var(--border)", maxHeight: height + 74, overscrollBehavior: "contain" }}>
        <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 13 }}>
          <caption className="sr-only">Volume and value kept for LPs, per day</caption>
          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
            <tr style={{ background: "var(--surface-2)" }}>
              {["Day", "Swaps", "Volume", "Kept for LPs"].map((h, i) => (
                <th key={h} scope="col" style={{ textAlign: i ? "right" : "left", padding: "9px 14px", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day} style={{ borderTop: "1px solid var(--divider)" }}>
                <th scope="row" style={{ textAlign: "left", padding: "9px 14px", fontWeight: 600, color: "var(--text-2)" }}>
                  {dayFmt.format(new Date(`${d.day}T00:00:00`))}
                </th>
                <td style={{ textAlign: "right", padding: "9px 14px", color: "var(--text-3)" }}>{d.swaps}</td>
                <td style={{ textAlign: "right", padding: "9px 14px", color: "var(--text-2)", fontWeight: 600 }}>{fmtUsd(d.volume, { dp: 0 })}</td>
                <td style={{ textAlign: "right", padding: "9px 14px", color: "var(--up-ink)", fontWeight: 650 }}>{fmtUsd(d.captured, { dp: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const W = Math.max(280, measuredW || 720);
  const padX = 12;
  const padT = 28; // room for the running total above the line
  const base = height - 34; // plot floor; the regime strip and dates sit below it
  const slot = (W - 2 * padX) / n;
  const bw = Math.max(1.5, Math.min(14, slot * 0.7));
  const cx = (i: number) => padX + slot * i + slot / 2;
  const maxVol = Math.max(...rows.map((t) => t.notional_usdc || 0), 1e-9);
  const maxCum = Math.max(cum[n - 1], 1e-9);
  const yVol = (v: number) => base - (v / maxVol) * (base - padT) * 0.55;
  const yCum = (v: number) => base - (v / maxCum) * (base - padT);

  let line = "";
  cum.forEach((v, i) => (line += `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${yCum(v).toFixed(1)} `));
  const area = `M${cx(0).toFixed(1)},${base} ${line.slice(1)}L${cx(n - 1).toFixed(1)},${base} Z`;
  const ticks = n < 4 ? [0, n - 1] : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];

  const step = (e: KeyboardEvent) => {
    const next: Record<string, number | null> = {
      ArrowRight: idx === null ? n - 1 : Math.min(n - 1, idx + 1),
      ArrowLeft: idx === null ? n - 1 : Math.max(0, idx - 1),
      Home: 0,
      End: n - 1,
      Escape: null,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    setIdx(next[e.key]);
  };
  const hover = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setIdx(Math.max(0, Math.min(n - 1, Math.floor((x - padX) / slot))));
  };

  const t = idx === null ? null : rows[idx];

  return (
    <div>
      <div
        tabIndex={0}
        role="group"
        aria-label={`Value kept for LPs across ${n} swaps. Use the arrow keys to step through swaps.`}
        aria-describedby={readoutId}
        onKeyDown={step}
        className="rounded-md"
      >
        <svg
          viewBox={`0 0 ${W} ${height}`}
          style={{ width: "100%", height, display: "block", touchAction: "pan-y" }}
          aria-hidden="true"
          onPointerMove={hover}
          onPointerLeave={() => setIdx(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--up)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--up)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {rows.map((r, i) => {
            const y = yVol(r.notional_usdc || 0);
            return (
              <rect key={`v${i}`} x={cx(i) - bw / 2} y={y} width={bw} height={Math.max(1, base - y)} rx={Math.min(3, bw / 2)}
                fill="var(--lav)" opacity={idx === i ? 0.95 : 0.5} />
            );
          })}
          <path d={area} fill={`url(#${gradId})`} />
          <path d={line.trim()} fill="none" stroke="var(--up)" strokeWidth="2.25" strokeLinejoin="round" />
          <line x1={padX} y1={base} x2={W - padX} y2={base} stroke="var(--divider)" strokeWidth="1" />
          {rows.map((r, i) => (
            <rect key={`b${i}`} x={padX + slot * i} y={base + 5} width={Math.max(slot, 1)} height={7} fill={regimeColor(r)} opacity={0.85} />
          ))}
          {ticks.map((i, k) =>
            rows[i]?.ts ? (
              <text key={k} x={cx(i)} y={height - 4} fontSize="12" fontWeight="600" fill="var(--muted)"
                textAnchor={k === 0 ? "start" : k === ticks.length - 1 ? "end" : "middle"}>
                {dayFmt.format(new Date(rows[i].ts!))}
              </text>
            ) : null,
          )}
          <text x={W - padX} y={16} textAnchor="end" fontSize="13" fontWeight="650" fill="var(--up-ink)">
            {fmtUsd(cum[n - 1], { dp: 2 })} kept
          </text>
          {idx !== null && (
            <g pointerEvents="none">
              <line x1={cx(idx)} y1={padT - 6} x2={cx(idx)} y2={base + 12} stroke="var(--text-3)" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={cx(idx)} cy={yCum(cum[idx])} r="4.5" fill="var(--surface)" stroke="var(--up)" strokeWidth="2" />
            </g>
          )}
        </svg>
      </div>

      <p id={readoutId} aria-live="polite" className="mt-2.5" style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-3)", minHeight: "3.1em" }}>
        {t ? (
          <>
            <b style={{ color: "var(--text-2)" }}>{t.ts ? stampFmt.format(new Date(t.ts)) : `Swap ${idx! + 1}`}</b>
            {" · "}{t.side === "buy_weth" ? "Bought" : "Sold"} WETH, {fmtUsd(t.notional_usdc || 0, { dp: 0 })}
            {" · "}{regimeText(t)}
            {" · "}<span style={{ color: "var(--up-ink)", fontWeight: 600 }}>{fmtUsd(cum[idx!], { dp: 2 })} kept so far</span>
          </>
        ) : (
          <>
            {n} swap{n === 1 ? "" : "s"} in range. Hover the chart, or focus it and use ← →, to read any single swap.
          </>
        )}
      </p>
    </div>
  );
  }
}

/** Legend for the timeline: what each mark means, kept next to the chart rather than inside it. */
export function TimelineLegend() {
  const item = (swatch: ReactNode, label: string) => (
    <span className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>
      {swatch}
      {label}
    </span>
  );
  const box = (c: string, h = 9) => <span aria-hidden="true" style={{ width: 9, height: h, borderRadius: 2, background: c, display: "inline-block" }} />;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {item(box("var(--lav)"), "Swap size")}
      {item(<span aria-hidden="true" style={{ width: 14, height: 2.5, borderRadius: 2, background: "var(--up)", display: "inline-block" }} />, "Kept for LPs, cumulative")}
      {item(box("var(--lav)", 5), "Calm")}
      {item(box("var(--up)", 5), "Up-trend")}
      {item(box("var(--down)", 5), "Down-trend")}
    </div>
  );
}

/** One whole split into parts, as a single stacked bar with its legend underneath. */
export function SplitBar({ title, slices, total }: { title: string; slices: Slice[]; total: string }) {
  const sum = slices.reduce((a, s) => a + s.value, 0);
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5 gap-3" style={{ fontSize: 12 }}>
        <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{title}</span>
        <span className="font-display" style={{ color: "var(--text)", fontWeight: 650 }}>{sum > 0 ? total : "—"}</span>
      </div>
      {sum > 0 ? (
        <>
          <div className="flex rounded overflow-hidden" style={{ height: 8, background: "var(--track)", gap: 2 }}
            role="img" aria-label={`${title}: ${slices.map((s) => `${s.label} ${Math.round((s.value / sum) * 100)}%`).join(", ")}`}>
            {slices.map((s) => (
              <div key={s.label} style={{ width: `${(s.value / sum) * 100}%`, background: s.color, opacity: 0.9 }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {slices.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: s.color, display: "inline-block" }} />
                {s.label}
                <b style={{ color: "var(--text-2)" }}>{Math.round((s.value / sum) * 100)}%</b>
              </span>
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>Nothing recorded yet</div>
      )}
    </div>
  );
}

/** How hard the pool actually leans, as a share of its own cap. */
export function KappaHistogram({ buckets }: { buckets: Bucket[] }) {
  const any = buckets.some((b) => b.n > 0);
  if (!any) return <Empty label="No spread charged yet" height={120} />;
  const max = Math.max(...buckets.map((b) => b.frac), 1e-9);

  return (
    <div className="flex items-end gap-2" style={{ height: 120 }}>
      {buckets.map((b) => (
        <div key={b.label} className="flex flex-col items-center justify-end flex-1" style={{ height: "100%" }}>
          <span style={{ fontSize: 12, fontWeight: 650, color: "var(--honey-ink)", marginBottom: 3 }}>
            {b.n || ""}
          </span>
          <div
            title={`${b.n} swaps charged ${b.label} of the cap`}
            style={{
              width: "100%",
              height: `${Math.max(2, (b.frac / max) * 72)}%`,
              background: "var(--honey)",
              opacity: 0.8,
              borderRadius: "4px 4px 0 0",
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginTop: 5, textAlign: "center", lineHeight: 1.2 }}>
            {b.label}
          </span>
        </div>
      ))}
    </div>
  );
}
