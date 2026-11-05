import { useState } from "react";
import { fmtPct } from "@/lib/format";

/** Fixed decimals, as an order book prints them, so columns line up digit for digit. */
const fx = (n: number, d: number) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * An exchange-style order book for a pool that has no orders: each row is a price level on the
 * curve, and its size is what it takes to walk the pool there.
 *
 * Read off the same float model as the local quote (constant product, vol-scaled fee on input,
 * directional spread on output), so it is a picture of the curve rather than an executable
 * promise - the ticket's Lens quote stays the number that trades. What it shows that no other
 * view does is the hook itself: when a trend is detected the with-trend side of the book steps
 * away from the mid by the spread, and the gap in the middle widens on one side only.
 */

export type DepthLevel = {
  /** Marginal price a trader pays (asks) or receives (bids) at this level, USDC per WETH. */
  price: number;
  /** WETH traded between the previous level and this one. */
  size: number;
  /** Cumulative WETH to reach this level. */
  cumWeth: number;
  /** Cumulative amount the trader pays to reach this level: USDC for asks, WETH for bids. */
  pay: number;
};

export function depthOf(x: number, y: number, fee: number, spreadBuy: number, spreadSell: number, step: number, n: number) {
  const empty = { asks: [] as DepthLevel[], bids: [] as DepthLevel[], mid: 0, bestAsk: 0, bestBid: 0 };
  if (x <= 0 || y <= 0) return empty;
  const k = x * y;
  const mid = x / y;
  const asks: DepthLevel[] = [];
  const bids: DepthLevel[] = [];
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const p = mid * (1 + i * step);
    const cumWeth = (y - Math.sqrt(k / p)) * (1 - spreadBuy);
    asks.push({ price: p / ((1 - fee) * (1 - spreadBuy)), size: cumWeth - prev, cumWeth, pay: (Math.sqrt(k * p) - x) / (1 - fee) });
    prev = cumWeth;
  }
  prev = 0;
  for (let i = 1; i <= n && 1 - i * step > 0; i++) {
    const p = mid * (1 - i * step);
    const effIn = Math.sqrt(k / p) - y;
    const cumWeth = effIn / (1 - fee);
    bids.push({ price: p * (1 - fee) * (1 - spreadSell), size: cumWeth - prev, cumWeth, pay: cumWeth });
    prev = cumWeth;
  }
  return { asks, bids, mid, bestAsk: mid / ((1 - fee) * (1 - spreadBuy)), bestBid: mid * (1 - fee) * (1 - spreadSell) };
}

const COLS = "minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr)";

