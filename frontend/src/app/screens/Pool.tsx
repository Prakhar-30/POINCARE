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
import { TokenIcon } from "@/components/ui/TokenIcon";
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

  const hasPos = pos.shares > 0;

  return (
    <>
    <TxSteps stepper={lp.stepper} title={mode === "add" ? "Adding liquidity" : "Removing liquidity"} />
    <div className="flex flex-col px-4 sm:px-7 py-6" style={{ gap: 20 }}>
      {/* position strip */}
      <div className="kpi-strip">
        <Kpi label="Your position" value={hasPos ? fmtUsd(pos.valueUsdc) : "—"} />
        <Kpi label="Pool share" value={hasPos ? fmtPct(pos.sharePct) : "—"} />
        <Kpi label="LP shares" value={hasPos ? fmtNum(pos.shares, 4) : "—"} />
        <div className="kpi-good">
          <div className="lbl" style={{ color: "var(--green-label)" }}>Your share of LVR kept</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 600, marginTop: 6, color: "var(--green-label)" }}>
            {pos.sharePct > 0 ? fmtUsd(lpLvr, { dp: 2 }) : "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-5 items-start grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ticket */}
        <section className="panel p-5 min-w-0 xl:order-2 xl:sticky" style={{ top: 84, boxShadow: "var(--shadow-lg)" }}>
          <div className="seg w-full mb-4" role="group" aria-label="Add or remove liquidity" style={{ padding: 4 }}>
            {(["add", "remove"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => { setMode(m); lp.reset(); }}
                className="flex-1"
                style={{ height: 36, fontSize: 14 }}
              >
                {m === "add" ? "Add" : "Remove"}
              </button>
            ))}
          </div>

          {mode === "add"
            ? <AddPanel price={price} bal={bal} lp={lp} />
            : <RemovePanel pos={pos} lp={lp} />}
        </section>

        <div className="flex flex-col min-w-0 xl:order-1" style={{ gap: 20 }}>
          <section className="panel overflow-hidden">
            <div className="panel-head">
              <div className="flex items-center gap-2.5">
                <span style={{ color: "var(--lav-deep)" }}><Icon name="curve" size={17} /></span>
                <h2 className="panel-title">Bonding curve · live</h2>
              </div>
              <span className="panel-sub num">{fmtUsd(price)} / WETH</span>
            </div>
            <div className="p-5">
              <BondingCurve r0={pos.r0} r1={pos.r1} spreadZeroForOne={s.spreadZeroForOne} spreadOneForZero={s.spreadOneForZero} trend={s.trend} />
              <p className="m-0 mt-4" style={{ fontSize: 13, lineHeight: 1.65, color: "var(--text-2)" }}>
                Liquidity sits on the constant-product invariant. When the CUSUM detector flags a trend, the with-trend
                side of the curve steepens by the directional spread, and that captured value is what a normal pool leaks
                to arbitrageurs as LVR. In calm markets both slopes coincide and the pool trades deep and symmetric.
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2 className="panel-title">Your position</h2></div>
            <div className="px-5 py-1.5">
              {hasPos ? (
                <>
                  <div className="kv"><span>WETH</span><span className="num">{fmtNum(pos.underlying1, 4)}</span></div>
                  <div className="kv"><span>USDC</span><span className="num">{fmtNum(pos.underlying0, 2)}</span></div>
                  <div className="kv"><span>Value</span><span className="num">{fmtUsd(pos.valueUsdc)}</span></div>
                  <div className="kv"><span>Pool-wide LVR kept</span><span className="num">{totals ? fmtUsd(totals.lvr_avoided, { dp: 2 }) : "—"}</span></div>
                </>
              ) : (
                <p className="m-0 py-3" style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.65 }}>
                  You have no liquidity yet. Add USDC and WETH at the current ratio to start earning the directional spread.
                </p>
              )}
            </div>
          </section>

          <p className="m-0" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--muted)" }}>
            LVR kept is the spread the pool charged with-trend flow, retained for LPs instead of leaking to arbitrageurs.
            It accrues as trades are recorded and is not guaranteed.
          </p>
        </div>
      </div>
    </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="num truncate" style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function AddPanel({ price, bal, lp }: { price: number; bal: ReturnType<typeof useBalances>; lp: ReturnType<typeof useLiquidity> }) {
  const [usdc, setUsdc] = useState("3000");
  const [weth, setWeth] = useState(price > 0 ? (3000 / price).toFixed(4) : "1");

  // Editing one leg auto-fills the other at the pool ratio.
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
      <LiqInput label="USDC" sub={`Balance ${fmtNum(bal.usdc, 2)}`} value={usdc} onInput={onUsdc} />
      <div className="flex items-center justify-center" style={{ margin: "8px 0", color: "var(--muted)" }}><Icon name="plus" size={15} /></div>
      <LiqInput label="WETH" sub={`Balance ${fmtNum(bal.weth, 4)}`} value={weth} onInput={onWeth} />

      <div className="mt-3">
        <Detail label="Deposit value" value={fmtUsd(valueUsdc)} />
        <Detail label="Pool ratio" value={`${fmtUsd(price)} / WETH`} />
        <Detail label="Added at" value="current reserve ratio" />
      </div>

      <button type="button" onClick={onAdd} disabled={disabled} className="btn btn-primary btn-block mt-4"
        style={ctaStyle(disabled, lp.status === "success")}>
        {busy ? "Confirming…" : lp.status === "success" ? "Added ✓" : insufficient ? "Insufficient balance" : "Add liquidity"}
      </button>

      {(bal.usdc < u || bal.weth < w) && (
        <p className="mt-3 mb-0 text-center" style={{ fontSize: 12, color: "var(--muted)" }}>Need test tokens? Use “Get test tokens” in the sidebar or footer.</p>
      )}
    </>
  );
}

