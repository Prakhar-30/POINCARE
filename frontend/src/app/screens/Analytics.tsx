import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParam } from "@/hooks/useParam";
import { PanelHead, StatStrip, StatCell, SourceTag, Seg } from "@/components/ui/Panel";
import { usePoolState } from "@/hooks/usePoolState";
import { useDetectorConfig } from "@/hooks/useDetectorConfig";
import { useDetectorSeries } from "@/hooks/useDetectorSeries";
import { usePoolTotals, useWalletTotals, useTape } from "@/hooks/useBackend";
import { fmtPct, fmtUsd, fmtNum } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Skel } from "@/components/ui/Skeleton";
import { useIsNarrow } from "@/hooks/useMediaQuery";
import { AiNote } from "@/components/ui/AiNote";
import { useExplain } from "@/hooks/useExplain";
import type { ReportFacts } from "@/lib/narrate";
import {
  analyticsOf, counterfactualOf, biggestLeanOf,
  dailyActivityOf, capturedByTrendOf, sideSplitOf, kappaHistogramOf,
} from "@/lib/analytics";
import {
  RegimeBar, FlowSplitChart, RiskMeter, KappaHistogram,
  ValueTimeline, TimelineLegend, SplitBar,
} from "@/components/ui/AnalyticsCharts";

/**
 * The Analytics screen: a standing report on what this pool has actually done, rather than a
 * second copy of the live gauges.
 *
 * Laid out like an exchange's market-data page: a strip of headline figures, then panels in the
 * order a liquidity provider asks - what did it keep, who paid, how hard does it lean, is anything
 * happening right now - and the tuning, the historical study and app usage below. The model-written
 * report and the parameter table are reference material, so they sit behind disclosures; the
 * historical study and the app's own usage figures close the page and are labelled as such,
 * because a backtest number next to a live one must never read as the same kind of claim.
 *
 * Everything on this page is measured. Where a number cannot be computed from recorded data the
 * card says so instead of rendering a zero, because on this page a confident zero is worse than
 * an honest blank. Range, chart/table view and open panels live in the URL so a shared link
 * shows what its sender saw.
 */

const RANGES = [
  { id: "24h", label: "24h", ms: 86_400_000 },
  { id: "7d", label: "7d", ms: 7 * 86_400_000 },
  { id: "all", label: "All", ms: Infinity },
] as const;
type Range = (typeof RANGES)[number]["id"];

