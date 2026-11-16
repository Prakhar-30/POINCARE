import type { ReactNode } from "react";
import { Chain, Figure } from "./illustrations";

/**
 * Figures for the "Understand Poincaré" pages. Same rules as ./illustrations: the docs' own
 * tokens (lx-*), so they follow light and dark; flows are HTML and reflow to a column on phones;
 * charts are SVG with real text that scroll sideways on narrow screens instead of shrinking.
 *
 * The worked example is one made-up price path run through the pool's real rules and its
 * deployed settings (k = 0.001, h = 0.005, evidence cap 0.02, spread cap 5%): six quiet blocks,
 * then ten blocks that each rise 0.3%.
 */

const K = 0.001, H = 0.005, S_MAX = 0.02, KAPPA_MAX = 0.05;
const RETURNS = [0.0005, -0.0008, 0.0006, -0.0004, 0.0007, -0.0006, ...Array<number>(10).fill(0.003)];
/** Evidence and spread after each block, by the contract's own recursion. */
export const EXAMPLE = RETURNS.reduce<{ block: number; r: number; s: number; kappa: number; price: number }[]>((rows, r, i) => {
  const prev = rows[i - 1];
  const s = Math.min(S_MAX, Math.max(0, (prev?.s ?? 0) + r - K));
  const kappa = s <= H ? 0 : KAPPA_MAX * Math.min(1, (s - H) / (S_MAX - H));
  rows.push({ block: i + 1, r, s, kappa, price: (prev?.price ?? 3000) * Math.exp(r) });
  return rows;
}, []);

function Scroll({ label, children }: { label: string; children: ReactNode }) {
  return <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label={`${label}, scrollable`}>{children}</div>;
}

