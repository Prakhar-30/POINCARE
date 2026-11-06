import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { hasDca } from "@/config/contracts";
import { useDcaActions, useDcaOrders, type DcaOrderWithNext } from "@/hooks/useDca";
import {
  DcaParamError,
  FREQUENCIES,
  FREQUENCY_LABEL,
  PROTECTIONS,
  PROTECTION_TEXT,
  buildEditParams,
  formatAmount,
  progressOf,
  spentOf,
  type DcaEditInput,
  type DcaStatus,
  type Frequency,
  type Protection,
} from "@/lib/poincare-sdk";
import { fmtNum } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Chips, paramHint } from "@/components/ui/DcaTicket";

/** The connected wallet's DCA plans: progress, average price, the contract's verdict on the next
 *  fill, and the owner's controls (pause / resume, edit, cancel, refund). `startLink` adds a way
 *  into the DCA ticket (used off the Trade screen). */
export function DcaOrders({ maxHeight, startLink }: { maxHeight?: number; startLink?: boolean }) {
  const q = useDcaOrders();
  const actions = useDcaActions();
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
        <OrderRow key={o.id.toString()} o={o} actions={actions} />
      ))}
    </ul>
  );
}

type Actions = ReturnType<typeof useDcaActions>;
type Mode = "view" | "confirm-cancel" | "edit";

