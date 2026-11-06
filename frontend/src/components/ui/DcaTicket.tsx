import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { hasDca } from "@/config/contracts";
import type { PoolState } from "@/hooks/usePoolState";
import { useDcaActions } from "@/hooks/useDca";
import {
  DCA_STATUS_TEXT,
  DcaParamError,
  FREQUENCY_LABEL,
  PROTECTION_TEXT,
  buildOrderParams,
  formatAmount,
  planSlice,
  recurringOrder,
  twapOrder,
  type DcaOrderInput,
  type DcaOrderParams,
  type DcaStatus,
  type Frequency,
  type Protection,
  type Side,
} from "@/lib/poincare-sdk";
import { fmtNum, fmtPct } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { TxSteps } from "@/components/ui/TxSteps";

/**
 * The DCA ticket, in the shape exchanges taught users: set up -> review -> confirm.
 *
 *   Set up   a RECURRING buy (amount per buy x frequency x number of buys: Coinbase, Kraken,
 *            Binance Auto-Invest) or a TWAP (one total over a duration: Binance Spot TWAP), plus
 *            a PROTECTION preset, the Poincaré part: may a buy pay the trend spread?
 *   Review   everything that will happen, including the total escrowed, before any signature.
 *
 * Every number here comes from the SDK's builders and planSlice, the same rules PoincareDCA
 * applies on chain, so the preview is what the contract does.
 */

export type DcaPrefill = { kind: "twap"; total: string };

const FREQS: Frequency[] = ["5m", "15m", "1h", "4h", "1d", "1w"];
const COUNTS = [2, 4, 6, 10, 12, 24, 52] as const;
const TWAP_WINDOWS = [
  { s: 1_800, label: "30 min" },
  { s: 3_600, label: "1 hour" },
  { s: 14_400, label: "4 hours" },
  { s: 43_200, label: "12 hours" },
  { s: 86_400, label: "24 hours" },
] as const;
const PROTECTION_ORDER: Protection[] = ["spread-guard", "trend-pause", "always"];
const SLIPPAGE = [0.1, 0.5, 1] as const;
const DEC = /^\d*\.?\d*$/;

const toBpsUp = (frac: number) => Math.ceil(frac * 10_000 - 1e-9);
const when = (unixSec: number | bigint) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(Number(unixSec) * 1000));
const cleanDecimal = (v: string) => v.replace(/,/g, ".").replace(/[^0-9.]/g, "");

