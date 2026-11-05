import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useWidth } from "@/hooks/useWidth";
import { fmtNum, fmtPct, fmtUsd } from "@/lib/format";

/**
 * The pool as an exchange depth chart: price across, cumulative WETH up, bids rising to the left
 * of the pool price and asks to the right.
 *
 * This is the accurate picture of what the hook does. It never reshapes the curve (the depth
 * lever was measured and rejected, OPEN_ITEMS E1); it charges a spread on the side pushing with a
 * detected trend. On a price scale that is a sideways shift of one side of the book, so the chart
 * draws the live book solid and the plain constant-product book dashed beneath it, and shades the
 * gap between them: the band is the trend spread, paid by with-trend flow and kept by LPs. In a
 * calm market the two books coincide and only the base-fee gap remains around the mid.
 *
 * Same float model as the Trade book and the local quote (constant product, fee on input, spread
 * on output), so it is a picture of the curve, not an executable promise.
 */

type Props = {
  /** USDC reserve (human units). */
  x: number;
  /** WETH reserve (human units). */
  y: number;
  fee: number;
  /** Spread on buys of WETH (zeroForOne). */
  spreadBuy: number;
  /** Spread on sells of WETH (oneForZero). */
  spreadSell: number;
  /** Half-width of the price window as a fraction of the pool price, e.g. 0.05 for ±5%. */
  range: number;
  height?: number;
};

const PAD = { l: 8, r: 58, t: 26, b: 24 };
const N = 160;

function niceStep(span: number, target: number) {
  const raw = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}

