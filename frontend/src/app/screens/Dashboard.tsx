import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePoolState } from "@/hooks/usePoolState";
import { usePoolTotals, useWalletActivity } from "@/hooks/useBackend";
import { useDetectorConfig } from "@/hooks/useDetectorConfig";
import { useDetectorSeries } from "@/hooks/useDetectorSeries";
import { useBalances } from "@/hooks/useBalances";
import { usePosition } from "@/hooks/usePosition";
import { useFaucet } from "@/hooks/useSwap";
import { fmtUsd, fmtNum, fmtPct, shorten } from "@/lib/format";
import { CONTRACTS, EXPLORER } from "@/config/contracts";
import { fromWei } from "@/lib/units";
import { priceOf, type LpEvent, type SwapRow } from "@/lib/db";
import { useIsNarrow } from "@/hooks/useMediaQuery";
import { Icon } from "@/components/ui/Icon";
import { Skel } from "@/components/ui/Skeleton";
import { WalletAvatar } from "@/components/ui/WalletAvatar";
import { PanelHead } from "@/components/ui/Panel";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { EvidenceChart } from "@/components/ui/EvidenceChart";

/**
 * The Dashboard as an exchange account overview: who you are on the platform and what you hold
 * first, then the market (the detector's evidence chart, unchanged), then your own activity with
 * what the hook did to each trade, then the pool (the market-wide tape lives on Trade). Everything personal is read for the connected
 * wallet - balances and LP shares from the chain, history from the backend mirror.
 */

const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
/** Plain digits normally; compact (3.5B) once a figure would overflow a narrow column. */
const big = (n: number, dp: number) => (Math.abs(n) >= 1e6 ? compactFmt.format(n) : fmtNum(n, dp));

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const stampFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function regimeOf(trend: string) {
  if (trend === "up") return { label: "Up-trend", ink: "var(--up-ink)", bg: "rgba(107,184,154,.15)" };
  if (trend === "down") return { label: "Down-trend", ink: "var(--down-ink)", bg: "rgba(229,140,160,.15)" };
  return { label: "Calm", ink: "var(--lav-ink)", bg: "rgba(142,136,216,.15)" };
}

/** Per-wallet figures: what this wallet traded, and how the hook treated it. */
function tradeStatsOf(rows: SwapRow[]) {
  let volume = 0;
  let spreadPaid = 0;
  let freeVolume = 0;
  let steadying = 0;
  for (const t of rows) {
    const n = t.notional_usdc || 0;
    volume += n;
    if (t.with_trend && (t.spread_frac || 0) > 0) spreadPaid += n * t.spread_frac;
    else freeVolume += n;
    if (!t.with_trend && (t.kappa || 0) > 0) steadying += 1;
  }
  return { count: rows.length, volume, spreadPaid, freeShare: volume > 0 ? freeVolume / volume : 0, steadying };
}

function lpStatsOf(events: LpEvent[]) {
  let added = 0;
  let removed = 0;
  let netShares = 0;
  let sharesKnown = true;
  for (const e of events) {
    if (e.kind === "add") {
      added += e.value_usdc || 0;
      netShares += e.shares || 0;
      if (!(e.shares > 0)) sharesKnown = false; // older deposits were recorded without their share count
    } else {
      removed += e.value_usdc || 0;
      netShares -= e.shares || 0;
    }
  }
  return { netDeposited: added - removed, count: events.length, netShares, sharesKnown };
}

/** The recorded deposits explain the position only if they add up to the shares held. Liquidity
 *  added outside this app (a deploy script, another front end) is invisible to the backend, and a
 *  P&L against a partial deposit history would credit those deposits as profit. */
function historyCovers(lp: ReturnType<typeof lpStatsOf>, sharesHeld: number) {
  if (!lp.count || !lp.sharesKnown || sharesHeld <= 0) return false;
  return Math.abs(lp.netShares - sharesHeld) <= sharesHeld * 0.01;
}