export function DcaTicket({
  s, side, onSide, payBal, onCreated, prefill,
}: { s: PoolState; side: Side; onSide: (s: Side) => void; payBal: number; onCreated?: () => void; prefill?: DcaPrefill | null }) {
  const { create, busy, stepper } = useDcaActions();
  const [step, setStep] = useState<"setup" | "review">("setup");
  const [kind, setKind] = useState<"recurring" | "twap">(prefill ? "twap" : "recurring");
  const [perBuy, setPerBuy] = useState(side === "buy" ? "100" : "0.05");
  const [freq, setFreq] = useState<Frequency>("1h");
  const [count, setCount] = useState<number>(10);
  const [total, setTotal] = useState(prefill?.total ?? (side === "buy" ? "1000" : "0.5"));
  const [windowSec, setWindowSec] = useState<number>(14_400);
  const [protection, setProtection] = useState<Protection>("spread-guard");
  const [advanced, setAdvanced] = useState(false);
  const [limit, setLimit] = useState("");
  const [slip, setSlip] = useState<number>(0.5);
  const [catchUp, setCatchUp] = useState(true);

  const paySym = side === "buy" ? "USDC" : "WETH";
  const getSym = side === "buy" ? "WETH" : "USDC";
  const dp = (sym: string) => (sym === "WETH" ? 4 : 2);
  const sideSpread = side === "buy" ? s.spreadZeroForOne : s.spreadOneForZero;
  const trendWithSide = (s.trend === "up" && side === "buy") || (s.trend === "down" && side === "sell");

  const common = { side, protection, limitPrice: limit && Number(limit) > 0 ? limit : undefined, maxSlippageBps: Math.round(slip * 100) };
  const input: DcaOrderInput =
    kind === "recurring"
      ? { ...recurringOrder({ ...common, amountPerBuy: DEC.test(perBuy) && perBuy ? perBuy : "0", frequency: freq, count }), catchUp }
      : { ...twapOrder({ ...common, total: DEC.test(total) && total ? total : "0", durationSec: windowSec }), catchUp };

  // Validate exactly as the contract will, and preview the first buy under this block's regime.
  const plan = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    try {
      const p = buildOrderParams(input, now);
      const first = firstBuy(p, side, now, toBpsUp(sideSpread), trendWithSide);
      return { ok: true as const, p, first, now, error: null };
    } catch (e) {
      return { ok: false as const, p: null, first: null, now, error: e instanceof DcaParamError ? e.reason : "invalid" };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, side, perBuy, freq, count, total, windowSec, protection, limit, slip, catchUp, sideSpread, trendWithSide]);

  const totalNum = plan.ok ? Number(formatAmount(plan.p.amountIn)) : 0;
  const perNum = plan.ok ? totalNum / plan.p.slices : 0;
  const empty = !(totalNum > 0);
  const insufficient = !empty && totalNum > payBal + 1e-9;
  const setupBlocked = empty || insufficient || !plan.ok;

  const setupCta = empty ? "Enter an amount" : insufficient ? `Insufficient ${paySym}` : !plan.ok ? "Check the plan" : "Review plan";

  const switchSide = (next: Side) => {
    if (next === side) return;
    const conv = (v: string) => {
      const n = Number(v);
      if (!(n > 0) || !(s.price > 0)) return v;
      return next === "sell" ? String(Math.round((n / s.price) * 1e5) / 1e5) : String(Math.round(n * s.price));
    };
    setPerBuy(conv(perBuy));
    setTotal(conv(total));
    setLimit("");
    onSide(next);
  };

  async function onConfirm() {
    if (!hasDca || busy || setupBlocked) return;
    const id = await create(input);
    if (id !== undefined) {
      setStep("setup");
      onCreated?.();
    }
  }

  const onSubmitSetup = (e: FormEvent) => {
    e.preventDefault();
    if (!setupBlocked) setStep("review");
  };

  return (
    <>
      <TxSteps stepper={stepper} title={`DCA · ${side === "buy" ? "buying" : "selling"} WETH`} />
      {step === "review" && plan.ok ? (
        <Review
          plan={plan.p} first={plan.first} now={plan.now} side={side} kind={kind} freq={freq} windowSec={windowSec}
          protection={protection} catchUp={catchUp} slip={slip} limit={limit} s={s} perNum={perNum} totalNum={totalNum}
          paySym={paySym} getSym={getSym} busy={busy} onBack={() => setStep("setup")} onConfirm={() => void onConfirm()}
        />
      ) : (
        <form onSubmit={onSubmitSetup} noValidate className="flex flex-col flex-1 min-h-0" aria-label="DCA plan">
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ gap: 10, padding: "12px 16px 10px" }}>
            <SideToggle side={side} s={s} onChange={switchSide} />

            <div className="seg seg-sm w-full" role="group" aria-label="Plan type" style={{ padding: 2 }}>
              <button type="button" className="seg-item" aria-pressed={kind === "recurring"} onClick={() => setKind("recurring")}>Recurring</button>
              <button type="button" className="seg-item" aria-pressed={kind === "twap"} onClick={() => setKind("twap")}>TWAP</button>
            </div>

            {kind === "recurring" ? (
              <>
                <AmountField id="dca-per" label="Each buy" value={perBuy} onChange={setPerBuy} sym={paySym}
                  foot={<>Avbl <b style={{ color: "var(--text-2)" }}>{fmtNum(payBal, dp(paySym))} {paySym}</b></>} />
                <Chips label="Frequency" value={freq} onChange={(v) => setFreq(v as Frequency)}
                  options={FREQS.map((f) => ({ id: f, label: FREQUENCY_LABEL[f].replace("Every ", "") }))} />
                <Chips label="Number of buys" value={String(count)} onChange={(v) => setCount(Number(v))}
                  options={COUNTS.map((n) => ({ id: String(n), label: String(n) }))} />
              </>
            ) : (
              <>
                <AmountField id="dca-total" label="Total" value={total} onChange={setTotal} sym={paySym}
                  foot={<>Avbl <b style={{ color: "var(--text-2)" }}>{fmtNum(payBal, dp(paySym))} {paySym}</b></>} />
                <Chips label="Spread it over" value={String(windowSec)} onChange={(v) => setWindowSec(Number(v))}
                  options={TWAP_WINDOWS.map((w) => ({ id: String(w.s), label: w.label }))} />
              </>
            )}

            <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.45 }}>
              {plan.ok
                ? kind === "recurring"
                  ? <>{fmtNum(totalNum, dp(paySym))} {paySym} in total, {FREQUENCY_LABEL[freq].toLowerCase()}, done by {when(plan.p.deadline)}.</>
                  : <>{plan.p.slices} buys of ≈{fmtNum(perNum, dp(paySym))} {paySym}, one every {Math.round(plan.p.interval / 60)} min, done by {when(plan.p.deadline)}.</>
                : <span style={{ color: "var(--down-ink)", fontWeight: 700 }}>{paramHint(plan.error ?? "")}</span>}
            </p>

            <fieldset>
              <legend style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>Protection from the trend spread</legend>
              <div className="flex flex-col" style={{ gap: 6 }}>
                {PROTECTION_ORDER.map((p) => (
                  <ProtectionCard key={p} id={p} selected={protection === p} onSelect={() => setProtection(p)}
                    now={protectionNow(p, side, sideSpread, trendWithSide)} recommended={p === "spread-guard"} />
                ))}
              </div>
            </fieldset>

            <div>
              <button type="button" className="link-quiet inline-flex items-center gap-1.5" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}
                style={{ fontSize: 12, fontWeight: 800, minHeight: 28 }}>
                <Icon name={advanced ? "minus" : "plus"} size={12} aria-hidden="true" /> Advanced: limit price, slippage, catch-up
              </button>
              {advanced && (
                <div className="flex flex-col" style={{ gap: 8, marginTop: 6 }}>
                  <div className="grid grid-cols-2" style={{ gap: 8 }}>
                    <div className="field" style={{ padding: "7px 10px", borderRadius: 12 }}>
                      <label htmlFor="dca-limit" style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
                        {side === "buy" ? "Max price" : "Min price"} <span style={{ fontWeight: 600 }}>(optional)</span>
                      </label>
                      <input id="dca-limit" value={limit} inputMode="decimal" autoComplete="off" placeholder={s.price > 0 ? fmtNum(s.price, 0) : "USDC"}
                        onChange={(e) => setLimit(cleanDecimal(e.target.value))} className="w-full"
                        style={{ background: "transparent", border: "none", fontSize: 14, fontWeight: 800, color: "var(--text)" }} />
                    </div>
                    <div>
                      <div id="dca-slip-label" style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>Slippage per buy</div>
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
                  <Toggle checked={catchUp} onChange={setCatchUp} label="Catch up skipped buys" hint="Later buys grow so the plan still completes by its end time." />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col shrink-0" style={{ gap: 8, padding: "10px 16px 14px", borderTop: "1px solid var(--divider)", background: "var(--surface)", borderRadius: "0 0 var(--r-card) var(--r-card)" }}>
            <button type="submit" disabled={setupBlocked} className={`btn btn-lg btn-block ${side === "buy" ? "btn-positive" : "btn-negative"}`}>
              {setupCta}
              {!setupBlocked && <Icon name="arrowRight" size={16} aria-hidden="true" />}
            </button>
            <p className="text-center" style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.4 }}>
              {hasDca ? "Nothing is sent until you confirm on the next screen." : "The DCA contract is not deployed on this network yet; you can still plan and review."}
            </p>
          </div>
        </form>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Review

