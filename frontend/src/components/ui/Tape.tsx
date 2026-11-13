import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { priceOf, type SwapRow } from "@/lib/db";
import { fmtNum, fmtUsd } from "@/lib/format";
import { isReplayTrader } from "@/config/contracts";

/** Fresh trades get a relative age; anything older (e.g. replayed history, which
 *  carries its historical market date) shows that date instead of "9mo". */
function when(ts?: string) {
  if (!ts) return "now";
  const d = new Date(ts);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 172800) return `${Math.floor(s / 3600)}h`;
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === new Date().getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", year: "2-digit" };
  return d.toLocaleDateString(undefined, opts);
}

const COLS = "44px minmax(0,1fr) minmax(0,1fr) 56px";

export function Tape({
  rows,
  onLoadMore,
  hasMore,
  loadingMore,
  scroll = true,
  maxHeight = 250,
  badge = "live",
  title = "Trade tape",
  actions,
  empty = "No trades yet. Be the first to swap.",
  bare = false,
  fill = false,
}: {
  rows: SwapRow[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  scroll?: boolean;
  maxHeight?: number;
  badge?: string;
  title?: string;
  /** Optional controls rendered in the header, e.g. a filter. */
  actions?: ReactNode;
  empty?: string;
  /** Render without the card and header, for use inside a panel that already has them. */
  bare?: boolean;
  /** Fill the parent's height: only the rows scroll, the footnote and "load more" always show. */
  fill?: boolean;
}) {
  return (
    <section className={[bare ? "" : "card-quiet overflow-hidden", fill ? "flex flex-col h-full min-h-0" : ""].join(" ").trim() || undefined} aria-labelledby={bare ? undefined : "tape-title"} aria-label={bare ? title : undefined}>
      {!bare && <div className="flex justify-between items-center px-5 py-3.5" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="flex items-center gap-3">
          <h2 id="tape-title" style={{ fontSize: 13, fontWeight: 650, color: "var(--text-2)" }}>{title}</h2>
          {actions}
        </div>
        <span className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: "var(--green-label)" }}>
          <span className="anim-pulse-dot" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--up)" }} />
          {badge}
        </span>
      </div>}
      <div role="table" className={fill ? "flex flex-col flex-1 min-h-0" : undefined} aria-labelledby={bare ? undefined : "tape-title"} aria-label={bare ? title : undefined}>
      <div role="row" className="grid px-5 py-2" style={{ gridTemplateColumns: COLS, gap: 10, fontSize: 12, fontWeight: 600, color: "var(--muted)", borderBottom: "1px solid var(--divider-2)" }}>
        <span role="columnheader">Side</span>
        <span role="columnheader" className="text-right">Price</span>
        <span role="columnheader" className="text-right">Size · WETH</span>
        <span role="columnheader" className="text-right">Time</span>
      </div>
      <div
        role="rowgroup"
        className={fill ? "flex-1 min-h-0" : undefined}
        style={fill ? { overflowY: "auto", overscrollBehavior: "contain" } : scroll ? { maxHeight, overflowY: "auto", overscrollBehavior: "contain" } : undefined}
        tabIndex={scroll ? 0 : undefined}
        aria-label={scroll ? "Trade history, scrollable" : undefined}
      >
        {rows.length === 0 && (
          <div role="row" className="px-5 py-6 text-center" style={{ fontSize: 13, color: "var(--muted)" }}>
            <span role="cell">{empty}</span>
          </div>
        )}
        <AnimatePresence initial={false}>
          {rows.map((t) => {
            const buy = t.side === "buy_weth";
            const replay = isReplayTrader(t.trader);
            return (
              <motion.div
                key={t.tx_hash}
                role="row"
                initial={{ opacity: 0, backgroundColor: buy ? "rgba(107,184,154,.16)" : "rgba(229,140,160,.16)" }}
                animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }}
                transition={{ duration: 0.9 }}
                className="grid items-center px-5 py-2"
                style={{ gridTemplateColumns: COLS, gap: 10, fontSize: 12, borderBottom: "1px solid var(--divider-2)" }}
              >
                <span role="cell" style={{ color: buy ? "var(--up-ink)" : "var(--down-ink)", fontWeight: 650 }}>{buy ? "Buy" : "Sell"}</span>
                <span role="cell" className="text-right truncate" style={{ color: "var(--text-2)", fontWeight: 600 }}>{fmtUsd(priceOf(t))}</span>
                <span role="cell" className="text-right truncate" style={{ color: "var(--text-3)" }}>{fmtNum(buy ? t.amount_out : t.amount_in, 3)}</span>
                <span
                  role="cell"
                  className="text-right"
                  title={replay ? "Original trade time" : "Live trade, execution time"}
                  style={{ color: replay ? "var(--lav-ink)" : "var(--green-label)", fontSize: 12, fontWeight: 700 }}
                >
                  <span aria-hidden="true">{replay ? "◦ " : "• "}</span>{when(t.ts)}
                  <span className="sr-only">{replay ? " (original trade time)" : " (live trade)"}</span>
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      </div>

      {rows.some((t) => isReplayTrader(t.trader)) && (
        <div className="px-5 py-2 shrink-0 flex flex-wrap gap-x-4 gap-y-1" style={{ fontSize: 12, lineHeight: 1.5, color: "var(--muted)", borderTop: "1px solid var(--divider-2)" }}>
          {rows.some((t) => !isReplayTrader(t.trader)) && (
            <span><span style={{ color: "var(--green-label)", fontWeight: 700 }} aria-hidden="true">•</span> Live trade, at its execution time.</span>
          )}
          <span><span style={{ color: "var(--lav-ink)", fontWeight: 600 }} aria-hidden="true">◦</span> Earlier market activity, shown at its original trade time.</span>
        </div>
      )}

      {onLoadMore && rows.length > 0 && (hasMore || loadingMore) && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          aria-busy={loadingMore}
          className="tape-more w-full text-center font-bold shrink-0"
          style={{
            minHeight: 44,
            fontSize: 13,
            color: "var(--lav-ink)",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--divider)",
          }}
        >
          {loadingMore ? "Loading…" : "Load more history"}
        </button>
      )}
    </section>
  );
}
