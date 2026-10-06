import { useState } from "react";
import { usePoolState } from "@/hooks/usePoolState";
import { useBalances } from "@/hooks/useBalances";
import { useSwap, useFaucet } from "@/hooks/useSwap";
import { useTradeQuote } from "@/hooks/useQuote";
import { useOnchainTape } from "@/hooks/useOnchainTape";
import { fromWei, legsOf, toWei } from "@/lib/units";
import { fmtNum, fmtUsd, fmtPct } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Tape } from "@/components/ui/Tape";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { PoolChart } from "@/components/ui/PoolChart";
import { TxSteps } from "@/components/ui/TxSteps";
import { useIsNarrow } from "@/hooks/useMediaQuery";
import { regimeOf } from "@/components/ui/Regime";

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

  const regime = regimeOf(s.trend);

  return (
    <>
    <TxSteps stepper={stepper} title="Swapping" />
    <div className="grid gap-5 px-4 sm:px-7 py-6 items-start grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px]">
      {/* ticket: first on small screens, right rail on desktop */}
      <section className="panel p-5 min-w-0 xl:order-2 xl:sticky" style={{ top: 84, boxShadow: "var(--shadow-lg)" }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="m-0" style={{ fontSize: 16, fontWeight: 600 }}>{sellUSDC ? "Buy WETH" : "Sell WETH"}</h2>
          <span className="num flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--lav-deep)" }}>
            <span className="anim-pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor" }} /> live quote
          </span>
        </div>

        <TokenRow label="You pay" balance={sellBal} sym={sellSym} value={amt} onInput={setAmt} editable />
        <div className="flex justify-center" style={{ margin: "-12px 0", position: "relative", zIndex: 2 }}>
          <button
            type="button"
            onClick={() => setSellUSDC((v) => !v)}
            aria-label="Flip direction"
            className="flex items-center justify-center transition-colors hover:text-lav"
            style={{ width: 36, height: 36, borderRadius: 10, background: "var(--lav-soft)", border: "4px solid var(--surface)", color: "var(--lav-deep)", cursor: "pointer" }}
          >
            <Icon name="swap" size={15} className="rotate-90" />
          </button>
        </div>
        <TokenRow label="You receive · est." sub="via the live curve" sym={buySym} value={q.out > 0 ? fmtNum(q.out, buySym === "WETH" ? 5 : 2) : "0"} />

        <TrendBadge withTrend={q.withTrend} trend={s.trend} spread={spread} />

        <div className="mt-3 px-0.5">
          <div className="kv"><span>Effective price</span><span className="num">{fmtUsd(q.execPrice)}</span></div>
          <div className="kv"><span>Directional spread</span><span className="num" style={{ color: spread > 0 ? "var(--honey-deep)" : undefined }}>{fmtPct(spread)}</span></div>
          {s.fee > 0 && <div className="kv"><span>Base fee · vol-scaled</span><span className="num">{fmtPct(s.fee)}</span></div>}
          <div className="kv"><span>Price impact</span><span className="num" style={{ color: q.impact > 0.01 ? "var(--down-deep)" : undefined }}>{fmtPct(q.impact)}</span></div>
          <div className="kv"><span>Min received</span><span className="num">{fmtNum(minOut, buySym === "WETH" ? 5 : 2)} {buySym}</span></div>
          <div className="kv">
            <span>Slippage tolerance</span>
            <div className="seg" role="group" aria-label="Slippage tolerance">
              {SLIPPAGE_OPTIONS.map((v) => (
                <button key={v} type="button" aria-pressed={slip === v} onClick={() => setSlip(v)} className="num">{v}%</button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onSwap}
          disabled={disabled}
          className="btn btn-primary btn-block mt-4"
          style={status === "success" ? { background: "var(--up-deep)" } : undefined}
        >
          {busy ? "Confirming…" : status === "success" ? "Swapped ✓" : insufficient ? `Insufficient ${sellSym}` : `Swap ${sellSym} → ${buySym}`}
        </button>

        {sellBal < 1 && (
          <button type="button" onClick={() => faucet.mint()} disabled={faucet.minting} className="btn btn-ghost btn-block mt-2.5" style={{ height: 42, fontSize: 13.5, color: "var(--lav-deep)" }}>
            {faucet.minting ? "Minting test tokens…" : "Get test tokens · 50k USDC + 20 WETH"}
          </button>
        )}
      </section>

      {/* context */}
      <div className="flex flex-col min-w-0 xl:order-1" style={{ gap: 20 }}>
        <section className="panel p-5 min-w-0">
          <PoolChart height={narrow ? 180 : 240} />
        </section>

        <section className="panel min-w-0">
          <div className="panel-head">
            <h2 className="panel-title">This trade vs a normal pool</h2>
            <span className="pill" style={{ color: regime.color, background: regime.bg }}>{regime.label}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 1, background: "var(--divider)" }}>
            <Cell label="Poincaré pays you" value={`${fmtNum(q.out, buySym === "WETH" ? 5 : 2)} ${buySym}`} strong />
            <Cell label="Normal pool · 0.3% fee" value={`${fmtNum(q.feeOut, buySym === "WETH" ? 5 : 2)} ${buySym}`} />
            {q.withTrend
              ? <Cell label="This trade → LPs" value={fmtUsd(q.lvrToLps, { dp: 2 })} color="var(--honey-deep)" />
              : <Cell label="You save vs a 0.3% pool" value={fmtUsd(Math.max(0, q.savedVsFee), { dp: 2 })} color="var(--green-label)" />}
          </div>
          <div className="px-5 py-4" style={{ borderTop: "1px solid var(--divider)" }}>
            <CompareBar label="Poincaré (this pool)" value={q.out} max={q.baseOut} sym={buySym} color="var(--up)" highlight />
            <CompareBar label="Constant-product · no fee" value={q.baseOut} max={q.baseOut} sym={buySym} color="var(--lav)" />
            <CompareBar label="Normal pool · 0.3% fee" value={q.feeOut} max={q.baseOut} sym={buySym} color="var(--faint)" />
            <p className="m-0 mt-3" style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-2)" }}>
              {q.withTrend ? (
                <>You're trading <span style={{ color: "var(--honey-deep)", fontWeight: 600 }}>with the detected trend</span>, so a spread of {fmtPct(spread)} applies, and that{" "}
                <span className="num" style={{ color: "var(--green-label)", fontWeight: 600 }}>{fmtUsd(q.lvrToLps, { dp: 2 })}</span> goes straight to LPs. A normal pool would have leaked it to arbitrageurs: that's LVR being reduced in real time.</>
              ) : (
                <>You're trading in <span style={{ color: "var(--up-deep)", fontWeight: 600 }}>{s.trend === "none" ? "a calm market" : "the stabilising direction"}</span>, so Poincaré charges <span style={{ fontWeight: 600, color: "var(--text)" }}>zero spread</span> and you keep{" "}
                <span className="num" style={{ color: "var(--green-label)", fontWeight: 600 }}>{fmtUsd(Math.max(0, q.savedVsFee), { dp: 2 })}</span> that a 0.3% fee pool would have taken. Protection without taxing honest flow.</>
              )}
            </p>
          </div>
        </section>

        <Tape rows={shownRows} onLoadMore={onTapeLoadMore} hasMore={tapeHasMore} loadingMore={tape.loadingMore} maxHeight={420} badge="on-chain · live" />
      </div>
    </div>
    </>
  );
}