function Review({
  plan, first, now, side, kind, freq, windowSec, protection, catchUp, slip, limit, s, perNum, totalNum, paySym, getSym, busy, onBack, onConfirm,
}: {
  plan: DcaOrderParams; first: DcaStatus; now: number; side: Side; kind: "recurring" | "twap"; freq: Frequency; windowSec: number;
  protection: Protection; catchUp: boolean; slip: number; limit: string; s: PoolState; perNum: number; totalNum: number;
  paySym: string; getSym: string; busy: boolean; onBack: () => void; onConfirm: () => void;
}) {
  const dp = (sym: string) => (sym === "WETH" ? 4 : 2);
  const sideSpread = side === "buy" ? s.spreadZeroForOne : s.spreadOneForZero;
  const start = plan.startTime === 0n ? BigInt(now) : plan.startTime;
  const times = Array.from({ length: Math.min(plan.slices, 3) }, (_, i) => start + BigInt(i * plan.interval));
  const estOut = s.price > 0 ? (side === "buy" ? (totalNum / s.price) * (1 - s.fee) : totalNum * s.price * (1 - s.fee)) : 0;
  const label = kind === "recurring" ? `${FREQUENCY_LABEL[freq]} · ${plan.slices} buys` : `Over ${windowLabel(windowSec)} · ${plan.slices} buys`;
  const firstText =
    first === "ready"
      ? sideSpread > 0 ? `Now, paying the ${fmtPct(sideSpread)} trend spread` : "Now"
      : first === "spread-too-high"
        ? `When the spread clears (${side === "buy" ? "buyers" : "sellers"} pay ${fmtPct(sideSpread)} now)`
        : first === "trend-against"
          ? "When the trend in your direction ends"
          : DCA_STATUS_TEXT[first];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ gap: 10, padding: "12px 16px 10px" }}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="icon-btn icon-btn-plain" aria-label="Back to the plan">
            <Icon name="arrowRight" size={16} aria-hidden="true" style={{ transform: "rotate(180deg)" }} />
          </button>
          <h3 className="font-display" style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Review your plan</h3>
        </div>

        <div className="rounded-xl" style={{ padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 800, color: side === "buy" ? "var(--up-ink)" : "var(--down-ink)" }}>
              <TokenIcon sym="WETH" size={18} /> {side === "buy" ? "Buy" : "Sell"} WETH
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>{label}</span>
          </div>
          <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginTop: 4 }}>
            {fmtNum(totalNum, dp(paySym))} {paySym}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>escrowed now · ≈{fmtNum(perNum, dp(paySym))} {paySym} per buy</div>
        </div>

        <dl className="flex flex-col" style={{ gap: 6 }}>
          <Row label="First buy">{firstText}</Row>
          <Row label="Done by">{when(plan.deadline)}</Row>
          <Row label="Protection">{PROTECTION_TEXT[protection].title}{catchUp ? " · catches up" : ""}</Row>
          <Row label="Limit">{limit && Number(limit) > 0 ? `${side === "buy" ? "Max" : "Min"} ${fmtNum(Number(limit), 2)} USDC/WETH` : "None"}</Row>
          <Row label="Slippage per buy">{slip}%</Row>
          <Row label="Fee per buy">{fmtPct(s.fee)} base fee{protection === "always" ? " + any trend spread" : ""}</Row>
          <Row label={`≈ ${getSym} at today's price`}>{estOut > 0 ? `${fmtNum(estOut, dp(getSym))} ${getSym}` : "—"}</Row>
        </dl>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>Schedule</div>
          <ol className="flex flex-col" style={{ gap: 3, fontSize: 12, color: "var(--text-2)" }}>
            {times.map((t, i) => (
              <li key={i} className="flex justify-between"><span>Buy {i + 1}</span><span>{when(t)}</span></li>
            ))}
            {plan.slices > times.length && <li style={{ color: "var(--text-3)" }}>… and {plan.slices - times.length} more, every {intervalLabel(plan.interval)}</li>}
          </ol>
        </div>

        <p className="rounded-lg" style={{ padding: "8px 10px", fontSize: 12, lineHeight: 1.5, color: "var(--text-2)", background: "var(--lav-soft)", border: "1px solid var(--lav-dim)" }}>
          Your budget is held by the PoincareDCA contract. A keeper submits each buy and the contract re-checks your protection
          every time; skipped buys {catchUp ? "are made up later" : "are not made up"}. Cancel any time to get the rest back.
          Unaudited periphery contract on a testnet.
        </p>
      </div>

      <div className="flex flex-col shrink-0" style={{ gap: 8, padding: "10px 16px 14px", borderTop: "1px solid var(--divider)", background: "var(--surface)", borderRadius: "0 0 var(--r-card) var(--r-card)" }}>
        <button type="button" onClick={onConfirm} disabled={!hasDca || busy} aria-busy={busy} className={`btn btn-lg btn-block ${side === "buy" ? "btn-positive" : "btn-negative"}`}>
          {busy && <Icon name="spinner" size={17} className="animate-spin" aria-hidden="true" />}
          {!hasDca ? "DCA not live yet" : busy ? "Confirming…" : "Confirm & start plan"}
        </button>
        <button type="button" onClick={onBack} className="link-quiet w-full" style={{ fontSize: 12, fontWeight: 800, minHeight: 28 }}>Edit plan</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// pieces

