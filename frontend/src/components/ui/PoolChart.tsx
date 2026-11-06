import { useMemo, useState } from "react";
import { usePriceSeries, PRICE_WINDOWS, type PriceWindowKey } from "@/hooks/usePriceSeries";
import { useWidth } from "@/hooks/useWidth";
import { fmtNum, fmtUsd } from "@/lib/format";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const PAD = { l: 8, r: 64, t: 10, b: 24 }; // right gutter carries the price axis, bottom the time axis

/** 1 / 2 / 2.5 / 5 × 10ⁿ: the step a person would choose for gridlines over `range`. */
function niceStep(range: number, target: number) {
  const raw = range / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const TIME_STEPS = [5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY, 90 * DAY, 180 * DAY, 365 * DAY];

/** Time gridlines on round local boundaries (midnights for day steps), at most `maxTicks`. */
function timeTicks(start: number, end: number, maxTicks: number) {
  const span = end - start;
  const step = TIME_STEPS.find((s) => span / s <= maxTicks) ?? TIME_STEPS[TIME_STEPS.length - 1];
  // Local time is UTC minus the offset, so local midnights sit at k·DAY + offset in UTC ms.
  const off = step >= HOUR ? new Date(start).getTimezoneOffset() * MIN : 0; // hour and day lines on local boundaries
  const ticks: number[] = [];
  for (let t = Math.ceil((start - off) / step) * step + off; t <= end; t += step) ticks.push(t);
  return { ticks, step };
}

const fmtTime = (t: number, span: number) =>
  new Date(t).toLocaleString(undefined,
    span <= 2 * DAY ? { hour: "2-digit", minute: "2-digit" }
      : span <= 200 * DAY ? { month: "short", day: "numeric" }
        : { month: "short", year: "2-digit" });

/**
 * Pool price chart (USDC per WETH): last-trade price over a window that ends now.
 *
 * Drawn as a step line, because an AMM's price holds until the next trade - a sloped segment
 * between two trades would show prices nobody ever traded at. The line opens at the price
 * carried into the window and runs flat to now, so a quiet window reads as "unchanged", not
 * "no data". Price and time gridlines, a crosshair, and a last-price tag on the axis follow the
 * conventions of an exchange chart.
 */
export function PoolChart({ height = 220 }: { height?: number }) {
  const [wrapRef, W] = useWidth<HTMLDivElement>();
  const [win, setWin] = useState<PriceWindowKey>("30D");
  const [hoverX, setHoverX] = useState<number | null>(null);
  const { series, loading, fetching } = usePriceSeries(win);

  const H = height;
  const innerW = Math.max(0, W - PAD.l - PAD.r);
  const innerH = Math.max(0, H - PAD.t - PAD.b);

  const model = useMemo(() => {
    if (!series || innerW <= 0) return null;
    const { trades, open, start, end } = series;
    const openPrice = open ?? trades[0]?.p ?? null;
    if (openPrice === null) return null; // the pool has never traded
    const lastPrice = trades.length ? trades[trades.length - 1].p : openPrice;

    // The path: opening price at the window start, each trade, then flat to now.
    const path: { t: number; p: number }[] = [];
    if (open !== null || !trades.length) path.push({ t: start, p: openPrice });
    for (const tr of trades) path.push({ t: tr.t, p: tr.p });
    path.push({ t: end, p: lastPrice });

    let lo = Math.min(...path.map((d) => d.p));
    let hi = Math.max(...path.map((d) => d.p));
    if (hi - lo < hi * 0.002) { const c = (hi + lo) / 2; lo = c * 0.997; hi = c * 1.003; } // flat: give it a band
    const pad = (hi - lo) * 0.1;
    lo -= pad;
    hi += pad;

    const span = Math.max(1, end - start);
    const x = (t: number) => PAD.l + ((t - start) / span) * innerW;
    const y = (p: number) => PAD.t + (1 - (p - lo) / (hi - lo)) * innerH;

    let line = `M${x(path[0].t).toFixed(1)},${y(path[0].p).toFixed(1)}`;
    for (let i = 1; i < path.length; i++) line += ` H${x(path[i].t).toFixed(1)} V${y(path[i].p).toFixed(1)}`;
    const base = (PAD.t + innerH).toFixed(1);
    const area = `${line} V${base} H${x(path[0].t).toFixed(1)} Z`;

    const pStep = niceStep(hi - lo, Math.max(2, Math.floor(innerH / 46)));
    const priceTicks: number[] = [];
    for (let p = Math.ceil(lo / pStep) * pStep; p <= hi; p += pStep) priceTicks.push(p);
    const { ticks: tTicks } = timeTicks(start, end, Math.max(2, Math.floor(innerW / 96)));

    return { trades, start, end, span, openPrice, lastPrice, x, y, line, area, priceTicks, pStep, tTicks };
  }, [series, innerW, innerH]);

  const change = model ? ((model.lastPrice - model.openPrice) / model.openPrice) * 100 : 0;
  const up = change >= 0;
  const accent = up ? "var(--up)" : "var(--down)";
  const accentInk = up ? "var(--up-ink)" : "var(--down-ink)";
  const gid = up ? "poolgrad-up" : "poolgrad-down";
  const priceDp = model && model.pStep < 1 ? 2 : 0;

  // Crosshair snaps to the nearest real trade; synthetic open/now points have nothing to show.
  let hi: number | null = null;
  if (model && hoverX !== null) {
    let best = Infinity;
    for (let i = 0; i < model.trades.length; i++) {
      const d = Math.abs(model.x(model.trades[i].t) - hoverX);
      if (d < best) { best = d; hi = i; }
    }
  }
  const hp = hi !== null && model ? model.trades[hi] : null;
  const quiet = model && model.trades.length === 0;

  return (
    <div ref={wrapRef}>
      <div className="flex items-end justify-between gap-3 mb-2 flex-wrap">
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", letterSpacing: ".3px" }}>WETH / USDC · last trade</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-display" style={{ fontSize: 24, fontWeight: 650, color: "var(--text)" }}>
              {model ? fmtUsd(model.lastPrice, { dp: 2 }) : "—"}
            </span>
            {model && (
              <span style={{ fontSize: 13, fontWeight: 650, color: accentInk }}>
                <span aria-hidden="true">{change === 0 ? "" : up ? "▲ " : "▼ "}</span>
                <span className="sr-only">{up ? "Up" : "Down"} </span>
                {Math.abs(change).toFixed(2)}%
                <span style={{ fontWeight: 600, color: "var(--muted)" }}> {win === "All" ? "all time" : win}</span>
              </span>
            )}
          </div>
        </div>
        <div className="seg seg-sm" role="group" aria-label="Price history window" style={{ padding: 3, borderRadius: 11 }}>
          {PRICE_WINDOWS.map((r) => (
            <button key={r.key} type="button" onClick={() => setWin(r.key)} aria-pressed={win === r.key} className="seg-item">
              {r.key}
            </button>
          ))}
        </div>
      </div>

      {/* Keyboard: focus the chart, then the arrow keys step the crosshair trade by trade
          (Home / End jump to the ends, Escape clears), the same readout the pointer gets. */}
      <div
        style={{ position: "relative", height: H, opacity: fetching && !loading ? 0.8 : 1, transition: "opacity .2s", borderRadius: 8 }}
        tabIndex={model && model.trades.length > 0 ? 0 : undefined}
        role={model && model.trades.length > 0 ? "group" : undefined}
        aria-label={model && model.trades.length > 0 ? "Price chart: use the arrow keys to step through trades" : undefined}
        onBlur={() => setHoverX(null)}
        onKeyDown={(e) => {
          if (!model || model.trades.length === 0) return;
          const n = model.trades.length;
          let next: number | null = null;
          if (e.key === "ArrowRight") next = hi === null ? n - 1 : Math.min(hi + 1, n - 1);
          else if (e.key === "ArrowLeft") next = hi === null ? n - 1 : Math.max(hi - 1, 0);
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = n - 1;
          else if (e.key === "Escape") { setHoverX(null); return; }
          if (next === null) return;
          e.preventDefault();
          setHoverX(model.x(model.trades[next].t));
        }}
      >
        <span className="sr-only" aria-live="polite">
          {hp ? `${hp.buy ? "Buy" : "Sell"} ${fmtNum(hp.weth, 4)} WETH at ${fmtUsd(hp.p, { dp: 2 })}, ${tipFmt.format(new Date(hp.t))}` : ""}
        </span>
        {!model ? (
          <div className="flex items-center justify-center gap-2" style={{ height: H, fontSize: 13, color: "var(--muted)" }}>
            {loading ? "Loading price history…" : "No trades yet."}
          </div>
        ) : (
          <svg
            width={W}
            height={H}
            style={{ display: "block", touchAction: "pan-y" }}
            role="img"
            aria-label={`WETH/USDC last-trade price over ${win === "All" ? "all recorded history" : `the last ${win}`}: ${fmtUsd(model.lastPrice, { dp: 2 })}, ${up ? "up" : "down"} ${Math.abs(change).toFixed(2)}%`}
            onPointerMove={(e) => setHoverX(e.clientX - e.currentTarget.getBoundingClientRect().left)}
            onPointerLeave={() => setHoverX(null)}
          >
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.2} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* grid: price lines with labels in the right gutter, time lines with labels below */}
            {model.priceTicks.map((p) => (
              <g key={`p${p}`}>
                <line x1={PAD.l} x2={PAD.l + innerW} y1={model.y(p)} y2={model.y(p)} stroke="var(--divider)" strokeWidth={1} strokeDasharray="3 4" />
                <text x={PAD.l + innerW + 8} y={model.y(p) + 4} fontSize="12" fontWeight="600" fill="var(--muted)">{fmtNum(p, priceDp)}</text>
              </g>
            ))}
            {model.tTicks.map((t) => (
              <g key={`t${t}`}>
                <line x1={model.x(t)} x2={model.x(t)} y1={PAD.t} y2={PAD.t + innerH} stroke="var(--divider)" strokeWidth={1} strokeDasharray="3 4" />
                <text x={model.x(t)} y={H - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--muted)">{fmtTime(t, model.span)}</text>
              </g>
            ))}
            <line x1={PAD.l} x2={PAD.l + innerW} y1={PAD.t + innerH} y2={PAD.t + innerH} stroke="var(--border)" strokeWidth={1} />

            <path d={model.area} fill={`url(#${gid})`} />
            <path d={model.line} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" />

            {/* last-price tag on the axis, as on an exchange chart */}
            <line x1={PAD.l} x2={PAD.l + innerW} y1={model.y(model.lastPrice)} y2={model.y(model.lastPrice)} stroke={accent} strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
            <rect x={PAD.l + innerW + 2} y={model.y(model.lastPrice) - 10} width={PAD.r - 4} height={20} rx={5} fill={up ? "var(--positive)" : "var(--negative)"} />
            <text x={PAD.l + innerW + PAD.r / 2} y={model.y(model.lastPrice) + 4} textAnchor="middle" fontSize="12" fontWeight="650" fill="#fff">
              {fmtNum(model.lastPrice, priceDp)}
            </text>

            {hp && (
              <g pointerEvents="none">
                <line x1={model.x(hp.t)} x2={model.x(hp.t)} y1={PAD.t} y2={PAD.t + innerH} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3 3" />
                <line x1={PAD.l} x2={PAD.l + innerW} y1={model.y(hp.p)} y2={model.y(hp.p)} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3 3" />
                <circle cx={model.x(hp.t)} cy={model.y(hp.p)} r={4} fill={accent} stroke="var(--surface)" strokeWidth={1.5} />
              </g>
            )}
          </svg>
        )}

        {quiet && model && (
          <div className="absolute rounded-lg px-3 py-1.5" style={{ left: PAD.l + 8, top: PAD.t + 6, fontSize: 12, fontWeight: 600, color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            No trades in the last {win} · price unchanged
          </div>
        )}

        {/* absolutely positioned so hover never reflows the column */}
        {model && hp && hi !== null && (
          <div
            style={{
              position: "absolute",
              top: 4,
              left: clamp(model.x(hp.t) - 82, 4, Math.max(4, W - PAD.r - 168)),
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
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>
              {tipFmt.format(new Date(hp.t))}
            </div>
            <TipRow label="Price" value={fmtUsd(hp.p, { dp: 2 })} bold />
            <TipRow label="Side" value={hp.buy ? "Buy WETH" : "Sell WETH"} color={hp.buy ? "var(--up-ink)" : "var(--down-ink)"} />
            <TipRow label="Size" value={`${fmtNum(hp.weth, 4)} WETH`} />
            <TipRow label="Value" value={fmtUsd(hp.usdc)} />
          </div>
        )}
      </div>
    </div>
  );
}

const tipFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function TipRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center" style={{ fontSize: 12, padding: "1.5px 0" }}>
      <span style={{ color: "var(--text-3)" }}>{label}</span>
      <span style={{ color: color ?? "var(--text-2)", fontWeight: bold ? 800 : 700 }}>{value}</span>
    </div>
  );
}