export function Analytics() {
  const s = usePoolState();
  const cfg = useDetectorConfig();
  const totals = usePoolTotals().data;
  const users = useWalletTotals().data;
  const series = useDetectorSeries();
  const tape = useTape(200).data ?? [];
  const narrow = useIsNarrow();

  const [range, setRange] = useParam<Range>("range", RANGES.map((r) => r.id), "all");
  const [view, setView] = useParam("view", ["chart", "table"] as const, "chart");
  const [reportOpen, setReportOpen] = useParam("report", ["closed", "open"] as const, "closed");
  const [paramsOpen, setParamsOpen] = useParam("params", ["closed", "open"] as const, "closed");

  const a = useMemo(
    () => analyticsOf(series.points, tape, { h: cfg.h, dFloor: cfg.dFloor }),
    [series.points, tape, cfg.h, cfg.dFloor],
  );
  const cf = useMemo(() => counterfactualOf(tape), [tape]);
  const biggest = useMemo(() => biggestLeanOf(tape), [tape]);
  const byTrend = useMemo(() => capturedByTrendOf(tape), [tape]);
  const bySide = useMemo(() => sideSplitOf(tape), [tape]);
  const kappaHist = useMemo(() => kappaHistogramOf(tape, cfg.kappaMax), [tape, cfg.kappaMax]);

  // The timeline's slice of the tape: oldest first, cut to the chosen range.
  const inRange = useMemo(() => {
    const ms = RANGES.find((r) => r.id === range)!.ms;
    const cutoff = Date.now() - ms;
    const asc = [...tape].reverse();
    return ms === Infinity ? asc : asc.filter((t) => t.ts && Date.parse(t.ts) >= cutoff);
  }, [tape, range]);
  const days = useMemo(() => dailyActivityOf(inRange, 400), [inRange]);

  const volume = a.flow.withTrend + a.flow.free;

  const facts: ReportFacts | null = useMemo(() => {
    if (!series.points.length) return null;
    const vol = a.flow.withTrend + a.flow.free;
    return {
      trend: s.trend,
      riskLevel: a.risk.level,
      progressToThresholdPct: a.risk.progress * 100,
      gateBlocking: a.risk.gated,
      dPct: s.directionalEfficiency * 100,
      dFloorPct: cfg.dFloor * 100,
      kappaPct: s.kappa * 100,
      kappaMaxPct: cfg.kappaMax * 100,
      sigmaPct: s.sigma * 100,
      samples: a.samples,
      engagedPct: a.engagedFrac * 100,
      calmPct: a.regime.total ? (a.regime.calm / a.regime.total) * 100 : 0,
      upPct: a.regime.total ? (a.regime.up / a.regime.total) * 100 : 0,
      downPct: a.regime.total ? (a.regime.down / a.regime.total) * 100 : 0,
      longestTrendRun: a.longestRun,
      meanKappaWhenEngagedPct: a.meanKappaWhenEngaged * 100,
      swaps: totals?.swap_count ?? tape.length,
      volumeUsdc: totals?.volume_usdc ?? vol,
      withTrendVolumeUsdc: a.flow.withTrend,
      freeVolumeUsdc: a.flow.free,
      paidSpreadPct: vol > 0 ? (a.flow.withTrend / vol) * 100 : 0,
      keptByLpUsdc: a.flow.captured,
    };
  }, [series.points.length, a, s, cfg, totals, tape.length]);

  // Keyed on the latest sampled block AND the swap count: the report covers both, so either
  // changing is a genuinely different question and deserves its own cached answer.
  const report = useExplain({
    kind: "report",
    cacheKey: facts
      ? `${series.points[series.points.length - 1]?.block_number ?? 0}-${facts.swaps}`
      : null,
    facts,
    // The fallback stays as the last resort for a pool with no samples at all; with samples the
    // panel waits on the model rather than substituting a local reading, because the report IS
    // the model's reading and a blunter stand-in would be passing one off as the other.
    fallback: "Waiting for the first detector samples — one is recorded per traded block.",
    auto: true,
    retry: Boolean(facts),
  });

  // The tape is a window, not the whole history: say how many swaps a tape-derived figure covers.
  const tapeScope = `over the latest ${fmtNum(tape.length, 0)} swaps`;
  const partialTape = (totals?.swap_count ?? 0) > tape.length;

  const study = [
    { label: "LP value vs a 30 bps pool", value: "+6.4%", sub: "4 years of real ETH/USDC", ink: "var(--up-ink)" },
    { label: "Arbitrage extraction cut", value: "32%", sub: "Same four-year replay", ink: "var(--up-ink)" },
    { label: "LVR reduction, synthetic", value: "50.6%", sub: "Mean of 5 seeded stress paths", ink: "var(--lav-ink)" },
    { label: "LP advantage, 12m real", value: "+$34k", sub: "vs x·y=k, matched friction budget", ink: "var(--lav-ink)" },
    { label: "Detection delay", value: "≈ 6 blocks", sub: "After a real trend onset", ink: "var(--honey-ink)" },
  ];

  const header = (
    <section className="card overflow-hidden" aria-labelledby="an-title" style={{ padding: 0 }}>
      <PanelHead id="an-title" title={<>Pool analytics <SourceTag kind="live" /></>} style={{ borderBottom: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
          WETH / USDC · last sampled block #{cfg.lastSampledBlock || "—"}
        </span>
      </PanelHead>
      <StatStrip cols="repeat(5, minmax(0, 1fr))" label="Headline figures">
        <StatCell label="Kept for LPs" tone="good" ink="var(--green-label)"
          value={!totals ? <Skel /> : totals.swap_count > 0 ? fmtUsd(totals.lvr_avoided, { dp: 2, compact: totals.lvr_avoided > 99_999 }) : "—"}
          sub={`All time, over ${fmtNum(totals?.swap_count ?? 0, 0)} swaps`} />
        <StatCell label="Charged as spread" ink="var(--honey-ink)"
          value={cf.charged > 0 ? fmtUsd(cf.charged, { dp: 2 }) : "—"}
          sub={cf.withTrendNotional > 0 ? `On ${fmtUsd(cf.withTrendNotional, { dp: 0 })} pushed with a trend` : tapeScope} />
        <StatCell label="Never charged"
          value={volume > 0 ? `${Math.round((a.flow.free / volume) * 100)}%` : "—"}
          sub={`Of volume, ${tapeScope}`} />
        <StatCell label="Detector engaged" ink="var(--lav-ink)"
          value={a.samples ? `${Math.round(a.engagedFrac * 100)}%` : "—"}
          sub={`Of ${fmtNum(a.samples, 0)} sampled blocks`} />
        <StatCell label="Volume recorded"
          value={totals ? fmtUsd(totals.volume_usdc, { compact: true }) : <Skel />}
          sub={totals ? `${fmtUsd(totals.volume_24h, { compact: true })} in the last 24h` : <Skel />} />
      </StatStrip>
    </section>
  );

  const now = (
    <section className="card min-w-0" aria-labelledby="an-now" style={{ padding: 0 }}>
      <PanelHead id="an-now" title="Detector right now">
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>κ {fmtPct(s.kappa)} · σ̂ {fmtPct(s.sigma)}</span>
      </PanelHead>
      <div className="px-5 pt-4 pb-5">
        <RiskMeter risk={a.risk} dPct={s.directionalEfficiency} dFloorPct={cfg.dFloor} />
      </div>
    </section>
  );

  const timeline = (
    <section className="card min-w-0" aria-labelledby="an-time" style={{ padding: 0 }}>
      <PanelHead id="an-time" title="Value kept over time">
        <div className="flex items-center gap-2 flex-wrap">
          <Seg label="Time range" value={range} onChange={setRange} options={RANGES.map((r) => ({ id: r.id, label: r.label }))} />
          <button type="button" className="btn btn-secondary btn-sm" aria-pressed={view === "table"}
            onClick={() => setView(view === "table" ? "chart" : "table")}>
            <Icon name={view === "table" ? "chart" : "layers"} size={14} aria-hidden="true" />
            {view === "table" ? "View as chart" : "View as table"}
          </button>
        </div>
      </PanelHead>
      <div className="px-5 pt-3.5 pb-4">
        {view === "chart" && <div className="mb-3"><TimelineLegend /></div>}
        <ValueTimeline
          rows={inRange}
          days={days}
          asTable={view === "table"}
          emptyLabel={range === "all" ? "No swaps recorded yet" : `No swaps in the last ${range}`}
        />
        <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--divider)", maxWidth: "80ch", textWrap: "pretty" }}>
          Each column is one swap; the line is the spread kept for LPs, adding up across the range; the strip underneath
          shows whether the pool was leaning when the swap arrived. On a plain constant-product pool the line would stay flat at zero.
          {range === "all" && partialTape && <> It covers the latest {tape.length} swaps, so it ends below the all-time total above.</>}
          {biggest && (
            <> Largest single lean: <b style={{ color: "var(--text-2)" }}>{fmtUsd(biggest.notional_usdc, { dp: 0 })}</b>{" "}
              {biggest.side === "buy_weth" ? "buying" : "selling"} WETH into a {biggest.trend}-trend, charged{" "}
              <b style={{ color: "var(--honey-ink)" }}>{fmtPct(biggest.spread_frac)}</b>.</>
          )}
        </p>
      </div>
    </section>
  );

  const paid = (
    <section className="card min-w-0" aria-labelledby="an-paid" style={{ padding: 0 }}>
      <PanelHead id="an-paid" title="Who paid">
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{tapeScope}</span>
      </PanelHead>
      <div className="px-5 pt-4 pb-5">
        <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, margin: "0 0 12px", textWrap: "pretty" }}>
          The spread is aimed, not broadcast. Counter-trend flow and everything in a calm market trades at the plain pool price.
        </p>
        <FlowSplitChart flow={a.flow} />
        <div className="flex flex-col gap-4 mt-4 pt-4" style={{ borderTop: "1px solid var(--divider)" }}>
          <SplitBar title="Value kept, by the trend running" slices={byTrend}
            total={a.flow.captured > 0 ? fmtUsd(a.flow.captured, { dp: 2 }) : "—"} />
          <SplitBar title="Volume, by side" slices={bySide}
            total={volume > 0 ? fmtUsd(volume, { dp: 0 }) : "—"} />
          <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
            Direction alone decides nothing; only direction relative to a detected trend does.
          </p>
        </div>
      </div>
    </section>
  );

  const lean = (
    <section className="card min-w-0" aria-labelledby="an-lean" style={{ padding: 0 }}>
      <PanelHead id="an-lean" title="How hard it leans">
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>cap {fmtPct(cfg.kappaMax)}</span>
      </PanelHead>
      <div className="px-5 pt-4 pb-5">
        <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, margin: "0 0 12px", textWrap: "pretty" }}>
          Spread charged, as a share of the cap. A pool pinned at the top of this range is one whose cap is doing the work rather than its detector.
        </p>
        <KappaHistogram buckets={kappaHist} />
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--divider)" }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>Sampled blocks, by what was charged</h3>
          <RegimeBar split={a.regime} />
          <dl className="mt-4 flex flex-col" style={{ gap: 6 }}>
            <Line label="Mean κ when leaning" value={a.meanKappaWhenEngaged > 0 ? fmtPct(a.meanKappaWhenEngaged) : "—"} ink="var(--honey-ink)" />
            <Line label="Longest unbroken lean" value={a.longestRun ? `${a.longestRun} blocks` : "—"} ink="var(--lav-ink)" />
            <Line label="Mean volatility σ̂ per block" value={a.meanSigma > 0 ? fmtPct(a.meanSigma) : "—"} />
          </dl>
        </div>
      </div>
    </section>
  );

  const reportPanel = (
    <section className="card min-w-0 flex flex-col" aria-labelledby="an-report" style={{ padding: 0 }}>
      <PanelHead id="an-report" title={<><span style={{ color: "var(--lav)" }} aria-hidden="true"><Icon name="brain" size={16} /></span>Analyst summary</>}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{a.samples} samples · {totals?.swap_count ?? 0} swaps</span>
      </PanelHead>
      <div className="px-5 pt-4 pb-5 flex-1">
        <ReportBody tall={!narrow} open={reportOpen === "open"} onToggle={() => setReportOpen(reportOpen === "open" ? "closed" : "open")}>
          <AiNote explained={report} title="Pool report" skeletonLines={reportOpen === "open" ? 12 : 4} />
        </ReportBody>
      </div>
    </section>
  );

  const params = [
    { sym: "k", name: "CUSUM slack", value: cfg.k.toFixed(4), desc: "Drift below this is ignored as noise.",
      why: "Swept across four years; moving it either way costs LP value, so it is left where it was." },
    { sym: "h", name: "Threshold", value: cfg.h.toFixed(4), desc: "Evidence needed before a trend is declared.",
      why: "Set from a target false-alarm rate (ARL₀), never from a block count — so there is no countdown to game." },
    { sym: "sMax", name: "Statistic cap", value: cfg.sMax.toFixed(4), desc: "Evidence level at which κ saturates.",
      why: "Sits at the knee: higher changes nothing, lower costs real value." },
    { sym: "λ", name: "EWMA decay", value: cfg.lambda.toFixed(3), desc: `Signal memory ≈ ${cfg.effWindow ? fmtNum(cfg.effWindow, 1) : "—"} samples.`,
      why: "Paired with D_floor: the gate only means something relative to the noise this window implies. Changing one without the other silently moves the gate." },
    { sym: "D_floor", name: "Efficiency floor", value: fmtPct(cfg.dFloor), desc: "How one-way a move must look before the pool acts.",
      why: "Set at about 0.79 noise-widths of directionality. For a driftless walk D averages 1/√n, so a fixed floor means nothing except relative to λ." },
    { sym: "κ_max", name: "Spread cap", value: fmtPct(cfg.kappaMax), desc: "The hardest this pool can ever lean; κ is charged as the spread.",
      why: "A security bound, not a tuning knob: it caps the most a faked trend could ever be worth, and halving it tightened that bound." },
    { sym: "d_max", name: "Ramp rate", value: fmtPct(cfg.dMax), desc: "Most κ can move in a single block.",
      why: "Rate-limits the spread so no single block can swing the quote far enough to be worth engineering." },
  ];

  const paramsPanel = (
    <section className="card min-w-0" aria-labelledby="an-params" style={{ padding: 0 }}>
      <PanelHead id="an-params" title="How this pool is tuned">
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={paramsOpen === "open"} aria-controls="an-params-table"
          onClick={() => setParamsOpen(paramsOpen === "open" ? "closed" : "open")}>
          <Icon name={paramsOpen === "open" ? "minus" : "plus"} size={14} aria-hidden="true" />
          {paramsOpen === "open" ? "Hide reasoning" : "Show reasoning"}
        </button>
      </PanelHead>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Pool parameters, scrollable">
        <table id="an-params-table" className="w-full" style={{ borderCollapse: "collapse" }}>
          <caption className="sr-only">Detector and curve parameters of the live hook: seven immutable values, each derived from an interpretable target.</caption>
          <thead>
            <tr>
              {["Parameter", "Controls", "Value"].map((h, i) => (
                <th key={h} scope="col" className={i === 1 ? "hidden sm:table-cell" : undefined} style={{ textAlign: i === 2 ? "right" : "left", padding: "8px 20px", fontSize: 12, fontWeight: 600, color: "var(--muted)", borderBottom: "1px solid var(--divider)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {params.map((r) => (
              <tr key={r.sym} className="row-hover" style={{ borderBottom: "1px solid var(--divider-2)" }}>
                <th scope="row" className="pl-4 pr-2 sm:px-5" style={{ textAlign: "left", fontWeight: 400, paddingTop: 10, paddingBottom: 10, verticalAlign: "top" }}>
                  <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
                    <span className="font-display" style={{ fontSize: 12, fontWeight: 650, color: "var(--lav-ink)", background: "var(--lav-soft)", borderRadius: 7, padding: "2px 8px", minWidth: 52, textAlign: "center" }}>{r.sym}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>{r.name}</span>
                  </span>
                  {/* phones: the "Controls" column folds in under the name instead of scrolling sideways */}
                  <div className="sm:hidden" style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, marginTop: 4 }}>{r.desc}</div>
                  {paramsOpen === "open" && <div className="sm:hidden" style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginTop: 3 }}>{r.why}</div>}
                </th>
                <td className="hidden sm:table-cell" style={{ padding: "10px 20px 10px 0", verticalAlign: "top", minWidth: 220 }}>
                  <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>{r.desc}</div>
                  {paramsOpen === "open" && <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginTop: 3, maxWidth: "80ch" }}>{r.why}</div>}
                </td>
                <td className="font-display pl-2 pr-4 sm:px-5" style={{ fontSize: 14, fontWeight: 650, color: "var(--text)", whiteSpace: "nowrap", textAlign: "right", verticalAlign: "top", paddingTop: 10, paddingBottom: 10 }}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, padding: "10px 20px 14px" }}>
        The live hook was deployed with these values. None was chosen by feel; the reasoning is in the README&rsquo;s four-year parameter study.
      </p>
    </section>
  );

  const evidence = (
    <section className="card overflow-hidden" aria-labelledby="an-study" style={{ padding: 0 }}>
      <PanelHead id="an-study" title={<>Backtest evidence <SourceTag kind="backtest" /></>} style={{ borderBottom: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Historical replays documented in the README, not this pool&rsquo;s activity</span>
      </PanelHead>
      <StatStrip cols="repeat(5, minmax(0, 1fr))" label="Backtest figures">
        {study.map((k) => <StatCell key={k.label} label={k.label} value={k.value} sub={k.sub} ink={k.ink} />)}
      </StatStrip>
    </section>
  );

  const usage = (
    <section className="card overflow-hidden" aria-labelledby="an-usage" style={{ padding: 0 }}>
      <PanelHead id="an-usage" title={<>App usage <SourceTag kind="usage" /></>} style={{ borderBottom: 0 }} />
      <StatStrip cols={narrow ? "repeat(4, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))"} label="App usage figures">
        <StatCell label="Wallets connected" value={users ? fmtNum(users.total_wallets, 0) : <Skel />} />
        <StatCell label="New this week" value={users ? fmtNum(users.new_7d, 0) : <Skel />} />
        <StatCell label="Returning" value={users ? fmtNum(users.returning_wallets, 0) : <Skel />} />
        <StatCell label="Active in 24h" value={users ? fmtNum(users.active_24h, 0) : <Skel />} />
      </StatStrip>
    </section>
  );

  return (
    <div className="px-3 sm:px-4 pt-4 pb-8 flex flex-col" style={{ gap: 12 }}>
      {header}
      {narrow ? (
        <div className="flex flex-col" style={{ gap: 12 }}>
          {now}
          {timeline}
          {paid}
          {lean}
          {reportPanel}
          {usage}
        </div>
      ) : (
        <div className="grid items-stretch" style={{ gridTemplateColumns: "minmax(0,1fr) 380px", gap: 12 }}>
          <div className="dash-col flex flex-col min-w-0" style={{ gap: 12 }}>
            {timeline}
            <div className="grid items-stretch" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
              {paid}
              {lean}
            </div>
          </div>
          <div className="dash-col flex flex-col min-w-0" style={{ gap: 12 }}>
            {now}
            {usage}
            {reportPanel}
          </div>
        </div>
      )}
      {paramsPanel}
      {evidence}
      <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, textAlign: "center", maxWidth: 760, margin: "4px auto 0" }}>
        Study percentages are measured on historical replays documented in the README; live figures
        are this testnet pool&rsquo;s own recorded activity. The summary above is generated from these same
        numbers and may phrase them loosely. Not investment advice; testnet deployment.
      </p>
    </div>
  );
}

