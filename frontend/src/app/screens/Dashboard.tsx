import { usePoolState } from "@/hooks/usePoolState";
import { usePoolTotals, useTape } from "@/hooks/useBackend";
import { fmtUsd, fmtNum, fmtPct } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Gauge } from "@/components/ui/Gauge";
import { Tape } from "@/components/ui/Tape";
import { Oscilloscope } from "@/components/ui/Oscilloscope";

function regimeOf(trend: string) {
  if (trend === "up") return { label: "Up-trend", color: "var(--up)", ring: "rgba(107,184,154,.15)" };
  if (trend === "down") return { label: "Down-trend", color: "var(--down)", ring: "rgba(229,140,160,.15)" };
  return { label: "Calm", color: "var(--lav)", ring: "rgba(142,136,216,.15)" };
}

function Stat({ label, value, accent, tinted }: { label: string; value: string; accent?: string; tinted?: boolean }) {
  return (
    <div
      className="rounded-card px-4.5 py-3.5"
      style={{
        padding: "14px 18px",
        background: tinted ? "var(--green-stat-bg)" : "var(--surface)",
        border: `1px solid ${tinted ? "var(--green-border)" : "var(--border)"}`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".4px", color: tinted ? "var(--green-label)" : "var(--muted)", marginBottom: 5 }}>
        {label}
      </div>
      <div className="font-display" style={{ fontSize: 21, fontWeight: 700, color: accent ?? (tinted ? "var(--green-label)" : "var(--text)") }}>
        {value}
      </div>
    </div>
  );
}

export function Dashboard() {
  const s = usePoolState();
  const totals = usePoolTotals().data;
  const tape = useTape(10).data ?? [];
  const regime = regimeOf(s.trend);
  const tvl = (Number(s.r0) / 1e18) * 2; // balanced pool, both legs ≈ r0 in USDC terms

  return (
    <div className="px-6 pb-8">
      {/* stat bar */}
      <div className="grid gap-3.5 pt-5" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <Stat label="Total value locked" value={s.loading ? "—" : fmtUsd(tvl, { compact: true })} />
        <Stat label="Mid · WETH/USDC" value={s.loading ? "—" : fmtUsd(s.price)} />
        <Stat label="Detector regime" value={regime.label} accent={regime.color} />
        <Stat label="Lean · κ spread" value={fmtPct(s.kappa)} accent={s.kappa > 0 ? "var(--honey)" : undefined} />
        <Stat label="24h volume" value={totals ? fmtUsd(totals.volume_24h, { compact: true }) : "—"} />
      </div>

      {/* brain + side */}
      <div className="grid gap-4.5 mt-4" style={{ gridTemplateColumns: "1fr 340px", gap: 18 }}>
        {/* The Brain */}
        <div className="card grain relative overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--divider)" }}>
            <div className="flex items-center gap-2.5">
              <span style={{ color: "var(--lav)" }}><Icon name="brain" size={18} /></span>
              <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>The Brain</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--faint)" }}>· CUSUM drift detector</span>
            </div>
            <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ fontSize: 12, fontWeight: 700, color: regime.color, background: regime.ring }}>
              <span className="anim-pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: regime.color }} />
              live · per block
            </div>
          </div>

          <div className="grid gap-5 p-6" style={{ gridTemplateColumns: "1.45fr 1fr" }}>
            <div>
              <div className="flex items-baseline gap-3">
                <div className="font-display" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: regime.color }}>
                  {regime.label}
                </div>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                  {s.trend === "none" ? "watching for drift" : "detector engaged"}
                </span>
              </div>
              <div className="mt-3.5">
                <Oscilloscope trend={s.trend} intensity={Math.max(s.kappa / 0.1, s.directionalEfficiency)} />
              </div>
              <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <Readout label="spread · sell WETH" value={fmtPct(s.spreadZeroForOne)} color={s.spreadZeroForOne > 0 ? "var(--down)" : "var(--text-2)"} />
                <Readout label="spread · buy WETH" value={fmtPct(s.spreadOneForZero)} color={s.spreadOneForZero > 0 ? "var(--up)" : "var(--text-2)"} />
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-5">
              <Gauge value={s.kappa} max={0.1} label="κ · lean" color="var(--honey)" suffix="%" scale={100} />
              <Gauge value={s.directionalEfficiency} max={1} label="D · efficiency" color="var(--lav)" suffix="%" scale={100} />
            </div>
          </div>
        </div>

        {/* LVR avoided card */}
        <div className="flex flex-col gap-4.5" style={{ gap: 18 }}>
          <div
            className="relative overflow-hidden"
            style={{ border: "1px solid var(--green-border)", borderRadius: "var(--r-card)", background: "var(--green-bg)", padding: 22, boxShadow: "var(--shadow-glow-up)" }}
          >
            <div className="anim-floaty" style={{ position: "absolute", right: -24, top: -24, width: 120, height: 120, borderRadius: 99, background: "radial-gradient(circle, rgba(107,184,154,.22), transparent 70%)" }} />
            <div className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 700, color: "var(--green-label)", marginBottom: 10 }}>
              <Icon name="spark" size={15} /> LVR avoided vs a normal pool
            </div>
            <div className="font-display" style={{ fontSize: 34, fontWeight: 700, color: "var(--green-label)", lineHeight: 1 }}>
              {totals && totals.swap_count > 0 ? fmtUsd(totals.lvr_avoided, { compact: totals.lvr_avoided > 9999, dp: 2 }) : "—"}
            </div>
            <div style={{ marginTop: 9, fontSize: 12, fontWeight: 600, color: "var(--green-rate)" }}>
              {totals?.swap_count ?? 0} swaps tracked · retained for LPs
            </div>
            <div style={{ marginTop: 14, paddingTop: 13, borderTop: "1px solid var(--green-border)", fontSize: 11, color: "var(--green-sub)", lineHeight: 1.6 }}>
              The directional spread Poincaré charged with-trend flow — value a constant-product (x·y=k) pool would
              have leaked to arbitrageurs. Accrues as trades are recorded. Not guaranteed.
            </div>
          </div>

          <div className="card-quiet p-5">
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".3px", color: "var(--text-3)", marginBottom: 14 }}>Pool reserves</div>
            <Row label="WETH (currency1)" value={`${fmtNum(Number(s.r1) / 1e18, 2)} WETH`} />
            <Row label="USDC (currency0)" value={`${fmtNum(Number(s.r0) / 1e18, 0)} USDC`} />
            <Row label="implied price" value={`${fmtUsd(s.price)} / WETH`} />
            <Row label="hook" value="0x8dBc…aA88" mono />
          </div>

          <Tape rows={tape} />
        </div>
      </div>
    </div>
  );
}

function Readout({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md px-3 py-2.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center" style={{ padding: "7px 0" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)", fontFamily: mono ? "ui-monospace, monospace" : undefined }}>{value}</span>
    </div>
  );
}
