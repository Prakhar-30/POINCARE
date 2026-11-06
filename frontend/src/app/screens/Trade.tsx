import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccount } from "wagmi";
import { usePoolState, type PoolState } from "@/hooks/usePoolState";
import { useBalances } from "@/hooks/useBalances";
import { useSwap, useFaucet } from "@/hooks/useSwap";
import { useTradeQuote, type TradeQuote } from "@/hooks/useQuote";
import { useOnchainTape } from "@/hooks/useOnchainTape";
import { useDetectorSeries } from "@/hooks/useDetectorSeries";
import { useDetectorConfig } from "@/hooks/useDetectorConfig";
import { riskOf, type RiskState } from "@/lib/analytics";
import { fromWei, legsOf, toWei } from "@/lib/units";
import { fmtNum, fmtUsd, fmtPct } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Skel } from "@/components/ui/Skeleton";
import { Tape } from "@/components/ui/Tape";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { PoolChart } from "@/components/ui/PoolChart";
import { TxSteps } from "@/components/ui/TxSteps";
import { CurveDepth, depthOf } from "@/components/ui/CurveDepth";
import { useIsNarrow, useIsTablet, useMediaQuery } from "@/hooks/useMediaQuery";
import { useParam } from "@/hooks/useParam";
import { DcaTicket, type DcaPrefill } from "@/components/ui/DcaTicket";
import { track } from "@/lib/telemetry";
import { DcaOrders } from "@/components/ui/DcaOrders";

/**
 * The Trade screen as an exchange terminal: ticker bar, chart, book, ticket - the layout every
 * CeFi trader already reads without thinking - sized to the viewport on desktop so the ticket's
 * button is never below the fold.
 *
 * The hook's behaviour is placed where the eye already goes on an exchange:
 *   - the ticker bar carries the detector state and what each side costs this block;
 *   - the book is modelled from the curve, so a detected trend shows as one side of the book
 *     stepping away from the mid - the directional spread drawn as an exchange would draw it;
 *   - the ticket ends with a one-line "hook check" right above the button.
 *
 * Side and amount live in the URL (`?tab=trade&side=sell&amt=2`) so a link carries a trade.
 */

const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0] as const; // %
const DEFAULT_AMT = "1000";
const AMOUNT_RE = /^\d*\.?\d*$/;
/** Pure price impact above this asks for an explicit acknowledgement before trading. */
const IMPACT_WARN = 0.01;
const BOOK_STEPS = [0.001, 0.005] as const;

type Side = "buy" | "sell";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
/** Plain digits normally; compact (1.2M, 3.5B) once a figure would overflow the ticket. */
const big = (n: number, dp: number) => (Math.abs(n) >= 1e6 ? compact.format(n) : fmtNum(n, dp));
const bigUsd = (n: number) => (Math.abs(n) >= 1e6 ? fmtUsd(n, { compact: true }) : fmtUsd(n, { dp: 2 }));
/** Impact past 100% is a number nobody can act on; say so instead. */
const fmtImpact = (f: number) => (f > 1 ? ">100%" : fmtPct(f));

function useTradeParams() {
  const [params, setParams] = useSearchParams();
  const side: Side = params.get("side") === "sell" ? "sell" : "buy";
  const fromUrl = params.get("amt");
  const [amt, setAmt] = useState(fromUrl !== null && fromUrl !== "" && AMOUNT_RE.test(fromUrl) ? fromUrl : DEFAULT_AMT);

  const write = (key: string, v: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v === null) next.delete(key);
        else next.set(key, v);
        return next;
      },
      { replace: true },
    );

  // Mirrored after a pause rather than per keystroke, and never with an invalid amount.
  useEffect(() => {
    if (!AMOUNT_RE.test(amt)) return;
    const t = setTimeout(() => write("amt", amt === DEFAULT_AMT || amt === "" ? null : amt), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amt]);

  const setSide = (v: Side) => write("side", v === "buy" ? null : "sell");
  return { side, setSide, amt, setAmt };
}

/** Measured size of an element, through a callback ref so it survives layout switches. */
function useBox<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, box] as const;
}

/** Height from an element's top to the bottom of the viewport, so the terminal fits one screen. */
function useFillHeight() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [h, setH] = useState(0);
  const measure = useCallback(() => {
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    setH(Math.max(520, window.innerHeight - top - 16));
  }, [el]);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  return [setEl, h] as const;
}

