import { useMemo } from "react";
import { usePoolState } from "@/hooks/usePoolState";
import { useDetectorConfig } from "@/hooks/useDetectorConfig";
import { useDetectorSeries } from "@/hooks/useDetectorSeries";
import { usePoolTotals, useWalletTotals, useTape } from "@/hooks/useBackend";
import { fmtPct, fmtUsd, fmtNum } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { useIsNarrow } from "@/hooks/useMediaQuery";
import { AiNote } from "@/components/ui/AiNote";
import { useExplain } from "@/hooks/useExplain";
import type { ReportFacts } from "@/lib/narrate";
import {
  analyticsOf, counterfactualOf, biggestLeanOf,
  dailyActivityOf, capturedByTrendOf, sideSplitOf, kappaHistogramOf,
} from "@/lib/analytics";
import {
  SavingsChart, RegimeBar, FlowSplitChart, RiskMeter,
  Donut, DailyColumns, KappaHistogram,
} from "@/components/ui/AnalyticsCharts";

/**
 * The Analytics screen: a standing report on what this pool has actually done, rather than a
 * second copy of the live gauges.
 *
 * The CUSUM evidence chart used to lead this page and now lives only on the Dashboard, where a
 * live reading belongs. What replaced it is the set of questions an LP would actually ask -
 * how often did it act, who paid, what did I keep, what would hurt me here - answered from the
 * pool's own `DetectorSample` trace and swap tape, with a Gemini report over the same figures.
 *
 * Everything on this page is measured. Where a number cannot be computed from recorded data the
 * card says so instead of rendering a zero, because on this page a confident zero is worse than
 * an honest blank.
 */