function firstBuy(p: DcaOrderParams, side: Side, now: number, spreadBps: number, trendWithSide: boolean): DcaStatus {
  const start = p.startTime === 0n ? BigInt(now) : p.startTime;
  return planSlice(
    {
      id: 0n, owner: "0x0000000000000000000000000000000000000000", recipient: p.recipient, side, zeroForOne: p.zeroForOne,
      pauseOnTrend: p.pauseOnTrend, catchUp: p.catchUp, cancelled: false, maxSpreadBps: p.maxSpreadBps, maxSlippageBps: p.maxSlippageBps,
      slices: p.slices, interval: p.interval, filled: 0, startTime: start, deadline: p.deadline, lastSlotPlusOne: 0n,
      amountIn: p.amountIn, remaining: p.amountIn, amountOut: 0n, minPriceWad: p.minPriceWad,
    },
    { now: BigInt(now), spreadBps, trendWithSide },
  ).status;
}

/** What a protection preset would do with a buy right now: a short chip, and the reason. */
function protectionNow(p: Protection, side: Side, sideSpread: number, trendWithSide: boolean): { text: string; tone: "good" | "wait"; why?: string } {
  const who = side === "buy" ? "Buyers" : "Sellers";
  if (p === "always") return sideSpread > 0 ? { text: `Pays ${fmtPct(sideSpread)}`, tone: "wait", why: `${who} pay ${fmtPct(sideSpread)} right now.` } : { text: "Buys now", tone: "good" };
  if (sideSpread > 0) return { text: "Waits now", tone: "wait", why: `${who} pay ${fmtPct(sideSpread)} right now.` };
  if (p === "trend-pause" && trendWithSide) return { text: "Waits now", tone: "wait", why: "A trend runs in your direction right now." };
  return { text: "Buys now", tone: "good" };
}

