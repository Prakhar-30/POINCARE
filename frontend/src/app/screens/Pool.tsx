import { useState } from "react";
import type { CSSProperties } from "react";
import { parseUnits } from "viem";
import { usePoolState } from "@/hooks/usePoolState";
import { usePosition } from "@/hooks/usePosition";
import { useBalances } from "@/hooks/useBalances";
import { useLiquidity } from "@/hooks/useLiquidity";
import { usePoolTotals } from "@/hooks/useBackend";
import { fmtNum, fmtUsd, fmtPct } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { BondingCurve } from "@/components/ui/BondingCurve";
import { TxSteps } from "@/components/ui/TxSteps";

export function Pool() {
  const s = usePoolState();
  const pos = usePosition();
  const bal = useBalances();
  const totals = usePoolTotals().data;
  const lp = useLiquidity(() => { pos.refetch(); bal.refetch(); });

  const [mode, setMode] = useState<"add" | "remove">("add");

  const price = pos.price || s.price;
  const lpLvr = totals ? totals.lvr_avoided * pos.sharePct : 0;

  return (
    <>
    <TxSteps stepper={lp.stepper} title={mode === "add" ? "Adding liquidity" : "Removing liquidity"} />
    <div className="grid gap-4.5 px-6 pb-8 pt-5 items-start" style={{ gridTemplateColumns: "minmax(0,440px) minmax(0,1fr)", gap: 18 }}>
      {/* ---- left: add / remove ---- */}
      <div className="card p-6">
        {/* mode toggle */}
        <div className="flex gap-1 mb-5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 14, padding: 4 }}>
          {(["add", "remove"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); lp.reset(); }}
              className="flex-1 font-bold"
              style={{
                padding: "9px", borderRadius: 10, fontSize: 13, letterSpacing: ".2px", transition: "all .15s",
                background: mode === m ? "var(--surface)" : "transparent",
                color: mode === m ? "var(--text)" : "var(--muted)",
                boxShadow: mode === m ? "var(--shadow-sm)" : "none",
              }}
            >
              {m === "add" ? "Add liquidity" : "Remove"}
            </button>
          ))}
        </div>

        {mode === "add"
          ? <AddPanel price={price} bal={bal} lp={lp} />
          : <RemovePanel pos={pos} lp={lp} />}
      </div>

      {/* ---- right: curve + position ---- */}
      <div className="flex flex-col gap-4.5" style={{ gap: 18 }}>
        {/* bonding curve */}
        <div className="card grain overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--divider)" }}>
            <div className="flex items-center gap-2.5">
              <span style={{ color: "var(--lav)" }}><Icon name="curve" size={18} /></span>
              <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Live bonding curve</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--faint)" }}>{fmtUsd(price)} / WETH</span>
          </div>
          <div className="p-6 pt-5">
            <BondingCurve r0={pos.r0} r1={pos.r1} spreadZeroForOne={s.spreadZeroForOne} spreadOneForZero={s.spreadOneForZero} trend={s.trend} />
            <p className="mt-4" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text-3)" }}>
              Liquidity sits on the constant-product invariant. When the CUSUM detector flags a trend, the with-trend
              side of the curve steepens by the directional spread, and that captured value is what a normal pool leaks
              to arbitrageurs as LVR. In calm markets both slopes coincide and the pool trades deep and symmetric.
            </p>
          </div>
        </div>

        {/* position + LP LVR */}
        <div className="grid gap-4.5" style={{ gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div className="card-quiet p-5">
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".3px", color: "var(--text-3)", marginBottom: 14 }}>Your position</div>
            {pos.shares > 0 ? (
              <>
                <Row label="Pool value" value={fmtUsd(pos.valueUsdc)} big />
                <Row label="Pool share" value={fmtPct(pos.sharePct)} />
                <Row label="WETH" value={`${fmtNum(pos.underlying1, 4)}`} />
                <Row label="USDC" value={`${fmtNum(pos.underlying0, 2)}`} />
                <Row label="LP shares" value={fmtNum(pos.shares, 4)} />
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7, padding: "8px 0" }}>
                You have no liquidity yet. Add USDC and WETH at the current ratio to start earning the directional spread.
              </div>
            )}
          </div>

          <div
            className="relative overflow-hidden"
            style={{ border: "1px solid var(--green-border)", borderRadius: "var(--r-card)", background: "var(--green-bg)", padding: 20, boxShadow: "var(--shadow-glow-up)" }}
          >
            <div className="anim-floaty" style={{ position: "absolute", right: -24, top: -24, width: 110, height: 110, borderRadius: 99, background: "radial-gradient(circle, rgba(107,184,154,.22), transparent 70%)" }} />
            <div className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 700, color: "var(--green-label)", marginBottom: 10 }}>
              <Icon name="spark" size={15} /> Your LVR avoided
            </div>
            <div className="font-display" style={{ fontSize: 28, fontWeight: 700, color: "var(--green-label)", lineHeight: 1 }}>
              {pos.sharePct > 0 ? fmtUsd(lpLvr, { dp: 2 }) : "—"}
            </div>
            <div style={{ marginTop: 9, fontSize: 11.5, fontWeight: 600, color: "var(--green-rate)" }}>
              your {fmtPct(pos.sharePct)} share of {totals ? fmtUsd(totals.lvr_avoided, { dp: 2 }) : "—"} captured pool-wide
            </div>
            <div style={{ marginTop: 13, paddingTop: 12, borderTop: "1px solid var(--green-border)", fontSize: 11, color: "var(--green-sub)", lineHeight: 1.6 }}>
              Spread the pool charged with-trend flow, retained for LPs instead of leaking to arbitrageurs. Accrues as
              trades are recorded. Not guaranteed.
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

