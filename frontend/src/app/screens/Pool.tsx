import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { parseUnits } from "viem";
import { usePoolState } from "@/hooks/usePoolState";
import { usePosition } from "@/hooks/usePosition";
import { useBalances } from "@/hooks/useBalances";
import { useLiquidity } from "@/hooks/useLiquidity";
import { usePoolTotals, useWalletActivity } from "@/hooks/useBackend";
import { useDetectorConfig } from "@/hooks/useDetectorConfig";
import { useParam } from "@/hooks/useParam";
import { useBox, useFillHeight } from "@/hooks/useViewportFit";
import { fmtNum, fmtUsd, fmtPct, shorten } from "@/lib/format";
import { CONTRACTS, EXPLORER } from "@/config/contracts";
import { Icon } from "@/components/ui/Icon";
import { Skel } from "@/components/ui/Skeleton";
import { BondingCurve } from "@/components/ui/BondingCurve";
import { LiquidityDepth, DepthLegend } from "@/components/ui/LiquidityDepth";
import { PanelHead, SourceTag, Seg } from "@/components/ui/Panel";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { TxSteps } from "@/components/ui/TxSteps";
import { useIsMobile, useIsNarrow } from "@/hooks/useMediaQuery";

/**
 * The Pool screen as an exchange "earn" terminal, built the way the Trade screen is: one row of
 * pool figures, then the book and the deposit / withdraw ticket sized to the viewport so the
 * button is always on screen, then one tabbed panel for everything about your stake and the pool.
 * The panel's tab bar is left showing above the fold, so it reads as "more below" at a glance
 * instead of a wall of cards to discover by scrolling.
 *
 * The depth chart is the primary picture because it shows the mechanism where it lives: the hook
 * charges a spread on one side of the book, which on a price scale is a sideways shift of that
 * side against the plain constant-product book. Chart, window, scenario and the open tab live in
 * the URL so a shared link opens on the same view.
 */

