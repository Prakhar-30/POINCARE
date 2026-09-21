import type { RegimeSplit, FlowSplit, RiskState, Slice, DayBucket, Bucket } from "@/lib/analytics";
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

// ---------------------------------------------------------------------------------------
// Historic-tape charts: a donut, a grouped column chart, and a distribution.

/** Proportions of a whole, with the total in the middle. */
export function Donut({
  slices,
  centerLabel,
  centerValue,
  size = 148,
}: {
  slices: Slice[];
  centerLabel: string;
  centerValue: string;
  size?: number;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return <Empty label="Nothing recorded yet" height={size} />;

  const R = size / 2;
  const stroke = size * 0.17;
  const r = R - stroke / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${R} ${R})`}>
          {slices.map((s) => {
            const len = (s.value / total) * circ;
            const el = (
              <circle
                key={s.label}
                cx={R}
                cy={R}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
                opacity={0.9}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x={R} y={R - 2} textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--text)">
          {centerValue}
        </text>
        <text x={R} y={R + 13} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--faint)">
          {centerLabel}
        </text>
      </svg>

      <div className="flex flex-col gap-2" style={{ minWidth: 0 }}>
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2" style={{ fontSize: 11.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "var(--text-3)", fontWeight: 700 }}>{s.label}</span>
            <span className="font-display" style={{ color: "var(--text)", fontWeight: 800 }}>
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Daily volume as columns, with value kept overlaid on its own scale. */
export function DailyColumns({ days, height = 170 }: { days: DayBucket[]; height?: number }) {
  if (days.length < 1) return <Empty label="No dated swaps yet" height={height} />;

  const W = 520;
  const padX = 12;
  const padB = 26;
  const padT = 14;
  const maxVol = Math.max(...days.map((d) => d.volume), 1);
  const maxCap = Math.max(...days.map((d) => d.captured), 1e-9);
  const n = days.length;
  const slot = (W - 2 * padX) / n;
  const bw = Math.min(30, slot * 0.6);
  const yVol = (v: number) => height - padB - (v / maxVol) * (height - padB - padT);
  const yCap = (v: number) => height - padB - (v / maxCap) * (height - padB - padT);

  let capLine = "";
  days.forEach((d, i) => {
    const cx = padX + slot * i + slot / 2;
    capLine += `${i === 0 ? "M" : "L"}${cx.toFixed(1)},${yCap(d.captured).toFixed(1)} `;
  });

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }}>
      <line x1={padX} y1={height - padB} x2={W - padX} y2={height - padB} stroke="var(--divider)" strokeWidth="1" />
      {days.map((d, i) => {
        const cx = padX + slot * i + slot / 2;
        const y = yVol(d.volume);
        return (
          <rect
            key={d.day}
            x={cx - bw / 2}
            y={y}
            width={bw}
            height={Math.max(1, height - padB - y)}
            rx={3}
            fill="var(--lav)"
            opacity={0.55}
          >
            <title>{`${d.day} · ${d.swaps} swaps`}</title>
          </rect>
        );
      })}
      <path d={capLine.trim()} fill="none" stroke="var(--up)" strokeWidth="2" strokeLinejoin="round" />
      {days.map((d, i) => (
        <circle key={d.day} cx={padX + slot * i + slot / 2} cy={yCap(d.captured)} r="2.5" fill="var(--up)" />
      ))}
      {days.map((d, i) =>
        i % Math.ceil(n / 6) === 0 || i === n - 1 ? (
          <text
            key={d.day}
            x={padX + slot * i + slot / 2}
            y={height - 9}
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="700"
            fill="var(--faint)"
          >
            {d.day.slice(5)}
          </text>
        ) : null,
      )}
      <text x={padX} y={10} fontSize="9" fontWeight="800" fill="var(--lav-deep)">volume</text>
      <text x={W - padX} y={10} textAnchor="end" fontSize="9" fontWeight="800" fill="var(--up-deep)">value kept</text>
    </svg>
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
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--honey-deep)", marginBottom: 3 }}>
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
          <span style={{ fontSize: 8.5, fontWeight: 700, color: "var(--faint)", marginTop: 5, whiteSpace: "nowrap" }}>
            {b.label}
          </span>
        </div>
      ))}
    </div>
  );
}
