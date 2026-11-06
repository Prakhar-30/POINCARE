import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { hasDca } from "@/config/contracts";
import type { PoolState } from "@/hooks/usePoolState";
import { useDcaActions } from "@/hooks/useDca";
import { DCA_STATUS_TEXT, DcaParamError, buildOrderParams, planSlice, type DcaOrderInput, type DcaStatus, type Side } from "@/lib/poincare-sdk";
import { fmtNum, fmtPct } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { TxSteps } from "@/components/ui/TxSteps";

/**
 * The DCA ticket: a spread-aware DCA / TWAP order. Each slice is checked ON CHAIN when it runs
 * (PoincareDCA), against the hook's own spread and trend for that block; this form previews the
 * first slice with the same rules (the SDK's planSlice), so what it says is what the contract does.
 */

const INTERVALS = [
  { s: 60, label: "1 min" },
  { s: 300, label: "5 min" },
  { s: 900, label: "15 min" },
  { s: 3600, label: "1 hour" },
  { s: 14_400, label: "4 hours" },
  { s: 86_400, label: "1 day" },
] as const;

const SPREAD_CAPS = [
  { id: "never", label: "Never", bps: 0 },
  { id: "1", label: "≤ 1%", bps: 100 },
  { id: "2.5", label: "≤ 2.5%", bps: 250 },
  { id: "any", label: "Always", bps: 10_000 },
] as const;
type CapId = (typeof SPREAD_CAPS)[number]["id"];

const SLIPPAGE = [0.1, 0.5, 1] as const;
const AMOUNT_RE = /^\d*\.?\d*$/;
const SLICE_OPTIONS = [2, 4, 6, 8, 12, 24] as const;

const toBpsUp = (frac: number) => Math.ceil(frac * 10_000 - 1e-9);
const when = (unixSec: number) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(unixSec * 1000));

