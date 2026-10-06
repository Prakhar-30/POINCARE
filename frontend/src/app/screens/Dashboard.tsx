import type { ReactNode } from "react";
import { usePoolState } from "@/hooks/usePoolState";
import { usePoolTotals, useTape } from "@/hooks/useBackend";
import { useDetectorConfig } from "@/hooks/useDetectorConfig";
import { useDetectorSeries } from "@/hooks/useDetectorSeries";
import { fmtUsd, fmtNum, fmtPct, shorten } from "@/lib/format";
import { CONTRACTS, EXPLORER } from "@/config/contracts";
import { fromWei } from "@/lib/units";
import { Icon } from "@/components/ui/Icon";
import { Tape } from "@/components/ui/Tape";
import { EvidenceChart } from "@/components/ui/EvidenceChart";
import { regimeOf } from "@/components/ui/Regime";

export function Dashboard() {
  const s = usePoolState();
  const cfg = useDetectorConfig();
  const totals = usePoolTotals().data;
  const tape = useTape(8).data ?? [];
  const series = useDetectorSeries();
  const regime = regimeOf(s.trend);
  const tvl = fromWei(s.r0, "USDC") * 2; // balanced pool, both legs ≈ r0 in USDC terms
  // Meter scale fallback only; the real value is read from the hook (see Analytics).
  const kappaMax = cfg.kappaMax || 0.05;
  const hasSwaps = Boolean(totals && totals.swap_count > 0);

  return (
    <div className="flex flex-col px-4 sm:px-7 py-6" style={{ gap: 20 }}>
      {/* KPI strip */}
      <div className="kpi-strip">
        <Kpi label="Total value locked" value={s.loading ? "—" : fmtUsd(tvl, { compact: true })} />
        <Kpi label="Mid price · WETH" value={s.loading ? "—" : fmtUsd(s.price)} />
        <Kpi label="24h volume" value={totals ? fmtUsd(totals.volume_24h, { compact: true }) : "—"} />
        <Kpi label="Lean · κ spread" value={fmtPct(s.kappa)} color={s.kappa > 0 ? "var(--honey-deep)" : undefined} />
        <div className="kpi-good">
          <div className="lbl" style={{ color: "var(--green-label)" }}>LVR kept for LPs</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 600, marginTop: 6, color: "var(--green-label)" }}>
            {hasSwaps && totals ? fmtUsd(totals.lvr_avoided, { compact: totals.lvr_avoided > 9999, dp: 2 }) : "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-5 items-start grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* detector */}
        <section className="panel min-w-0">
          <div className="panel-head">
            <div className="flex items-center gap-2.5">
              <span style={{ color: "var(--lav-deep)" }}><Icon name="brain" size={17} /></span>
              <h2 className="panel-title">Detector</h2>
              <span className="panel-sub hidden sm:inline">two-sided CUSUM · sampled per block</span>
            </div>
            <span className="pill" style={{ color: regime.color, background: regime.bg }}>
              <span className="anim-pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor" }} />
              live
            </span>
          </div>
          <div className="flex flex-col p-5" style={{ gap: 16 }}>
            <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
              <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.02em", color: regime.color, lineHeight: 1.1 }}>{regime.label}</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{s.trend === "none" ? "watching for drift" : "detector engaged"}</span>
            </div>
            <EvidenceChart points={series.points} thresholdH={cfg.h} loading={series.loading} />
            <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 1, background: "var(--divider)", border: "1px solid var(--divider)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
              <Readout label="Spread · sell WETH" value={fmtPct(s.spreadZeroForOne)} color={s.spreadZeroForOne > 0 ? "var(--down-deep)" : undefined} />
              <Readout label="Spread · buy WETH" value={fmtPct(s.spreadOneForZero)} color={s.spreadOneForZero > 0 ? "var(--up-deep)" : undefined} />
              <Readout label="Volatility σ̂ · per block" value={fmtPct(s.sigma)} />
              <Readout label="Base fee · vol-scaled" value={fmtPct(s.fee)} color={s.fee > 0 ? "var(--honey-deep)" : undefined} />
            </div>
          </div>
        </section>

        {/* right rail */}
        <div className="flex flex-col min-w-0" style={{ gap: 20 }}>
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Lean</h2>
              <span className="panel-sub num">cap {fmtPct(kappaMax)}</span>
            </div>
            <div className="flex flex-col px-5 py-4" style={{ gap: 16 }}>
              <Meter label="κ · spread" value={fmtPct(s.kappa)} frac={kappaMax > 0 ? s.kappa / kappaMax : 0} color="var(--honey)" />
              <Meter label="D · directional efficiency" value={fmtPct(s.directionalEfficiency)} frac={s.directionalEfficiency} color="var(--lav)" />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2 className="panel-title">Reserves</h2></div>
            <div className="px-5 py-1.5">
              <div className="kv"><span>WETH</span><span className="num">{fmtNum(fromWei(s.r1, "WETH"), 2)}</span></div>
              <div className="kv"><span>USDC</span><span className="num">{fmtNum(fromWei(s.r0, "USDC"), 0)}</span></div>
              <div className="kv"><span>Implied price</span><span className="num">{fmtUsd(s.price)}</span></div>
              <div className="kv">
                <span>Hook</span>
                <a className="num inline-flex items-center gap-1 hover:text-lav" href={`${EXPLORER}/address/${CONTRACTS.hook}`} target="_blank" rel="noreferrer" style={{ color: "var(--text-2)" }}>
                  {shorten(CONTRACTS.hook)} <Icon name="external" size={12} />
                </a>
              </div>
            </div>
          </section>

          <Tape rows={tape} />
        </div>
      </div>

      <p className="m-0" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--muted)", maxWidth: 820 }}>
        LVR kept is the directional spread Poincaré charged with-trend flow: value a constant-product (x·y=k) pool would have leaked to
        arbitrageurs. It accrues as trades are recorded{totals ? ` (${totals.swap_count} swaps so far)` : ""} and is not guaranteed.
      </p>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="num truncate" style={{ fontSize: 22, fontWeight: 600, marginTop: 6, color: color ?? "var(--text)" }}>{value}</div>
    </div>
  );
}

function Readout({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--surface)", padding: "12px 14px" }}>
      <div className="lbl">{label}</div>
      <div className="num" style={{ fontSize: 15, fontWeight: 600, marginTop: 4, color: color ?? "var(--text)" }}>{value}</div>
    </div>
  );
}

function Meter({ label, value, frac, color }: { label: string; value: string; frac: number; color: string }) {
  const pct = Math.max(0, Math.min(1, frac)) * 100;
  return (
    <div>
      <div className="flex justify-between" style={{ fontSize: 13 }}>
        <span style={{ color: "var(--text-2)" }}>{label}</span>
        <span className="num" style={{ fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--track)", marginTop: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color, transition: "width .4s ease" }} />
      </div>
    </div>
  );
}