function TokenRow({ label, sub, balance, sym, value, onInput, editable }: { label: string; sub?: string; balance?: number; sym: string; value: string; onInput?: (v: string) => void; editable?: boolean }) {
  const id = `amt-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="field">
      <div className="flex justify-between lbl" style={{ marginBottom: 8 }}>
        <label htmlFor={editable ? id : undefined}>{label}</label>
        <span className="num">{balance !== undefined ? `Balance ${fmtNum(balance, 3)}` : sub}</span>
      </div>
      <div className="flex items-center gap-2.5">
        {editable ? (
          <input id={id} className="num" value={value} onChange={(e) => onInput?.(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 28, fontWeight: 500 }} />
        ) : (
          <div className="num" style={{ flex: 1, minWidth: 0, color: "var(--text)", fontSize: 28, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        )}
        <TokenChip sym={sym} />
      </div>
    </div>
  );
}

function TokenChip({ sym }: { sym: string }) {
  return (
    <div className="flex items-center gap-2 shrink-0" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 99, padding: "6px 12px 6px 7px" }}>
      <TokenIcon sym={sym} size={20} />
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{sym}</span>
    </div>
  );
}

function TrendBadge({ withTrend, trend, spread }: { withTrend: boolean; trend: string; spread: number }) {
  const calm = trend === "none";
  const bg = withTrend ? "var(--warn-bg)" : "var(--change-up-bg)";
  const color = withTrend ? "var(--warn-label)" : "var(--green-label)";
  return (
    <div className="mt-4 flex items-center gap-2.5" style={{ background: bg, color, borderRadius: "var(--r-sm)", padding: "10px 12px", fontSize: 13, fontWeight: 500 }}>
      <Icon name={withTrend ? "wave" : "check"} size={15} />
      {withTrend ? `With the trend · ${fmtPct(spread)} directional spread` : calm ? "Calm market · no spread" : "Stabilising flow · no spread"}
    </div>
  );
}

function Cell({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div style={{ background: "var(--surface)", padding: "16px 20px" }}>
      <div className="lbl">{label}</div>
      <div className="num truncate" style={{ fontSize: 18, fontWeight: 600, marginTop: 6, color: color ?? (strong ? "var(--text)" : "var(--text-3)") }}>{value}</div>
    </div>
  );
}

function CompareBar({ label, value, max, sym, color, highlight }: { label: string; value: number; max: number; sym: string; color: string; highlight?: boolean }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1.5" style={{ fontSize: 12.5 }}>
        <span style={{ color: highlight ? "var(--text)" : "var(--text-3)", fontWeight: highlight ? 600 : 400 }}>{label}</span>
        <span className="num" style={{ color: "var(--text-2)" }}>{fmtNum(value, sym === "WETH" ? 5 : 2)} {sym}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--track)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .3s" }} />
      </div>
    </div>
  );
}