export function Trade() {
  const s = usePoolState();
  const cfg = useDetectorConfig();
  const series = useDetectorSeries();
  const bal = useBalances();
  const { address } = useAccount();
  const { swap, status, stepper, reset } = useSwap();
  const faucet = useFaucet();
  const tape = useOnchainTape();
  const narrow = useIsNarrow();
  const tablet = useIsTablet();
  const wide = useMediaQuery("(min-width: 1280px)");

  const last = series.points[series.points.length - 1];
  const risk = riskOf({
    sPos: last?.s_pos ?? 0,
    sNeg: last?.s_neg ?? 0,
    threshold: cfg.h,
    d: last?.d ?? s.directionalEfficiency,
    dFloor: cfg.dFloor,
    kappa: last?.kappa ?? s.kappa,
  });

  // ---- layout measurement ----
  const [fillRef, fillH] = useFillHeight();
  const [chartRef, chartBox] = useBox<HTMLDivElement>();
  const [panelRef, panelBox] = useBox<HTMLDivElement>();

  // ---- the ticket ----
  const { side, setSide, amt, setAmt: setAmtRaw } = useTradeParams();
  const [mode, setMode] = useParam("mode", ["market", "dca"] as const, "market");
  // Set when the market ticket hands an order to DCA ("skip the spread"); seeds a TWAP of that amount.
  const [dcaPrefill, setDcaPrefill] = useState<DcaPrefill | null>(null);
  // The book level the ticket was filled from; any manual edit of the order clears it.
  const [bookSel, setBookSel] = useState<{ side: Side; idx: number } | null>(null);
  const setAmt = (v: string) => {
    setBookSel(null);
    setAmtRaw(v);
  };
  const [slip, setSlip] = useState<number>(0.5); // %, a personal setting: deliberately not in the URL
  const [impactAck, setImpactAck] = useState(false);

  const invalid = !AMOUNT_RE.test(amt);
  const zeroForOne = side === "buy"; // currency0 = USDC: buying WETH pays USDC
  const spread = zeroForOne ? s.spreadZeroForOne : s.spreadOneForZero;
  const q = useTradeQuote(s, invalid ? "" : amt, zeroForOne);

  // minOut in wei, from the wei-exact Lens quote when available (real slippage
  // protection); the float model only backstops older deployments.
  const { outSym } = legsOf(zeroForOne);
  const slipBps = BigInt(Math.round(slip * 100));
  const minOutWei =
    q.outWei !== null ? (q.outWei * (10_000n - slipBps)) / 10_000n : toWei(q.out * (1 - slip / 100), outSym);
  const minOut = fromWei(minOutWei, outSym);

  const paySym = zeroForOne ? "USDC" : "WETH";
  const getSym = zeroForOne ? "WETH" : "USDC";
  const payBal = zeroForOne ? bal.usdc : bal.weth;
  const amtNum = invalid ? 0 : Number(amt);
  const insufficient = amtNum > payBal + 1e-9;

  const outText = q.out > 0 ? big(q.out, getSym === "WETH" ? 5 : 2) : "0";
  const outRef = useRef(outText);
  outRef.current = outText;
  const [spokenOut, setSpokenOut] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSpokenOut(outRef.current === "0" ? "" : outRef.current), 900);
    return () => clearTimeout(t);
  }, [amt, side]);

  // Price impact on its own, without the fee and spread the executed price also carries.
  const mid = s.price;
  const cpPrice = q.baseOut > 0 && amtNum > 0 ? (zeroForOne ? amtNum / q.baseOut : q.baseOut / amtNum) : 0;
  const pureImpact = mid > 0 && cpPrice > 0 ? Math.abs(cpPrice - mid) / mid : 0;
  const highImpact = pureImpact > IMPACT_WARN;
  useEffect(() => setImpactAck(false), [amt, side]);

  const busy = status === "busy";
  const empty = invalid || !amt || amtNum <= 0;
  const disabled = busy || empty || q.out <= 0 || insufficient || (highImpact && !impactAck);
  // With nothing to trade, the faucet is the next step, so it takes the primary slot.
  const faucetFirst = payBal < 1 && insufficient;

  const round = (v: number, sym: string) => {
    const f = sym === "WETH" ? 1e6 : 1e2;
    return String(Math.floor(v * f) / f);
  };
  const pct = payBal > 0 && amtNum > 0 ? Math.min(100, (amtNum / payBal) * 100) : 0;
  // Switching side keeps the amount's value rather than its digits.
  const switchSide = (next: Side) => {
    if (next === side) return;
    setBookSel(null);
    if (!invalid && amtNum > 0 && mid > 0) {
      setAmt(next === "sell" ? String(Math.round((amtNum / mid) * 1e4) / 1e4) : String(Math.round(amtNum * mid)));
    }
    setSide(next);
  };
  const pickLevel = (lvSide: Side, pay: number, idx: number) => {
    setSide(lvSide);
    setAmtRaw(round(pay, lvSide === "buy" ? "USDC" : "WETH"));
    setBookSel({ side: lvSide, idx });
  };

  const verb = zeroForOne ? "Buy" : "Sell";
  const ctaLabel = busy
    ? "Confirming…"
    : status === "success"
      ? "Done"
      : empty
        ? "Enter an amount"
        : insufficient
          ? `Insufficient ${paySym}`
          : q.out <= 0
            ? "Fetching quote…"
            : highImpact && !impactAck
              ? "Accept the price impact first"
              : `${verb} WETH`;

  async function onTrade() {
    track("swap_submitted", { side });
    await swap({ amountIn: amt, zeroForOne, minOutWei, quote: q });
    bal.refetch();
    setTimeout(reset, 2500);
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!disabled) void onTrade();
  }
  async function onFaucet() {
    await faucet.mint();
    bal.refetch();
  }

  // ---- book / trades panel ----
  const [panel, setPanel] = useParam("panel", ["book", "trades", "dca"] as const, "book");
  const [step, setStep] = useState<(typeof BOOK_STEPS)[number]>(BOOK_STEPS[0]);
  const rowsPerSide = narrow ? 6 : Math.max(4, Math.min(12, Math.floor((panelBox.h - 240) / 2 / 24)));
  const book = useMemo(
    () => depthOf(fromWei(s.r0, "USDC"), fromWei(s.r1, "WETH"), s.fee, s.spreadZeroForOne, s.spreadOneForZero, step, rowsPerSide),
    [s.r0, s.r1, s.fee, s.spreadZeroForOne, s.spreadOneForZero, step, rowsPerSide],
  );

  const PAGE = 18;
  const [visible, setVisible] = useState(PAGE);
  const [mine, setMine] = useState(false);
  const myRows = useMemo(
    () => (address ? tape.rows.filter((t) => t.trader?.toLowerCase() === address.toLowerCase()) : []),
    [tape.rows, address],
  );
  const listRows = mine ? myRows : tape.rows;
  const onTapeLoadMore = () => {
    setVisible((v) => v + PAGE);
    if (visible + PAGE >= tape.rows.length && tape.hasMore) void tape.loadMore();
  };

  // ---------------------------------------------------------------- pieces
  const toDca = () => {
    setDcaPrefill({ kind: "twap", total: !invalid && amtNum > 0 ? amt : side === "buy" ? "1000" : "0.5" });
    setMode("dca");
  };
  const hookCheck = <HookCheck s={s} side={side} spread={spread} q={q} risk={risk} onDca={toDca} />;
  const ticket = (
    <section className="card min-w-0 flex flex-col" aria-labelledby="ticket-title" style={narrow ? undefined : { height: "100%" }}>
      <h2 id="ticket-title" className="sr-only">Order form</h2>
      {/* The order type is the ticket's mode, so it is the ticket's tabs (an underline across the top,
          as exchanges draw Market / Limit), not one more switch in the stack: everything below it,
          including the DCA plan's own settings, belongs to the tab that is open. */}
      {/* Core look inline (layout, size, colour, underline), so the tabs render right even when a
          dev server serves a stale stylesheet; .ticket-tab in global.css adds hover only. */}
      <div className="ticket-tabs" role="group" aria-label="Order type"
        style={{ display: "flex", gap: 4, padding: "0 8px", borderBottom: "1px solid var(--lx-line)" }}>
        {([["market", "Market"], ["dca", "DCA"]] as const).map(([id, label]) => {
          const on = mode === id;
          return (
            <button key={id} type="button" className="ticket-tab" aria-pressed={on} onClick={() => setMode(id)}
              style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 48, marginBottom: -1,
                fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", cursor: "pointer",
                color: on ? "var(--lx-ink)" : "var(--text-3)", borderBottom: `2px solid ${on ? "var(--action)" : "transparent"}` }}>
              {label}
              {id === "dca" && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 999, color: "var(--lx-accent-ink)", background: "var(--lav-soft)" }}>
                  spread-aware
                </span>
              )}
            </button>
          );
        })}
      </div>
      {mode === "dca" ? (
        <DcaTicket key={dcaPrefill ? `prefill-${dcaPrefill.total}` : "plan"} s={s} side={side} onSide={setSide} payBal={payBal}
          prefill={dcaPrefill} onCreated={() => { setDcaPrefill(null); setPanel("dca"); }} />
      ) : (
      <form onSubmit={onSubmit} noValidate className="flex flex-col flex-1 min-h-0">
        {/* Everything above the button scrolls if it must; the button never moves. */}
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ gap: 9, padding: "16px 16px 10px" }}>
        {/* the same selector as the Pool ticket's Deposit / Withdraw: one recipe for both tickets */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl p-1" role="group" aria-label="Order side" style={{ background: "var(--surface-2)" }}>
          {(["buy", "sell"] as const).map((id) => {
            const on = side === id;
            const sp = id === "buy" ? s.spreadZeroForOne : s.spreadOneForZero;
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => switchSide(id)}
                className={on ? (id === "buy" ? "btn btn-positive btn-sm" : "btn btn-negative btn-sm") : "btn btn-sm"}
                style={on ? { minHeight: 36, borderRadius: 8 } : { minHeight: 36, borderRadius: 8, background: "transparent", color: "var(--text-3)", boxShadow: "none", border: "1px solid transparent" }}>
                <Icon name="arrowRight" size={14} aria-hidden="true" style={{ transform: `rotate(${id === "buy" ? -90 : 90}deg)` }} />
                {/* one word like Deposit / Withdraw, so the spread badge fits; the CTA and screen readers keep "WETH" */}
                <span>{id === "buy" ? "Buy" : "Sell"}<span className="sr-only"> WETH</span></span>
                {sp > 0 && (
                  <span className="rounded-full px-1.5" style={{ fontSize: 11, fontWeight: 650, background: on ? "rgba(255,255,255,.22)" : "var(--warn-bg)", color: on ? "#fff" : "var(--honey-ink)" }}>
                    +{fmtPct(sp, 1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
          <span className="min-w-0 truncate" style={{ color: "var(--text-3)" }} title={q.execPrice > 0 ? `${fmtNum(q.execPrice, 2)} USDC per WETH` : undefined}>
            <b style={{ color: "var(--text-2)" }}>Market</b>{q.execPrice > 0 ? ` ≈ ${big(q.execPrice, 2)} USDC` : ""}
          </span>
          <span className="min-w-0 truncate" style={{ color: "var(--text-3)" }} title={`${fmtNum(payBal, 6)} ${paySym}`}>
            Avbl <b style={{ color: "var(--text-2)" }}>{big(payBal, paySym === "WETH" ? 4 : 2)} {paySym}</b>
          </span>
        </div>

        <InlineField label="Amount" unit={paySym} htmlFor="ticket-amount"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 truncate" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>{amtNum > 0 ? `≈ ${bigUsd(amtNum * (paySym === "USDC" ? 1 : mid))}` : "\u00a0"}</span>
              <span className="flex gap-1.5 shrink-0" role="group" aria-label="Share of available balance">
                {([25, 50, 75, 100] as const).map((p) => {
                  const on = payBal > 0 && Math.round(pct) === p;
                  return (
                    <button key={p} type="button" className="btn btn-secondary btn-sm" disabled={payBal <= 0} aria-pressed={on}
                      onClick={() => setAmt(round((payBal * p) / 100, paySym))}
                      // a chip inside the 12px field, so a 6px corner like the slippage and book-step chips, not a pill
                      style={{ minHeight: 26, padding: "0 9px", fontSize: 12, borderRadius: 6, ...(on ? { borderColor: "var(--action)", color: "var(--lav-ink)" } : {}) }}>
                      {p === 100 ? "Max" : `${p}%`}
                    </button>
                  );
                })}
              </span>
            </div>
          }
          error={invalid ? "Use digits and one decimal point, e.g. 1250.5" : insufficient && amtNum > 0 && !faucetFirst ? `More than your ${fmtNum(payBal, 4)} ${paySym}` : null}>
          <input
            id="ticket-amount"
            name="amount"
            value={amt}
            // A second point is kept so it can be flagged rather than silently disabling the button.
            onChange={(e) => setAmt(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder={zeroForOne ? "1000…" : "0.5…"}
            aria-invalid={invalid || (insufficient && amtNum > 0)}
            aria-describedby={invalid || (insufficient && amtNum > 0 && !faucetFirst) ? "ticket-amount-error" : undefined}
            className="w-full text-right num-input"
            style={{ background: "transparent", border: "none", fontSize: 16, fontWeight: 650, color: "var(--text)", minWidth: 0 }}
          />
        </InlineField>

        <InlineField label="Receive" unit={getSym} muted>
          <output htmlFor="ticket-amount" style={{ fontSize: 16, fontWeight: 650, color: "var(--text)" }}>
            {outText}
          </output>
        </InlineField>
        {/* spoken once the typing settles, not on every block's quote refresh */}
        <span className="sr-only" aria-live="polite">{spokenOut ? `You receive about ${spokenOut} ${getSym}` : ""}</span>

        <dl className="flex flex-col" style={{ gap: 5 }}>
          <Row label="Fee · scales with volatility">{fmtPct(s.fee)}</Row>
          <Row label="Trend spread" color={spread > 0 ? "var(--honey-ink)" : "var(--up-ink)"}>{spread > 0 ? fmtPct(spread) : "None"}</Row>
          <Row label="Price impact" color={highImpact ? "var(--down-ink)" : undefined}>{fmtImpact(pureImpact)}</Row>
          <Row label="Minimum received">{big(minOut, getSym === "WETH" ? 5 : 2)} {getSym}</Row>
        </dl>
          <div className="flex justify-between items-center gap-3" style={{ fontSize: 12 }}>
            <span id="slippage-label" style={{ color: "var(--text-3)" }}>Slippage</span>
            <div className="flex gap-1" role="group" aria-labelledby="slippage-label">
              {SLIPPAGE_OPTIONS.map((v) => (
                <button key={v} type="button" onClick={() => setSlip(v)} aria-pressed={slip === v} className="rounded-md chip-touch"
                  style={{ fontSize: 12, fontWeight: 650, padding: "2px 8px", minHeight: 24, cursor: "pointer", color: slip === v ? "var(--text)" : "var(--text-3)", background: slip === v ? "var(--surface-2)" : "transparent", border: `1px solid ${slip === v ? "var(--border-strong)" : "transparent"}` }}>
                  {v}%
                </button>
              ))}
            </div>
          </div>
        {/* stacked layouts: the hook check scrolls with the form, so only the button rides the screen's edge */}
        {narrow && hookCheck}
        </div>

        <div
          className="flex flex-col shrink-0"
          style={{
            gap: 8,
            padding: "10px 16px 14px",
            borderTop: "1px solid var(--divider)",
            background: "var(--surface)",
            borderRadius: "0 0 var(--r-card) var(--r-card)",
            // on stacked layouts the ticket is taller than the screen, so the footer rides the viewport's bottom edge
            // (above the phone tab bar, which --bottom-nav measures)
            ...(narrow ? { position: "sticky" as const, bottom: "var(--bottom-nav)", zIndex: 5, boxShadow: "0 -8px 18px rgba(20,18,45,.07)" } : {}),
          }}
        >
        {!narrow && hookCheck}

        {highImpact && !insufficient && (
          <label className="flex items-start gap-2 rounded-lg" style={{ padding: "7px 10px", background: "var(--warn-bg)", border: "1px solid var(--warn-border)", cursor: "pointer", fontSize: 12, lineHeight: 1.4, color: "var(--text-2)" }}>
            <input type="checkbox" checked={impactAck} onChange={(e) => setImpactAck(e.target.checked)} style={{ accentColor: "var(--action)", width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
            {/* wraps instead of truncating: this is a consent the trader has to be able to read in full */}
            <span className="min-w-0">
              <b style={{ color: "var(--warn-label)" }}>Accept {fmtImpact(pureImpact)} price impact</b> · large for the pool's depth
            </span>
          </label>
        )}

        {faucetFirst ? (
          <div>
            <button type="button" onClick={onFaucet} disabled={faucet.minting} aria-busy={faucet.minting} className="btn btn-primary btn-lg btn-block">
              {faucet.minting && <Icon name="spinner" size={17} className="animate-spin" aria-hidden="true" />}
              {faucet.minting ? "Minting test tokens…" : "Get test tokens to trade"}
            </button>
            <p className="mt-1.5 text-center" style={{ fontSize: 12, color: "var(--text-3)" }}>Free on testnet: 50k USDC + 20 WETH, one confirmation.</p>
          </div>
        ) : (
          <div>
            <button type="submit" disabled={disabled} aria-busy={busy} className={`btn btn-lg btn-block ${zeroForOne ? "btn-positive" : "btn-negative"}`}>
              {busy && <Icon name="spinner" size={17} className="animate-spin" aria-hidden="true" />}
              {status === "success" && <Icon name="check" size={17} aria-hidden="true" />}
              {ctaLabel}
            </button>
            {payBal < 1 && (
              <button type="button" onClick={onFaucet} disabled={faucet.minting} aria-busy={faucet.minting} className="link-quiet w-full mt-1.5" style={{ fontSize: 12, fontWeight: 600, minHeight: 28 }}>
                {faucet.minting ? "Minting test tokens…" : "Get free test tokens"}
              </button>
            )}
          </div>
        )}
        </div>
      </form>
      )}
    </section>
  );

  const panelCard = (
    <section className="card min-w-0 flex flex-col overflow-hidden" aria-labelledby="panel-title" style={wide ? { height: "100%" } : undefined}>
      <h2 id="panel-title" className="sr-only">Order book and trades</h2>
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="seg seg-sm" role="group" aria-label="Panel" style={{ padding: 2 }}>
          <button type="button" className="seg-item" aria-pressed={panel === "book"} onClick={() => setPanel("book")}>Book</button>
          <button type="button" className="seg-item" aria-pressed={panel === "trades"} onClick={() => setPanel("trades")}>Trades</button>
          <button type="button" className="seg-item" aria-pressed={panel === "dca"} onClick={() => setPanel("dca")}>DCA</button>
        </div>
        {panel === "dca" ? null : panel === "book" ? (
          <div className="flex gap-1" role="group" aria-label="Price step">
            {BOOK_STEPS.map((st) => (
              <button key={st} type="button" aria-pressed={step === st} onClick={() => { setStep(st); setBookSel(null); }} className="rounded-md chip-touch"
                style={{ fontSize: 12, fontWeight: 650, padding: "2px 7px", minHeight: 24, cursor: "pointer", color: step === st ? "var(--text)" : "var(--text-3)", background: step === st ? "var(--surface-2)" : "transparent", border: `1px solid ${step === st ? "var(--border-strong)" : "transparent"}` }}>
                {fmtPct(st, 1)}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-1" role="group" aria-label="Whose trades">
            {([[false, "All"], [true, "Yours"]] as const).map(([v, l]) => (
              <button key={l} type="button" aria-pressed={mine === v} onClick={() => { setMine(v); setVisible(PAGE); }} className="rounded-md chip-touch"
                style={{ fontSize: 12, fontWeight: 650, padding: "2px 8px", minHeight: 24, cursor: "pointer", color: mine === v ? "var(--text)" : "var(--text-3)", background: mine === v ? "var(--surface-2)" : "transparent", border: `1px solid ${mine === v ? "var(--border-strong)" : "transparent"}` }}>
                {l}{v && myRows.length > 0 ? ` ${myRows.length}` : ""}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={panelRef} className="flex-1 min-h-0 overflow-hidden">
        {panel === "dca" ? (
          <DcaOrders maxHeight={narrow ? 420 : Math.max(160, panelBox.h)} />
        ) : panel === "book" ? (
          <CurveDepth book={book} spreadBuy={s.spreadZeroForOne} spreadSell={s.spreadOneForZero} onPick={pickLevel} selected={bookSel} />
        ) : (
          <Tape bare fill={!narrow} title="Trades" rows={listRows.slice(0, visible)} onLoadMore={onTapeLoadMore}
            hasMore={visible < listRows.length || tape.hasMore} loadingMore={tape.loadingMore}
            maxHeight={narrow ? 360 : Math.max(160, panelBox.h - 130)}
            empty={mine ? "No trades from this wallet in the loaded history." : "No trades yet. Be the first to swap."} />
        )}
      </div>
    </section>
  );

  const chartCard = (
    <div className="card min-w-0 flex flex-col" style={{ padding: "14px 16px", height: narrow ? undefined : "100%" }}>
      <div ref={chartRef} className={narrow ? undefined : "flex-1 min-h-0"}>
        <PoolChart height={narrow ? 200 : Math.max(160, chartBox.h - 74)} />
      </div>
    </div>
  );

  return (
    <>
      <TxSteps stepper={stepper} title={zeroForOne ? "Buying WETH" : "Selling WETH"} />
      <div className="px-3 sm:px-4 pt-4 pb-5 flex flex-col" style={{ gap: 12 }}>
        <TickerBar s={s} risk={risk} ready={series.points.length > 0} spreadCap={cfg.kappaMax} />

        {tablet ? (
          // tablets: ticket and book side by side (the book is the ticket's price ladder), chart below
          <div className="flex flex-col" style={{ gap: 12 }}>
            <div className="grid items-start" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
              {ticket}
              {panelCard}
            </div>
            {chartCard}
          </div>
        ) : narrow ? (
          <div className="flex flex-col" style={{ gap: 12 }}>
            {ticket}
            {panelCard}
            {chartCard}
          </div>
        ) : wide ? (
          <div ref={fillRef} className="grid" style={{ height: fillH || undefined, gridTemplateColumns: "minmax(0,1fr) 300px 340px", gap: 12 }}>
            {chartCard}
            {panelCard}
            <div className="min-h-0">{ticket}</div>
          </div>
        ) : (
          <div ref={fillRef} className="grid" style={{ height: fillH || undefined, gridTemplateColumns: "minmax(0,1fr) 340px", gap: 12 }}>
            <div className="grid min-h-0" style={{ gridTemplateRows: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
              {chartCard}
              {panelCard}
            </div>
            <div className="min-h-0">{ticket}</div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------

/** The exchange ticker bar, carrying the detector where an exchange carries its 24h stats. */
function TickerBar({ s, risk, ready, spreadCap }: { s: PoolState; risk: RiskState; ready: boolean; spreadCap: number }) {
  const tone =
    risk.level === "engaged"
      ? { ink: "var(--honey-ink)", bg: "rgba(217,140,0,.13)", bar: "var(--honey-deep)" }
      : risk.level === "watching"
        ? { ink: "var(--lav-ink)", bg: "var(--lav-soft)", bar: "var(--lav-deep)" }
        : { ink: "var(--up-ink)", bg: "var(--green-bg)", bar: "var(--up-deep)" };
  const sideCost = (sp: number) => (sp > 0 ? { v: `+${fmtPct(sp)}`, c: "var(--honey-ink)" } : { v: "No spread", c: "var(--up-ink)" });
  const buy = sideCost(s.spreadZeroForOne);
  const sell = sideCost(s.spreadOneForZero);

  return (
    <section className="card" aria-label="Market and detector" style={{ padding: "10px 16px" }}>
      <div className="ticker ticker-lg">
        <div className="ticker-lead">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex shrink-0" aria-hidden="true">
              <TokenIcon sym="WETH" size={26} />
              <span style={{ marginLeft: -8 }}><TokenIcon sym="USDC" size={26} /></span>
            </span>
            <div className="min-w-0">
              <div className="font-display" style={{ fontSize: 16, fontWeight: 650, color: "var(--text)", lineHeight: 1.1, whiteSpace: "nowrap" }}>WETH / USDC</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>Poincaré pool</div>
            </div>
          </div>
          <div className="font-display text-right lg:text-left" style={{ fontSize: 22, fontWeight: 650, color: "var(--text)" }}>
            {s.loading ? <Skel w="7ch" /> : s.price > 0 ? fmtNum(s.price, 2) : "—"}
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", fontFamily: "inherit" }}>Mid price</span>
          </div>
        </div>
        <Divider />
        <Cell label="Detector">
          <span className="rounded-full px-2 py-0.5" style={{ fontSize: 12, fontWeight: 650, color: tone.ink, background: tone.bg }} role="status"
            title={risk.detail}>
            {ready ? risk.label : "Reading…"}
          </span>
        </Cell>
        <Cell label={risk.gated ? "Evidence · gated" : "Evidence"}>
          <span className="flex items-center gap-2">
            <span style={{ fontSize: 13, fontWeight: 650, color: "var(--text)" }}>{ready ? `${Math.round(risk.progress * 100)}%` : "—"}</span>
            <span style={{ width: 40, height: 5, borderRadius: 3, background: "var(--track)", overflow: "hidden", display: "inline-block" }} aria-hidden="true">
              <span style={{ display: "block", height: "100%", background: tone.bar, transform: `scaleX(${Math.max(0.03, risk.progress)})`, transformOrigin: "left" }} />
            </span>
          </span>
        </Cell>
        <Cell label="Buy side"><b style={{ fontSize: 13, color: buy.c }}>{buy.v}</b></Cell>
        <Cell label="Sell side"><b style={{ fontSize: 13, color: sell.c }}>{sell.v}</b></Cell>
        <Divider />
        <Cell label="Base fee"><b style={{ fontSize: 13, color: "var(--text)" }}>{fmtPct(s.fee)}</b></Cell>
        <Cell label="Volatility σ̂"><b style={{ fontSize: 13, color: "var(--text)" }}>{fmtPct(s.sigma)}</b></Cell>
        <Cell label="Spread cap"><b style={{ fontSize: 13, color: "var(--text)" }}>{fmtPct(spreadCap)}</b></Cell>
      </div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col" style={{ gap: 3 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ whiteSpace: "nowrap" }}>{children}</span>
    </div>
  );
}

const Divider = () => <span aria-hidden="true" className="ticker-div" />;

/** A compact exchange-style field: label on the left, value right-aligned, unit suffix. */
function InlineField({ label, unit, htmlFor, muted, error, footer, children }: { label: string; unit: string; htmlFor?: string; muted?: boolean; error?: string | null; footer?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="field" style={{ padding: "9px 12px", borderRadius: 12, background: muted ? "transparent" : undefined, borderColor: error ? "var(--negative)" : undefined }}>
      <div className="flex items-center gap-3">
        {htmlFor ? (
          <label htmlFor={htmlFor} style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", width: 56, flexShrink: 0 }}>{label}</label>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", width: 56, flexShrink: 0 }}>{label}</span>
        )}
        <div className="flex-1 min-w-0 text-right truncate">{children}</div>
        <span className="flex items-center gap-1.5 shrink-0" style={{ fontSize: 13, fontWeight: 650, color: "var(--text-2)" }}>
          <TokenIcon sym={unit} size={16} />
          {unit}
        </span>
      </div>
      {footer && <div style={{ marginTop: 8 }}>{footer}</div>}
      </div>
      {error && <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" style={{ fontSize: 12, fontWeight: 600, color: "var(--down-ink)", marginTop: 4 }}>{error}</p>}
    </div>
  );
}

/** Right above the button: what the hook is doing to this order, and how it compares. */
function HookCheck({ s, side, spread, q, risk, onDca }: { s: PoolState; side: Side; spread: number; q: TradeQuote; risk: RiskState; onDca?: () => void }) {
  const other = side === "buy" ? s.spreadOneForZero : s.spreadZeroForOne;
  const verb = side === "buy" ? "Buying" : "Selling";
  const [icon, tone, bg, border, text] =
    spread > 0
      ? (["wave", "var(--warn-label)", "var(--warn-bg)", "var(--warn-border)",
          `${verb} pushes with the detected trend: +${fmtPct(spread)} spread${q.lvrToLps > 0 ? `, ${fmtUsd(q.lvrToLps, { dp: 2 })} to LPs` : ""}. The ${side === "buy" ? "sell" : "buy"} side is free.`] as const)
      : other > 0
        ? (["check", "var(--green-label)", "var(--green-bg)", "var(--green-border)", "No spread: you're trading against the trend, which steadies the pool."] as const)
        : risk.level === "watching" && !risk.gated
          ? (["target", "var(--lav-ink)", "var(--lav-soft)", "var(--lav-dim)", `No spread yet. Evidence is at ${Math.round(risk.progress * 100)}% of the threshold; a spread may start on the side pushing with the move.`] as const)
          : (["check", "var(--green-label)", "var(--green-bg)", "var(--green-border)", "No trend spread on either side right now."] as const);

  const diff = q.savedVsFee;
  const edge =
    q.out <= 0 ? null
      : Math.abs(diff) < 0.005 ? "Same price as a standard 0.3% pool."
        : diff > 0 ? `${fmtUsd(diff, { dp: 2 })} better than a standard 0.3% pool.`
          : `${fmtUsd(-diff, { dp: 2 })} more than a standard 0.3% pool${q.withTrend ? ", paid to LPs" : ""}.`;

  // What a screen reader hears: the hook's verdict only, so it speaks when the verdict changes
  // (a spread starts or ends), not every block the percentages move.
  const verdict =
    spread > 0 ? `Hook: this ${side} pushes with the trend and pays a spread.`
      : other > 0 ? "Hook: no spread; this order trades against the trend."
        : risk.level === "watching" && !risk.gated ? "Hook: no spread yet; trend evidence is building."
          : "Hook: no trend spread right now.";

  return (
    <div className="flex gap-2 rounded-lg" style={{ padding: "8px 10px", background: bg, border: `1px solid ${border}` }}>
      <span className="sr-only" aria-live="polite">{verdict}</span>
      <span aria-hidden="true" style={{ color: tone, marginTop: 1 }}><Icon name={icon} size={14} /></span>
      <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--text-2)" }}>
        <b style={{ color: tone }}>Hook · </b>{text}
        {edge && <div style={{ color: "var(--text-3)", marginTop: 2 }}>{edge}</div>}
        {/* Paying the spread is a choice: the same amount as a spread-aware DCA waits it out. */}
        {spread > 0 && onDca && (
          <button type="button" onClick={onDca} className="inline-flex items-center gap-1 mt-1"
            style={{ fontSize: 12, fontWeight: 650, color: "var(--lav-ink)", cursor: "pointer", minHeight: 24 }}>
            Skip the spread: spread this {side === "buy" ? "buy" : "sell"} out with DCA
            <Icon name="arrowRight" size={13} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, color, children }: { label: string; color?: string; children: ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3" style={{ fontSize: 12 }}>
      <dt style={{ color: "var(--text-3)" }}>{label}</dt>
      <dd style={{ color: color ?? "var(--text-2)", fontWeight: 600, textAlign: "right" }}>{children}</dd>
    </div>
  );
}