export function Analytics() {
  const s = usePoolState();
  const cfg = useDetectorConfig();
  const totals = usePoolTotals().data;
  const users = useWalletTotals().data;
  const series = useDetectorSeries();
  const tape = useTape(200).data ?? [];
  const narrow = useIsNarrow();

  const a = useMemo(
    () => analyticsOf(series.points, tape, { h: cfg.h, dFloor: cfg.dFloor }),
    [series.points, tape, cfg.h, cfg.dFloor],
  );
  const cf = useMemo(() => counterfactualOf(tape), [tape]);
  const biggest = useMemo(() => biggestLeanOf(tape), [tape]);
  const days = useMemo(() => dailyActivityOf(tape), [tape]);
  const byTrend = useMemo(() => capturedByTrendOf(tape), [tape]);
  const bySide = useMemo(() => sideSplitOf(tape), [tape]);
  const kappaHist = useMemo(() => kappaHistogramOf(tape, cfg.kappaMax), [tape, cfg.kappaMax]);

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

  return (
    <div className="px-4 sm:px-6 pb-10 pt-5 flex flex-col" style={{ gap: 18 }}>
      {/* ---------------- the report ---------------- */}
      <div className="card grain overflow-hidden">
        <div
          className="flex items-center justify-between gap-2 flex-wrap px-6 py-4"
          style={{ borderBottom: "1px solid var(--divider)" }}
        >
          <div className="flex items-center gap-2.5">
            <span style={{ color: "var(--lav)" }}><Icon name="brain" size={18} /></span>
            <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              Pool report
            </span>
            <span className="hidden md:inline" style={{ fontSize: 12, fontWeight: 600, color: "var(--faint)" }}>
              · written over this pool's own trace
            </span>
          </div>
          <span
            className="rounded-full px-3 py-1.5"
            style={{ fontSize: 11.5, fontWeight: 700, color: "var(--faint)", background: "var(--surface-2)" }}
          >
            {a.samples} samples · {totals?.swap_count ?? 0} swaps
          </span>
        </div>

        <div
          className="grid gap-6 p-4 sm:p-6"
          style={{ gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1.35fr) minmax(0,1fr)" }}
        >
          <div style={{ minWidth: 0 }}>
            <AiNote explained={report} title="Pool report" skeletonLines={12} />
          </div>
          <div style={{ minWidth: 0 }}>
            <SectionLabel icon="target" text="Right now" />
            <RiskMeter risk={a.risk} dPct={s.directionalEfficiency} dFloorPct={cfg.dFloor} />
          </div>
        </div>
      </div>

      {/* ---------------- what it kept, and who paid ---------------- */}
      <div
        className="grid gap-4.5"
        style={{ gridTemplateColumns: narrow ? "1fr" : "minmax(0,1.15fr) minmax(0,1fr)", gap: 18 }}
      >
        <div className="card p-6">
          <SectionLabel icon="chart" text="Value kept for liquidity providers" />
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, margin: "0 0 14px" }}>
            Cumulative spread retained from flow that pushed into a detected trend. On a plain
            constant-product pool this is value that would simply have left.
          </p>
          <SavingsChart points={a.savings} />
          <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
            <Mini label="kept, all time" value={totals && totals.swap_count > 0 ? fmtUsd(totals.lvr_avoided, { dp: 2 }) : "—"} color="var(--up-deep)" />
            <Mini label="charged as spread" value={cf.charged > 0 ? fmtUsd(cf.charged, { dp: 2 }) : "—"} color="var(--honey-deep)" />
            <Mini label="volume leaned on" value={cf.withTrendNotional > 0 ? fmtUsd(cf.withTrendNotional, { dp: 0 }) : "—"} color="var(--text-2)" />
          </div>
          {biggest && (
            <p style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.55, marginTop: 12 }}>
              Largest single lean: <b style={{ color: "var(--text-2)" }}>{fmtUsd(biggest.notional_usdc, { dp: 0 })}</b>{" "}
              {biggest.side === "buy_weth" ? "buying" : "selling"} WETH into a {biggest.trend}-trend, charged{" "}
              <b style={{ color: "var(--honey-deep)" }}>{fmtPct(biggest.spread_frac)}</b>.
            </p>
          )}
        </div>

        <div className="card p-6">
          <SectionLabel icon="shield" text="Who actually paid" />
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, margin: "0 0 14px" }}>
            The spread is aimed, not broadcast. Counter-trend flow and everything in a calm market
            trades at the plain pool price.
          </p>
          <FlowSplitChart flow={a.flow} />
        </div>
      </div>

      {/* ---------------- regime history ---------------- */}
      <div className="card p-6">
        <SectionLabel icon="brain" text="What the detector has seen" />
        <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, margin: "0 0 14px" }}>
          Every sampled block, classified by what was actually charged. A block where κ is zero counts as calm, whatever the detector’s trend label still says.
        </p>
        <RegimeBar split={a.regime} />
        <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
          <Mini label="engaged" value={a.samples ? `${(a.engagedFrac * 100).toFixed(0)}%` : "—"} color="var(--honey-deep)" sub="of sampled blocks" />
          <Mini label="mean κ when leaning" value={a.meanKappaWhenEngaged > 0 ? fmtPct(a.meanKappaWhenEngaged) : "—"} color="var(--honey-deep)" sub={`cap ${fmtPct(cfg.kappaMax)}`} />
          <Mini label="longest unbroken lean" value={a.longestRun ? `${a.longestRun} blocks` : "—"} color="var(--lav-deep)" sub="κ continuously engaged" />
          <Mini label="mean volatility σ̂" value={a.meanSigma > 0 ? fmtPct(a.meanSigma) : "—"} color="var(--text-2)" sub="per sampled block" />
        </div>
      </div>

      {/* ---------------- historic tape ---------------- */}
      <div
        className="grid gap-4.5"
        style={{ gridTemplateColumns: narrow ? "1fr" : "minmax(0,1.25fr) minmax(0,1fr)", gap: 18 }}
      >
        <div className="card p-6">
          <SectionLabel icon="chart" text="Activity by day" />
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, margin: "0 0 14px" }}>
            Volume traded each day, with the value the pool kept drawn over it on its own scale.
            The two do not track each other, which is the point: what the LP keeps depends on when
            the flow arrived, not just how much of it there was.
          </p>
          <DailyColumns days={days} />
        </div>

        <div className="card p-6">
          <SectionLabel icon="target" text="How hard it actually leans" />
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, margin: "0 0 14px" }}>
            Spread charged, as a share of the {fmtPct(cfg.kappaMax)} cap. A pool pinned at the top
            of this range is one whose cap is doing the work rather than its detector.
          </p>
          <KappaHistogram buckets={kappaHist} />
        </div>
      </div>

      <div
        className="grid gap-4.5"
        style={{ gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 18 }}
      >
        <div className="card p-6">
          <SectionLabel icon="brain" text="Which direction paid" />
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, margin: "0 0 16px" }}>
            Value kept, split by the trend that was running when it was charged.
          </p>
          <Donut
            slices={byTrend}
            centerLabel="kept"
            centerValue={a.flow.captured > 0 ? fmtUsd(a.flow.captured, { dp: 0 }) : "—"}
          />
        </div>

        <div className="card p-6">
          <SectionLabel icon="swap" text="Flow direction" />
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, margin: "0 0 16px" }}>
            All notional, by side. Direction alone decides nothing — only direction relative to a
            detected trend does.
          </p>
          <Donut
            slices={bySide}
            centerLabel="volume"
            centerValue={
              a.flow.withTrend + a.flow.free > 0
                ? fmtUsd(a.flow.withTrend + a.flow.free, { dp: 0 })
                : "—"
            }
          />
        </div>
      </div>

      {/* ---------------- configuration, explained ---------------- */}
      <div className="card p-6">
        <SectionLabel icon="target" text="Why this pool is tuned the way it is" />
        <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, margin: "0 0 16px" }}>
          Immutable parameters the live hook was deployed with. Each is derived from an
          interpretable target rather than chosen by feel, and the reasoning is in the README's
          four-year parameter study.
        </p>

        <ParamRow sym="k" name="CUSUM slack" value={cfg.k.toFixed(4)}
          desc="Drift below this is ignored as noise."
          why="Swept across four years; moving it either way costs LP value, so it is left where it was." />
        <ParamRow sym="h" name="Threshold" value={cfg.h.toFixed(4)}
          desc="Evidence needed before a trend is declared."
          why="Set from a target false-alarm rate (ARL₀), never from a block count — so there is no countdown to game." />
        <ParamRow sym="sMax" name="Statistic cap" value={cfg.sMax.toFixed(4)}
          desc="Evidence level at which κ saturates."
          why="Sits at the knee: higher changes nothing, lower costs real value." />
        <ParamRow sym="λ" name="EWMA decay" value={cfg.lambda.toFixed(3)}
          desc={`Signal memory ≈ ${cfg.effWindow ? fmtNum(cfg.effWindow, 1) : "—"} samples.`}
          why="Paired with D_floor: the gate only means something relative to the noise this window implies. Changing one without the other silently moves the gate." />
        <ParamRow sym="r" name="Gate target" value={`${cfg.gateR.toFixed(2)}σ`}
          desc="Noise-widths of directionality demanded before the pool acts."
          why="This is the number actually configured. For a driftless walk D averages 1/√n, so a raw floor means nothing except relative to λ — the hook derives the floor from this and λ itself, which is why the two can never drift apart." />
        <ParamRow sym="D_floor" name="Efficiency floor (derived)" value={fmtPct(cfg.dFloor)}
          desc="The gate the hot path actually compares D against."
          why={`Computed on chain as r·√(1−λ) = ${cfg.gateR.toFixed(2)}·√(1−${cfg.lambda.toFixed(2)}). Not settable on its own.`} />
        <ParamRow sym="κ_max" name="Lean cap" value={fmtPct(cfg.kappaMax)}
          desc="The hardest this pool can ever lean."
          why="A security bound, not a tuning knob: it caps the most a faked trend could ever be worth, and halving it tightened that bound." />
        <ParamRow sym="d_max" name="Ramp rate" value={fmtPct(cfg.dMax)} last
          desc="Most κ can move in a single block."
          why="Rate-limits the spread so no single block can swing the quote far enough to be worth engineering." />

        <div className="mt-4 flex items-center justify-between" style={{ fontSize: 11, color: "var(--faint)" }}>
          <span>last detector sample</span>
          <span style={{ fontWeight: 700, color: "var(--text-3)" }}>block #{cfg.lastSampledBlock || "—"}</span>
        </div>
      </div>

      {/* ---------------- study results + usage ---------------- */}
      <div className="grid gap-4.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 18 }}>
        <HeadStat label="LP value vs a 30bps pool" value="+6.4%" color="var(--up)" tinted sub="4 years of real ETH/USDC" />
        <HeadStat label="Arbitrage extraction cut" value="32%" color="var(--up)" sub="same four-year replay" />
        <HeadStat label="LVR reduction, synthetic" value="50.6%" color="var(--lav)" sub="mean of 5 seeded stress paths" />
        <HeadStat label="LP advantage, 12m real" value="+$34k" color="var(--lav)" sub="vs x·y=k, matched friction budget" />
        <HeadStat label="Detection delay" value="≈ 6 blocks" color="var(--honey-deep)" sub="after a real trend onset" />
      </div>

      <div className="grid gap-4.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 18 }}>
        <HeadStat label="Wallets connected" value={users ? fmtNum(users.total_wallets, 0) : "—"} color="var(--text)" sub="all time" />
        <HeadStat label="New this week" value={users ? fmtNum(users.new_7d, 0) : "—"} color="var(--lav-deep)" sub="first connection in 7 days" />
        <HeadStat label="Returning" value={users ? fmtNum(users.returning_wallets, 0) : "—"} color="var(--up)" sub="more than one session" />
        <HeadStat label="Active · 24h" value={users ? fmtNum(users.active_24h, 0) : "—"} color="var(--honey-deep)" sub="seen in the last day" />
      </div>

      <p style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.6, textAlign: "center", maxWidth: 760, margin: "0 auto" }}>
        Study percentages are measured on historical replays documented in the README; live figures
        are this testnet pool's own recorded activity. The report above is generated from these same
        numbers and may phrase them loosely. Not investment advice; testnet deployment.
      </p>
    </div>
  );
}

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-1.5">
      <span style={{ color: "var(--lav)" }}><Icon name={icon} size={17} /></span>
      <span className="font-display" style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)" }}>{text}</span>
    </div>
  );
}

