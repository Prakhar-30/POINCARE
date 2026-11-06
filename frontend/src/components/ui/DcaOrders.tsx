import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { hasDca } from "@/config/contracts";
import { useDcaActions, useDcaOrders, type DcaOrderWithNext } from "@/hooks/useDca";
import { formatAmount, progressOf, type DcaStatus } from "@/lib/poincare-sdk";
import { fmtNum } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";

/** The connected wallet's DCA plans: progress, average price, the contract's verdict on the next
 *  buy, cancel / refund. `startLink` adds a way into the DCA ticket (used off the Trade screen). */
export function DcaOrders({ maxHeight, startLink }: { maxHeight?: number; startLink?: boolean }) {
  const q = useDcaOrders();
  const { cancel, refund, busy } = useDcaActions();
  const start = startLink ? (
    <Link to={{ search: "?tab=trade&mode=dca" }} onClick={() => window.scrollTo({ top: 0 })} className="btn btn-soft btn-sm" style={{ marginTop: 10 }}>
      <Icon name="layers" size={14} aria-hidden="true" /> Start a DCA plan
    </Link>
  ) : null;

  if (!hasDca) {
    return <Empty action={start}>DCA goes live once its contract is deployed on this network. You can already plan one on the Trade screen.</Empty>;
  }
  if (q.isLoading) return <Empty>Loading your DCA plans…</Empty>;
  if (q.isError) return <Empty>Couldn't read your plans. Retrying…</Empty>;
  const orders = q.data ?? [];
  if (!orders.length) {
    return <Empty action={start}>No DCA plans yet. Buy or sell on a schedule, and skip the trend spread while you do.</Empty>;
  }

  return (
    <ul className="overflow-y-auto" style={{ maxHeight }} aria-label="Your DCA orders">
      {orders.map((o) => (
        <OrderRow key={o.id.toString()} o={o} busy={busy} onCancel={() => void cancel(o.id)} onRefund={() => void refund(o.id)} />
      ))}
    </ul>
  );
}

function OrderRow({ o, busy, onCancel, onRefund }: { o: DcaOrderWithNext; busy: boolean; onCancel: () => void; onRefund: () => void }) {
  const inSym = o.side === "buy" ? "USDC" : "WETH";
  const outSym = o.side === "buy" ? "WETH" : "USDC";
  const dp = (sym: string) => (sym === "WETH" ? 4 : 2);
  const progress = progressOf(o);
  const status = o.next.status;
  const live = !["filled", "cancelled", "expired"].includes(status);
  const tone = STATUS_TONE[status];

  return (
    <li className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--divider-2)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>#{o.id.toString()}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: o.side === "buy" ? "var(--up-ink)" : "var(--down-ink)" }}>
            {o.side === "buy" ? "Buy" : "Sell"} WETH
          </span>
        </span>
        <span className="rounded-full px-2 py-0.5 shrink-0" style={{ fontSize: 11, fontWeight: 800, color: tone.ink, background: tone.bg }} title={nextText(o)}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="mt-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={`Order ${o.id} filled`}
        style={{ height: 5, borderRadius: 3, background: "var(--track)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(2, progress * 100)}%`, background: o.side === "buy" ? "var(--up)" : "var(--down)" }} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-1.5" style={{ fontSize: 12, color: "var(--text-3)" }}>
        <span>
          {o.filled}/{o.slices} fills · <b style={{ color: "var(--text-2)" }}>{fmtNum(Number(formatAmount(o.remaining)), dp(inSym))} {inSym}</b> left
          {o.amountOut > 0n && <> · got {fmtNum(Number(formatAmount(o.amountOut)), dp(outSym))} {outSym}</>}
          {avgPrice(o) > 0 && <> · avg {fmtNum(avgPrice(o), 2)}</>}
        </span>
        <span className="flex items-center gap-2">
          {status === "expired" && o.remaining > 0n && (
            <button type="button" className="link-quiet" onClick={onRefund} disabled={busy} style={{ fontSize: 12, fontWeight: 800, minHeight: 24 }}>
              Refund
            </button>
          )}
          {live && (
            <button type="button" className="link-quiet inline-flex items-center gap-1" onClick={onCancel} disabled={busy} style={{ fontSize: 12, fontWeight: 800, minHeight: 24 }}>
              <Icon name="close" size={12} aria-hidden="true" /> Cancel
            </button>
          )}
        </span>
      </div>
      {live && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{nextText(o)}</div>}
    </li>
  );
}

const STATUS_LABEL: Record<DcaStatus, string> = {
  ready: "Due now",
  unknown: "Unknown",
  cancelled: "Cancelled",
  filled: "Complete",
  expired: "Expired",
  "not-started": "Scheduled",
  "waiting-for-slot": "Running",
  "spread-too-high": "Held · spread",
  "trend-against": "Paused · trend",
  "below-limit": "Held · limit",
};

const STATUS_TONE: Record<DcaStatus, { ink: string; bg: string }> = {
  ready: { ink: "var(--up-ink)", bg: "var(--green-bg)" },
  unknown: { ink: "var(--text-3)", bg: "var(--surface-2)" },
  cancelled: { ink: "var(--text-3)", bg: "var(--surface-2)" },
  filled: { ink: "var(--up-ink)", bg: "var(--green-bg)" },
  expired: { ink: "var(--down-ink)", bg: "var(--surface-2)" },
  "not-started": { ink: "var(--lav-ink)", bg: "var(--lav-soft)" },
  "waiting-for-slot": { ink: "var(--lav-ink)", bg: "var(--lav-soft)" },
  "spread-too-high": { ink: "var(--honey-ink)", bg: "var(--warn-bg)" },
  "trend-against": { ink: "var(--honey-ink)", bg: "var(--warn-bg)" },
  "below-limit": { ink: "var(--honey-ink)", bg: "var(--warn-bg)" },
};

/** Average executed price, USDC per WETH, over the buys so far (what exchanges show per plan). */
function avgPrice(o: DcaOrderWithNext): number {
  const spent = Number(formatAmount(o.amountIn - o.remaining));
  const got = Number(formatAmount(o.amountOut));
  if (!(spent > 0) || !(got > 0)) return 0;
  return o.side === "buy" ? spent / got : got / spent;
}

function relative(unixSec: bigint): string {
  const s = Number(unixSec) - Math.floor(Date.now() / 1000);
  if (s <= 0) return "now";
  if (s < 90) return `in ${s}s`;
  if (s < 5400) return `in ${Math.round(s / 60)} min`;
  if (s < 129_600) return `in ${Math.round(s / 3600)} h`;
  return `in ${Math.round(s / 86_400)} d`;
}

function nextText(o: DcaOrderWithNext): string {
  const n = o.next;
  switch (n.status) {
    case "ready":
      return "Next slice is due; the keeper fills it within a minute.";
    case "waiting-for-slot":
      return n.nextSlotAt > 0n ? `Next slice ${relative(n.nextSlotAt)}.` : "No slot left before the end time.";
    case "not-started":
      return `Starts ${relative(n.nextSlotAt)}.`;
    case "spread-too-high":
      return `Held: this side pays ${(n.spreadBps / 100).toFixed(2)}%, above your cap. Fills when it drops${o.catchUp ? "; later slices catch up" : ""}.`;
    case "trend-against":
      return "Paused: a trend runs with this side. Resumes when it ends.";
    case "below-limit":
      return "Held: the pool price is beyond your limit.";
    default:
      return "";
  }
}

function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center" style={{ padding: "26px 18px", textAlign: "center" }}>
      <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.5, maxWidth: 360 }}>{children}</p>
      {action}
    </div>
  );
}