export function CurveDepth({
  book,
  spreadBuy,
  spreadSell,
  onPick,
  selected,
}: {
  book: ReturnType<typeof depthOf>;
  spreadBuy: number;
  spreadSell: number;
  /** Fill the ticket from a level: side, and the amount the trader would pay. */
  onPick: (side: "buy" | "sell", pay: number, idx: number) => void;
  /** The level the ticket was filled from: rows from the mid out to it stay highlighted. */
  selected?: { side: "buy" | "sell"; idx: number } | null;
}) {
  const [hover, setHover] = useState<{ side: "buy" | "sell"; idx: number } | null>(null);
  const { asks, bids, mid, bestAsk, bestBid } = book;
  if (!mid) {
    return <div className="flex items-center justify-center" style={{ height: 200, fontSize: 13, color: "var(--muted)" }}>Reading reserves…</div>;
  }
  const maxCum = Math.max(asks[asks.length - 1]?.cumWeth ?? 0, bids[bids.length - 1]?.cumWeth ?? 0, 1e-12);
  const gap = (bestAsk - bestBid) / mid;

  // A market order walks every level between the mid and its limit, so the whole range is marked,
  // not just the clicked row: a dull overlay for the range, an edge on the level itself.
  const inRange = (r: { side: string; idx: number } | null | undefined, side: string, i: number) => Boolean(r && r.side === side && i <= r.idx);

  const row = (l: DepthLevel, side: "buy" | "sell", i: number) => {
    const ask = side === "buy";
    const picked = inRange(selected, side, i);
    const hovered = !picked && inRange(hover, side, i);
    const edge = selected?.side === side && selected.idx === i;
    const shadows = [
      edge ? `inset 3px 0 0 ${ask ? "var(--negative)" : "var(--positive)"}` : "",
      picked ? "inset 0 0 0 100vmax var(--book-sel)" : hovered ? "inset 0 0 0 100vmax var(--book-hover)" : "",
    ].filter(Boolean).join(", ");
    return (
      <button
        key={`${side}${i}`}
        type="button"
        onClick={() => onPick(side, l.pay, i)}
        onPointerEnter={() => setHover({ side, idx: i })}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover({ side, idx: i })}
        onBlur={() => setHover(null)}
        aria-pressed={edge}
        className="depth-row grid w-full text-right"
        aria-label={`${ask ? "Buy" : "Sell"} ${fx(l.cumWeth, 4)} WETH, reaching ${fx(l.price, 2)} USDC`}
        style={{
          gridTemplateColumns: COLS,
          gap: 8,
          padding: "3px 14px",
          fontSize: 12,
          lineHeight: "18px",
          // depth bar: cumulative size, drawn from the right like an exchange book
          backgroundImage: `linear-gradient(to left, ${ask ? "var(--depth-ask)" : "var(--depth-bid)"} ${(l.cumWeth / maxCum) * 100}%, transparent 0)`,
          boxShadow: shadows || undefined,
        }}
      >
        <span className="text-left" style={{ fontWeight: 700, color: ask ? "var(--down-ink)" : "var(--up-ink)" }}>{fx(l.price, 2)}</span>
        <span style={{ color: "var(--text-2)" }}>{fx(l.size, 4)}</span>
        <span style={{ color: "var(--text-2)" }}>{fx(l.cumWeth, 3)}</span>
      </button>
    );
  };

  // Footer summary, as an exchange book closes with its buy/sell ratio: how much WETH each side
  // holds across the levels on screen, and where the best quotes sit.
  const bidDepth = bids[bids.length - 1]?.cumWeth ?? 0;
  const askDepth = asks[asks.length - 1]?.cumWeth ?? 0;
  const bidShare = bidDepth + askDepth > 0 ? bidDepth / (bidDepth + askDepth) : 0.5;
  const rangePct = asks.length ? asks[asks.length - 1].price / mid - 1 : 0;

  return (
    <div className="flex flex-col h-full" style={{ fontVariantNumeric: "tabular-nums" }}>
      <div className="grid px-3.5 py-1.5" style={{ gridTemplateColumns: COLS, gap: 8, fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
        <span>Price · USDC</span>
        <span className="text-right">Size · WETH</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex flex-col">{asks.map((l, i) => row(l, "buy", i)).reverse()}</div>

      <div className="px-3.5 py-2 my-1" style={{ background: "var(--surface-2)", borderTop: "1px solid var(--divider)", borderBottom: "1px solid var(--divider)" }}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display" style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{fx(mid, 2)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>mid · gap {fmtPct(gap)}</span>
        </div>
        {(spreadBuy > 0 || spreadSell > 0) && (
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--honey-ink)", marginTop: 2 }}>
            {spreadBuy > 0 ? `Asks +${fmtPct(spreadBuy)} trend spread` : `Bids −${fmtPct(spreadSell)} trend spread`} · other side free
          </div>
        )}
      </div>

      <div className="flex flex-col">{bids.map((l, i) => row(l, "sell", i))}</div>

      <div className="mt-auto px-3.5 pt-3 pb-3" style={{ borderTop: "1px solid var(--divider)", fontSize: 12 }}>
        <div className="flex items-center gap-2" role="img" aria-label={`Depth on screen: bids ${Math.round(bidShare * 100)}%, asks ${Math.round((1 - bidShare) * 100)}%`}>
          <span style={{ fontWeight: 800, color: "var(--up-ink)" }}>B {Math.round(bidShare * 100)}%</span>
          <span className="flex flex-1 overflow-hidden rounded-full" style={{ height: 6, gap: 2 }} aria-hidden="true">
            <span style={{ width: `${bidShare * 100}%`, background: "var(--up)" }} />
            <span style={{ flex: 1, background: "var(--down)" }} />
          </span>
          <span style={{ fontWeight: 800, color: "var(--down-ink)" }}>{Math.round((1 - bidShare) * 100)}% S</span>
        </div>
        <dl className="grid mt-2.5" style={{ gridTemplateColumns: "auto 1fr", gap: "4px 10px" }}>
          <dt style={{ color: "var(--text-3)" }}>Best bid / ask</dt>
          <dd className="text-right" style={{ fontWeight: 700, color: "var(--text-2)" }}>
            <span style={{ color: "var(--up-ink)" }}>{fx(bestBid, 2)}</span> / <span style={{ color: "var(--down-ink)" }}>{fx(bestAsk, 2)}</span>
          </dd>
          <dt style={{ color: "var(--text-3)" }}>Depth ±{fmtPct(rangePct, 1)}</dt>
          <dd className="text-right" style={{ fontWeight: 700, color: "var(--text-2)" }}>{fx(bidDepth, 2)} / {fx(askDepth, 2)} WETH</dd>
          <dt style={{ color: "var(--text-3)" }}>Trend spread</dt>
          <dd className="text-right" style={{ fontWeight: 700, color: spreadBuy > 0 || spreadSell > 0 ? "var(--honey-ink)" : "var(--up-ink)" }}>
            {spreadBuy > 0 ? `Buy +${fmtPct(spreadBuy)}` : spreadSell > 0 ? `Sell +${fmtPct(spreadSell)}` : "None · both sides free"}
          </dd>
        </dl>
      </div>
    </div>
  );
}
