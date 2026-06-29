import { useState } from "react";
import { usePoolState } from "@/hooks/usePoolState";
import { useBalances } from "@/hooks/useBalances";
import { useSwap, useFaucet } from "@/hooks/useSwap";
import { useTape } from "@/hooks/useBackend";
import { quote } from "@/lib/curve";
import { fmtNum, fmtUsd, fmtPct } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Tape } from "@/components/ui/Tape";
import { TxSteps } from "@/components/ui/TxSteps";
import { useIsNarrow } from "@/hooks/useMediaQuery";

const SLIP = 0.5; // %

export function Trade() {
  const s = usePoolState();
  const bal = useBalances();
  const { swap, status, stepper, reset } = useSwap();
  const faucet = useFaucet();
  const tape = useTape(16).data ?? [];
  const narrow = useIsNarrow();

  const [sellUSDC, setSellUSDC] = useState(true);
  const [amt, setAmt] = useState("1000");

  const r0 = Number(s.r0) / 1e18; // USDC
  const r1 = Number(s.r1) / 1e18; // WETH
  const zeroForOne = sellUSDC; // currency0 = USDC
  const spread = zeroForOne ? s.spreadZeroForOne : s.spreadOneForZero;
  const q = quote(r0, r1, Number(amt) || 0, zeroForOne, spread);
  const minOut = q.out * (1 - SLIP / 100);

  const sellSym = sellUSDC ? "USDC" : "WETH";
  const buySym = sellUSDC ? "WETH" : "USDC";
  const sellBal = sellUSDC ? bal.usdc : bal.weth;
  const insufficient = Number(amt) > sellBal + 1e-9;

  const busy = status === "busy";
  const disabled = busy || !amt || Number(amt) <= 0 || q.out <= 0 || insufficient;

  async function onSwap() {
    await swap({ amountIn: amt, zeroForOne, minOut, quote: q });
    bal.refetch();
    setTimeout(reset, 2500);
  }

  return (
    <>
    <TxSteps stepper={stepper} title="Swapping" />
    <div className="grid gap-4.5 px-4 sm:px-6 pb-8 pt-5 items-start" style={{ gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,420px) minmax(0,1fr) 320px", gap: 18 }}>
      {/* ---- swap form ---- */}
      <div className="card p-5 sm:p-6 min-w-0">
        <div className="flex justify-between items-center mb-4">
          <span className="font-display" style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Swap</span>
          <span className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 700, color: "var(--lav)" }}>
            <span className="anim-pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--lav)" }} /> live quote
          </span>
        </div>

        <TokenRow label="You pay" balance={sellBal} sym={sellSym} value={amt} onInput={setAmt} editable />
        <div className="flex justify-center" style={{ margin: "-10px 0", position: "relative", zIndex: 2 }}>
          <button
            onClick={() => setSellUSDC((v) => !v)}
            className="flex items-center justify-center"
            style={{ width: 34, height: 34, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--nav-border)", color: "var(--lav)", boxShadow: "var(--shadow-sm)" }}
          >
            <Icon name="swap" size={16} className="rotate-90" />
          </button>
        </div>
        <TokenRow label="You receive · est" sub="via the live curve" sym={buySym} value={q.out > 0 ? fmtNum(q.out, buySym === "WETH" ? 5 : 2) : "0"} />

        {/* trend badge */}
        <TrendBadge withTrend={q.withTrend} trend={s.trend} spread={spread} />

        {/* the comparison — this is the LVR story per trade */}
        <Comparison q={q} />

        {/* details */}
        <div className="mt-4 flex flex-col gap-2.5 pt-4" style={{ borderTop: "1px solid var(--divider)" }}>
          <Detail label="Effective price" value={`${fmtUsd(q.execPrice)} / WETH`} />
          <Detail label="Spread applied" value={fmtPct(spread)} color={spread > 0 ? "var(--honey-deep)" : undefined} />
          <Detail label="Price impact" value={fmtPct(q.impact)} color={q.impact > 0.01 ? "var(--down)" : undefined} />
          <Detail label={`Min received · slip ${SLIP}%`} value={`${fmtNum(minOut, buySym === "WETH" ? 5 : 2)} ${buySym}`} />
        </div>

        {/* CTA */}
        <button
          onClick={onSwap}
          disabled={disabled}
          className="mt-5 w-full text-center font-bold"
          style={{
            color: "#fff",
            background: disabled ? "var(--faint)" : status === "success" ? "var(--up)" : "var(--up-deep)",
            borderRadius: 16,
            padding: "15px",
            fontSize: 14.5,
            letterSpacing: ".3px",
            boxShadow: disabled ? "none" : "0 8px 20px rgba(107,184,154,.3)",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "background .2s",
          }}
        >
          {busy ? "Confirming…" : status === "success" ? "Swapped ✓" : insufficient ? `Insufficient ${sellSym}` : `Swap ${sellSym} → ${buySym}`}
        </button>

        {/* faucet */}
        {sellBal < 1 && (
          <button onClick={faucet.mint} disabled={faucet.minting} className="mt-3 w-full text-center font-bold" style={{ color: "var(--lav-deep)", background: "var(--lav-soft)", borderRadius: 14, padding: "11px", fontSize: 12.5 }}>
            {faucet.minting ? "Minting test tokens…" : "Get test tokens (50k USDC · 20 WETH)"}
          </button>
        )}
      </div>

      {/* ---- middle: explainer ---- */}
      <div className="card-quiet p-5 sm:p-6 min-w-0">
        <div className="flex items-center gap-2.5 mb-4">
          <span style={{ color: "var(--lav)" }}><Icon name="shield" size={18} /></span>
          <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>How this trade compares to a normal pool</span>
        </div>
        <CompareBar label="Poincaré (this pool)" value={q.out} max={q.baseOut} sym={buySym} color="var(--up)" highlight />
        <CompareBar label="Constant-product · no fee" value={q.baseOut} max={q.baseOut} sym={buySym} color="var(--lav)" />
        <CompareBar label="Normal pool · 0.3% fee" value={q.feeOut} max={q.baseOut} sym={buySym} color="var(--faint)" />
        <p className="mt-5" style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-3)" }}>
          {q.withTrend ? (
            <>You're trading <span style={{ color: "var(--honey-deep)", fontWeight: 700 }}>with the detected trend</span>, so a small spread of {fmtPct(spread)} applies, and that{" "}
            <span style={{ color: "var(--green-label)", fontWeight: 700 }}>{fmtUsd(q.lvrToLps)}</span> goes straight to LPs. A normal pool would have leaked it to arbitrageurs. That's the LVR being reduced, in real time.</>
          ) : (
            <>You're trading in <span style={{ color: "var(--up-deep)", fontWeight: 700 }}>{s.trend === "none" ? "a calm market" : "the stabilising direction"}</span>, so Poincaré charges <span style={{ fontWeight: 700, color: "var(--text)" }}>zero spread</span>, so you keep <span style={{ color: "var(--green-label)", fontWeight: 700 }}>{fmtUsd(Math.max(0, q.savedVsFee))}</span> that a 0.3% fee pool would have taken. Protection without taxing honest flow.</>
          )}
        </p>
        <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
          <MiniStat label="Detector regime" value={s.trend === "none" ? "Calm" : s.trend === "up" ? "Up-trend" : "Down-trend"} color={s.trend === "up" ? "var(--up)" : s.trend === "down" ? "var(--down)" : "var(--lav)"} />
          <MiniStat label="This trade → LPs" value={fmtUsd(q.lvrToLps)} color="var(--green-label)" />
        </div>
      </div>

      {/* ---- tape ---- */}
      <div className="min-w-0"><Tape rows={tape} /></div>
    </div>
    </>
  );
}

