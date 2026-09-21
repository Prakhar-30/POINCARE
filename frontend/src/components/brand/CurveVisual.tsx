import { useEffect, useRef, useState } from "react";
import { HERO } from "./heroData";

// Landing hero: the mechanism, and what it is worth, on REAL detector output.
//
// Three earlier versions of this were wrong, each for a reason worth keeping:
//
//  1. Two hyperbolas, a calm one and a "leaning" one bent on the buy side. That is a picture of
//     a depth/curvature lever we built, measured across four years and rejected (OPEN_ITEMS E1).
//  2. One hyperbola with two rays fanning from the operating point. Accurate, and it still read
//     as a curvature change, because anything drawn near a curved line looks like another curve.
//  3. Price with the kappa band drawn on the same axis. Honest, and invisible: kappa caps at 5%
//     while the window's price moves 90%, so the band was a few pixels tall.
//
// So each layer gets its OWN scale, which is the only way all three are legible at once: the
// market on top for context, the spread in the middle at its own bps scale where it can
// actually be seen, and the money underneath. No curve appears anywhere, because a spread is a
// price and not a shape.
//
// The data is one window of the four-year replay, not an illustration. Regenerate it with
// `python analysis/simulation/export_hero.py`.

const W = 520;
const L = 16;
const R = 16;

// Laid out by accumulation rather than by hand, because hand-picked offsets put the last strip
// 12px past the bottom of the card on the first attempt and clipped it.
const PRICE_T = 88;
const PRICE_H = 84;
const KAPPA_T = PRICE_T + PRICE_H + 34;
const KAPPA_H = 72; // +/- half of this around the zero line
const ADV_T = KAPPA_T + KAPPA_H + 32;
const ADV_H = 52;
const H = ADV_T + ADV_H + 16;

const N = HERO.price.length;
const pMin = Math.min(...HERO.price);
const pMax = Math.max(...HERO.price);
const kMax = Math.max(...HERO.kappa, 1);
// The advantage genuinely dips NEGATIVE early in this window, before the trend develops:
// 13 of the 64 samples, to a low of -$4,302. The zero line is placed to show that rather than
// clamping it away, because a hero that only ever goes up is a hero nobody should believe.
const advHi = Math.max(...HERO.adv, 1);
const advLo = Math.min(...HERO.adv, 0);

const sx = (i: number) => L + (i / (N - 1)) * (W - L - R);
const sp = (p: number) => PRICE_T + PRICE_H - ((p - pMin) / (pMax - pMin || 1)) * PRICE_H;
const kMid = KAPPA_T + KAPPA_H / 2;
/** κ above the line when buyers pay, below when sellers do. Its own scale, so it is visible. */
const sk = (i: number) => {
  const v = (HERO.kappa[i] / kMax) * (KAPPA_H / 2);
  return HERO.trend[i] === 1 ? kMid - v : kMid + v;
};
const sa = (v: number) => ADV_T + ADV_H - ((v - advLo) / (advHi - advLo)) * ADV_H;
const advZero = sa(0);

function poly(upTo: number, f: (i: number) => number) {
  let d = "";
  for (let i = 0; i <= upTo; i++) d += `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${f(i).toFixed(1)} `;
  return d.trim();
}

function areaTo(upTo: number, f: (i: number) => number, base: number) {
  if (upTo < 1) return "";
  return `M${sx(0).toFixed(1)},${base} ${poly(upTo, f).slice(1)} L${sx(upTo).toFixed(1)},${base} Z`;
}