function Line({ label, value, ink }: { label: string; value: string; ink?: string }) {
  return (
    <div className="flex justify-between gap-3" style={{ fontSize: 12 }}>
      <dt style={{ color: "var(--text-3)" }}>{label}</dt>
      <dd style={{ color: ink ?? "var(--text-2)", fontWeight: 650, textAlign: "right" }}>{value}</dd>
    </div>
  );
}

/** The model's report, previewed to its first lines until the reader asks for the rest. */
/** The model's report, previewed to its first lines. Opening it never grows the panel: the full
 *  text scrolls inside the box the preview already occupied, so the layout around it holds still. */
function ReportBody({ open, onToggle, children, tall }: { open: boolean; onToggle: () => void; children: ReactNode; tall?: boolean }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [closedH, setClosedH] = useState(0);
  // Measured by a ResizeObserver while closed (the preview grows when the report text arrives),
  // never by reading layout on every render.
  useLayoutEffect(() => {
    const el = box.current;
    if (open || !el) return;
    const ro = new ResizeObserver(() => setClosedH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  return (
    <>
      <div
        id={id}
        ref={box}
        className={open ? undefined : tall ? "prose-clamp prose-clamp-tall" : "prose-clamp"}
        tabIndex={open ? 0 : undefined}
        aria-label={open ? "Full report, scrollable" : undefined}
        style={open ? { maxHeight: Math.max(closedH, 240), overflowY: "auto", overscrollBehavior: "contain", paddingRight: 4 } : undefined}
      >
        {children}
      </div>
      <button type="button" className="btn btn-soft btn-sm mt-3" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <Icon name={open ? "minus" : "plus"} size={14} aria-hidden="true" />
        {open ? "Collapse report" : "Read full report"}
      </button>
    </>
  );
}

