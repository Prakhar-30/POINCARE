import { usePoolState } from "@/hooks/usePoolState";
import { useDetectorConfig } from "@/hooks/useDetectorConfig";
import { useSignalSeries } from "@/hooks/useSignalSeries";
import { usePoolTotals } from "@/hooks/useBackend";
import { fmtPct, fmtUsd, fmtNum } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Gauge } from "@/components/ui/Gauge";
import { Oscilloscope } from "@/components/ui/Oscilloscope";
import { useIsNarrow } from "@/hooks/useMediaQuery";

function regimeOf(trend: string) {
  if (trend === "up") return { label: "Up-trend", color: "var(--up)", ring: "rgba(107,184,154,.15)" };
  if (trend === "down") return { label: "Down-trend", color: "var(--down)", ring: "rgba(229,140,160,.15)" };
  return { label: "Calm", color: "var(--lav)", ring: "rgba(142,136,216,.15)" };
}

export function Analytics() {
  const s = usePoolState();
  const cfg = useDetectorConfig();
  const totals = usePoolTotals().data;
  const real = useSignalSeries();
  const regime = regimeOf(s.trend);
  const kappaMax = cfg.kappaMax || 0.1;
  const narrow = useIsNarrow();

  return (
    <div className="px-4 sm:px-6 pb-10 pt-5 flex flex-col" style={{ gap: 18 }}>
      {/* ---- the Brain deep-dive ---- */}
      <div className="card grain overflow-hidden">
        <div className="flex items-center justify-between gap-2 flex-wrap px-6 py-4" style={{ borderBottom: "1px solid var(--divider)" }}>
          <div className="flex items-center gap-2.5">
            <span style={{ color: "var(--lav)" }}><Icon name="brain" size={18} /></span>
            <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>The Brain · CUSUM detector</span>
            <span className="hidden md:inline" style={{ fontSize: 12, fontWeight: 600, color: "var(--faint)" }}>· quickest-change, data-dependent firing</span>
          </div>
          <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ fontSize: 12, fontWeight: 700, color: regime.color, background: regime.ring }}>
            <span className="anim-pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: regime.color }} /> live
          </div>
        </div>

        <div className="grid gap-6 p-6" style={{ gridTemplateColumns: narrow ? "1fr" : "1.5fr 1fr" }}>
          <div>
            <Oscilloscope trend={s.trend} intensity={Math.max(s.kappa / kappaMax, s.directionalEfficiency)} real={real} height={210} />
            <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
              <Readout label="regime" value={regime.label} color={regime.color} />
              <Readout label="spread · sell WETH" value={fmtPct(s.spreadZeroForOne)} color={s.spreadZeroForOne > 0 ? "var(--down)" : "var(--text-2)"} />
              <Readout label="spread · buy WETH" value={fmtPct(s.spreadOneForZero)} color={s.spreadOneForZero > 0 ? "var(--up)" : "var(--text-2)"} />
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-5">
            <div className="flex gap-6 flex-wrap justify-center">
              <Gauge value={s.kappa} max={kappaMax} label="κ · lean" color="var(--honey)" suffix="%" scale={100} />
              <Gauge value={s.directionalEfficiency} max={1} label="D · efficiency" color="var(--lav)" suffix="%" scale={100} />
            </div>
            <p className="text-center" style={{ fontSize: 12, lineHeight: 1.65, color: "var(--text-3)", maxWidth: 280 }}>
              Two one-sided CUSUM statistics run on the pool's own log-returns. A trend is declared only when one
              crosses the threshold <b style={{ color: "var(--text-2)" }}>h</b>, at a moment that depends on the data
              and never on a fixed block count.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4.5" style={{ gridTemplateColumns: narrow ? "1fr" : "minmax(0,1fr) minmax(0,1.1fr)", gap: 18 }}>
        {/* ---- detector configuration ---- */}
        <div className="card p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <span style={{ color: "var(--lav)" }}><Icon name="target" size={18} /></span>
            <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Detector configuration</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, marginBottom: 16 }}>
            Immutable parameters the live hook was deployed with. Every one is injected and derived from an
            interpretable target, so none are hard-coded by feel.
          </p>

          <ParamRow sym="k" name="CUSUM slack" desc="drift below this is ignored as noise" value={cfg.k.toFixed(4)} />
          <ParamRow sym="h" name="Threshold" desc="evidence needed to declare a trend (set from ARL₀)" value={cfg.h.toFixed(4)} />
          <ParamRow sym="sMax" name="Statistic cap" desc="evidence level where κ saturates" value={cfg.sMax.toFixed(4)} />
          <ParamRow sym="λ" name="EWMA decay" desc={`signal memory ≈ ${cfg.effWindow ? fmtNum(cfg.effWindow, 1) : "—"} steps`} value={cfg.lambda.toFixed(3)} />
          <ParamRow sym="D_floor" name="Efficiency floor" desc="min directional-efficiency to engage" value={fmtPct(cfg.dFloor)} />
          <ParamRow sym="κ_max" name="Lean cap (security)" desc="hard ceiling on curve asymmetry" value={fmtPct(cfg.kappaMax)} />
          <ParamRow sym="d_max" name="Spread ceiling" desc="max directional spread charged" value={fmtPct(cfg.dMax)} last />

          <div className="mt-4 flex items-center justify-between" style={{ fontSize: 11, color: "var(--faint)" }}>
            <span>last detector sample</span>
            <span style={{ fontWeight: 700, color: "var(--text-3)" }}>block #{cfg.lastSampledBlock || "—"}</span>
          </div>
        </div>

        {/* ---- manipulation-cost / moat ---- */}
        <div className="card p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <span style={{ color: "var(--up)" }}><Icon name="shield" size={18} /></span>
            <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Why faking a trend doesn't pay</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6, marginBottom: 16 }}>
            The security bound is an inequality:
            <b style={{ color: "var(--text-2)" }}> max gain from a fake trend &lt; min cost to trigger one.</b> For the
            spread lever shipped here it holds by construction, with the entire trigger cost as margin.
          </p>

          {/* the inequality, visualized */}
          <div className="flex flex-col gap-3 mb-5">
            <CostBar label="Max extractable by faking" value="$0" frac={0.02} color="var(--down)"
              note="the soft side trades at the plain x·y=k price, so there is zero edge" />
            <CostBar label="Min cost to trigger the detector" value="≈ 0.045 WETH" frac={1} color="var(--up)"
              note="~5 blocks of genuine round-trip price impact, which buys nothing" />
          </div>

          <div className="flex flex-col gap-2.5">
            <Layer n={1} title="Data-dependent firing" body="No fixed N to game, so an attacker can't precompute when the curve leans. Multi-block sampling means one block can't move the statistic." />
            <Layer n={2} title="Bounded prize" body="The spread is a one-sided, non-negative haircut on with-trend flow. There is no soft-side discount to harvest." />
            <Layer n={3} title="Arbitrage punishment" body="Faking a trend means pushing price off fair value, which arbitrageurs immediately harvest back." />
          </div>
        </div>
      </div>

      {/* ---- LVR headline ---- */}
      <div className="grid gap-4.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 18 }}>
        <HeadStat label="LVR reduction vs x·y=k" value="14.3%" color="var(--up)" tinted sub="back-test, synthetic regime path" />
        <HeadStat label="vs equal-spread vol fee" value="11.5%" color="var(--lav)" sub="same average spread, symmetric" />
        <HeadStat label="LVR avoided · live" value={totals && totals.swap_count > 0 ? fmtUsd(totals.lvr_avoided, { dp: 2 }) : "—"} color="var(--green-label)" sub={`${totals?.swap_count ?? 0} swaps tracked`} />
        <HeadStat label="Detection delay" value="≈ 6 blocks" color="var(--honey-deep)" sub="after a real trend onset" />
      </div>
      <p style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.6, textAlign: "center", maxWidth: 760, margin: "0 auto" }}>
        Back-test percentages are measured on a seeded regime-switching path, not a named pair, and the engine is
        data-ready so the same machinery yields production numbers once a real return series is supplied. Not
        investment advice; testnet deployment.
      </p>
    </div>
  );
}

