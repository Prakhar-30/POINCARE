import { useEffect, useMemo, useRef, useState } from "react";

type Regime = "none" | "up" | "down";

/** rAF ease toward the target whenever it changes (easeOutCubic). */
function useTweened(target: number, ms = 900) {
  const [v, setV] = useState(target);
  const st = useRef({ from: target, to: target, t0: 0, raf: 0 });
  useEffect(() => {
    const s = st.current;
    if (target === s.to) return;
    s.from = s.to === s.from && s.t0 === 0 ? target : v;
    s.to = target;
    s.t0 = performance.now();
    cancelAnimationFrame(s.raf);
    const step = (now: number) => {
      const p = Math.min(1, (now - s.t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(s.from + (s.to - s.from) * e);
      if (p < 1) s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(s.raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  return v;
}

/**
 * The live bonding curve. The frame is anchored to a slow-moving reference so trades
 * visibly slide the reserve point along the hyperbola (re-centering instantly would
 * cancel all apparent motion). A directional dash current runs along the curve, a
 * ripple fires when reserves change, and under a detected trend the bid/ask tangents
 * fan apart with the seam wedge shaded.
 */
export function BondingCurve({
  r0, r1, spreadZeroForOne, spreadOneForZero, trend, height = 260,
}: {
  r0: number; r1: number; spreadZeroForOne: number; spreadOneForZero: number; trend: Regime; height?: number;
}) {
  const W = 520;
  const H = height;
  const pad = 28;

  // fast tween for the point, slow tween for the frame anchor
  const x0 = useTweened(r1 || 1, 900); // WETH on x
  const y0 = useTweened(r0 || 1, 900); // USDC on y
  const ax = useTweened(r1 || 1, 9000);
  const ay = useTweened(r0 || 1, 9000);
  const sBid = useTweened(spreadZeroForOne, 700);
  const sAsk = useTweened(spreadOneForZero, 700);

  // ripple every time the underlying reserves actually change
  const [rippleKey, setRippleKey] = useState(0);
  const lastR = useRef({ r0, r1 });
  useEffect(() => {
    if (r0 !== lastR.current.r0 || r1 !== lastR.current.r1) {
      lastR.current = { r0, r1 };
      setRippleKey((k) => k + 1);
    }
  }, [r0, r1]);

  const { path, px, py, bid, ask, seam } = useMemo(() => {
    const k = x0 * y0;
    const xMin = (ax || 1) * 0.4;
    const xMax = (ax || 1) * 1.85;
    const yAt = (x: number) => k / x;
    const yRef = (x: number) => ((ax || 1) * (ay || 1)) / x; // frame scale from the anchor curve
    const yMax = yRef(xMin);
    const yMin = yRef(xMax);

    const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (W - 2 * pad);
    const sy = (y: number) => H - pad - ((y - yMin) / (yMax - yMin)) * (H - 2 * pad);

    let d = "";
    const STEPS = 80;
    for (let i = 0; i <= STEPS; i++) {
      const x = xMin + (i / STEPS) * (xMax - xMin);
      d += `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)},${sy(yAt(x)).toFixed(1)} `;
    }

    const px = sx(x0);
    const py = sy(yAt(x0));

    // marginal slope dy/dx = -k/x^2 mapped into screen space (screen-Y grows downward)
    const slope = -k / (x0 * x0);
    const dXdx = (W - 2 * pad) / (xMax - xMin);
    const dYdy = -((H - 2 * pad) / (yMax - yMin));
    const screenSlope = (slope * dYdy) / dXdx;
    const L = 78;
    const tangent = (spreadFrac: number, dir: 1 | -1) => {
      const s = screenSlope * (1 + spreadFrac * 6);
      const dx = (dir * L) / Math.sqrt(1 + s * s);
      return { x1: px, y1: py, x2: px + dx, y2: py + s * dx };
    };
    const ask = tangent(sAsk, 1); // buy WETH direction
    const bid = tangent(sBid, -1); // sell WETH direction
    const seam = `M${px},${py} L${ask.x2},${ask.y2} L${bid.x2},${bid.y2} Z`;
    return { path: d.trim(), px, py, bid, ask, seam };
  }, [x0, y0, ax, ay, sBid, sAsk, H]);

  const leaning = trend !== "none" && (spreadZeroForOne > 0 || spreadOneForZero > 0);
  const accent = trend === "up" ? "var(--up)" : trend === "down" ? "var(--down)" : "var(--lav)";

  return (
    <div className="relative rounded-md overflow-hidden" style={{ background: "var(--scope-bg)", border: "1px solid var(--border)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }}>
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g}>
            <line x1={pad + g * (W - 2 * pad)} y1={pad} x2={pad + g * (W - 2 * pad)} y2={H - pad} stroke="var(--divider)" strokeWidth={1} />
            <line x1={pad} y1={pad + g * (H - 2 * pad)} x2={W - pad} y2={pad + g * (H - 2 * pad)} stroke="var(--divider)" strokeWidth={1} />
          </g>
        ))}

        <path d={path} fill="none" stroke="var(--lav)" strokeWidth={2.5} strokeLinecap="round" opacity={0.8} />
        {/* liquidity current: dashes drifting along the curve, direction follows the trend */}
        <path
          d={path}
          fill="none"
          stroke={accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          className="curve-flow"
          style={{ animationDirection: trend === "down" ? "reverse" : "normal", animationDuration: leaning ? "1.6s" : "3.2s" }}
          opacity={0.55}
        />

        {/* bid/ask seam wedge, only visible when the curve leans */}
        {leaning && <path d={seam} fill={accent} opacity={0.1} />}

        {/* executable tangents: bid = soft/against-trend, ask = hard/with-trend */}
        <line x1={ask.x1} y1={ask.y1} x2={ask.x2} y2={ask.y2} stroke="var(--up)" strokeWidth={2} strokeLinecap="round" opacity={leaning ? 0.95 : 0.4} />
        <line x1={bid.x1} y1={bid.y1} x2={bid.x2} y2={bid.y2} stroke="var(--down)" strokeWidth={2} strokeLinecap="round" opacity={leaning ? 0.95 : 0.4} />

        {/* reserve point: halo + trade ripple + pulsing core */}
        <circle cx={px} cy={py} r={9} fill={accent} opacity={0.16} />
        {rippleKey > 0 && <circle key={rippleKey} cx={px} cy={py} r={9} fill="none" stroke={accent} strokeWidth={2} className="curve-ripple" />}
        <circle cx={px} cy={py} r={4.5} fill={accent}>
          <animate attributeName="opacity" values="1;.55;1" dur="2.2s" repeatCount="indefinite" />
        </circle>
      </svg>

      <div className="absolute left-3 top-2.5 hidden sm:block" style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>x · y = k · WETH ↔ USDC</div>
      <div className="absolute right-3 top-2.5 flex items-center gap-3" style={{ fontSize: 10, fontWeight: 700 }}>
        <span style={{ color: "var(--up)" }}>● buy slope</span>
        <span style={{ color: "var(--down)" }}>● sell slope</span>
      </div>
      <div className="absolute left-3 bottom-2" style={{ fontSize: 10, fontWeight: 600, color: leaning ? accent : "var(--faint)" }}>
        {leaning ? "leaning, bid/ask seam open" : "calm, symmetric and deep"}
      </div>
    </div>
  );
}
