import { useState } from "react";
import { usePoolState } from "@/hooks/usePoolState";
import { useBalances } from "@/hooks/useBalances";
import { useSwap, useFaucet } from "@/hooks/useSwap";
import { useTradeQuote } from "@/hooks/useQuote";
import { useOnchainTape } from "@/hooks/useOnchainTape";
import { fromWei, legsOf, toWei } from "@/lib/units";
import type { Quote } from "@/lib/curve";
import { fmtNum, fmtUsd, fmtPct } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Tape } from "@/components/ui/Tape";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { PoolChart } from "@/components/ui/PoolChart";
import { TxSteps } from "@/components/ui/TxSteps";
import { useIsNarrow } from "@/hooks/useMediaQuery";

const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0] as const; // %

export function Trade() {
  const s = usePoolState();
  const bal = useBalances();
  const { swap, status, stepper, reset } = useSwap();
  const faucet = useFaucet();
  const tape = useOnchainTape();
  const narrow = useIsNarrow();

  // Reveal 18 rows at a time; page the chain when the buffer runs low.
  const PAGE = 18;
  const [visible, setVisible] = useState(PAGE);
  const shownRows = tape.rows.slice(0, visible);
  const moreInBuffer = visible < tape.rows.length;
  const tapeHasMore = moreInBuffer || tape.hasMore;
  const onTapeLoadMore = () => {
    setVisible((v) => v + PAGE);
    if (visible + PAGE >= tape.rows.length && tape.hasMore) void tape.loadMore();
  };

  const [sellUSDC, setSellUSDC] = useState(true);
  const [amt, setAmt] = useState("1000");
  const [slip, setSlip] = useState<number>(0.5); // %

  const zeroForOne = sellUSDC; // currency0 = USDC
  const spread = zeroForOne ? s.spreadZeroForOne : s.spreadOneForZero;
  const q = useTradeQuote(s, amt, zeroForOne);

  // minOut in wei, from the wei-exact Lens quote when available (real slippage
  // protection); the float model only backstops older deployments.
  const { outSym } = legsOf(zeroForOne);
  const slipBps = BigInt(Math.round(slip * 100));
  const minOutWei =
    q.outWei !== null ? (q.outWei * (10_000n - slipBps)) / 10_000n : toWei(q.out * (1 - slip / 100), outSym);
  const minOut = fromWei(minOutWei, outSym);

  const sellSym = sellUSDC ? "USDC" : "WETH";
  const buySym = sellUSDC ? "WETH" : "USDC";
  const sellBal = sellUSDC ? bal.usdc : bal.weth;
  const insufficient = Number(amt) > sellBal + 1e-9;

  const busy = status === "busy";
  const disabled = busy || !amt || Number(amt) <= 0 || q.out <= 0 || insufficient;

  async function onSwap() {
    await swap({ amountIn: amt, zeroForOne, minOutWei, quote: q });
    bal.refetch();
    setTimeout(reset, 2500);
  }

  return (
    <>
    <TxSteps stepper={stepper} title="Swapping" />
    <div className="grid gap-4.5 px-4 sm:px-6 pb-8 pt-5 items-start" style={{ gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,420px) minmax(0,1fr) 320px", gap: 18 }}>
      {/* Swap form; spacing tuned so its lower edge lines up with the tape and
          comparison cards in the other columns. */}
      <div className="card p-4 sm:p-5 min-w-0">
        <div className="flex justify-between items-center mb-3">
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

        <TrendBadge withTrend={q.withTrend} trend={s.trend} spread={spread} />
        <Comparison q={q} />

        <div className="mt-3 flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
          <Detail label="Effective price" value={`${fmtUsd(q.execPrice)} / WETH`} />
          <Detail label="Directional spread" value={fmtPct(spread)} color={spread > 0 ? "var(--honey-deep)" : undefined} />
          {s.fee > 0 && <Detail label="Base fee · vol-scaled" value={fmtPct(s.fee)} />}
          <Detail label="Price impact" value={fmtPct(q.impact)} color={q.impact > 0.01 ? "var(--down)" : undefined} />
          <Detail label="Min received" value={`${fmtNum(minOut, buySym === "WETH" ? 5 : 2)} ${buySym}`} />
          <div className="flex justify-between items-center" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--text-3)" }}>Slippage tolerance</span>
            <div className="flex gap-1">
              {SLIPPAGE_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => setSlip(v)}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 9px",
                    borderRadius: 8,
                    border: `1px solid ${slip === v ? "var(--lav)" : "var(--border)"}`,
                    background: slip === v ? "var(--lav-soft)" : "transparent",
                    color: slip === v ? "var(--lav-deep)" : "var(--text-3)",
                    cursor: "pointer",
                  }}
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={onSwap}
          disabled={disabled}
          className="mt-4 w-full text-center font-bold"
          style={{
            color: "#fff",
            background: disabled ? "var(--faint)" : status === "success" ? "var(--up)" : "var(--up-deep)",
            borderRadius: 16,
            padding: "13px",
            fontSize: 14.5,
            letterSpacing: ".3px",
            boxShadow: disabled ? "none" : "0 8px 20px rgba(107,184,154,.3)",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "background .2s",
          }}
        >
          {busy ? "Confirming…" : status === "success" ? "Swapped ✓" : insufficient ? `Insufficient ${sellSym}` : `Swap ${sellSym} → ${buySym}`}
        </button>

        {sellBal < 1 && (
          <button onClick={() => faucet.mint()} disabled={faucet.minting} className="mt-3 w-full text-center font-bold" style={{ color: "var(--lav-deep)", background: "var(--lav-soft)", borderRadius: 14, padding: "11px", fontSize: 12.5 }}>
            {faucet.minting ? "Minting test tokens…" : "Get test tokens (50k USDC · 20 WETH)"}
          </button>
        )}
      </div>

      <div className="flex flex-col min-w-0" style={{ gap: 14 }}>
      <div className="card p-5 sm:p-6 min-w-0">
        <PoolChart height={158} />
      </div>
      <div className="card-quiet p-5 sm:p-6 min-w-0">
        <div className="flex items-center gap-2.5 mb-3.5">
          <span style={{ color: "var(--lav)" }}><Icon name="shield" size={18} /></span>
          <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>How this trade compares to a normal pool</span>
        </div>
        <CompareBar label="Poincaré (this pool)" value={q.out} max={q.baseOut} sym={buySym} color="var(--up)" highlight />
        <CompareBar label="Constant-product · no fee" value={q.baseOut} max={q.baseOut} sym={buySym} color="var(--lav)" />
        <CompareBar label="Normal pool · 0.3% fee" value={q.feeOut} max={q.baseOut} sym={buySym} color="var(--faint)" />
        <p className="mt-4" style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-3)" }}>
          {q.withTrend ? (
            <>You're trading <span style={{ color: "var(--honey-deep)", fontWeight: 700 }}>with the detected trend</span>, so a small spread of {fmtPct(spread)} applies, and that{" "}
            <span style={{ color: "var(--green-label)", fontWeight: 700 }}>{fmtUsd(q.lvrToLps)}</span> goes straight to LPs. A normal pool would have leaked it to arbitrageurs. That's the LVR being reduced, in real time.</>
          ) : (
            <>You're trading in <span style={{ color: "var(--up-deep)", fontWeight: 700 }}>{s.trend === "none" ? "a calm market" : "the stabilising direction"}</span>, so Poincaré charges <span style={{ fontWeight: 700, color: "var(--text)" }}>zero spread</span>, so you keep <span style={{ color: "var(--green-label)", fontWeight: 700 }}>{fmtUsd(Math.max(0, q.savedVsFee))}</span> that a 0.3% fee pool would have taken. Protection without taxing honest flow.</>
          )}
        </p>
        <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
          <MiniStat label="Detector regime" value={s.trend === "none" ? "Calm" : s.trend === "up" ? "Up-trend" : "Down-trend"} color={s.trend === "up" ? "var(--up)" : s.trend === "down" ? "var(--down)" : "var(--lav)"} />
          <MiniStat label="This trade → LPs" value={fmtUsd(q.lvrToLps)} color="var(--green-label)" />
        </div>
      </div>
      </div>

      <div className="min-w-0">
        <Tape rows={shownRows} onLoadMore={onTapeLoadMore} hasMore={tapeHasMore} loadingMore={tape.loadingMore} maxHeight={510} badge="on-chain · live" />
      </div>
    </div>
    </>
  );
}

function TokenRow({ label, sub, balance, sym, value, onInput, editable }: { label: string; sub?: string; balance?: number; sym: string; value: string; onInput?: (v: string) => void; editable?: boolean }) {
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
          <TokenIcon sym={sym} size={20} />
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

function Comparison({ q }: { q: Quote }) {
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
    <div className="mb-2.5">
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