export function Dashboard() {
  const s = usePoolState();
  const cfg = useDetectorConfig();
  const totals = usePoolTotals().data;
  const series = useDetectorSeries();
  const bal = useBalances();
  const pos = usePosition();
  const me = useWalletActivity();
  const faucet = useFaucet();
  const narrow = useIsNarrow();

  const price = s.price;
  const walletValue = bal.usdc + bal.weth * price;
  const lpValue = pos.valueUsdc;
  const total = walletValue + lpValue;
  const trades = useMemo(() => tradeStatsOf(me.swaps), [me.swaps]);
  const [hide, setHide] = useHiddenBalances();
  const lp = useMemo(() => lpStatsOf(me.lpEvents), [me.lpEvents]);

  const account = (
    <AccountBar
      address={me.address}
      firstSeen={me.profile?.first_seen}
      visits={me.profile?.visit_count}
      total={total}
      walletValue={walletValue}
      lpValue={lpValue}
      trades={trades}
      empty={bal.usdc + bal.weth < 1e-9 && pos.shares === 0}
      onFaucet={async () => { await faucet.mint(); bal.refetch(); }}
      minting={faucet.minting}
      hide={hide}
      onToggleHide={() => setHide(!hide)}
    />
  );

  const market = <MarketPanel s={s} cfg={cfg} series={series} />;
  const assets = (
    <AssetsCard
      usdc={bal.usdc}
      weth={bal.weth}
      price={price}
      lpShares={pos.shares}
      lpValue={lpValue}
      sharePct={pos.sharePct}
      underlying0={pos.underlying0}
      underlying1={pos.underlying1}
      netDeposited={lp.count ? lp.netDeposited : null}
      historyComplete={historyCovers(lp, pos.shares)}
      lvrShare={totals ? totals.lvr_avoided * pos.sharePct : null}
      total={total}
      hide={hide}
    />
  );
  const activity = <ActivityCard swaps={me.swaps} lpEvents={me.lpEvents} stats={trades} loading={me.loading} />;
  const pool = <PoolCard s={s} totals={totals} cfg={cfg} />;

  return (
    <div className="px-3 sm:px-4 pt-4 pb-8 flex flex-col" style={{ gap: 12 }}>
      {account}
      {narrow ? (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {assets}
          {market}
          {activity}
          {pool}
        </div>
      ) : (
        <div className="grid items-stretch" style={{ gridTemplateColumns: "minmax(0,1fr) 380px", gap: 12 }}>
          <div className="dash-col flex flex-col min-w-0" style={{ gap: 12 }}>
            {market}
            {activity}
          </div>
          <div className="dash-col flex flex-col min-w-0" style={{ gap: 12 }}>
            {assets}
            {pool}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Account bar

const HIDE_KEY = "poincare-hide-balances";
const MASK = "••••••";

/** Remembered per browser; storage can throw in private windows, in which case it just isn't remembered. */
function useHiddenBalances() {
  const [hide, setHide] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
  });
  const set = (v: boolean) => {
    setHide(v);
    try { localStorage.setItem(HIDE_KEY, v ? "1" : "0"); } catch { /* not remembered */ }
  };
  return [hide, set] as const;
}

function AccountBar({
  address, firstSeen, visits, total, walletValue, lpValue, trades, empty, onFaucet, minting, hide, onToggleHide,
}: {
  address?: string;
  firstSeen?: string;
  visits?: number;
  total: number;
  walletValue: number;
  lpValue: number;
  trades: ReturnType<typeof tradeStatsOf>;
  empty: boolean;
  onFaucet: () => void;
  minting: boolean;
  hide: boolean;
  onToggleHide: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const addr = address ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard refused: nothing to do */ }
  };
  const goTop = () => window.scrollTo({ top: 0 });
  const money = (n: number) => (hide ? MASK : fmtUsd(n, { dp: 2, compact: n >= 1e6 }));

  return (
    <section className="card" aria-label="Your account" style={{ padding: 0 }}>
      <div className="flex flex-wrap items-center justify-between px-5 py-4" style={{ gap: "14px 24px" }}>
        <div className="flex items-center gap-3.5 min-w-0">
          {addr ? <WalletAvatar address={addr} size={52} /> : <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 999, background: "var(--surface-2)" }} />}
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-display truncate" translate="no" title={addr} style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{addr ? shorten(addr) : "—"}</span>
              <button type="button" className="icon-btn icon-btn-plain" onClick={copy} aria-label={copied ? "Address copied" : "Copy wallet address"} title="Copy address" style={{ color: copied ? "var(--up-ink)" : "var(--text-3)" }}>
                <Icon name={copied ? "check" : "copy"} size={15} aria-hidden="true" />
              </button>
              {addr && (
                <a className="icon-btn icon-btn-plain" href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer" title="View on explorer" aria-label="View wallet on the block explorer (opens in a new tab)" style={{ color: "var(--text-3)" }}>
                  <Icon name="external" size={15} aria-hidden="true" />
                </a>
              )}
              <span className="sr-only" aria-live="polite">{copied ? "Address copied" : ""}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1" style={{ fontSize: 12, color: "var(--text-3)" }}>
              <span>{firstSeen ? `Member since ${dateFmt.format(new Date(firstSeen))}` : "Welcome to Poincaré"}</span>
              {visits && visits > 1 ? <><span aria-hidden="true">·</span><span>{visits} visits</span></> : null}
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ fontWeight: 700, color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--up)" }} />
                Unichain Sepolia
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {empty ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onFaucet} disabled={minting} aria-busy={minting}>
              {minting && <Icon name="spinner" size={14} className="animate-spin" aria-hidden="true" />}
              {minting ? "Minting…" : "Get test tokens"}
            </button>
          ) : null}
          <Link to={{ search: "?tab=trade" }} onClick={goTop} className="btn btn-positive btn-sm">
            <Icon name="swap" size={14} aria-hidden="true" /> Trade
          </Link>
          <Link to={{ search: "?tab=pool" }} onClick={goTop} className="btn btn-secondary btn-sm">
            <Icon name="plus" size={14} aria-hidden="true" /> Add liquidity
          </Link>
        </div>
      </div>

      <dl className="acct-strip">
        <div className="acct-cell">
          <dt className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
            Estimated balance
            <button type="button" className="icon-btn icon-btn-plain hit-slop" onClick={onToggleHide} aria-pressed={hide} aria-label={hide ? "Show balances" : "Hide balances"} title={hide ? "Show balances" : "Hide balances"} style={{ color: "var(--text-3)", width: 22, height: 18, borderRadius: 6 }}>
              <Icon name={hide ? "eye-off" : "eye"} size={14} aria-hidden="true" />
            </button>
          </dt>
          <dd>
            <div className="font-display" style={{ fontSize: "clamp(22px, 2.4vw, 28px)", fontWeight: 800, color: "var(--text)", lineHeight: 1.15 }}>{money(total)}</div>
            <div className="truncate" style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }} title={hide ? undefined : `Wallet ${fmtUsd(walletValue, { dp: 2 })} · Liquidity ${fmtUsd(lpValue, { dp: 2 })}`}>
              Wallet <b style={{ color: "var(--text-2)" }}>{money(walletValue)}</b> · Liquidity <b style={{ color: "var(--text-2)" }}>{money(lpValue)}</b>
            </div>
          </dd>
        </div>
        <AccStat label="Your trades" value={fmtNum(trades.count, 0)} sub={trades.volume > 0 ? `${hide ? MASK : fmtUsd(trades.volume, { compact: true })} volume` : "None yet"} />
        <AccStat label="Spread-free volume" value={trades.volume > 0 ? `${Math.round(trades.freeShare * 100)}%` : "—"} sub="Traded at the plain curve price" ink="var(--up-ink)" />
        <AccStat label="Trend spread paid" value={trades.count ? (hide ? MASK : fmtUsd(trades.spreadPaid, { dp: 2, compact: trades.spreadPaid >= 1e4 })) : "—"} sub="Went to LPs" ink="var(--honey-ink)" />
      </dl>
    </section>
  );
}