export function CurveVisual() {
  const [i, setI] = useState(N - 1);
  const raf = useRef(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    let t0 = 0;
    const DUR = 5000;
    const HOLD = 1800;
    const step = (now: number) => {
      if (!t0) t0 = now;
      const e = now - t0;
      if (e < DUR) setI(Math.floor((e / DUR) * (N - 1)));
      else if (e < DUR + HOLD) setI(N - 1);
      else t0 = now;
      raf.current = requestAnimationFrame(step);
    };
    setI(0);
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const k = HERO.kappa[i];
  const up = HERO.trend[i] === 1;
  const engaged = k > 0;

  return (
    <div
      className="relative grain rounded-xl overflow-hidden"
      style={{ background: "var(--scope-bg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        <defs>
          <linearGradient id="advFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--up)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--up)" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* ---------- headline: what it was worth ---------- */}
        <text x={L} y={22} fontSize="10" fontWeight="700" fill="var(--faint)">
          ETH/USDC · {HERO.from} → {HERO.to} · real detector output
        </text>
        <text x={L} y={48} fontSize="23" fontWeight="800" fill={HERO.adv[i] >= 0 ? "var(--up)" : "var(--faint)"}>
          {HERO.adv[i] >= 0 ? "+" : "−"}${Math.abs(HERO.adv[i]).toLocaleString()}
        </text>
        <text x={L} y={62} fontSize="9.5" fontWeight="700" fill="var(--text-3)">
          kept for liquidity providers, against an ordinary 30bps pool
        </text>

        {/* live state pill, top right */}
        <g transform={`translate(${W - R - 150}, 26)`}>
          <rect width="150" height="22" rx="11" fill={engaged ? "rgba(217,140,0,.15)" : "var(--surface)"} stroke="var(--border)" />
          <circle cx="13" cy="11" r="3.5" fill={engaged ? "var(--honey)" : "var(--faint)"}>
            {engaged && <animate attributeName="opacity" values="1;.3;1" dur="1.1s" repeatCount="indefinite" />}
          </circle>
          <text x="25" y="15" fontSize="9.5" fontWeight="800" fill={engaged ? "var(--honey-deep)" : "var(--faint)"}>
            {engaged ? `trend · κ ${k}bps on ${up ? "buys" : "sells"}` : "calm · no spread charged"}
          </text>
        </g>

        {/* ---------- 1. the market ---------- */}
        <text x={L} y={PRICE_T - 9} fontSize="9" fontWeight="700" fill="var(--faint)">
          THE MARKET
        </text>
        <path d={poly(i, (j) => sp(HERO.price[j]))} fill="none" stroke="var(--text-3)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={sx(i)} cy={sp(HERO.price[i])} r="3.5" fill="var(--text-3)" />
        <text x={W - R} y={PRICE_T - 9} textAnchor="end" fontSize="9" fontWeight="700" fill="var(--text-3)">
          ${Math.round(HERO.price[i]).toLocaleString()}
        </text>

        {/* ---------- 2. the spread, at its own scale ---------- */}
        <text x={L} y={KAPPA_T - 11} fontSize="9" fontWeight="700" fill="var(--honey-deep)">
          THE SPREAD κ
        </text>
        <line x1={L} y1={kMid} x2={W - R} y2={kMid} stroke="var(--divider)" strokeWidth="1" />
        <path d={areaTo(i, sk, kMid)} fill="var(--honey)" opacity="0.55" />
        <path d={poly(i, sk)} fill="none" stroke="var(--honey-deep)" strokeWidth="1.4" strokeLinejoin="round" />
        {/* haloed, because the ribbon runs underneath them once the window fills */}
        <text
          x={L + 2}
          y={kMid - KAPPA_H / 2 + 9}
          fontSize="8.5"
          fontWeight="800"
          fill="var(--honey-deep)"
          stroke="var(--scope-bg)"
          strokeWidth="3"
          paintOrder="stroke"
        >
          buyers pay ↑
        </text>
        <text
          x={L + 2}
          y={kMid + KAPPA_H / 2 - 1}
          fontSize="8.5"
          fontWeight="800"
          fill="var(--honey-deep)"
          stroke="var(--scope-bg)"
          strokeWidth="3"
          paintOrder="stroke"
        >
          sellers pay ↓
        </text>
        <text x={W - R} y={KAPPA_T - 11} textAnchor="end" fontSize="8.5" fontWeight="700" fill="var(--faint)">
          charged only to the side pushing with the trend
        </text>

        {/* ---------- 3. what the LP kept ---------- */}
        <text x={L} y={ADV_T - 10} fontSize="9" fontWeight="700" fill="var(--up)">
          WHAT THE LP KEPT
        </text>
        <line x1={L} y1={advZero} x2={W - R} y2={advZero} stroke="var(--divider)" strokeWidth="1" />
        <path d={areaTo(i, (j) => sa(HERO.adv[j]), advZero)} fill="url(#advFill)" />
        <path d={poly(i, (j) => sa(HERO.adv[j]))} fill="none" stroke="var(--up)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