export function DcaTicket({ s, side, onSide, payBal, onCreated }: { s: PoolState; side: Side; onSide: (s: Side) => void; payBal: number; onCreated?: () => void }) {
  const { create, busy, stepper } = useDcaActions();
  const [amt, setAmt] = useState(side === "buy" ? "1000" : "0.5");
  const [slices, setSlices] = useState<number>(6);
  const [interval, setIntervalSec] = useState<number>(3600);
  const [cap, setCap] = useState<CapId>("never");
  const [pauseOnTrend, setPause] = useState(false);
  const [catchUp, setCatchUp] = useState(true);
  const [limit, setLimit] = useState("");
  const [slip, setSlip] = useState<number>(0.5);

  const paySym = side === "buy" ? "USDC" : "WETH";
  const getSym = side === "buy" ? "WETH" : "USDC";
  const amtNum = AMOUNT_RE.test(amt) ? Number(amt) : NaN;
  const sideSpread = side === "buy" ? s.spreadZeroForOne : s.spreadOneForZero;
  const otherSpread = side === "buy" ? s.spreadOneForZero : s.spreadZeroForOne;
  const trendWithSide = (s.trend === "up" && side === "buy") || (s.trend === "down" && side === "sell");

  const input: DcaOrderInput = {
    side,
    amount: amt || "0",
    slices,
    interval,
    maxSpreadBps: SPREAD_CAPS.find((c) => c.id === cap)!.bps,
    pauseOnTrend,
    catchUp,
    maxSlippageBps: Math.round(slip * 100),
    limitPrice: limit && Number(limit) > 0 ? limit : undefined,
  };

  // Validate exactly as the contract will, and preview the first slice under this block's regime.
  const plan = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    try {
      const p = buildOrderParams(input, now);
      const first = planSlice(
        {
          id: 0n, owner: "0x0000000000000000000000000000000000000000", recipient: p.recipient, side, zeroForOne: p.zeroForOne,
          pauseOnTrend: p.pauseOnTrend, catchUp: p.catchUp, cancelled: false, maxSpreadBps: p.maxSpreadBps,
          maxSlippageBps: p.maxSlippageBps, slices: p.slices, interval: p.interval, filled: 0, startTime: BigInt(now),
          deadline: p.deadline, lastSlotPlusOne: 0n, amountIn: p.amountIn, remaining: p.amountIn, amountOut: 0n, minPriceWad: p.minPriceWad,
        },
        { now: BigInt(now), spreadBps: toBpsUp(sideSpread), trendWithSide },
      );
      return { ok: true as const, status: first.status as DcaStatus, endsAt: Number(p.deadline), error: null };
    } catch (e) {
      const reason = e instanceof DcaParamError ? e.reason : "invalid";
      return { ok: false as const, status: null, endsAt: 0, error: reason };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, amt, slices, interval, cap, pauseOnTrend, catchUp, limit, slip, sideSpread, trendWithSide]);

  const empty = !(amtNum > 0);
  const insufficient = !empty && amtNum > payBal + 1e-9;
  const disabled = !hasDca || busy || empty || insufficient || !plan.ok;
  const perSlice = amtNum > 0 ? amtNum / slices : 0;

  const cta = !hasDca
    ? "DCA not live yet"
    : busy
      ? "Confirming…"
      : empty
        ? "Enter a budget"
        : insufficient
          ? `Insufficient ${paySym}`
          : !plan.ok
            ? "Check the order"
            : `Start DCA · ${slices} × ${fmtNum(perSlice, paySym === "WETH" ? 4 : 2)} ${paySym}`;

  const switchSide = (next: Side) => {
    if (next === side) return;
    if (amtNum > 0 && s.price > 0) setAmt(next === "sell" ? String(Math.round((amtNum / s.price) * 1e4) / 1e4) : String(Math.round(amtNum * s.price)));
    setLimit("");
    onSide(next);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const id = await create(input);
    if (id !== undefined) onCreated?.();
  }

  const verdict = verdictFor(plan.status, side, sideSpread, otherSpread, catchUp);

  return (
    <>
      <TxSteps stepper={stepper} title={`DCA · ${side === "buy" ? "buying" : "selling"} WETH`} />
      <form onSubmit={onSubmit} noValidate className="flex flex-col flex-1 min-h-0" aria-label="DCA order">
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ gap: 10, padding: "12px 16px 10px" }}>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl p-1" role="group" aria-label="DCA side" style={{ background: "var(--surface-2)" }}>
            {(["buy", "sell"] as const).map((id) => {
              const on = side === id;
              const sp = id === "buy" ? s.spreadZeroForOne : s.spreadOneForZero;
              return (
                <button key={id} type="button" aria-pressed={on} onClick={() => switchSide(id)}
                  className={on ? (id === "buy" ? "btn btn-positive btn-sm" : "btn btn-negative btn-sm") : "btn btn-sm"}
                  style={on ? { minHeight: 36, borderRadius: 8 } : { minHeight: 36, borderRadius: 8, background: "transparent", color: "var(--text-3)", boxShadow: "none", border: "1px solid transparent" }}>
                  <Icon name="arrowRight" size={14} aria-hidden="true" style={{ transform: `rotate(${id === "buy" ? -90 : 90}deg)` }} />
                  <span>{id === "buy" ? "Buy" : "Sell"}<span className="sr-only"> WETH</span></span>
                  {sp > 0 && (
                    <span className="rounded-full px-1.5" style={{ fontSize: 11, fontWeight: 800, background: on ? "rgba(255,255,255,.22)" : "var(--warn-bg)", color: on ? "#fff" : "var(--honey-ink)" }}>
                      +{fmtPct(sp, 1)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="field" style={{ padding: "9px 12px", borderRadius: 12 }}>
            <div className="flex items-center gap-3">
              <label htmlFor="dca-amount" style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", width: 56, flexShrink: 0 }}>Budget</label>
              <input id="dca-amount" value={amt} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="0.00"
                onChange={(e) => setAmt(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, ""))}
                aria-invalid={insufficient} className="flex-1 min-w-0 text-right"
                style={{ background: "transparent", border: "none", fontSize: 16, fontWeight: 800, color: "var(--text)" }} />
              <span className="flex items-center gap-1.5 shrink-0" style={{ fontSize: 13, fontWeight: 800, color: "var(--text-2)" }}>
                <TokenIcon sym={paySym} size={16} />{paySym}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)" }}>
              <span>Avbl <b style={{ color: "var(--text-2)" }}>{fmtNum(payBal, paySym === "WETH" ? 4 : 2)} {paySym}</b></span>
              <span>{perSlice > 0 ? `${fmtNum(perSlice, paySym === "WETH" ? 4 : 2)} ${paySym} per slice` : " "}</span>
            </div>
          </div>

          <div className="grid grid-cols-2" style={{ gap: 8 }}>
            <Pick label="Slices" id="dca-slices" value={String(slices)} onChange={(v) => setSlices(Number(v))}
              options={SLICE_OPTIONS.map((n) => ({ v: String(n), label: `${n} slices` }))} />
            <Pick label="Every" id="dca-every" value={String(interval)} onChange={(v) => setIntervalSec(Number(v))}
              options={INTERVALS.map((i) => ({ v: String(i.s), label: i.label }))} />
          </div>

          <div>
            <div id="dca-cap-label" style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>
              Pay the trend spread
            </div>
            <div className="seg seg-sm" role="group" aria-labelledby="dca-cap-label" style={{ padding: 2 }}>
              {SPREAD_CAPS.map((c) => (
                <button key={c.id} type="button" className="seg-item" aria-pressed={cap === c.id} onClick={() => setCap(c.id)} style={{ whiteSpace: "nowrap" }}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col" style={{ gap: 6 }}>
            <Toggle checked={pauseOnTrend} onChange={setPause} label="Pause while the trend runs with my side" hint="Holds slices during a confirmed trend in your direction; resumes when it ends." />
            <Toggle checked={catchUp} onChange={setCatchUp} label="Catch up skipped slices" hint="Later slices grow so the order still completes by its end time." />
          </div>

          <div className="grid grid-cols-2" style={{ gap: 8 }}>
            <div className="field" style={{ padding: "7px 10px", borderRadius: 12 }}>
              <label htmlFor="dca-limit" style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
                {side === "buy" ? "Max price" : "Min price"} <span style={{ fontWeight: 600 }}>(optional)</span>
              </label>
              <input id="dca-limit" value={limit} inputMode="decimal" autoComplete="off" placeholder={s.price > 0 ? fmtNum(s.price, 0) : "USDC"}
                onChange={(e) => setLimit(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, ""))}
                className="w-full" style={{ background: "transparent", border: "none", fontSize: 14, fontWeight: 800, color: "var(--text)" }} />
            </div>
            <div>
              <div id="dca-slip-label" style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>Slippage per slice</div>
              <div className="flex gap-1" role="group" aria-labelledby="dca-slip-label">
                {SLIPPAGE.map((v) => (
                  <button key={v} type="button" onClick={() => setSlip(v)} aria-pressed={slip === v} className="rounded-md"
                    style={{ fontSize: 12, fontWeight: 800, padding: "2px 8px", minHeight: 28, cursor: "pointer", color: slip === v ? "var(--text)" : "var(--text-3)", background: slip === v ? "var(--surface-2)" : "transparent", border: `1px solid ${slip === v ? "var(--border-strong)" : "transparent"}` }}>
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <dl className="flex flex-col" style={{ gap: 5 }}>
            <Row label="Runs until">{plan.ok ? when(plan.endsAt) : "—"}</Row>
            <Row label={`Receives`}>{getSym}, to your wallet each slice</Row>
            {!plan.ok && plan.error && <Row label="Check" color="var(--down-ink)">{paramHint(plan.error)}</Row>}
          </dl>
        </div>

        <div className="flex flex-col shrink-0" style={{ gap: 8, padding: "10px 16px 14px", borderTop: "1px solid var(--divider)", background: "var(--surface)", borderRadius: "0 0 var(--r-card) var(--r-card)" }}>
          {verdict && (
            <div className="flex gap-2 rounded-lg" role="status" style={{ padding: "8px 10px", background: verdict.bg, border: `1px solid ${verdict.border}` }}>
              <span aria-hidden="true" style={{ color: verdict.ink, marginTop: 1 }}><Icon name={verdict.icon} size={14} /></span>
              <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--text-2)" }}>
                <b style={{ color: verdict.ink }}>First slice · </b>{verdict.text}
              </div>
            </div>
          )}
          <button type="submit" disabled={disabled} aria-busy={busy} className={`btn btn-lg btn-block ${side === "buy" ? "btn-positive" : "btn-negative"}`}>
            {busy && <Icon name="spinner" size={17} className="animate-spin" aria-hidden="true" />}
            {cta}
          </button>
          <p className="text-center" style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.4 }}>
            {hasDca
              ? "A keeper fills each slice on schedule; the contract re-checks your rules every time. Cancel anytime to get the rest back."
              : "The DCA contract is not deployed on this network yet. The preview above already uses the live regime."}
          </p>
        </div>
      </form>
    </>
  );
}

function verdictFor(status: DcaStatus | null, side: Side, sideSpread: number, otherSpread: number, catchUp: boolean) {
  if (!status) return null;
  const who = side === "buy" ? "Buyers" : "Sellers";
  if (status === "ready") {
    return sideSpread > 0
      ? { icon: "wave" as const, ink: "var(--warn-label)", bg: "var(--warn-bg)", border: "var(--warn-border)", text: `fills now, paying the ${fmtPct(sideSpread)} trend spread (your cap allows it).` }
      : { icon: "check" as const, ink: "var(--green-label)", bg: "var(--green-bg)", border: "var(--green-border)", text: otherSpread > 0 ? "fills now, free: your side trades against the trend." : "fills now; no trend spread on either side." };
  }
  if (status === "spread-too-high") {
    return { icon: "pause" as const, ink: "var(--warn-label)", bg: "var(--warn-bg)", border: "var(--warn-border)", text: `waits. ${who} pay ${fmtPct(sideSpread)} while the trend runs; it fills once the spread is within your cap${catchUp ? ", and later slices catch up" : ""}.` };
  }
  if (status === "trend-against") {
    return { icon: "pause" as const, ink: "var(--lav-ink)", bg: "var(--lav-soft)", border: "var(--lav-dim)", text: "paused. A trend runs with your side; slices resume when it ends." };
  }
  return { icon: "target" as const, ink: "var(--lav-ink)", bg: "var(--lav-soft)", border: "var(--lav-dim)", text: DCA_STATUS_TEXT[status] };
}

function paramHint(reason: string): string {
  switch (reason) {
    case "amountIn below slices":
    case "amountIn":
      return "Budget too small for the slice count";
    case "limitPrice":
      return "Limit price must be above zero";
    case "deadline":
      return "End time leaves no room for every slice";
    default:
      return `Invalid ${reason}`;
  }
}

function Pick({ label, id, value, onChange, options }: { label: string; id: string; value: string; onChange: (v: string) => void; options: { v: string; label: string }[] }) {
  return (
    <div className="field" style={{ padding: "7px 10px", borderRadius: 12 }}>
      <label htmlFor={id} style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full"
        style={{ background: "transparent", border: "none", fontSize: 14, fontWeight: 800, color: "var(--text)", cursor: "pointer", outline: "none" }}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} title={hint}
      className="flex items-center justify-between gap-3 text-left" style={{ cursor: "pointer", minHeight: 30 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>{label}</span>
      <span aria-hidden="true" className="shrink-0 rounded-full relative"
        style={{ width: 34, height: 20, background: checked ? "var(--action)" : "var(--track)", transition: "background-color .15s ease-out" }}>
        <span className="absolute rounded-full" style={{ top: 2, left: checked ? 16 : 2, width: 16, height: 16, background: "#fff", boxShadow: "var(--shadow-sm)", transition: "left .15s ease-out" }} />
      </span>
    </button>
  );
}

function Row({ label, color, children }: { label: string; color?: string; children: ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3" style={{ fontSize: 12 }}>
      <dt style={{ color: "var(--text-3)" }}>{label}</dt>
      <dd style={{ color: color ?? "var(--text-2)", fontWeight: 700, textAlign: "right" }}>{children}</dd>
    </div>
  );
}