function AccStat({ label, value, sub, ink }: { label: string; value: string; sub: string; ink?: string }) {
  return (
    <div className="acct-cell min-w-0">
      <dt style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{label}</dt>
      <dd>
        <div className="font-display truncate" title={value} style={{ fontSize: "clamp(16px, 4.6vw, 20px)", fontWeight: 800, color: ink ?? "var(--text)", lineHeight: 1.3 }}>{value}</div>
        <div className="acct-sub truncate" style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{sub}</div>
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Market: the detector evidence chart, with the live readouts in a compact strip

function MarketPanel({
  s, cfg, series,
}: {
  s: ReturnType<typeof usePoolState>;
  cfg: ReturnType<typeof useDetectorConfig>;
  series: ReturnType<typeof useDetectorSeries>;
}) {
  const regime = regimeOf(s.trend);
  const kappaMax = cfg.kappaMax || 0.05;
  const side = (sp: number) => (sp > 0 ? { v: `+${fmtPct(sp)}`, c: "var(--honey-ink)" } : { v: "No spread", c: "var(--up-ink)" });
  const buy = side(s.spreadZeroForOne);
  const sell = side(s.spreadOneForZero);

  return (
    <section className="card" aria-labelledby="market-title" style={{ padding: 0 }}>
      <PanelHead id="market-title" title={<>
        <span className="flex" aria-hidden="true">
          <TokenIcon sym="WETH" size={22} />
          <span style={{ marginLeft: -7 }}><TokenIcon sym="USDC" size={22} /></span>
        </span>
        WETH / USDC
        <span style={{ color: "var(--text-2)" }}>{s.loading ? <Skel /> : fmtNum(s.price, 2)}</span>
      </>}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Detector · two-sided CUSUM</span>
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ fontSize: 12, fontWeight: 800, color: regime.ink, background: regime.bg }} role="status">
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: regime.ink }} />
            {regime.label}
          </span>
        </div>
      </PanelHead>

      <div className="px-5 pt-4 pb-2">
        <EvidenceChart points={series.points} thresholdH={cfg.h} loading={series.loading} height={210} />
      </div>

      <div className="grid px-5 pb-4 pt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: 14, borderTop: "1px solid var(--divider)" }}>
        <Readout label="Buy side"><b style={{ color: buy.c }}>{buy.v}</b></Readout>
        <Readout label="Sell side"><b style={{ color: sell.c }}>{sell.v}</b></Readout>
        <Readout label="Lean κ">
          <b style={{ color: s.kappa > 0 ? "var(--honey-ink)" : "var(--text)" }}>{fmtPct(s.kappa)}</b>
          <Meter frac={s.kappa / kappaMax} color="var(--honey)" label={`of ${fmtPct(kappaMax)} cap`} />
        </Readout>
        <Readout label="Efficiency D">
          <b style={{ color: s.directionalEfficiency >= cfg.dFloor ? "var(--up-ink)" : "var(--text)" }}>{fmtPct(s.directionalEfficiency)}</b>
          <Meter frac={s.directionalEfficiency} color="var(--lav)" marker={cfg.dFloor} label={`floor ${fmtPct(cfg.dFloor, 0)}`} />
        </Readout>
        <Readout label="Volatility σ̂"><b style={{ color: "var(--text)" }}>{fmtPct(s.sigma)}</b></Readout>
        <Readout label="Base fee"><b style={{ color: "var(--text)" }}>{fmtPct(s.fee)}</b></Readout>
      </div>
    </section>
  );
}

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0" style={{ fontSize: 15 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  );
}