function Mini({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="rounded-md px-3 py-2.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div className="font-display" style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ParamRow({
  sym, name, desc, why, value, last,
}: { sym: string; name: string; desc: string; why: string; value: string; last?: boolean }) {
  return (
    <div style={{ padding: "11px 0", borderBottom: last ? "none" : "1px solid var(--divider)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3" style={{ minWidth: 0 }}>
          <span className="font-display" style={{ fontSize: 13, fontWeight: 800, color: "var(--lav-deep)", background: "var(--lav-soft)", borderRadius: 8, padding: "3px 9px", minWidth: 56, textAlign: "center", flexShrink: 0 }}>{sym}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-2)" }}>{name}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.45 }}>{desc}</div>
            <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.5, marginTop: 3 }}>{why}</div>
          </div>
        </div>
        <span className="font-display" style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap" }}>{value}</span>
      </div>
    </div>
  );
}

function HeadStat({ label, value, color, sub, tinted }: { label: string; value: string; color: string; sub: string; tinted?: boolean }) {
  return (
    <div style={{ background: tinted ? "var(--green-stat-bg)" : "var(--surface)", border: `1px solid ${tinted ? "var(--green-border)" : "var(--border)"}`, borderRadius: "var(--r-card)", padding: 18, boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      <div className="font-display" style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}