const RANGES = [
  { id: "5", label: "±5%", frac: 0.05 },
  { id: "10", label: "±10%", frac: 0.1 },
  { id: "20", label: "±20%", frac: 0.2 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];
type Scenario = "live" | "up" | "down";
type Tab = "position" | "composition" | "history" | "how";

/** Height of the details panel's tab bar left visible below the terminal. */
const PEEK = 70;

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const big = (n: number, dp: number) => (Math.abs(n) >= 1e6 ? compact.format(n) : fmtNum(n, dp));
const stampFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function regimeOf(trend: string) {
  if (trend === "up") return { label: "Up-trend", ink: "var(--up-ink)", bg: "rgba(107,184,154,.15)" };
  if (trend === "down") return { label: "Down-trend", ink: "var(--down-ink)", bg: "rgba(229,140,160,.15)" };
  return { label: "Calm", ink: "var(--lav-ink)", bg: "rgba(142,136,216,.15)" };
}

export function Pool() {
  const s = usePoolState();
  const pos = usePosition();
  const bal = useBalances();
  const cfg = useDetectorConfig();
  const totals = usePoolTotals().data;
  const me = useWalletActivity();
  const lp = useLiquidity(() => { pos.refetch(); bal.refetch(); });
  const narrow = useIsNarrow();
  const mobile = useIsMobile();

  const [mode, setMode] = useState<"add" | "remove">("add");
  const [chart, setChart] = useParam("chart", ["depth", "curve"] as const, "depth");
  const [rangeId, setRangeId] = useParam<RangeId>("window", RANGES.map((r) => r.id), "10");
  const [scenario, setScenario] = useParam<Scenario>("scenario", ["live", "up", "down"] as const, "live");
  const [tab, setTab] = useParam<Tab>("panel", ["position", "composition", "history", "how"] as const, "position");

  const [fillRef, fillH] = useFillHeight(PEEK + 12, 470);
  const [plotRef, plotBox] = useBox<HTMLDivElement>();

  const price = pos.price || s.price;
  const lpLvr = totals ? totals.lvr_avoided * pos.sharePct : 0;
  const tvl = pos.poolValueUsdc || pos.r0 + pos.r1 * price;
  const regime = regimeOf(s.trend);

  // What-if scenarios put the full spread cap on the with-trend side: an up-trend charges buyers
  // of WETH, a down-trend charges sellers. Labelled as a preview wherever it is drawn.
  const spreadBuy = scenario === "live" ? s.spreadZeroForOne : scenario === "up" ? cfg.kappaMax : 0;
  const spreadSell = scenario === "live" ? s.spreadOneForZero : scenario === "down" ? cfg.kappaMax : 0;
  const range = RANGES.find((r) => r.id === rangeId)!.frac;
  const leaning = spreadBuy > 0 || spreadSell > 0;
  const side = (sp: number) => (sp > 0 ? { v: `+${fmtPct(sp)}`, c: "var(--honey-ink)" } : { v: "Free", c: "var(--up-ink)" });

  // ------------------------------------------------------------------ ticker
  const tradeLink = (
    <Link to={{ search: "?tab=trade" }} onClick={() => window.scrollTo({ top: 0 })} className="btn btn-secondary btn-sm">
      <Icon name="swap" size={14} aria-hidden="true" /> Trade
    </Link>
  );
  const ticker = (
    <section className="card" aria-labelledby="pool-head" style={{ padding: "10px 16px" }}>
      <div className="ticker">
        <div className="ticker-lead">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex shrink-0" aria-hidden="true">
            <TokenIcon sym="WETH" size={26} />
            <span style={{ marginLeft: -8 }}><TokenIcon sym="USDC" size={26} /></span>
          </span>
          <div>
            <h2 id="pool-head" className="font-display flex flex-wrap items-center gap-x-2 gap-y-1" style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", lineHeight: 1.15, whiteSpace: "nowrap" }}>
              WETH / USDC
              <span className="rounded-full px-2 py-0.5" role="status" style={{ fontSize: 12, fontWeight: 800, color: regime.ink, background: regime.bg, fontFamily: "var(--font-sans)" }}>{regime.label}</span>
            </h2>
            <a href={`${EXPLORER}/address/${CONTRACTS.hook}`} target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1" translate="no"
              aria-label={`Hook contract ${CONTRACTS.hook} on the block explorer (opens in a new tab)`} style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              Hook {shorten(CONTRACTS.hook)} <Icon name="external" size={11} aria-hidden="true" />
            </a>
          </div>
        </div>
        {/* below 1280 the Trade link leads the stats row's right edge instead of trailing it */}
        <div className="xl:hidden shrink-0">{tradeLink}</div>
        </div>
        <Divider />
        <Cell label="Total value locked"><b className="font-display" style={{ fontSize: 16, color: "var(--text)" }}>{s.loading ? <Skel /> : tvl > 0 ? fmtUsd(tvl, { compact: true }) : "—"}</b></Cell>
        <Cell label="24h volume"><b style={{ fontSize: 13, color: "var(--text)" }}>{totals ? fmtUsd(totals.volume_24h, { compact: true }) : <Skel />}</b></Cell>
        <Cell label="LVR kept for LPs"><b style={{ fontSize: 13, color: "var(--green-label)" }}>{!totals ? <Skel /> : totals.swap_count > 0 ? fmtUsd(totals.lvr_avoided, { compact: true }) : "—"}</b></Cell>
        <Divider />
        <Cell label="Buy side"><b style={{ fontSize: 13, color: side(s.spreadZeroForOne).c }}>{side(s.spreadZeroForOne).v}</b></Cell>
        <Cell label="Sell side"><b style={{ fontSize: 13, color: side(s.spreadOneForZero).c }}>{side(s.spreadOneForZero).v}</b></Cell>
        <Cell label="Base fee"><b style={{ fontSize: 13, color: "var(--text)" }}>{fmtPct(s.fee)}</b></Cell>
        <Divider />
        <Cell label="Your position">
          <b style={{ fontSize: 13, color: "var(--text)" }}>{pos.shares > 0 ? fmtUsd(pos.valueUsdc, { dp: 2, compact: pos.valueUsdc >= 1e6 }) : "—"}</b>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>{pos.shares > 0 ? ` · ${fmtPct(pos.sharePct, pos.sharePct < 0.01 ? 3 : 2)}` : ""}</span>
        </Cell>
        <div className="hidden xl:block">{tradeLink}</div>
      </div>
    </section>
  );

  // ------------------------------------------------------------------ chart
  const footnote =
    scenario === "live"
      ? leaning
        ? "Trend detected: the with-trend side quotes further out than a plain pool would. The shaded band is that spread, kept for LPs; the other side trades free."
        : "No spread right now: both sides quote at the plain constant-product price, separated only by the base fee. Try a scenario to see a trend."
      : `Preview, not the live quote: the full ${fmtPct(cfg.kappaMax)} spread on the ${scenario === "up" ? "buy" : "sell"} side, as in a confirmed ${scenario}-trend. Counter-trend flow still trades at the plain price.`;

  const chartCard = (
    <section className="card min-w-0 flex flex-col" aria-labelledby="liq-chart" style={{ padding: 0, height: narrow ? undefined : "100%" }}>
      <PanelHead id="liq-chart" title={<>Liquidity {chart === "depth" && scenario !== "live" && <SourceTag kind="preview" />}</>}>
        <div className="flex flex-wrap items-center gap-2">
          {chart === "depth" && (
            <>
              <Seg label="Scenario" value={scenario} onChange={setScenario}
                options={[{ id: "live", label: "Live" }, { id: "up", label: mobile ? "Up-trend" : "Up-trend at cap" }, { id: "down", label: mobile ? "Down-trend" : "Down-trend at cap" }]} />
              <Seg label="Price window" value={rangeId} onChange={setRangeId} options={RANGES.map((r) => ({ id: r.id, label: r.label }))} />
            </>
          )}
          <Seg label="Chart" value={chart} onChange={setChart} options={[{ id: "depth", label: "Depth" }, { id: "curve", label: "Curve" }]} />
        </div>
      </PanelHead>
      <div className="px-5 pt-3 pb-3 flex flex-col flex-1 min-h-0">
        <div ref={plotRef} className={narrow ? undefined : "flex-1 min-h-0"}>
          {chart === "depth" ? (
            <LiquidityDepth x={pos.r0} y={pos.r1} fee={s.fee} spreadBuy={spreadBuy} spreadSell={spreadSell} range={range}
              height={narrow ? 240 : Math.max(200, plotBox.h - 30)} />
          ) : (
            <BondingCurve r0={pos.r0} r1={pos.r1} spreadZeroForOne={s.spreadZeroForOne} spreadOneForZero={s.spreadOneForZero} trend={s.trend}
              height={narrow ? 240 : Math.max(200, plotBox.h - 4)} />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 pt-2.5 mt-1" style={{ borderTop: "1px solid var(--divider)" }}>
          {chart === "depth" ? <DepthLegend lean={leaning} /> : <span style={{ fontSize: 12, color: "var(--text-3)" }}>Reserves on one x·y=k curve; the spread is a price, drawn on the quote strip at the right.</span>}
        </div>
        {chart === "depth" && (
          <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-3)", marginTop: 6, textWrap: "pretty" }}>{footnote}</p>
        )}
      </div>
    </section>
  );

  // ------------------------------------------------------------------ ticket
  const ticket = (
    <section className="card min-w-0 flex flex-col" aria-labelledby="ticket-title" style={{ padding: 0, height: narrow ? undefined : "100%" }}>
      <h2 id="ticket-title" className="sr-only">Manage liquidity</h2>
      <div className="px-4 pt-4">
        {/* a selector, not an action: it keeps the rectangle, matching the trade ticket's Buy / Sell */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl p-1" role="group" aria-label="Liquidity action" style={{ background: "var(--surface-2)" }}>
          {(["add", "remove"] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); lp.reset(); }} aria-pressed={mode === m}
              className={mode === m ? (m === "add" ? "btn btn-positive btn-sm" : "btn btn-negative btn-sm") : "btn btn-sm"}
              style={mode === m ? { minHeight: 36, borderRadius: 8 } : { minHeight: 36, borderRadius: 8, background: "transparent", color: "var(--text-3)", boxShadow: "none", border: "1px solid transparent" }}>
              <Icon name={m === "add" ? "plus" : "minus"} size={14} aria-hidden="true" />
              {m === "add" ? "Deposit" : "Withdraw"}
            </button>
          ))}
        </div>
      </div>
      {mode === "add"
        ? <AddPanel price={price} bal={bal} lp={lp} pinned={!narrow} />
        : <RemovePanel pos={pos} lp={lp} pinned={!narrow} />}
    </section>
  );

  // ------------------------------------------------------------------ details (tabbed)
  const cell = { padding: "9px 14px", fontSize: 12, borderBottom: "1px solid var(--divider-2)", whiteSpace: "nowrap" as const };
  const usdcShare = tvl > 0 ? pos.r0 / tvl : 0.5;

  const positionTab = (
    <div className="grid p-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 20 }}>
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>Your stake</h3>
        {pos.shares > 0 ? (
          <dl className="flex flex-col" style={{ gap: 7 }}>
            <Detail label="Position value" value={fmtUsd(pos.valueUsdc, { dp: 2, compact: pos.valueUsdc >= 1e6 })} strong />
            <Detail label="Share of pool" value={fmtPct(pos.sharePct, pos.sharePct < 0.01 ? 3 : 2)} />
            <Detail label="LP shares" value={big(pos.shares, 4)} />
          </dl>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>No liquidity yet. Deposit USDC and WETH at the current ratio to start earning the trend spread.</p>
        )}
      </div>
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>Redeems for</h3>
        <dl className="flex flex-col" style={{ gap: 7 }}>
          <Detail label="USDC" value={pos.shares > 0 ? big(pos.underlying0, 2) : "—"} />
          <Detail label="WETH" value={pos.shares > 0 ? big(pos.underlying1, 4) : "—"} />
          <Detail label="At pool price" value={`${fmtNum(price, 2)} USDC`} />
        </dl>
      </div>
      <div className="rounded-xl p-3.5" style={{ background: "var(--green-bg)", border: "1px solid var(--green-border)" }}>
        <div className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 700, color: "var(--green-label)" }}>
          <Icon name="spark" size={13} aria-hidden="true" /> Your LVR avoided
        </div>
        <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: "var(--green-label)", lineHeight: 1.25 }}>{pos.sharePct > 0 ? fmtUsd(lpLvr, { dp: 2 }) : "—"}</div>
        <div style={{ fontSize: 12, color: "var(--green-sub)", lineHeight: 1.5, marginTop: 2 }}>
          Your {fmtPct(pos.sharePct)} share of {totals ? fmtUsd(totals.lvr_avoided, { dp: 2 }) : "—"} kept pool-wide. Accrues as trades are recorded; not guaranteed.
        </div>
      </div>
    </div>
  );

  const compositionTab = (
    <div className="grid p-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 24 }}>
      <div>
        <div className="flex justify-between" style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
          <span>Reserves by value</span><span>{fmtNum(price, 2)} USDC / WETH</span>
        </div>
        <div className="flex overflow-hidden rounded-full" style={{ height: 8, gap: 2 }} role="img"
          aria-label={`Reserves by value: USDC ${Math.round(usdcShare * 100)}%, WETH ${Math.round((1 - usdcShare) * 100)}%`}>
          <span style={{ width: `${usdcShare * 100}%`, background: "var(--lav)" }} />
          <span style={{ flex: 1, background: "var(--honey)" }} />
        </div>
        {[
          { sym: "USDC", amt: big(pos.r0, 2), value: pos.r0, share: usdcShare, color: "var(--lav)" },
          { sym: "WETH", amt: big(pos.r1, 4), value: pos.r1 * price, share: 1 - usdcShare, color: "var(--honey)" },
        ].map((r) => (
          <div key={r.sym} className="flex items-center justify-between gap-3" style={{ padding: "10px 0", borderBottom: "1px solid var(--divider-2)" }}>
            <span className="flex items-center gap-2.5">
              <TokenIcon sym={r.sym} size={22} />
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{r.sym}</span>
              <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--text-3)" }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: r.color }} />{Math.round(r.share * 100)}%
              </span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{r.amt} <span style={{ fontWeight: 600, color: "var(--text-3)" }}>· {fmtUsd(r.value, { compact: true })}</span></span>
          </div>
        ))}
      </div>
      <dl className="flex flex-col" style={{ gap: 7 }}>
        <Detail label="Total value locked" value={s.loading ? <Skel /> : tvl > 0 ? fmtUsd(tvl, { dp: 2, compact: tvl >= 1e6 }) : "—"} strong />
        <Detail label="LP shares outstanding" value={big(pos.supply, 2)} />
        <Detail label="Value per share" value={pos.supply > 0 ? fmtUsd(tvl / pos.supply, { dp: 4 }) : "—"} />
        <Detail label="All-time volume" value={totals ? fmtUsd(totals.volume_usdc, { compact: true }) : <Skel />} />
        <Detail label="Swaps recorded" value={fmtNum(totals?.swap_count ?? 0, 0)} />
        <Detail label="Deposits" value="At the current reserve ratio" />
      </dl>
    </div>
  );

  const historyTab = (
    <div className="overflow-auto" style={{ maxHeight: 340 }} tabIndex={0} aria-label="Your liquidity events">
      {me.loading ? (
        <p style={{ padding: 24, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>Loading your history…</p>
      ) : me.lpEvents.length === 0 ? (
        <p style={{ padding: "28px 20px", fontSize: 13, color: "var(--text-3)", textAlign: "center" }}>No deposits or withdrawals from this wallet yet.</p>
      ) : (
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <caption className="sr-only">Your liquidity events, newest first</caption>
          <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
            <tr>
              {["Time", "Action", "USDC", "WETH", "Shares", "Value", ""].map((h, i) => (
                <th key={h || i} scope="col" style={{ textAlign: i >= 2 && i <= 5 ? "right" : "left", padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--divider)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {me.lpEvents.map((e) => (
              <tr key={e.tx_hash} className="row-hover">
                <td style={{ ...cell, color: "var(--text-3)" }}>{e.ts ? stampFmt.format(new Date(e.ts)) : "—"}</td>
                <td style={{ ...cell, fontWeight: 800, color: e.kind === "add" ? "var(--up-ink)" : "var(--down-ink)" }}>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: e.kind === "add" ? "var(--up)" : "var(--down)" }} />{e.kind === "add" ? "Deposit" : "Withdraw"}</span>
                </td>
                <td style={{ ...cell, textAlign: "right", color: "var(--text-2)" }}>{big(e.amount0, 2)}</td>
                <td style={{ ...cell, textAlign: "right", color: "var(--text-2)" }}>{big(e.amount1, 4)}</td>
                <td style={{ ...cell, textAlign: "right", color: "var(--text-2)" }} title={e.shares > 0 ? undefined : "Share count not recorded for this deposit"}>{e.shares > 0 ? big(e.shares, 4) : "—"}</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "var(--text)" }}>{fmtUsd(e.value_usdc || 0, { dp: 2, compact: (e.value_usdc || 0) >= 1e6 })}</td>
                <td style={{ ...cell, textAlign: "right" }}>
                  <a href={`${EXPLORER}/tx/${e.tx_hash}`} target="_blank" rel="noreferrer" className="link-quiet inline-flex" aria-label="View transaction on the block explorer (opens in a new tab)" style={{ color: "var(--text-3)" }}>
                    <Icon name="external" size={13} aria-hidden="true" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const howTab = (
    <div className="grid p-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 20 }}>
      {[
        { t: "The detector watches the pool's own price", d: "A two-sided CUSUM test, no oracle. It fires on accumulated evidence, never after a fixed block count." },
        { t: "With-trend flow pays a spread", d: `Once a trend is confirmed, swaps pushing with it pay up to ${fmtPct(cfg.kappaMax)} on top of the base fee. Counter-trend and calm-market swaps pay nothing extra.` },
        { t: "The spread stays in the pool", d: "That is value a plain constant-product pool leaks to arbitrageurs (LVR). Here it accrues to LP shares." },
      ].map((st, i) => (
        <div key={st.t} className="flex gap-3">
          <span className="font-display shrink-0 flex items-center justify-center" aria-hidden="true"
            style={{ width: 24, height: 24, borderRadius: 99, fontSize: 12, fontWeight: 800, color: "var(--lav-ink)", background: "var(--lav-soft)" }}>{i + 1}</span>
          <span>
            <span className="block" style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{st.t}</span>
            <span className="block" style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-3)", marginTop: 2 }}>{st.d}</span>
          </span>
        </div>
      ))}
      <dl className="rounded-xl p-3.5 flex flex-col" style={{ gap: 6, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <Detail label="Detector now" value={regime.label} />
        <Detail label="Lean κ" value={`${fmtPct(s.kappa)} of ${fmtPct(cfg.kappaMax)} cap`} />
        <Detail label="Efficiency D" value={`${fmtPct(s.directionalEfficiency)} · floor ${fmtPct(cfg.dFloor, 0)}`} />
      </dl>
    </div>
  );

  const tabs: { id: Tab; label: ReactNode }[] = [
    { id: "position", label: "Your position" },
    { id: "composition", label: "Pool composition" },
    { id: "history", label: <>Liquidity history{me.lpEvents.length ? <span style={{ opacity: 0.7 }}> · {me.lpEvents.length}</span> : null}</> },
    { id: "how", label: "How LPs earn" },
  ];
  const details = (
    <section className="card min-w-0" aria-label="Position and pool details" style={{ padding: 0 }}>
      <div className="flex items-center gap-3 px-4 py-2.5" style={{ minHeight: 54, borderBottom: "1px solid var(--divider)" }}>
        <Seg label="Details" value={tab} onChange={setTab} options={tabs} className="seg-grid" />
      </div>
      {tab === "position" ? positionTab : tab === "composition" ? compositionTab : tab === "history" ? historyTab : howTab}
    </section>
  );

  return (
    <>
      <TxSteps stepper={lp.stepper} title={mode === "add" ? "Adding liquidity" : "Removing liquidity"} />
      <div className="px-3 sm:px-4 pt-4 pb-8 flex flex-col" style={{ gap: 12 }}>
        {ticker}
        {narrow ? (
          <>
            {ticket}
            {chartCard}
          </>
        ) : (
          <div ref={fillRef} className="grid" style={{ height: fillH || undefined, gridTemplateColumns: "minmax(0,1fr) 360px", gap: 12 }}>
            {chartCard}
            <div className="min-h-0">{ticket}</div>
          </div>
        )}
        {details}
      </div>
    </>
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

/** Ticket body that scrolls if it must, with the action pinned beneath it on wide layouts. */
function TicketBody({ pinned, children, footer }: { pinned: boolean; children: ReactNode; footer: ReactNode }) {
  return (
    <div className={pinned ? "flex flex-col flex-1 min-h-0" : "flex flex-col"}>
      <div className={pinned ? "flex-1 min-h-0 overflow-y-auto" : undefined} style={{ padding: "14px 16px 10px" }}>{children}</div>
      <div style={{ padding: "10px 16px 16px", borderTop: "1px solid var(--divider)" }}>{footer}</div>
    </div>
  );
}

function AddPanel({ price, bal, lp, pinned }: { price: number; bal: ReturnType<typeof useBalances>; lp: ReturnType<typeof useLiquidity>; pinned: boolean }) {
  const [usdc, setUsdc] = useState("3000");
  const [weth, setWeth] = useState(price > 0 ? (3000 / price).toFixed(4) : "1");

  // Editing one leg auto-fills the other at the pool ratio.
  const onUsdc = (v: string) => {
    setUsdc(v);
    const n = Number(v);
    if (price > 0 && n > 0) setWeth((n / price).toFixed(4));
  };
  const onWeth = (v: string) => {
    setWeth(v);
    const n = Number(v);
    if (price > 0 && n > 0) setUsdc((n * price).toFixed(2));
  };

  const u = Number(usdc) || 0;
  const w = Number(weth) || 0;
  const valueUsdc = u + w * price;
  const insufficient = u > bal.usdc + 1e-6 || w > bal.weth + 1e-9;
  const busy = lp.status === "busy";
  const disabled = busy || u <= 0 || w <= 0 || insufficient;

  async function onAdd() {
    await lp.add({ usdc, weth, valueUsdc });
    bal.refetch();
    setTimeout(lp.reset, 2500);
  }

  return (
    <TicketBody
      pinned={pinned}
      footer={
        <>
          <button type="button" onClick={onAdd} disabled={disabled} aria-busy={busy} className="btn btn-positive btn-lg btn-block">
            {busy && <Icon name="spinner" size={17} className="animate-spin" aria-hidden="true" />}
            {lp.status === "success" && <Icon name="check" size={17} aria-hidden="true" />}
            {busy ? "Confirming…" : lp.status === "success" ? "Added" : insufficient ? "Insufficient balance" : "Add liquidity"}
          </button>
          {(bal.usdc < u || bal.weth < w) && (
            <p className="mt-2 text-center" style={{ fontSize: 12, color: "var(--muted)" }}>Need test tokens? Grab them from the Trade tab faucet.</p>
          )}
        </>
      }
    >
      <LiqInput label="USDC" sub={`Avbl ${big(bal.usdc, 2)}`} value={usdc} onInput={onUsdc} />
      <div className="flex items-center justify-center" style={{ margin: "6px 0", color: "var(--muted)" }} aria-hidden="true"><Icon name="plus" size={14} /></div>
      <LiqInput label="WETH" sub={`Avbl ${big(bal.weth, 4)}`} value={weth} onInput={onWeth} />
      <dl className="mt-3.5 flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
        <Detail label="Deposit value" value={fmtUsd(valueUsdc, { dp: 2, compact: valueUsdc >= 1e6 })} />
        <Detail label="Pool ratio" value={`${fmtUsd(price)} / WETH`} />
        <Detail label="Added at" value="Current reserve ratio" />
      </dl>
    </TicketBody>
  );
}

function RemovePanel({ pos, lp, pinned }: { pos: ReturnType<typeof usePosition>; lp: ReturnType<typeof useLiquidity>; pinned: boolean }) {
  const [pct, setPct] = useState(50);

  const sharesToBurn = pos.shares * (pct / 100);
  const out0 = pos.underlying0 * (pct / 100);
  const out1 = pos.underlying1 * (pct / 100);
  const valueUsdc = out0 + out1 * pos.price;
  const busy = lp.status === "busy";
  const disabled = busy || pos.shares <= 0 || pct <= 0;

  async function onRemove() {
    // Burn in raw 18-dec units; the 100% branch avoids float drift leaving dust.
    const shares = pct >= 100 ? parseUnits(pos.shares.toFixed(18), 18) : parseUnits(sharesToBurn.toFixed(18), 18);
    await lp.remove({ shares, valueUsdc, amount0: out0, amount1: out1 });
    pos.refetch();
    setTimeout(lp.reset, 2500);
  }

  if (pos.shares <= 0) {
    return <p style={{ fontSize: 14, color: "var(--text-3)", lineHeight: 1.7, padding: "20px 18px" }}>No liquidity to withdraw yet. Switch to Deposit to make your first one.</p>;
  }

  return (
    <TicketBody
      pinned={pinned}
      footer={
        <button type="button" onClick={onRemove} disabled={disabled} aria-busy={busy} className="btn btn-negative btn-lg btn-block">
          {busy && <Icon name="spinner" size={17} className="animate-spin" aria-hidden="true" />}
          {lp.status === "success" && <Icon name="check" size={17} aria-hidden="true" />}
          {busy ? "Confirming…" : lp.status === "success" ? "Removed" : `Remove ${pct}% of liquidity`}
        </button>
      }
    >
      <div className="flex items-baseline justify-between mb-1">
        <label htmlFor="remove-pct" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>Amount to withdraw</label>
        <span className="font-display" aria-hidden="true" style={{ fontSize: 28, fontWeight: 800, color: "var(--text)" }}>{pct}%</span>
      </div>
      <input id="remove-pct" name="remove-pct" type="range" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))}
        aria-valuetext={`${pct}% of your position`}
        style={{ width: "100%", accentColor: "var(--lav)", margin: "8px 0 4px", minHeight: 24 }} />
      <div className="seg mt-2" role="group" aria-label="Quick amounts">
        {[25, 50, 75, 100].map((p) => (
          <button key={p} type="button" onClick={() => setPct(p)} aria-pressed={pct === p} className="seg-item">
            {p === 100 ? "Max" : `${p}%`}
          </button>
        ))}
      </div>
      <dl className="mt-4 flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
        <Detail label="You receive · USDC" value={big(out0, 2)} />
        <Detail label="You receive · WETH" value={big(out1, 4)} />
        <Detail label="Value" value={fmtUsd(valueUsdc, { dp: 2, compact: valueUsdc >= 1e6 })} />
      </dl>
    </TicketBody>
  );
}

function LiqInput({ label, sub, value, onInput }: { label: string; sub: string; value: string; onInput: (v: string) => void }) {
  const id = `liq-${label.toLowerCase()}`;
  return (
    <div className="field" style={{ padding: "10px 14px" }}>
      <div className="field-label">
        <label htmlFor={id}>{label} amount</label><span className="truncate">{sub}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <input id={id} name={id} value={value} onChange={(e) => onInput(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
          autoComplete="off" spellCheck={false} placeholder="0.0"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", color: "var(--text)", fontSize: 22, fontWeight: 800 }} />
        <div className="flex items-center gap-2 shrink-0" style={{ background: "var(--surface)", border: "1px solid var(--nav-border)", borderRadius: 22, padding: "5px 11px 5px 6px", boxShadow: "var(--shadow-sm)" }}>
          <TokenIcon sym={label} size={18} />
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{label}</span>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3" style={{ fontSize: 13 }}>
      <dt style={{ color: "var(--text-3)" }}>{label}</dt>
      <dd className="min-w-0 truncate" style={{ color: strong ? "var(--text)" : "var(--text-2)", fontWeight: strong ? 800 : 700, textAlign: "right" }} title={typeof value === "string" ? value : undefined}>{value}</dd>
    </div>
  );
}