function TokenRow({ label, sub, balance, sym, value, onInput, editable }: { label: string; sub?: string; balance?: number; sym: string; value: string; onInput?: (v: string) => void; editable?: boolean }) {
  const color = sym === "USDC" ? "var(--usdc)" : "var(--eth)";
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 16, background: "var(--surface-2)", padding: "15px 16px" }}>
      <div className="flex justify-between" style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 9 }}>
        <span>{label}</span>
        <span>{balance !== undefined ? `balance ${fmtNum(balance, 3)}` : sub}</span>
      </div>
      <div className="flex items-center gap-2.5">
        {editable ? (
          <input value={value} onChange={(e) => onInput?.(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 26, fontWeight: 800 }} />
        ) : (
          <div style={{ flex: 1, minWidth: 0, color: "var(--text)", fontSize: 26, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        )}
        <div className="flex items-center gap-2" style={{ background: "var(--surface)", border: "1px solid var(--nav-border)", borderRadius: 22, padding: "7px 13px 7px 8px", boxShadow: "var(--shadow-sm)" }}>
          <span style={{ width: 20, height: 20, borderRadius: 99, background: color, display: "inline-block" }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{sym}</span>
        </div>
      </div>
    </div>
  );
}

function TrendBadge({ withTrend, trend, spread }: { withTrend: boolean; trend: string; spread: number }) {
  const calm = trend === "none";
  const bg = withTrend ? "var(--warn-bg)" : "var(--green-bg)";
  const border = withTrend ? "var(--warn-border)" : "var(--green-border)";
  const color = withTrend ? "var(--warn-label)" : "var(--green-label)";
  return (
    <div className="mt-4" style={{ border: `1px solid ${border}`, background: bg, borderRadius: 16, padding: "13px 15px" }}>
      <div className="flex items-center gap-2">
        <span style={{ color }}><Icon name={withTrend ? "wave" : "check"} size={16} /></span>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>
          {withTrend ? `With-trend flow · ${fmtPct(spread)} spread` : calm ? "Calm market · no spread" : "Stabilising flow · no spread"}
        </span>
      </div>
    </div>
  );
}

function Comparison({ q }: { q: ReturnType<typeof quote> }) {
  const positive = !q.withTrend && q.savedVsFee > 0;
  return (
    <div className="mt-3 flex items-center justify-between" style={{ background: positive ? "var(--change-up-bg)" : "var(--surface-2)", border: `1px solid ${positive ? "var(--green-border)" : "var(--border)"}`, borderRadius: 14, padding: "12px 15px" }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-3)" }}>
        {q.withTrend ? "Returns to LPs" : "You save vs a 0.3% pool"}
      </span>
      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--green-label)" }}>
        {q.withTrend ? fmtUsd(q.lvrToLps) : fmtUsd(Math.max(0, q.savedVsFee))}
      </span>
    </div>
  );
}

function CompareBar({ label, value, max, sym, color, highlight }: { label: string; value: number; max: number; sym: string; color: string; highlight?: boolean }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1.5" style={{ fontSize: 12 }}>
        <span style={{ color: highlight ? "var(--text)" : "var(--text-3)", fontWeight: highlight ? 800 : 600 }}>{label}</span>
        <span style={{ color: "var(--text-2)", fontWeight: 700 }}>{fmtNum(value, sym === "WETH" ? 5 : 2)} {sym}</span>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: "var(--track)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 5, transition: "width .3s" }} />
      </div>
    </div>
  );
}

function Detail({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between" style={{ fontSize: 12 }}>
      <span style={{ color: "var(--text-3)" }}>{label}</span>
      <span style={{ color: color ?? "var(--text-2)", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}