/* ---------------- add ---------------- */

function AddPanel({ price, bal, lp }: { price: number; bal: ReturnType<typeof useBalances>; lp: ReturnType<typeof useLiquidity> }) {
  const [usdc, setUsdc] = useState("3000");
  const [weth, setWeth] = useState(price > 0 ? (3000 / price).toFixed(4) : "1");

  // edit one leg, auto-fill the other at the pool ratio
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
    <>
      <LiqInput label="USDC" sub={`balance ${fmtNum(bal.usdc, 2)}`} value={usdc} onInput={onUsdc} color="var(--usdc)" />
      <div className="flex items-center justify-center" style={{ margin: "10px 0", color: "var(--faint)" }}><Icon name="plus" size={16} /></div>
      <LiqInput label="WETH" sub={`balance ${fmtNum(bal.weth, 4)}`} value={weth} onInput={onWeth} color="var(--eth)" />

      <div className="mt-4 flex flex-col gap-2.5 pt-4" style={{ borderTop: "1px solid var(--divider)" }}>
        <Detail label="Deposit value" value={fmtUsd(valueUsdc)} />
        <Detail label="Pool ratio" value={`${fmtUsd(price)} / WETH`} />
        <Detail label="Added at" value="current reserve ratio" />
      </div>

      <button onClick={onAdd} disabled={disabled} className="mt-5 w-full font-bold"
        style={ctaStyle(disabled, lp.status === "success")}>
        {busy ? "Confirming…" : lp.status === "success" ? "Added ✓" : insufficient ? "Insufficient balance" : "Add liquidity"}
      </button>

      {(bal.usdc < u || bal.weth < w) && (
        <p className="mt-3 text-center" style={{ fontSize: 11, color: "var(--muted)" }}>Need test tokens? Grab them from the Trade tab faucet.</p>
      )}
    </>
  );
}

/* ---------------- remove ---------------- */