function Meter({ frac, color, marker, label }: { frac: number; color: string; marker?: number; label: string }) {
  return (
    <div style={{ marginTop: 5 }}>
      <div style={{ position: "relative", height: 5, borderRadius: 3, background: "var(--track)", overflow: "hidden" }} aria-hidden="true">
        <div style={{ height: "100%", width: "100%", background: color, transform: `scaleX(${Math.min(1, Math.max(0.02, frac))})`, transformOrigin: "left" }} />
        {marker !== undefined && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${Math.min(100, marker * 100)}%`, width: 2, background: "var(--text-2)" }} />}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Your assets

function AssetsCard({
  usdc, weth, price, lpShares, lpValue, sharePct, underlying0, underlying1, netDeposited, historyComplete, lvrShare, total, hide,
}: {
  usdc: number; weth: number; price: number; lpShares: number; lpValue: number; sharePct: number;
  underlying0: number; underlying1: number; netDeposited: number | null; historyComplete: boolean; lvrShare: number | null; total: number; hide: boolean;
}) {
  const money = (n: number) => (hide ? MASK : fmtUsd(n, { dp: 2, compact: n >= 1e6 }));
  const rows = [
    { key: "USDC", name: "USD Coin", icon: <TokenIcon sym="USDC" size={26} />, amount: hide ? MASK : big(usdc, 2), full: fmtNum(usdc, 2), value: usdc, color: "var(--lav)" },
    { key: "WETH", name: "Wrapped Ether", icon: <TokenIcon sym="WETH" size={26} />, amount: hide ? MASK : big(weth, 4), full: fmtNum(weth, 4), value: weth * price, color: "var(--honey)" },
    {
      key: "LP", name: "Pool shares", amount: hide ? MASK : big(lpShares, 2), full: `${fmtNum(lpShares, 4)} shares`, value: lpValue, color: "var(--up)",
      icon: <span aria-hidden="true" className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 99, background: "var(--green-bg)", color: "var(--green-label)" }}><Icon name="pool" size={14} /></span>,
    },
  ];
  const pnl = netDeposited !== null && lpShares > 0 && historyComplete ? lpValue - netDeposited : null;
  // Allocation: a real but tiny holding reads "<1%", never a flat "0%".
  const share = (v: number) => {
    if (!(total > 0)) return "—";
    const f = v / total;
    return f > 0 && f < 0.005 ? "<1%" : `${Math.round(f * 100)}%`;
  };

  return (
    <section className="card" aria-labelledby="assets-title" style={{ padding: 0 }}>
      <PanelHead id="assets-title" title="Your assets">
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-2)" }}>{money(total)}</span>
      </PanelHead>

      {total > 0 && (
        <div className="flex mx-5 mt-4 rounded overflow-hidden" style={{ height: 6, gap: 2 }} role="img"
          aria-label={`Allocation: ${rows.map((r) => `${r.key} ${share(r.value)}`).join(", ")}`}>
          {rows.filter((r) => r.value > 0).map((r) => <div key={r.key} style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />)}
        </div>
      )}

      <table className="w-full mt-2" style={{ borderCollapse: "collapse" }}>
        <caption className="sr-only">Wallet balances and liquidity position</caption>
        <thead>
          <tr>
            {["Asset", "Amount", "Value"].map((h, i) => (
              <th key={h} scope="col" style={{ textAlign: i ? "right" : "left", padding: i === 1 ? "8px 8px" : "8px clamp(12px, 3.5vw, 20px)", fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ borderTop: "1px solid var(--divider)" }}>
              <th scope="row" style={{ textAlign: "left", padding: "10px clamp(12px, 3.5vw, 20px)", fontWeight: 400 }}>
                <span className="flex items-center gap-2.5">
                  {r.icon}
                  <span>
                    <span className="block" style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{r.key}</span>
                    <span className="block" style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>{r.name}</span>
                  </span>
                </span>
              </th>
              <td title={hide ? undefined : r.full} style={{ textAlign: "right", padding: "10px 8px", fontSize: 13, fontWeight: 700, color: "var(--text-2)", whiteSpace: "nowrap" }}>{r.amount}</td>
              <td style={{ textAlign: "right", padding: "10px clamp(12px, 3.5vw, 20px)", fontSize: 13, fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap" }}>
                {money(r.value)}
                <span className="block" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>{share(r.value)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mx-5 mb-5 mt-1 rounded-xl p-3.5" style={{ background: lpShares > 0 ? "var(--green-bg)" : "var(--surface-2)", border: `1px solid ${lpShares > 0 ? "var(--green-border)" : "var(--border)"}` }}>
        {lpShares > 0 ? (
          <dl className="flex flex-col" style={{ gap: 6 }}>
            <Line label="Share of pool" value={fmtPct(sharePct, sharePct < 0.01 ? 3 : 2)} />
            <Line label="Redeems for" value={hide ? MASK : `${fmtNum(underlying0, 2)} USDC + ${fmtNum(underlying1, 4)} WETH`} />
            {netDeposited !== null && <Line label={historyComplete ? "Net deposited" : "Deposited via this app"} value={money(netDeposited)} />}
            {pnl !== null && (
              <Line label="P&L vs deposited" value={hide ? MASK : `${pnl >= 0 ? "+" : "−"}${fmtUsd(Math.abs(pnl), { dp: 2 })}`} ink={pnl >= 0 ? "var(--up-ink)" : "var(--down-ink)"} />
            )}
            {pnl === null && netDeposited !== null && (
              <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-3)" }}>
                P&amp;L not shown: part of this position was added outside the app, so the recorded deposits don&rsquo;t cover it.
              </p>
            )}
            {lvrShare !== null && (
              <Line label="LVR retained · your share" value={money(lvrShare)} ink="var(--green-label)" hint="Pool-wide LVR retained, at your current share of the pool" />
            )}
          </dl>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--text-2)" }}>Provide liquidity to earn the trend spread the hook charges.</span>
            <Link to={{ search: "?tab=pool" }} onClick={() => window.scrollTo({ top: 0 })} className="btn btn-soft btn-sm shrink-0">Add liquidity</Link>
          </div>
        )}
      </div>
    </section>
  );
}

function Line({ label, value, ink, hint }: { label: string; value: ReactNode; ink?: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-3" style={{ fontSize: 12 }} title={hint}>
      <dt style={{ color: "var(--text-3)" }}>{label}</dt>
      <dd style={{ color: ink ?? "var(--text-2)", fontWeight: 800, textAlign: "right" }}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Your activity

function hookTag(t: SwapRow) {
  if (t.with_trend && (t.spread_frac || 0) > 0) return { text: `Paid ${fmtPct(t.spread_frac)} → LPs`, ink: "var(--honey-ink)", bg: "var(--warn-bg)" };
  if ((t.kappa || 0) > 0) return { text: "Counter-trend · free", ink: "var(--up-ink)", bg: "var(--green-bg)" };
  return { text: "Calm · free", ink: "var(--text-3)", bg: "var(--surface-2)" };
}

function ActivityCard({ swaps, lpEvents, stats, loading }: { swaps: SwapRow[]; lpEvents: LpEvent[]; stats: ReturnType<typeof tradeStatsOf>; loading: boolean }) {
  const [tab, setTab] = useState<"trades" | "liquidity">("trades");
  const head = (cols: string[], right: number[]) => (
    <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
      <tr>
        {cols.map((h, i) => (
          <th key={h} scope="col" style={{ textAlign: right.includes(i) ? "right" : "left", padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "var(--muted)", borderBottom: "1px solid var(--divider)", whiteSpace: "nowrap" }}>{h}</th>
        ))}
      </tr>
    </thead>
  );
  const cell = { padding: "9px 14px", fontSize: 12, borderBottom: "1px solid var(--divider-2)", whiteSpace: "nowrap" as const };

  return (
    <section className="card flex flex-col" aria-labelledby="activity-title" style={{ padding: 0 }}>
      <PanelHead id="activity-title" title="Your activity">
        <div className="seg seg-sm" role="group" aria-label="Activity type" style={{ padding: 2, marginRight: "auto" }}>
          <button type="button" className="seg-item" style={{ whiteSpace: "nowrap" }} aria-pressed={tab === "trades"} onClick={() => setTab("trades")}>Trades{swaps.length ? ` · ${swaps.length}` : ""}</button>
          <button type="button" className="seg-item" style={{ whiteSpace: "nowrap" }} aria-pressed={tab === "liquidity"} onClick={() => setTab("liquidity")}>Liquidity{lpEvents.length ? ` · ${lpEvents.length}` : ""}</button>
        </div>
        {tab === "trades" && stats.count > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1" style={{ fontSize: 12, color: "var(--text-3)" }}>
            <span>Volume <b style={{ color: "var(--text)" }}>{fmtUsd(stats.volume, { compact: true })}</b></span>
            <span>Spread-free <b style={{ color: "var(--up-ink)" }}>{Math.round(stats.freeShare * 100)}%</b></span>
            <span>Steadying trades <b style={{ color: "var(--text)" }}>{stats.steadying}</b></span>
          </div>
        )}
      </PanelHead>

      <div className="overflow-auto flex-1" style={{ maxHeight: 420 }} tabIndex={0} aria-label={tab === "trades" ? "Your trades" : "Your liquidity events"}>
        {loading ? (
          <p style={{ padding: 24, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>Loading your history…</p>
        ) : tab === "trades" ? (
          swaps.length === 0 ? (
            <Empty text="No trades from this wallet yet." cta="Make your first trade" to="trade" />
          ) : (
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <caption className="sr-only">Your trades, newest first</caption>
              {head(["Time", "Side", "Size · WETH", "Price", "Value", "Hook", ""], [2, 3, 4])}
              <tbody>
                {swaps.map((t) => {
                  const buy = t.side === "buy_weth";
                  const tag = hookTag(t);
                  return (
                    <tr key={t.tx_hash} className="row-hover">
                      <td style={{ ...cell, color: "var(--text-3)" }}>{t.ts ? stampFmt.format(new Date(t.ts)) : "—"}</td>
                      <td style={{ ...cell, fontWeight: 800, color: buy ? "var(--up-ink)" : "var(--down-ink)" }}>
                        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: buy ? "var(--up)" : "var(--down)" }} />{buy ? "Buy" : "Sell"}</span>
                      </td>
                      <td style={{ ...cell, textAlign: "right", color: "var(--text-2)" }}>{fmtNum(buy ? t.amount_out : t.amount_in, 4)}</td>
                      <td style={{ ...cell, textAlign: "right", color: "var(--text-2)" }}>{fmtNum(priceOf(t), 2)}</td>
                      <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "var(--text)" }}>{fmtUsd(t.notional_usdc || 0, { dp: 2 })}</td>
                      <td style={cell}><span className="rounded-full px-2 py-0.5" style={{ fontWeight: 700, color: tag.ink, background: tag.bg }}>{tag.text}</span></td>
                      <td style={{ ...cell, textAlign: "right" }}><TxLink hash={t.tx_hash} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : lpEvents.length === 0 ? (
          <Empty text="No liquidity added from this wallet yet." cta="Add liquidity" to="pool" />
        ) : (
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <caption className="sr-only">Your liquidity events, newest first</caption>
            {head(["Time", "Action", "Shares", "USDC", "WETH", "Value", ""], [2, 3, 4, 5])}
            <tbody>
              {lpEvents.map((e) => (
                <tr key={e.tx_hash} className="row-hover">
                  <td style={{ ...cell, color: "var(--text-3)" }}>{e.ts ? stampFmt.format(new Date(e.ts)) : "—"}</td>
                  <td style={{ ...cell, fontWeight: 800, color: e.kind === "add" ? "var(--up-ink)" : "var(--down-ink)" }}>{e.kind === "add" ? "Add" : "Remove"}</td>
                  <td style={{ ...cell, textAlign: "right", color: "var(--text-2)" }} title={e.shares > 0 ? undefined : "Share count not recorded for this deposit"}>{e.shares > 0 ? fmtNum(e.shares, 4) : "—"}</td>
                  <td style={{ ...cell, textAlign: "right", color: "var(--text-2)" }}>{fmtNum(e.amount0, 2)}</td>
                  <td style={{ ...cell, textAlign: "right", color: "var(--text-2)" }}>{fmtNum(e.amount1, 4)}</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "var(--text)" }}>{fmtUsd(e.value_usdc || 0, { dp: 2 })}</td>
                  <td style={{ ...cell, textAlign: "right" }}><TxLink hash={e.tx_hash} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center" aria-label="View transaction on the block explorer (opens in a new tab)" style={{ color: "var(--text-3)" }}>
      <Icon name="external" size={13} aria-hidden="true" />
    </a>
  );
}

function Empty({ text, cta, to }: { text: string; cta: string; to: "trade" | "pool" }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center" style={{ padding: "32px 20px" }}>
      <p style={{ fontSize: 13, color: "var(--text-3)" }}>{text}</p>
      <Link to={{ search: `?tab=${to}` }} onClick={() => window.scrollTo({ top: 0 })} className="btn btn-soft btn-sm">{cta}</Link>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Pool overview

function PoolCard({ s, totals, cfg }: { s: ReturnType<typeof usePoolState>; totals: ReturnType<typeof usePoolTotals>["data"]; cfg: ReturnType<typeof useDetectorConfig> }) {
  const r0 = fromWei(s.r0, "USDC");
  const r1 = fromWei(s.r1, "WETH");
  const tvl = r0 + r1 * s.price;
  const usdcShare = tvl > 0 ? r0 / tvl : 0.5;
  return (
    <section className="card flex flex-col" aria-labelledby="pool-title" style={{ padding: 0 }}>
      <PanelHead id="pool-title" title="Pool overview">
        <a href={`${EXPLORER}/address/${CONTRACTS.hook}`} target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1" translate="no"
          aria-label={`Hook contract ${CONTRACTS.hook} on the block explorer (opens in a new tab)`} style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
          {shorten(CONTRACTS.hook)} <Icon name="external" size={12} aria-hidden="true" />
        </a>
      </PanelHead>
      <div className="grid grid-cols-2 px-5 pt-4" style={{ gap: 14 }}>
        <PoolStat label="Total value locked" value={s.loading ? <Skel /> : fmtUsd(tvl, { compact: true })} sub={`${fmtNum(r1, 2)} WETH · ${fmtUsd(r0, { compact: true }).replace("$", "")} USDC`} />
        <PoolStat label="24h volume" value={totals ? fmtUsd(totals.volume_24h, { compact: true }) : <Skel />} sub={`${fmtNum(totals?.swap_count ?? 0, 0)} swaps all time`} />
      </div>
      <div className="m-5 mt-4 rounded-xl p-3.5" style={{ background: "var(--green-bg)", border: "1px solid var(--green-border)" }}>
        <div className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 700, color: "var(--green-label)" }}>
          <Icon name="spark" size={13} aria-hidden="true" /> LVR retained for LPs
        </div>
        <div className="font-display" style={{ fontSize: 24, fontWeight: 800, color: "var(--green-label)", lineHeight: 1.2 }}>
          {!totals ? <Skel /> : totals.swap_count > 0 ? fmtUsd(totals.lvr_avoided, { dp: 2, compact: totals.lvr_avoided > 99_999 }) : "—"}
        </div>
        <div style={{ fontSize: 12, color: "var(--green-sub)", lineHeight: 1.5, marginTop: 2 }}>
          The spread charged to with-trend flow: value a constant-product pool would have leaked to arbitrageurs.
        </div>
      </div>

      <div className="px-5 pb-5 flex flex-col" style={{ gap: 14 }}>
        <div>
          <div className="flex justify-between" style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
            <span>Reserves by value</span>
            <span>
              <span style={{ color: "var(--lav-ink)" }}>USDC {Math.round(usdcShare * 100)}%</span>
              {" · "}
              <span style={{ color: "var(--honey-ink)" }}>WETH {Math.round((1 - usdcShare) * 100)}%</span>
            </span>
          </div>
          <div className="flex overflow-hidden rounded-full" style={{ height: 6, gap: 2 }} aria-hidden="true">
            <span style={{ width: `${usdcShare * 100}%`, background: "var(--lav)" }} />
            <span style={{ flex: 1, background: "var(--honey)" }} />
          </div>
        </div>
        <dl className="flex flex-col" style={{ gap: 7 }}>
          <Line label="Pool price" value={s.loading ? <Skel /> : `${fmtNum(s.price, 2)} USDC`} />
          <Line label="All-time volume" value={totals ? fmtUsd(totals.volume_usdc, { compact: true }) : <Skel />} />
          <Line label="Base fee · vol-scaled" value={fmtPct(s.fee)} />
          <Line label="Spread cap · κ_max" value={fmtPct(cfg.kappaMax)} />
          <Line label="Detector threshold h" value={cfg.h ? cfg.h.toFixed(4) : "—"} />
          <Line label="Pricing" value="Pool's own reserves · no oracle" />
        </dl>
      </div>
    </section>
  );
}

function PoolStat({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return (
    <div className="min-w-0">
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{label}</div>
      <div className="font-display" style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", lineHeight: 1.3 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>{sub}</div>
    </div>
  );
}
