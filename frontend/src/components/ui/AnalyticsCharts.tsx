import type { RegimeSplit, FlowSplit, RiskState } from "@/lib/analytics";
import { fmtUsd, fmtPct } from "@/lib/format";

/**
 * The Analytics page's own charts. Hand-rolled SVG rather than a charting dependency: these are
 * four small, fixed shapes, and a library would cost more bundle than it saves in code.
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
        fontSize: 11.5,
        color: "var(--faint)",
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

/** Cumulative value the LP kept from with-trend flow, over the tape. */
export function SavingsChart({
  points,
  height = 150,
}: {
  points: { t: number; v: number }[];
  height?: number;
}) {
  if (points.length < 2) return <Empty label="No swaps recorded yet" height={height} />;

  const W = 520;
  const pad = 10;
  const max = Math.max(...points.map((p) => p.v), 1e-9);
  const n = points.length;
  const sx = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const sy = (v: number) => height - pad - (v / max) * (height - 2 * pad - 8);

  let line = "";
  points.forEach((p, i) => {
    line += `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(p.v).toFixed(1)} `;
  });
  const area = `M${sx(0)},${height - pad} ${line.slice(1)} L${sx(n - 1)},${height - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }}>
      <defs>
        <linearGradient id="savingsFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--up)" stopOpacity="0.38" />
          <stop offset="100%" stopColor="var(--up)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={pad} y1={height - pad} x2={W - pad} y2={height - pad} stroke="var(--divider)" strokeWidth="1" />
      <path d={area} fill="url(#savingsFill)" />
      <path d={line.trim()} fill="none" stroke="var(--up)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={sx(n - 1)} cy={sy(points[n - 1].v)} r="3.5" fill="var(--up)" />
      <text x={W - pad} y={16} textAnchor="end" fontSize="11" fontWeight="800" fill="var(--up)">
        {fmtUsd(points[n - 1].v, { dp: 2 })}
      </text>
    </svg>
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
          <span key={s.k} className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>
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
      />
      <Row
        label="Paid nothing extra"
        sub={`${flow.freeSwaps} swap${flow.freeSwaps === 1 ? "" : "s"} · counter-trend or calm market`}
        value={fmtUsd(flow.free, { dp: 0 })}
        frac={1 - pct / 100}
        color="var(--up)"
      />
      <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.55, margin: 0 }}>
        {pct < 50
          ? `Most volume — ${(100 - pct).toFixed(0)}% — was never charged a spread. That is the design working: the haircut is aimed, not broadcast.`
          : `${pct.toFixed(0)}% of volume pushed into a detected trend and paid the spread. A symmetric fee would have charged the other ${(100 - pct).toFixed(0)}% too.`}
      </p>
    </div>
  );
}

function Row({ label, sub, value, frac, color }: { label: string; sub: string; value: string; frac: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1" style={{ fontSize: 12 }}>
        <span style={{ color: "var(--text-2)", fontWeight: 700 }}>{label}</span>
        <span className="font-display" style={{ color, fontWeight: 800 }}>{value}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--track)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(2, frac * 100)}%`, background: color, borderRadius: 4 }} />
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

/** The live risk read: how close the detector is to firing, and whether the gate is holding it. */
export function RiskMeter({ risk, dPct, dFloorPct }: { risk: RiskState; dPct: number; dFloorPct: number }) {
  const tone =
    risk.level === "engaged" ? "var(--honey-deep)" : risk.level === "watching" ? "var(--lav-deep)" : "var(--up-deep)";
  const bg =
    risk.level === "engaged" ? "rgba(217,140,0,.13)" : risk.level === "watching" ? "var(--lav-soft)" : "var(--green-bg)";

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span
          className="rounded-full px-3 py-1.5"
          style={{ fontSize: 12, fontWeight: 800, color: tone, background: bg }}
        >
          {risk.label}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-3)" }}>
          evidence {Math.round(risk.progress * 100)}% of threshold
        </span>
      </div>

      <div style={{ height: 10, borderRadius: 5, background: "var(--track)", overflow: "hidden", position: "relative" }}>
        <div style={{ height: "100%", width: `${Math.max(2, risk.progress * 100)}%`, background: tone, borderRadius: 5 }} />
      </div>

      <div className="flex justify-between mt-1.5" style={{ fontSize: 10.5, color: "var(--faint)", fontWeight: 600 }}>
        <span>no evidence</span>
        <span>threshold h · fires here</span>
      </div>

      <div className="mt-3.5 rounded-md p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <div className="flex justify-between mb-1.5" style={{ fontSize: 11.5 }}>
          <span style={{ color: "var(--text-3)", fontWeight: 700 }}>directional efficiency D</span>
          <span style={{ fontWeight: 800, color: risk.gated ? "var(--down)" : "var(--up-deep)" }}>
            {fmtPct(dPct)} {risk.gated ? "· below floor" : "· above floor"}
          </span>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: "var(--track)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, dPct * 100)}%`, background: risk.gated ? "var(--down)" : "var(--up)", borderRadius: 4 }} />
          <div style={{ position: "absolute", left: `${Math.min(100, dFloorPct * 100)}%`, top: -2, bottom: -2, width: 2, background: "var(--text-2)" }} />
        </div>
        <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.55, margin: "8px 0 0" }}>{risk.detail}</p>
      </div>
    </div>
  );
}