function RemovePanel({ pos, lp }: { pos: ReturnType<typeof usePosition>; lp: ReturnType<typeof useLiquidity> }) {
  const [pct, setPct] = useState(50);

  const sharesToBurn = pos.shares * (pct / 100);
  const out0 = pos.underlying0 * (pct / 100);
  const out1 = pos.underlying1 * (pct / 100);
  const valueUsdc = out0 + out1 * pos.price;
  const busy = lp.status === "busy";
  const disabled = busy || pos.shares <= 0 || pct <= 0;

  async function onRemove() {
    // Burn in raw 18-dec units; the 100% branch avoids float drift leaving dust.
    const shares = pct >= 100 ? parseUnits(pos.shares.toFixed(18), 18) : parseUnits(sharesToBurn.toFixed(18), 18);
    await lp.remove({ shares, valueUsdc, amount0: out0, amount1: out1 });
    pos.refetch();
    setTimeout(lp.reset, 2500);
  }

  if (pos.shares <= 0) {
    return <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.7, padding: "20px 4px" }}>No liquidity to remove. Add some first.</div>;
  }

  return (
    <>
      <div className="field">
        <label htmlFor="remove-pct" className="lbl">Amount to remove</label>
        <div className="num" style={{ fontSize: 40, fontWeight: 500, color: "var(--text)", lineHeight: 1.1, marginTop: 6 }}>{pct}%</div>
        <input id="remove-pct" type="range" min={1} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--primary)", margin: "12px 0 2px" }} />
      </div>
      <div className="flex gap-1.5 mt-2.5">
        {[25, 50, 75, 100].map((p) => (
          <button key={p} type="button" onClick={() => setPct(p)} className="num flex-1"
            style={{ height: 34, borderRadius: "var(--r-sm)", fontSize: 13, background: "var(--surface)", color: pct === p ? "var(--lav-deep)" : "var(--text-3)", border: `1px solid ${pct === p ? "var(--lav)" : "var(--border)"}`, cursor: "pointer" }}>
            {p === 100 ? "Max" : `${p}%`}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <Detail label="You receive · USDC" value={fmtNum(out0, 2)} />
        <Detail label="You receive · WETH" value={fmtNum(out1, 4)} />
        <Detail label="Value" value={fmtUsd(valueUsdc)} />
      </div>

      <button type="button" onClick={onRemove} disabled={disabled} className="btn btn-primary btn-block mt-4"
        style={ctaStyle(disabled, lp.status === "success", "var(--ink)")}>
        {busy ? "Confirming…" : lp.status === "success" ? "Removed ✓" : "Remove liquidity"}
      </button>
    </>
  );
}

function ctaStyle(disabled: boolean, success: boolean, base?: string): CSSProperties | undefined {
  if (success) return { background: "var(--up-deep)" };
  return base && !disabled ? { background: base } : undefined;
}

function LiqInput({ label, sub, value, onInput }: { label: string; sub: string; value: string; onInput: (v: string) => void }) {
  const id = `liq-${label.toLowerCase()}`;
  return (
    <div className="field">
      <div className="flex justify-between lbl" style={{ marginBottom: 8 }}>
        <label htmlFor={id}>{label}</label><span className="num">{sub}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <input id={id} className="num" value={value} onChange={(e) => onInput(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 24, fontWeight: 500 }} />
        <div className="flex items-center gap-2 shrink-0" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 99, padding: "6px 12px 6px 7px" }}>
          <TokenIcon sym={label} size={20} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{label}</span>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv"><span>{label}</span><span className="num">{value}</span></div>
  );
}