function OrderRow({ o, actions }: { o: DcaOrderWithNext; actions: Actions }) {
  const [mode, setMode] = useState<Mode>("view");
  const inSym = o.side === "buy" ? "USDC" : "WETH";
  const outSym = o.side === "buy" ? "WETH" : "USDC";
  const dp = (sym: string) => (sym === "WETH" ? 4 : 2);
  const noun = o.side === "buy" ? "buys" : "sells";
  const progress = progressOf(o);
  const status = o.next.status;
  const open = !o.cancelled && o.remaining > 0n;
  const live = open && status !== "expired";
  // An order closed by a refund reads "filled" on chain (nothing left); say what happened instead.
  const refundedEnd = !o.cancelled && o.remaining === 0n && o.refunded > 0n;
  const tone = refundedEnd ? STATUS_TONE.expired : STATUS_TONE[status];
  const label = refundedEnd ? "Refunded" : STATUS_LABEL[status];
  // fills before the latest edit + the current schedule = the plan as it stands now
  const planned = o.filled - o.scheduleFilled + o.slices;
  const left = `${fmtNum(Number(formatAmount(o.remaining)), dp(inSym))} ${inSym}`;
  const busy = actions.busy;

  return (
    <li className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--divider-2)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)" }}>#{o.id.toString()}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: o.side === "buy" ? "var(--up-ink)" : "var(--down-ink)" }}>
            {o.side === "buy" ? "Buy" : "Sell"} WETH
          </span>
        </span>
        <span className="rounded-full px-2 py-0.5 shrink-0" style={{ fontSize: 11, fontWeight: 800, color: tone.ink, background: tone.bg }}>
          {label}
        </span>
      </div>

      <div className="mt-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={`Order ${o.id} filled`}
        style={{ height: 5, borderRadius: 3, background: "var(--track)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress > 0 ? Math.max(2, progress * 100) : 0}%`, background: o.side === "buy" ? "var(--up)" : "var(--down)" }} />
      </div>

      <div className="mt-1.5" style={{ fontSize: 12, color: "var(--text-3)" }}>
        {o.filled}/{planned} {noun} · {open
          ? <><b style={{ color: "var(--text-2)" }}>{left}</b> left</>
          : o.refunded > 0n
            ? <><b style={{ color: "var(--text-2)" }}>{fmtNum(Number(formatAmount(o.refunded)), dp(inSym))} {inSym}</b> refunded</>
            : <>all {fmtNum(Number(formatAmount(o.amountIn)), dp(inSym))} {inSym} {o.side === "buy" ? "spent" : "sold"}</>}
        {o.amountOut > 0n && <> · got {fmtNum(Number(formatAmount(o.amountOut)), dp(outSym))} {outSym}</>}
        {avgPrice(o) > 0 && <> · avg {fmtNum(avgPrice(o), 2)}</>}
      </div>
      {live && mode === "view" && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{nextText(o)}</div>}

      {mode === "edit" && live && (
        <EditPlan o={o} busy={busy} onClose={() => setMode("view")} onSave={async (input) => {
          if (await actions.edit(o, input)) setMode("view");
        }} />
      )}

      {mode === "confirm-cancel" && live && (
        <div role="group" aria-label={`Cancel order ${o.id}`} className="rounded-lg mt-2" style={{ padding: "8px 10px", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.45 }}>
            Cancel plan #{o.id.toString()}? The <b>{left}</b> not yet {o.side === "buy" ? "spent" : "sold"} returns to your wallet. This can't be undone.
          </p>
          <div className="flex items-center justify-end gap-2 mt-2">
            <AutoFocusButton className="btn btn-sm btn-secondary" onClick={() => setMode("view")} disabled={busy}>Keep plan</AutoFocusButton>
            <button type="button" className="btn btn-sm btn-negative" disabled={busy} aria-busy={busy}
              onClick={() => void actions.cancel(o.id).then(() => setMode("view"))}>
              {busy && <Icon name="spinner" size={14} className="animate-spin" aria-hidden="true" />}
              Cancel &amp; refund
            </button>
          </div>
        </div>
      )}

      {mode === "view" && (open || status === "expired") && (
        <div className="flex flex-wrap items-center justify-end gap-1 mt-1">
          {status === "expired" && o.remaining > 0n && (
            <RowAction icon="check" onClick={() => void actions.refund(o.id)} disabled={busy}>Refund {left}</RowAction>
          )}
          {live && (
            <>
              {o.paused ? (
                <RowAction icon="play" onClick={() => void actions.resume(o.id)} disabled={busy}>Resume</RowAction>
              ) : (
                <RowAction icon="pause" onClick={() => void actions.pause(o.id)} disabled={busy}>Pause</RowAction>
              )}
              <RowAction icon="target" onClick={() => setMode("edit")} disabled={busy}>Edit</RowAction>
              <RowAction icon="close" onClick={() => setMode("confirm-cancel")} disabled={busy}>Cancel</RowAction>
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// Edit: re-plan what is left, the way the contract's editOrder does

const FREQS: Frequency[] = ["5m", "15m", "1h", "4h", "1d", "1w"];
const PROTECTION_ORDER: Protection[] = ["spread-guard", "trend-pause", "always"];

function protectionOf(o: DcaOrderWithNext): Protection | null {
  for (const p of PROTECTION_ORDER) {
    if (PROTECTIONS[p].maxSpreadBps === o.maxSpreadBps && PROTECTIONS[p].pauseOnTrend === o.pauseOnTrend) return p;
  }
  return null; // set to something custom through the SDK / API; kept as is unless changed here
}

function EditPlan({ o, busy, onClose, onSave }: { o: DcaOrderWithNext; busy: boolean; onClose: () => void; onSave: (i: DcaEditInput) => Promise<void> }) {
  const inSym = o.side === "buy" ? "USDC" : "WETH";
  const dp = inSym === "WETH" ? 4 : 2;
  const noun = o.side === "buy" ? "buys" : "sells";
  const freqNow = (Object.keys(FREQUENCIES) as Frequency[]).find((f) => FREQUENCIES[f] === o.interval) ?? null;
  const [count, setCount] = useState(String(Math.max(1, o.slices - o.scheduleFilled)));
  const [freq, setFreq] = useState<Frequency | null>(freqNow);
  const [protection, setProtection] = useState<Protection | null>(protectionOf(o));
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const input: DcaEditInput = {
    slices: /^\d+$/.test(count) ? Number(count) : 0,
    interval: freq ? FREQUENCIES[freq] : o.interval,
    ...(protection ? { maxSpreadBps: PROTECTIONS[protection].maxSpreadBps, pauseOnTrend: PROTECTIONS[protection].pauseOnTrend } : {}),
  };
  const check = useMemo(() => {
    try {
      return { ok: true as const, p: buildEditParams(o, input) };
    } catch (e) {
      return { ok: false as const, reason: e instanceof DcaParamError ? e.reason : "invalid" };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o, count, freq, protection]);
  const per = check.ok ? Number(formatAmount(o.remaining)) / check.p.slices : 0;
  const ends = check.ok ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(Number(check.p.deadline) * 1000)) : "";

  return (
    <form className="flex flex-col rounded-lg mt-2" style={{ gap: 8, padding: "10px", background: "var(--surface-2)", border: "1px solid var(--border)" }}
      aria-label={`Edit order ${o.id}`} noValidate
      onSubmit={(e) => { e.preventDefault(); if (check.ok && !busy) void onSave(input); }}>
      <p style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.45 }}>
        Re-plan the <b>{fmtNum(Number(formatAmount(o.remaining)), dp)} {inSym}</b> left, starting now. Side and budget stay the same
        {o.paused ? "; the plan stays paused until you resume it" : ""}.
      </p>

      <div className="field flex items-center gap-3" style={{ padding: "7px 10px", borderRadius: 12, background: "var(--surface)", borderColor: !check.ok && check.reason !== "invalid" && /slices/.test(check.reason) ? "var(--negative)" : undefined }}>
        <label htmlFor={`edit-count-${o.id}`} style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", flex: 1 }}>Number of {noun} left</label>
        <input ref={first} id={`edit-count-${o.id}`} value={count} inputMode="numeric" autoComplete="off" onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 5))}
          className="text-right" style={{ width: 72, background: "transparent", border: "none", fontSize: 15, fontWeight: 800, color: "var(--text)" }} />
      </div>

      <Chips label={freqNow || freq ? "Frequency" : `Frequency (now every ${Math.round(o.interval / 60)} min)`} value={freq ?? ""}
        onChange={(v) => setFreq(v as Frequency)} options={FREQS.map((f) => ({ id: f, label: FREQUENCY_LABEL[f].replace("Every ", "") }))} />

      <Chips label={protection ? `Protection: ${PROTECTION_TEXT[protection].title}` : "Protection (now custom)"} value={protection ?? ""}
        onChange={(v) => setProtection(v as Protection)} options={PROTECTION_ORDER.map((p) => ({ id: p, label: PROTECTION_TEXT[p].title }))} />

      <p aria-live="polite" style={{ fontSize: 12, lineHeight: 1.45, color: check.ok ? "var(--text-3)" : "var(--down-ink)", fontWeight: check.ok ? 400 : 700 }}>
        {check.ok
          ? `${check.p.slices} ${noun} of ≈${fmtNum(per, dp)} ${inSym}, ${freq ? FREQUENCY_LABEL[freq].toLowerCase() : `every ${Math.round(o.interval / 60)} min`}, done by ${ends}.`
          : paramHint(check.reason)}
      </p>

      <div className="flex items-center justify-end gap-2">
        <button type="button" className="btn btn-sm btn-secondary" onClick={onClose} disabled={busy}>Discard</button>
        <button type="submit" className="btn btn-sm btn-primary" disabled={!check.ok || busy} aria-busy={busy}>
          {busy && <Icon name="spinner" size={14} className="animate-spin" aria-hidden="true" />}
          Save changes
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// pieces

function RowAction({ icon, children, ...rest }: { icon: "play" | "pause" | "target" | "close" | "check"; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="link-quiet inline-flex items-center gap-1 rounded-md" {...rest}
      style={{ fontSize: 12, fontWeight: 800, minHeight: 32, padding: "0 8px" }}>
      <Icon name={icon} size={12} aria-hidden="true" /> {children}
    </button>
  );
}

/** The safe choice of a confirmation takes focus, so Enter never confirms by accident. */
function AutoFocusButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return <button ref={ref} type="button" {...props} />;
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
  "trend-against": "Held · trend",
  "below-limit": "Held · limit",
  paused: "Paused",
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
  paused: { ink: "var(--text-2)", bg: "var(--surface-2)" },
};

/** Average executed price, USDC per WETH, over the fills so far (what exchanges show per plan). */
function avgPrice(o: DcaOrderWithNext): number {
  const spent = Number(formatAmount(spentOf(o)));
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
  const one = o.side === "buy" ? "buy" : "sell";
  switch (n.status) {
    case "ready":
      return `Next ${one} is due; the keeper fills it within a minute.`;
    case "waiting-for-slot":
      return n.nextSlotAt > 0n ? `Next ${one} ${relative(n.nextSlotAt)}.` : "No slot left before the end time.";
    case "not-started":
      return `Starts ${relative(n.nextSlotAt)}.`;
    case "spread-too-high":
      return `Held: this side pays ${(n.spreadBps / 100).toFixed(2)}%, above your cap. Fills when it drops${o.catchUp ? "; later ones catch up" : ""}.`;
    case "trend-against":
      return "Held: a trend runs with this side. Continues when it ends.";
    case "below-limit":
      return "Held: the pool price is beyond your limit.";
    case "paused":
      return `Paused by you. Nothing fills until you resume${o.catchUp ? "; missed ones are made up before the end time" : ""}.`;
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
