import { useEffect, useMemo, useRef, useState } from "react";
import { priceOf, type SwapRow } from "@/lib/db";
import { fmtNum, fmtUsd } from "@/lib/format";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Measure a container's pixel width (so the SVG stays crisp and responsive). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type Pt = { t: number; p: number; buy: boolean; weth: number; usdc: number };
const DAY = 86_400_000;
const RANGES = [
  { label: "24H", ms: DAY },
  { label: "5D", ms: 5 * DAY },
  { label: "1M", ms: 30 * DAY },
  { label: "All", ms: Infinity },
];

/**
 * Uniswap-style pool price chart (USDC per WETH) built from the on-chain swap history.
 * Area + line with a hover crosshair; uses real block timestamps for the x-axis.
 */
export function PoolChart({ rows, height = 220 }: { rows: SwapRow[]; height?: number }) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const [range, setRange] = useState(3); // default "All"
  const [hover, setHover] = useState<number | null>(null);

  // chronological points (oldest -> newest), de-noised price from the legs
  const all = useMemo<Pt[]>(() => {
    const pts = [...rows].reverse().map((r) => {
      const buy = r.side === "buy_weth";
      return {
        t: r.ts ? new Date(r.ts).getTime() : 0,
        p: priceOf(r),
        buy,
        weth: buy ? r.amount_out : r.amount_in,
        usdc: buy ? r.amount_in : r.amount_out,
      };
    });
    return pts.filter((x) => x.p > 0);
  }, [rows]);

  const pts = useMemo(() => {
    const ms = RANGES[range].ms;
    if (ms === Infinity) return all;
    const cutoff = Date.now() - ms;
    const windowed = all.filter((x) => x.t >= cutoff);
    return windowed.length >= 2 ? windowed : all; // fall back to full history if too sparse
  }, [all, range]);

  const H = height;
  const padX = 6;
  const padTop = 8;
  const padBot = 14;
  const innerW = Math.max(0, W - padX * 2);
  const innerH = H - padTop - padBot;

  const geom = useMemo(() => {
    if (pts.length < 2 || innerW <= 0) return null;
    const ps = pts.map((x) => x.p);
    let lo = Math.min(...ps);
    let hi = Math.max(...ps);
    if (hi === lo) { hi = lo * 1.001; lo = lo * 0.999; }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const tMin = pts[0].t;
    const tMax = pts[pts.length - 1].t;
    const span = tMax - tMin || 1;
    const x = (t: number) => padX + ((t - tMin) / span) * innerW;
    const y = (p: number) => padTop + (1 - (p - lo) / (hi - lo)) * innerH;
    const xs = pts.map((d, i) => (span === 0 ? padX + (i / (pts.length - 1)) * innerW : x(d.t)));
    const ys = pts.map((d) => y(d.p));
    let line = "";
    for (let i = 0; i < pts.length; i++) line += `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${ys[i].toFixed(1)} `;
    const area = `${line}L${xs[xs.length - 1].toFixed(1)},${(H - padBot).toFixed(1)} L${xs[0].toFixed(1)},${(H - padBot).toFixed(1)} Z`;
    return { xs, ys, line: line.trim(), area, lo, hi };
  }, [pts, innerW, innerH, H]);

  const first = pts[0]?.p ?? 0;
  const last = pts[pts.length - 1]?.p ?? 0;
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const up = changePct >= 0;
  const accent = up ? "var(--up)" : "var(--down)";
  const gid = up ? "poolgrad-up" : "poolgrad-down";

  // nearest point to the hovered x
  const hi = hover != null && geom ? nearest(geom.xs, hover) : null;
  const hp = hi != null ? pts[hi] : null;

  return (
    <div ref={wrapRef}>
      {/* header — static height (hover info lives in the floating tooltip, not here) */}
      <div className="flex items-end justify-between gap-3 mb-2 flex-wrap">
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", letterSpacing: ".3px" }}>WETH / USDC · pool price</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-display" style={{ fontSize: 24, fontWeight: 800, color: "var(--text)" }}>
              {last > 0 ? fmtUsd(last) : "—"}
            </span>
            {pts.length >= 2 && (
              <span style={{ fontSize: 12.5, fontWeight: 800, color: accent }}>
                {up ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 3 }}>
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRange(i)}
              className="font-bold"
              style={{
                padding: "4px 10px", borderRadius: 7, fontSize: 11.5,
                background: range === i ? "var(--surface)" : "transparent",
                color: range === i ? "var(--text)" : "var(--muted)",
                boxShadow: range === i ? "var(--shadow-sm)" : "none",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* chart */}
      <div style={{ position: "relative", height: H }}>
        {!geom ? (
          <div className="flex items-center justify-center" style={{ height: H, fontSize: 12.5, color: "var(--faint)" }}>
            Not enough swaps yet to chart. Trade to build the price history.
          </div>
        ) : (
          <svg
            width={W}
            height={H}
            style={{ display: "block" }}
            onMouseMove={(e) => setHover(e.clientX - e.currentTarget.getBoundingClientRect().left)}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.22} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={geom.area} fill={`url(#${gid})`} />
            <path d={geom.line} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* last point */}
            <circle cx={geom.xs[geom.xs.length - 1]} cy={geom.ys[geom.ys.length - 1]} r={3.5} fill={accent} />
            {/* hover crosshair */}
            {hi != null && (
              <g>
                <line x1={geom.xs[hi]} y1={padTop} x2={geom.xs[hi]} y2={H - padBot} stroke="var(--divider)" strokeWidth={1} />
                <circle cx={geom.xs[hi]} cy={geom.ys[hi]} r={4} fill={accent} stroke="var(--surface)" strokeWidth={1.5} />
              </g>
            )}
          </svg>
        )}

        {/* floating tooltip — absolutely positioned so it never reflows the column */}
        {geom && hp && hi != null && (
          <div
            style={{
              position: "absolute",
              top: 4,
              left: clamp(geom.xs[hi] - 82, 4, Math.max(4, W - 168)),
              width: 164,
              pointerEvents: "none",
              zIndex: 4,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 11,
              boxShadow: "0 10px 26px rgba(20,18,45,.16)",
              padding: "9px 11px",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--faint)", marginBottom: 6 }}>
              {new Date(hp.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
            <TipRow label="Price" value={`${fmtUsd(hp.p)}`} bold />
            <TipRow label="Side" value={hp.buy ? "Buy WETH" : "Sell WETH"} color={hp.buy ? "var(--up)" : "var(--down)"} />
            <TipRow label="Size" value={`${fmtNum(hp.weth, 4)} WETH`} />
            <TipRow label="Value" value={fmtUsd(hp.usdc)} />
          </div>
        )}
      </div>
    </div>
  );
}

function TipRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center" style={{ fontSize: 11.5, padding: "1.5px 0" }}>
      <span style={{ color: "var(--text-3)" }}>{label}</span>
      <span style={{ color: color ?? "var(--text-2)", fontWeight: bold ? 800 : 700 }}>{value}</span>
    </div>
  );
}

function nearest(xs: number[], x: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - x);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