function ProtectionCard({ id, selected, onSelect, now, recommended }: { id: Protection; selected: boolean; onSelect: () => void; now: { text: string; tone: "good" | "wait"; why?: string }; recommended: boolean }) {
  const t = PROTECTION_TEXT[id];
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className="text-left rounded-xl"
      style={{ padding: "8px 10px", cursor: "pointer", background: selected ? "var(--lav-soft)" : "var(--surface)", border: `1px solid ${selected ? "var(--action)" : "var(--border)"}`, transition: "border-color .15s ease-out, background-color .15s ease-out" }}>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0" style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap" }}>
          <span aria-hidden="true" className="shrink-0 rounded-full" style={{ width: 14, height: 14, border: `2px solid ${selected ? "var(--action)" : "var(--border-strong)"}`, background: selected ? "radial-gradient(var(--action) 0 3px, transparent 4px)" : "transparent" }} />
          {t.title}
          {recommended && <span className="rounded-full px-1.5" style={{ fontSize: 10, fontWeight: 800, color: "var(--lav-ink)", background: "var(--surface)", border: "1px solid var(--lav-dim)" }}>Recommended</span>}
        </span>
        <span className="rounded-full px-2 py-0.5 shrink-0" style={{ fontSize: 11, fontWeight: 800, whiteSpace: "nowrap", color: now.tone === "good" ? "var(--up-ink)" : "var(--honey-ink)", background: now.tone === "good" ? "var(--green-bg)" : "var(--warn-bg)" }}>
          {now.text}
        </span>
      </span>
      <span className="block" style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.4, marginTop: 3, paddingLeft: 22 }}>
        {now.why && <b style={{ color: "var(--honey-ink)", fontWeight: 700 }}>{now.why} </b>}
        {t.detail}
      </span>
    </button>
  );
}