/** Rows of named parts: who talks to whom, top (what you use) to bottom (Uniswap). */
function Layers({ rows, label }: { rows: { name: string; note: string; items: string[]; tone?: "accent" | "green" | "plain" }[]; label: string }) {
  const tone = {
    accent: { bg: "var(--lav-soft)", ink: "var(--lx-accent-ink)" },
    green: { bg: "var(--green-bg)", ink: "var(--green-label)" },
    plain: { bg: "var(--lx-card)", ink: "var(--lx-ink)" },
  } as const;
  return (
    <ol className="flex flex-col" style={{ gap: 8 }} aria-label={label}>
      {rows.map((r) => {
        const t = tone[r.tone ?? "plain"];
        return (
          <li key={r.name} className="flex flex-col sm:flex-row sm:items-center min-w-0" style={{ gap: "8px 16px", padding: "12px 14px", borderRadius: 14, background: "var(--lx-card)", boxShadow: "inset 0 0 0 1px var(--lx-card-line)" }}>
            <span className="shrink-0" style={{ width: 132 }}>
              <span className="block" style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--lx-ink)" }}>{r.name}</span>
              <span className="lx-sub block" style={{ fontSize: 12.5, lineHeight: 1.4 }}>{r.note}</span>
            </span>
            <span className="flex flex-wrap min-w-0" style={{ gap: 6 }}>
              {r.items.map((it) => (
                <span key={it} className="rounded-full" translate="no" style={{ padding: "4px 11px", fontSize: 13, fontWeight: 550, background: t.bg, color: t.ink, boxShadow: r.tone ? undefined : "inset 0 0 0 1px var(--lx-card-line)" }}>{it}</span>
              ))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------------------------------
// How it works

/** The whole mechanism as one loop. */
export function LoopIllustration() {
  return (
    <Figure caption="The loop the pool runs. It reads its own price once per block, decides whether a real trend is under way, and prices the next swaps accordingly. Nothing outside the pool is consulted.">
      <Chain label="The Poincaré loop" nodes={[
        { icon: "pool", title: "The pool's own price", body: "From its reserves, once per block, before the swap." },
        { icon: "wave", title: "Trend or chop?", body: "How much of the recent movement went one way." },
        { icon: "gauge", title: "Evidence builds", body: "A CUSUM statistic adds up one-way moves.", tone: "honey" },
        { icon: "target", title: "Spread is set", body: "Past the threshold, a spread ramps to a 5% cap.", tone: "honey" },
        { icon: "swap", title: "Swaps are priced", body: "With the trend pays it. Against it pays nothing extra.", tone: "green" },
      ]} />
    </Figure>
  );
}

/** A normal pool and Poincaré on the same trend. */
export function CompareIllustration() {
  const col = (title: string, tone: "plain" | "green", rows: string[]) => (
    <div className="flex-1 min-w-0" style={{ padding: "14px 16px", borderRadius: 14, background: "var(--lx-card)", boxShadow: "inset 0 0 0 1px var(--lx-card-line)" }}>
      <p style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: tone === "green" ? "var(--green-label)" : "var(--lx-ink)" }}>{title}</p>
      <ol className="flex flex-col" style={{ marginTop: 6 }}>
        {rows.map((r, i) => (
          <li key={r} className="lx-sub flex gap-2.5" style={{ fontSize: 13.5, lineHeight: 1.45, padding: "8px 0", borderTop: i ? "1px solid var(--lx-line)" : undefined }}>
            <span aria-hidden="true" style={{ fontWeight: 600, color: "var(--lx-ink)" }}>{i + 1}</span>{r}
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <Figure caption="The same price trend, in two pools. The difference is the third step: Poincaré notices the trend and makes the trades that follow it pay for the damage they do.">
      <div className="flex flex-col md:flex-row" style={{ gap: 8 }}>
        {col("A normal pool", "plain", [
          "The price starts moving one way.",
          "The pool keeps quoting the same curve to everyone.",
          "Arbitrageurs trade with the move, block after block.",
          "LPs lose the full amount (LVR).",
        ])}
        {col("A Poincaré pool", "green", [
          "The price starts moving one way.",
          "The detector confirms a trend from the pool's own price.",
          "Trades that push with the trend pay a spread of up to 5%.",
          "LPs keep the spread. Everyone else pays the plain price.",
        ])}
      </div>
    </Figure>
  );
}

/** What is deployed and how the parts connect. */
export function SystemMapIllustration() {
  return (
    <Figure caption="The parts, from what you touch down to Uniswap. Everything above the hook only reads it or trades through Uniswap's own router; the hook itself has no admin and cannot be changed after deployment.">
      <Layers label="System map" rows={[
        { name: "What you use", note: "Reads and unsigned transactions", items: ["App", "TypeScript SDK", "MCP server", "HTTP API"], tone: "accent" },
        { name: "Periphery", note: "Read the hook, never change it", items: ["PoincareLens (quotes)", "PoincareDCA (orders)", "Keeper"] },
        { name: "The hook", note: "Pricing, detector, liquidity", items: ["PoincareHook", "Cusum", "DirectionalSignal", "ControlLaw", "AsymmetricCurve", "PriceLib"], tone: "green" },
        { name: "Uniswap v4", note: "Settlement and routing", items: ["PoolManager", "Router"] },
      ]} />
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------
// The detector

/** Price on top, evidence below: the statistic ignores the quiet blocks and crosses h on the third trending one. */
export function EvidenceIllustration() {
  const W = 720, H_PX = 330, x0 = 64, colW = 39, n = EXAMPLE.length;
  const x = (i: number) => x0 + colW * i + colW / 2;
  const pTop = 34, pBot = 118, eTop = 168, eBot = 282;
  const pMin = 2995, pMax = Math.max(...EXAMPLE.map((e) => e.price));
  const py = (p: number) => pBot - ((p - pMin) / (pMax - pMin)) * (pBot - pTop);
  const ey = (s: number) => eBot - (s / S_MAX) * (eBot - eTop);
  const fire = EXAMPLE.findIndex((e) => e.s >= H);
  return (
    <Figure caption="Six quiet blocks, then ten blocks that each rise 0.3%. The evidence stays at zero through the noise, starts climbing with the trend, and crosses the threshold on the third trending block. How fast it crosses depends on how strong the move is, not on a timer.">
      <Scroll label="Evidence chart">
        <svg viewBox={`0 0 ${W} ${H_PX}`} style={{ minWidth: 620, width: "100%", display: "block" }} role="img"
          aria-label="Price is flat for six blocks then rises steadily. The evidence statistic is zero for six blocks, then rises 0.002 per block, crossing the threshold 0.005 at block nine and reaching its cap 0.02 at block sixteen.">
          {/* regime bands */}
          <rect x={x0} y={6} width={colW * 6} height={22} rx={7} fill="var(--lav-soft)" />
          <text x={x0 + colW * 3} y={21} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--lx-sub)">Quiet · moves cancel out</text>
          <rect x={x0 + colW * 6} y={6} width={colW * 10} height={22} rx={7} fill="var(--honey)" fillOpacity={0.2} />
          <text x={x0 + colW * 11} y={21} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--honey-ink)">Trend · +0.3% every block</text>

          {/* price */}
          <text x={x0 - 10} y={pTop + 4} textAnchor="end" fontSize="11" fill="var(--lx-sub)">Price</text>
          <polyline fill="none" stroke="var(--lx-ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            points={EXAMPLE.map((e, i) => `${x(i)},${py(e.price).toFixed(1)}`).join(" ")} />

          {/* evidence axis */}
          <text x={x0 - 10} y={eTop - 24} textAnchor="end" fontSize="11" fill="var(--lx-sub)">Evidence</text>
          <line x1={x0} x2={x0 + colW * n} y1={eBot} y2={eBot} stroke="var(--lx-line)" strokeWidth={1.5} />
          <line x1={x0} x2={x0 + colW * n} y1={ey(H)} y2={ey(H)} stroke="var(--honey)" strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={x0 - 10} y={ey(H) + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--honey-ink)">h 0.005</text>
          <line x1={x0} x2={x0 + colW * n} y1={ey(S_MAX)} y2={ey(S_MAX)} stroke="var(--lx-line)" strokeDasharray="3 5" />
          <text x={x0 - 10} y={ey(S_MAX) + 4} textAnchor="end" fontSize="11" fill="var(--lx-sub)">cap 0.02</text>

          {EXAMPLE.map((e, i) => {
            const on = e.s >= H;
            const h = Math.max(e.s > 0 ? 3 : 0, eBot - ey(e.s));
            return (
              <g key={e.block}>
                <rect x={x(i) - 13} y={eBot - h} width={26} height={h} rx={6} fill={on ? "var(--honey)" : "var(--lav)"} opacity={on ? 0.9 : 0.75} />
                <text x={x(i)} y={eBot + 16} textAnchor="middle" fontSize="11" fill="var(--lx-sub)">{e.block}</text>
              </g>
            );
          })}
          <text x={x0 + (colW * n) / 2} y={eBot + 36} textAnchor="middle" fontSize="11" fill="var(--lx-sub)">block</text>

          {/* the crossing */}
          <line x1={x(fire)} x2={x(fire)} y1={pTop} y2={eBot} stroke="var(--honey)" strokeWidth={1} strokeDasharray="2 4" />
          <text x={x(fire) - 8} y={eTop - 12} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--honey-ink)">trend confirmed</text>
        </svg>
      </Scroll>
    </Figure>
  );
}

/** Two paths with the same amount of movement: one goes somewhere, one does not. */
export function TrendVsChopIllustration() {
  const path = (ys: number[], x0: number) => ys.map((y, i) => `${x0 + i * 26},${y}`).join(" ");
  const trend = [112, 100, 88, 76, 64, 52, 40, 28];
  const chop = [70, 58, 70, 58, 70, 58, 70, 58];
  const Panel = ({ x0, ys, title, d, ink, note }: { x0: number; ys: number[]; title: string; d: string; ink: string; note: string }) => (
    <g>
      <rect x={x0 - 20} y={8} width={300} height={170} rx={14} fill="var(--lx-card)" stroke="var(--lx-card-line)" />
      <text x={x0} y={34} fontSize="13" fontWeight="600" fill="var(--lx-ink)">{title}</text>
      <polyline fill="none" stroke={ink} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={path(ys, x0 + 6)} />
      <text x={x0} y={150} fontSize="12" fill="var(--lx-sub)">{note}</text>
      <text x={x0 + 260} y={34} textAnchor="end" fontSize="13" fontWeight="600" fill={ink}>{d}</text>
    </g>
  );
  return (
    <Figure caption="Both paths move the same amount at every step. The left one ends far from where it began, so its efficiency D is 1. The right one ends where it began, so D is 0. Only a path that is directional enough (D of at least 0.25) lets evidence turn into a spread.">
      <Scroll label="Trend versus chop">
        <svg viewBox="0 0 660 186" style={{ minWidth: 600, width: "100%", display: "block" }} role="img"
          aria-label="Left: a path that rises every step, directional efficiency 1. Right: a path that alternates up and down and ends where it started, directional efficiency 0.">
          <Panel x0={30} ys={trend} title="Trend" d="D = 1.0" ink="var(--green-label)" note="7 steps one way: net 7, total 7" />
          <Panel x0={350} ys={chop} title="Chop" d="D = 0" ink="var(--lx-sub)" note="7 steps that cancel: net 0, total 7" />
        </svg>
      </Scroll>
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------
// Pricing

/** Who pays what, calm and in a trend. */
export function SidesIllustration() {
  const side = (label: string, charge: string | null) => (
    <div className="flex items-center justify-between gap-3" style={{ padding: "10px 0", borderTop: "1px solid var(--lx-line)" }}>
      <span className="lx-sub" style={{ fontSize: 14 }}>{label}</span>
      <span className="rounded-full shrink-0" style={{ padding: "2px 10px", fontSize: 12, fontWeight: 600, background: charge ? "var(--warn-bg)" : "var(--green-bg)", color: charge ? "var(--honey-ink)" : "var(--green-label)" }}>{charge ?? "Plain price"}</span>
    </div>
  );
  const card = (title: string, sub: string, rows: ReactNode) => (
    <div className="flex-1 min-w-0" style={{ padding: "14px 16px 6px", borderRadius: 14, background: "var(--lx-card)", boxShadow: "inset 0 0 0 1px var(--lx-card-line)" }}>
      <p style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--lx-ink)" }}>{title}</p>
      <p className="lx-sub" style={{ fontSize: 12.5, lineHeight: 1.4, marginBottom: 8 }}>{sub}</p>
      {rows}
    </div>
  );
  return (
    <Figure caption="The spread is one-sided. It is charged to the side that pushes the price further along the trend, and only while the trend is confirmed. The base fee (not shown) applies to every swap.">
      <div className="flex flex-col md:flex-row" style={{ gap: 8 }}>
        {card("Calm", "No trend confirmed", <>{side("Buy WETH", null)}{side("Sell WETH", null)}</>)}
        {card("Price rising", "Up-trend confirmed", <>{side("Buy WETH (with the trend)", "+ up to 5%")}{side("Sell WETH (against it)", null)}</>)}
        {card("Price falling", "Down-trend confirmed", <>{side("Buy WETH (against it)", null)}{side("Sell WETH (with the trend)", "+ up to 5%")}</>)}
      </div>
    </Figure>
  );
}

/** Evidence to spread: nothing below h, a straight ramp, flat at the cap. */
export function RampIllustration() {
  const W = 660, x0 = 70, x1 = 620, y0 = 190, y1 = 40;
  const sx = (s: number) => x0 + (s / 0.025) * (x1 - x0);
  const ky = (k: number) => y0 - (k / KAPPA_MAX) * (y0 - y1);
  return (
    <Figure caption="How evidence becomes a spread. Below the threshold there is none. Past it the spread rises in a straight line and stops at 5%, however strong the trend gets. The cap is a safety limit: it bounds what any manipulation could ever be worth.">
      <Scroll label="Spread ramp">
        <svg viewBox={`0 0 ${W} 236`} style={{ minWidth: 560, width: "100%", display: "block" }} role="img"
          aria-label="The spread is zero while evidence is below 0.005, rises linearly to 5% at evidence 0.02, and stays at 5% above that.">
          <line x1={x0} x2={x1} y1={y0} y2={y0} stroke="var(--lx-line)" strokeWidth={1.5} />
          <line x1={x0} x2={x0} y1={y0} y2={y1 - 14} stroke="var(--lx-line)" strokeWidth={1.5} />
          <line x1={x0} x2={x1} y1={ky(KAPPA_MAX)} y2={ky(KAPPA_MAX)} stroke="var(--lx-line)" strokeDasharray="3 5" />
          <text x={x0 - 10} y={ky(KAPPA_MAX) + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--honey-ink)">5% cap</text>
          <text x={x0 - 10} y={y0 + 4} textAnchor="end" fontSize="11" fill="var(--lx-sub)">0%</text>
          <text x={x0 - 10} y={y1 - 18} textAnchor="end" fontSize="11" fill="var(--lx-sub)">Spread</text>
          {[{ s: H, t: "h 0.005" }, { s: S_MAX, t: "cap 0.02" }].map((m) => (
            <g key={m.t}>
              <line x1={sx(m.s)} x2={sx(m.s)} y1={y0} y2={y1} stroke="var(--lx-line)" strokeDasharray="3 5" />
              <text x={sx(m.s)} y={y0 + 18} textAnchor="middle" fontSize="11" fill="var(--lx-sub)">{m.t}</text>
            </g>
          ))}
          <text x={x1} y={y0 + 34} textAnchor="end" fontSize="11" fill="var(--lx-sub)">Evidence</text>
          <polyline fill="none" stroke="var(--honey)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
            points={`${sx(0)},${ky(0)} ${sx(H)},${ky(0)} ${sx(S_MAX)},${ky(KAPPA_MAX)} ${sx(0.025)},${ky(KAPPA_MAX)}`} />
          <text x={(sx(0) + sx(H)) / 2} y={y0 - 10} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--green-label)">no spread</text>
          <text x={(sx(H) + sx(S_MAX)) / 2 - 20} y={ky(0.03)} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--honey-ink)">ramps with evidence</text>
        </svg>
      </Scroll>
    </Figure>
  );
}

/** The design that was rejected, next to the one that shipped. */
export function RoundTripIllustration() {
  return (
    <Figure caption="Why the curve keeps one shape. Giving each direction its own curve moves the pool's mid-price, so a trader can buy on one and sell straight back on the other at a profit. A spread on a single curve can only make a round trip worse.">
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--honey-ink)", marginBottom: 8 }}>Two curves, one per direction (built, tested, rejected)</p>
      <Chain label="Round trip on two curves" nodes={[
        { icon: "swap", title: "Buy on the shallow curve", body: "Little price impact on the way in.", tone: "honey" },
        { icon: "swap", title: "Sell back on the deep curve", body: "A better price on the way out.", tone: "honey" },
        { icon: "shield", title: "Pool value leaves", body: "The trader ends with more than they started.", tone: "honey" },
      ]} />
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--green-label)", margin: "16px 0 8px" }}>One curve plus a spread (what the pool does)</p>
      <Chain label="Round trip on one curve with a spread" nodes={[
        { icon: "swap", title: "Buy on the curve", body: "Pays the spread if it is with the trend.", tone: "green" },
        { icon: "swap", title: "Sell back on the same curve", body: "The plain price, never better than the curve.", tone: "green" },
        { icon: "check", title: "Always ends with less", body: "Fees, spread and rounding all favour the pool.", tone: "green" },
      ]} />
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------
// A swap, step by step

export function SwapFlowIllustration() {
  return (
    <Figure caption="One swap. The hook does all of its work inside Uniswap's beforeSwap call and hands back the amounts; Uniswap's PoolManager moves the tokens.">
      <Chain label="The path of a swap" nodes={[
        { icon: "swap", title: "You swap", body: "Through Uniswap's router, like any v4 pool." },
        { icon: "layers", title: "PoolManager calls the hook", body: "beforeSwap, before any pricing happens." },
        { icon: "gauge", title: "Detector updates", body: "Only on the first swap of a block.", tone: "honey" },
        { icon: "curve", title: "Hook prices the swap", body: "Curve, fee, and spread if with the trend.", tone: "honey" },
        { icon: "check", title: "PoolManager settles", body: "Tokens move; the hook's books are updated.", tone: "green" },
      ]} />
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------
// Design choices

export function FakeTrendIllustration() {
  return (
    <Figure caption="What happens to someone who tries to fake a trend. The only way to move the detector is to move the real price and hold it across blocks, which costs money, and the reward for doing so is nothing.">
      <Chain label="Trying to fake a trend" nodes={[
        { icon: "swap", title: "Push the price", body: "Real buys, real money, block after block.", tone: "honey" },
        { icon: "pool", title: "Arbitrageurs push back", body: "The pool is now mispriced, and they profit from it.", tone: "honey" },
        { icon: "gauge", title: "The detector fires", body: "Now the attacker's own side pays the spread.", tone: "honey" },
        { icon: "shield", title: "The other side gains nothing", body: "It gets the plain price, never a better one.", tone: "green" },
      ]} />
    </Figure>
  );
}

/** Four years of real ETH/USDC: what arbitrageurs took from a $2M position. */
export function ArbBarsIllustration() {
  const rows = [
    { l: "Normal pool, 5 bps fee", v: 473_696, on: false },
    { l: "Normal pool, 30 bps fee", v: 387_110, on: false },
    { l: "Poincaré", v: 264_835, on: true },
  ];
  const max = rows[0].v;
  return (
    <Figure caption="Value taken by arbitrageurs from a $2,000,000 position over four years of real ETH/USDC prices (2022 to 2026). Lower is better. This is a back-test, not live trading.">
      <ul className="flex flex-col" style={{ gap: 12 }}>
        {rows.map((r) => (
          <li key={r.l}>
            <div className="flex items-baseline justify-between gap-3">
              <span style={{ fontSize: 14, fontWeight: r.on ? 600 : 500, color: r.on ? "var(--lx-ink)" : "var(--lx-sub)" }}>{r.l}</span>
              <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: r.on ? "var(--green-label)" : "var(--lx-ink)" }}>${r.v.toLocaleString("en-US")}</span>
            </div>
            <div aria-hidden="true" style={{ height: 10, borderRadius: 99, marginTop: 6, background: "var(--lx-line)" }}>
              <div style={{ width: `${(r.v / max) * 100}%`, height: "100%", borderRadius: 99, background: r.on ? "var(--green-label)" : "var(--lx-sub)", opacity: r.on ? 0.9 : 0.45 }} />
            </div>
          </li>
        ))}
      </ul>
    </Figure>
  );
}