function RemovePanel({ pos, lp }: { pos: ReturnType<typeof usePosition>; lp: ReturnType<typeof useLiquidity> }) {
  const [pct, setPct] = useState(50);

  const sharesToBurn = pos.shares * (pct / 100);
  const out0 = pos.underlying0 * (pct / 100);
  const out1 = pos.underlying1 * (pct / 100);
  const valueUsdc = out0 + out1 * pos.price;
  const busy = lp.status === "busy";
  const disabled = busy || pos.shares <= 0 || pct <= 0;

  async function onRemove() {
    // burn shares in raw 18-dec units (guard against float drift on 100%)
    const shares = pct >= 100 ? parseUnits(pos.shares.toFixed(18), 18) : parseUnits(sharesToBurn.toFixed(18), 18);
    await lp.remove({ shares, valueUsdc, amount0: out0, amount1: out1 });
    pos.refetch();
    setTimeout(lp.reset, 2500);
  }

  if (pos.shares <= 0) {
    return <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7, padding: "20px 4px" }}>No liquidity to remove. Add some first.</div>;
  }

  return (
    <>
      <div className="flex items-baseline justify-between mb-1">
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Amount to remove</span>
        <span className="font-display" style={{ fontSize: 30, fontWeight: 800, color: "var(--text)" }}>{pct}%</span>
      </div>
      <input type="range" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--lav)", margin: "8px 0 4px" }} />
      <div className="flex gap-2 mt-2">
        {[25, 50, 75, 100].map((p) => (
          <button key={p} onClick={() => setPct(p)} className="flex-1 font-bold"
            style={{ padding: "8px", borderRadius: 10, fontSize: 12, background: pct === p ? "var(--lav-soft)" : "var(--surface-2)", color: pct === p ? "var(--lav-deep)" : "var(--muted)", border: "1px solid var(--border)" }}>
            {p === 100 ? "Max" : `${p}%`}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-2.5 pt-4" style={{ borderTop: "1px solid var(--divider)" }}>
        <Detail label="You receive · USDC" value={fmtNum(out0, 2)} />
        <Detail label="You receive · WETH" value={fmtNum(out1, 4)} />
        <Detail label="Value" value={fmtUsd(valueUsdc)} />
      </div>

      <button onClick={onRemove} disabled={disabled} className="mt-5 w-full font-bold"
        style={ctaStyle(disabled, lp.status === "success", "var(--down-deep)", "rgba(229,140,160,.3)")}>
        {busy ? "Confirming…" : lp.status === "success" ? "Removed ✓" : "Remove liquidity"}
      </button>
    </>
  );
}

/* ---------------- bits ---------------- */

function ctaStyle(disabled: boolean, success: boolean, base = "var(--up-deep)", glow = "rgba(107,184,154,.3)"): CSSProperties {
  return {
    color: "#fff",
    background: disabled ? "var(--faint)" : success ? "var(--up)" : base,
    borderRadius: 16, padding: "15px", fontSize: 14.5, letterSpacing: ".3px",
    boxShadow: disabled ? "none" : `0 8px 20px ${glow}`,
    cursor: disabled ? "not-allowed" : "pointer", transition: "background .2s",
  };
}

function LiqInput({ label, sub, value, onInput, color }: { label: string; sub: string; value: string; onInput: (v: string) => void; color: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 16, background: "var(--surface-2)", padding: "15px 16px" }}>
      <div className="flex justify-between" style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 9 }}>
        <span>{label}</span><span>{sub}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <input value={value} onChange={(e) => onInput(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 26, fontWeight: 800 }} />
        <div className="flex items-center gap-2" style={{ background: "var(--surface)", border: "1px solid var(--nav-border)", borderRadius: 22, padding: "7px 13px 7px 8px", boxShadow: "var(--shadow-sm)" }}>
          <span style={{ width: 20, height: 20, borderRadius: 99, background: color, display: "inline-block" }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{label}</span>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between" style={{ fontSize: 12 }}>
      <span style={{ color: "var(--text-3)" }}>{label}</span>
      <span style={{ color: "var(--text-2)", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex justify-between items-center" style={{ padding: "7px 0" }}>
      <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 13, fontWeight: big ? 800 : 700, color: big ? "var(--text)" : "var(--text-2)" }}>{value}</span>
    </div>
  );
}