function SideToggle({ side, s, onChange }: { side: Side; s: PoolState; onChange: (s: Side) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-xl p-1" role="group" aria-label="DCA side" style={{ background: "var(--surface-2)" }}>
      {(["buy", "sell"] as const).map((id) => {
        const on = side === id;
        const sp = id === "buy" ? s.spreadZeroForOne : s.spreadOneForZero;
        return (
          <button key={id} type="button" aria-pressed={on} onClick={() => onChange(id)}
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
  );
}

function AmountField({ id, label, value, onChange, sym, foot }: { id: string; label: string; value: string; onChange: (v: string) => void; sym: string; foot: ReactNode }) {
  return (
    <div className="field" style={{ padding: "9px 12px", borderRadius: 12 }}>
      <div className="flex items-center gap-3">
        <label htmlFor={id} style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", width: 64, flexShrink: 0 }}>{label}</label>
        <input id={id} value={value} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="0.00"
          onChange={(e) => onChange(cleanDecimal(e.target.value))} className="flex-1 min-w-0 text-right"
          style={{ background: "transparent", border: "none", fontSize: 16, fontWeight: 800, color: "var(--text)" }} />
        <span className="flex items-center gap-1.5 shrink-0" style={{ fontSize: 13, fontWeight: 800, color: "var(--text-2)" }}>
          <TokenIcon sym={sym} size={16} />{sym}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)" }}>{foot}</div>
    </div>
  );
}

function Chips({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[] }) {
  const lid = `chips-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <div id={lid} style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>{label}</div>
      <div className="flex flex-wrap" style={{ gap: 4 }} role="group" aria-labelledby={lid}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button key={o.id} type="button" aria-pressed={on} onClick={() => onChange(o.id)} className="rounded-md"
              style={{ fontSize: 12, fontWeight: 800, padding: "0 10px", minHeight: 30, cursor: "pointer", color: on ? "var(--lav-ink)" : "var(--text-3)", background: on ? "var(--lav-soft)" : "var(--surface-2)", border: `1px solid ${on ? "var(--action)" : "var(--border)"}` }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} title={hint}
      className="flex items-center justify-between gap-3 text-left" style={{ cursor: "pointer", minHeight: 30 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>{label}</span>
      <span aria-hidden="true" className="shrink-0 rounded-full relative" style={{ width: 34, height: 20, background: checked ? "var(--action)" : "var(--track)", transition: "background-color .15s ease-out" }}>
        <span className="absolute rounded-full" style={{ top: 2, left: checked ? 16 : 2, width: 16, height: 16, background: "#fff", boxShadow: "var(--shadow-sm)", transition: "left .15s ease-out" }} />
      </span>
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-3" style={{ fontSize: 12 }}>
      <dt style={{ color: "var(--text-3)" }}>{label}</dt>
      <dd style={{ color: "var(--text-2)", fontWeight: 700, textAlign: "right" }}>{children}</dd>
    </div>
  );
}

function paramHint(reason: string): string {
  switch (reason) {
    case "amountIn below slices":
    case "amountIn":
      return "Enter an amount for the plan.";
    case "limitPrice":
      return "The limit price must be above zero.";
    case "deadline":
      return "The end time leaves no room for every buy.";
    case "interval":
      return "Buys must be at least a minute apart.";
    default:
      return `Check the plan (${reason}).`;
  }
}

const windowLabel = (s: number) => (s >= 3600 ? `${s / 3600} hour${s === 3600 ? "" : "s"}` : `${s / 60} min`);
const intervalLabel = (s: number) => (s % 86_400 === 0 ? `${s / 86_400} day${s === 86_400 ? "" : "s"}` : s % 3600 === 0 ? `${s / 3600} h` : `${Math.round(s / 60)} min`);