export function LiquidityDepth({ x, y, fee, spreadBuy, spreadSell, range, height = 300 }: Props) {
  const [wrapRef, measured] = useWidth<HTMLDivElement>();
  const W = Math.max(280, measured || 640);
  const H = height;
  const [cursor, setCursor] = useState<number | null>(null); // price under the pointer / keyboard

  const m = useMemo(() => {
    if (x <= 0 || y <= 0) return null;
    const k = x * y;
    const mid = x / y;
    const lo = mid * (1 - range);
    const hi = mid * (1 + range);

    // Cumulative WETH the book holds out to price q. Asks: what a buyer takes off the pool by the
    // time their marginal price reaches q. Bids: what a seller has put in by the time theirs falls to q.
    const askCum = (q: number, sb: number) => {
      const p = q * (1 - fee) * (1 - sb);
      return p <= mid ? 0 : (y - Math.sqrt(k / p)) * (1 - sb);
    };
    const bidCum = (q: number, ss: number) => {
      const p = q / ((1 - fee) * (1 - ss));
      return p >= mid ? 0 : (Math.sqrt(k / p) - y) / (1 - fee);
    };
    // What the trader pays (asks, USDC) or receives (bids, USDC) walking the book to q.
    const askPay = (q: number, sb: number) => {
      const p = q * (1 - fee) * (1 - sb);
      return p <= mid ? 0 : (Math.sqrt(k * p) - x) / (1 - fee);
    };
    const bidGet = (q: number, ss: number) => {
      const p = q / ((1 - fee) * (1 - ss));
      return p >= mid ? 0 : (x - Math.sqrt(k * p)) * (1 - ss);
    };

    const best = {
      ask: mid / ((1 - fee) * (1 - spreadBuy)),
      bid: mid * (1 - fee) * (1 - spreadSell),
      plainAsk: mid / (1 - fee),
      plainBid: mid * (1 - fee),
    };
    const yMax = Math.max(askCum(hi, 0), bidCum(lo, 0), askCum(hi, spreadBuy), bidCum(lo, spreadSell), 1e-12) * 1.1;

    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const sx = (q: number) => PAD.l + ((q - lo) / (hi - lo)) * iw;
    const sy = (v: number) => PAD.t + ih - (v / yMax) * ih;
    const base = sy(0);

    const side = (from: number, to: number, f: (q: number) => number) => {
      if ((to - from) * (to > from ? 1 : -1) <= 0) return { line: "", area: "" };
      const pts: string[] = [`${sx(from).toFixed(1)},${base.toFixed(1)}`];
      for (let i = 0; i <= N; i++) {
        const q = from + ((to - from) * i) / N;
        pts.push(`${sx(q).toFixed(1)},${sy(f(q)).toFixed(1)}`);
      }
      const line = `M${pts.join(" L")}`;
      return { line, area: `${line} L${sx(to).toFixed(1)},${base.toFixed(1)} Z` };
    };
    const asks = best.ask < hi ? side(best.ask, hi, (q) => askCum(q, spreadBuy)) : { line: "", area: "" };
    const bids = best.bid > lo ? side(best.bid, lo, (q) => bidCum(q, spreadSell)) : { line: "", area: "" };
    const plainAsks = side(best.plainAsk, hi, (q) => askCum(q, 0));
    const plainBids = side(best.plainBid, lo, (q) => bidCum(q, 0));

    const xs = niceStep(hi - lo, Math.max(3, Math.floor(iw / 110)));
    const xTicks: number[] = [];
    for (let t = Math.ceil(lo / xs) * xs; t <= hi; t += xs) xTicks.push(t);
    const ys = niceStep(yMax, 4);
    const yTicks: number[] = [];
    for (let t = ys; t < yMax; t += ys) yTicks.push(t);

    return { k, mid, lo, hi, best, askCum, bidCum, askPay, bidGet, sx, sy, base, iw, ih, asks, bids, plainAsks, plainBids, xTicks, yTicks, xs, ys, yMax };
  }, [x, y, fee, spreadBuy, spreadSell, range, W, H]);

  if (!m) {
    return (
      <div ref={wrapRef} className="flex items-center justify-center rounded-md" style={{ height: H, fontSize: 13, color: "var(--muted)", background: "var(--scope-bg)", border: "1px solid var(--border)" }}>
        Reading reserves…
      </div>
    );
  }

  const pxDp = m.xs < 1 ? 2 : 0;
  const leanBuy = spreadBuy > 0;
  const leanSell = spreadSell > 0;

  const toPrice = (clientX: number, rect: DOMRect) => {
    const fx = ((clientX - rect.left) / rect.width) * W;
    return Math.min(m.hi, Math.max(m.lo, m.lo + ((fx - PAD.l) / m.iw) * (m.hi - m.lo)));
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => setCursor(toPrice(e.clientX, e.currentTarget.getBoundingClientRect()));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const stepQ = (m.hi - m.lo) / 80;
    const at = cursor ?? m.mid;
    if (e.key === "ArrowRight") setCursor(Math.min(m.hi, at + stepQ));
    else if (e.key === "ArrowLeft") setCursor(Math.max(m.lo, at - stepQ));
    else if (e.key === "Home") setCursor(m.lo);
    else if (e.key === "End") setCursor(m.hi);
    else if (e.key === "Escape") setCursor(null);
    else return;
    e.preventDefault();
  };

  // readout for the cursor, in trader terms
  let read: { side: "ask" | "bid"; q: number; live: number; plain: number; usdc: number } | null = null;
  if (cursor !== null) {
    const ask = cursor >= m.mid;
    read = ask
      ? { side: "ask", q: cursor, live: m.askCum(cursor, spreadBuy), plain: m.askCum(cursor, 0), usdc: m.askPay(cursor, spreadBuy) }
      : { side: "bid", q: cursor, live: m.bidCum(cursor, spreadSell), plain: m.bidCum(cursor, 0), usdc: m.bidGet(cursor, spreadSell) };
  }
  const cx = cursor !== null ? m.sx(cursor) : 0;
  const tipLeft = cx > W / 2;

  const summary = `Depth within ±${fmtPct(range, 0)}: bids ${fmtNum(m.bidCum(m.lo, spreadSell), 2)} WETH, asks ${fmtNum(m.askCum(m.hi, spreadBuy), 2)} WETH.`;
  // The comparison a trader cares about is the same trade on a plain pool: for a buy, what the
  // same USDC would get; for a sell, what the same WETH would fetch. Depth to the same *price* is
  // what the dashed line shows, but that is a different trade, so it stays out of the readout.
  const plainSame = read && read.live > 0
    ? read.side === "ask"
      ? (y * read.usdc * (1 - fee)) / (x + read.usdc * (1 - fee))
      : (x * read.live * (1 - fee)) / (y + read.live * (1 - fee))
    : 0;
  const lean = read ? (read.side === "ask" ? leanBuy : leanSell) : false;
  const extraPct = read && read.live > 0 && plainSame > 0
    ? read.side === "ask" ? plainSame / read.live - 1 : plainSame / read.usdc - 1
    : 0;
  const askGap = m.best.ask / m.best.plainAsk - 1;
  const bidGap = 1 - m.best.bid / m.best.plainBid;

  const readText = read
    ? read.side === "ask"
      ? read.live > 0
        ? `Buying until the price reaches ${fmtNum(read.q, 2)} gets ${fmtNum(read.live, 3)} WETH for ${fmtUsd(read.usdc, { compact: read.usdc >= 1e6, dp: 0 })}${leanBuy ? `; the same USDC on a plain pool would get ${fmtNum(plainSame, 3)} WETH (${fmtPct(extraPct, 1)} more)` : ""}.`
        : leanBuy
          ? `Inside the trend spread: no WETH is offered until ${fmtNum(m.best.ask, 2)}, ${fmtPct(askGap, 1)} above where a plain pool starts selling.`
          : `No ask liquidity below ${fmtNum(m.best.ask, 2)}, the best ask.`
      : read.live > 0
        ? `Selling until the price falls to ${fmtNum(read.q, 2)} sells ${fmtNum(read.live, 3)} WETH for ${fmtUsd(read.usdc, { compact: read.usdc >= 1e6, dp: 0 })}${leanSell ? `; the same WETH on a plain pool would fetch ${fmtUsd(plainSame, { compact: plainSame >= 1e6, dp: 0 })} (${fmtPct(extraPct, 1)} more)` : ""}.`
        : leanSell
          ? `Inside the trend spread: no bid until ${fmtNum(m.best.bid, 2)}, ${fmtPct(bidGap, 1)} below where a plain pool starts buying.`
          : `No bid liquidity above ${fmtNum(m.best.bid, 2)}, the best bid.`
    : null;

  return (
    <div ref={wrapRef} className="min-w-0">
      <div
        tabIndex={0}
        role="group"
        aria-label="Liquidity depth chart. Use the left and right arrow keys to read depth at a price; Escape clears."
        onKeyDown={onKey}
        onBlur={() => setCursor(null)}
        className="relative rounded-md"
        style={{ background: "var(--scope-bg)", border: "1px solid var(--border)", outlineOffset: 2 }}
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: "block", width: "100%", height: H, touchAction: "pan-y", cursor: "crosshair" }}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setCursor(null)}
          aria-hidden="true"
        >
          {/* grid */}
          {m.yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={PAD.l} x2={W - PAD.r} y1={m.sy(t)} y2={m.sy(t)} stroke="var(--divider)" strokeDasharray="2 4" />
              <text x={W - PAD.r + 8} y={m.sy(t) + 4} fontSize={11} fill="var(--text-3)">{fmtNum(t, t < 10 ? 1 : 0)}</text>
            </g>
          ))}
          {m.xTicks.map((t) => (
            <g key={`x${t}`}>
              <line x1={m.sx(t)} x2={m.sx(t)} y1={PAD.t} y2={m.base} stroke="var(--divider)" strokeDasharray="2 4" />
              <text x={m.sx(t)} y={H - 7} fontSize={11} fill="var(--text-3)" textAnchor="middle">{fmtNum(t, pxDp)}</text>
            </g>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={m.base} y2={m.base} stroke="var(--border-strong)" />
          <text x={W - PAD.r + 8} y={PAD.t - 10} fontSize={11} fill="var(--text-3)">WETH</text>

          {/* the trend spread: the band between where a plain pool would quote and where this one does */}
          {leanBuy && (
            <rect x={m.sx(m.best.plainAsk)} y={PAD.t} width={Math.max(1.5, m.sx(Math.min(m.hi, m.best.ask)) - m.sx(m.best.plainAsk))} height={m.ih} fill="var(--honey)" opacity={0.2} />
          )}
          {leanSell && (
            <rect x={m.sx(Math.max(m.lo, m.best.bid))} y={PAD.t} width={Math.max(1.5, m.sx(m.best.plainBid) - m.sx(Math.max(m.lo, m.best.bid)))} height={m.ih} fill="var(--honey)" opacity={0.2} />
          )}

          {/* live book */}
          <path d={m.bids.area} fill="var(--up)" opacity={0.18} />
          <path d={m.asks.area} fill="var(--down)" opacity={0.18} />
          <path d={m.bids.line} fill="none" stroke="var(--up)" strokeWidth={2} strokeLinejoin="round" />
          <path d={m.asks.line} fill="none" stroke="var(--down)" strokeWidth={2} strokeLinejoin="round" />

          {/* plain constant-product book, for comparison */}
          {leanBuy && <path d={m.plainAsks.line} fill="none" stroke="var(--text-3)" strokeWidth={1.4} strokeDasharray="4 4" />}
          {leanSell && <path d={m.plainBids.line} fill="none" stroke="var(--text-3)" strokeWidth={1.4} strokeDasharray="4 4" />}

          {/* pool price */}
          <line x1={m.sx(m.mid)} x2={m.sx(m.mid)} y1={PAD.t - 6} y2={m.base} stroke="var(--lav)" strokeWidth={1.5} strokeDasharray="3 3" />
          <g transform={`translate(${m.sx(m.mid)},${PAD.t - 14})`}>
            <rect x={-40} y={-9} width={80} height={18} rx={9} fill="var(--action)" />
            <text y={4} fontSize={11} fontWeight={800} fill="#fff" textAnchor="middle">{fmtNum(m.mid, 2)}</text>
          </g>

          {/* cursor */}
          {read && (
            <g>
              <line x1={cx} x2={cx} y1={PAD.t} y2={m.base} stroke="var(--text-2)" strokeWidth={1} strokeDasharray="3 3" />
              {read.live > 0 && <circle cx={cx} cy={m.sy(read.live)} r={4.5} fill={read.side === "ask" ? "var(--down)" : "var(--up)"} stroke="var(--surface)" strokeWidth={2} />}
              {read.plain > 0 && read.plain !== read.live && <circle cx={cx} cy={m.sy(read.plain)} r={3.5} fill="var(--surface)" stroke="var(--text-3)" strokeWidth={1.5} />}
            </g>
          )}
        </svg>

        {read && (
          <div
            className="absolute pointer-events-none rounded-lg"
            style={{
              top: PAD.t + 6,
              left: tipLeft ? undefined : `calc(${(cx / W) * 100}% + 12px)`,
              right: tipLeft ? `calc(${((W - cx) / W) * 100}% + 12px)` : undefined,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
              padding: "7px 10px",
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: "nowrap",
              color: "var(--text-2)",
            }}
          >
            <div style={{ fontWeight: 800, color: read.side === "ask" ? "var(--down-ink)" : "var(--up-ink)" }}>
              {read.side === "ask" ? "Ask" : "Bid"} · {fmtNum(read.q, 2)}
            </div>
            {read.live > 0 ? (
              <>
                <div>{read.side === "ask" ? "You get" : "You sell"} <b style={{ color: "var(--text)" }}>{fmtNum(read.live, 3)} WETH</b></div>
                <div>{read.side === "ask" ? "You pay" : "You receive"} <b style={{ color: "var(--text)" }}>{fmtUsd(read.usdc, { compact: read.usdc >= 1e6, dp: 0 })}</b></div>
                {lean && plainSame > 0 && (
                  <div style={{ color: "var(--honey-ink)", fontWeight: 700 }}>
                    Plain pool, same trade: {read.side === "ask" ? `${fmtNum(plainSame, 3)} WETH` : fmtUsd(plainSame, { compact: plainSame >= 1e6, dp: 0 })} (+{fmtPct(extraPct, 1)})
                  </div>
                )}
              </>
            ) : (
              <div style={{ maxWidth: 210, whiteSpace: "normal" }}>
                {lean
                  ? <>Inside the trend spread. Nothing {read.side === "ask" ? "offered" : "bid"} until <b style={{ color: "var(--text)" }}>{fmtNum(read.side === "ask" ? m.best.ask : m.best.bid, 2)}</b>.</>
                  : <>No liquidity between the best quotes.</>}
              </div>
            )}
          </div>
        )}
      </div>

      <p aria-live="polite" style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-3)", marginTop: 8, minHeight: 18 }}>
        {readText ?? summary}
      </p>
    </div>
  );
}

export function DepthLegend({ lean }: { lean: boolean }) {
  const item = (swatch: JSX.Element, label: string) => (
    <span className="inline-flex items-center gap-1.5">{swatch}{label}</span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>
      {item(<span aria-hidden="true" style={{ width: 12, height: 8, borderRadius: 2, background: "var(--up)", opacity: 0.7 }} />, "Bids")}
      {item(<span aria-hidden="true" style={{ width: 12, height: 8, borderRadius: 2, background: "var(--down)", opacity: 0.7 }} />, "Asks")}
      {item(<span aria-hidden="true" style={{ width: 14, borderTop: "2px dashed var(--lav)" }} />, "Pool price")}
      {lean && item(<span aria-hidden="true" style={{ width: 14, borderTop: "2px dashed var(--text-3)" }} />, "Plain x·y=k")}
      {lean && item(<span aria-hidden="true" style={{ width: 12, height: 8, borderRadius: 2, background: "var(--honey)", opacity: 0.5 }} />, "Trend spread → LPs")}
    </div>
  );
}