function Readout({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md px-3 py-2.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function ParamRow({ sym, name, desc, value, last }: { sym: string; name: string; desc: string; value: string; last?: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "10px 0", borderBottom: last ? "none" : "1px solid var(--divider)" }}>
      <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
        <span className="font-display" style={{ fontSize: 13, fontWeight: 800, color: "var(--lav-deep)", background: "var(--lav-soft)", borderRadius: 8, padding: "3px 9px", minWidth: 52, textAlign: "center" }}>{sym}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-2)" }}>{name}</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.4 }}>{desc}</div>
        </div>
      </div>
      <span className="font-display" style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function CostBar({ label, value, frac, color, note }: { label: string; value: string; frac: number; color: string; note: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1.5" style={{ fontSize: 12 }}>
        <span style={{ color: "var(--text-2)", fontWeight: 700 }}>{label}</span>
        <span className="font-display" style={{ color, fontWeight: 800 }}>{value}</span>
      </div>
      <div style={{ height: 9, borderRadius: 5, background: "var(--track)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.max(3, frac * 100)}%`, background: color, borderRadius: 5 }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 5, lineHeight: 1.45 }}>{note}</div>
    </div>
  );
}

function Layer({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: "11px 13px" }}>
      <span className="font-display" style={{ fontSize: 12, fontWeight: 800, color: "var(--up-deep)", background: "var(--green-bg)", border: "1px solid var(--green-border)", borderRadius: 99, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-2)" }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5, marginTop: 2 }}>{body}</div>
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
