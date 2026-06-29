import { useMemo } from "react";

type Regime = "none" | "up" | "down";

/**
 * The live bonding curve: the pool's x*y=k hyperbola with the current reserve point,
 * plus the two executable tangents. In calm the bid and ask slopes coincide (deep,
 * symmetric). Under a detected trend the with-trend side steepens by the directional
 * spread (an endogenous bid-ask seam), which is what protects LPs from LVR.
 */
export function BondingCurve({
  r0, r1, spreadZeroForOne, spreadOneForZero, trend, height = 260,
}: {
  r0: number; r1: number; spreadZeroForOne: number; spreadOneForZero: number; trend: Regime; height?: number;
}) {
  const W = 520;
  const H = height;
  const pad = 28;

  const { path, px, py, bid, ask } = useMemo(() => {
    // Normalize around the current reserve point so the curve fills the frame.
    const x0 = r1 || 1; // WETH on x
    const y0 = r0 || 1; // USDC on y
    const k = x0 * y0;
    const xMin = x0 * 0.4;
    const xMax = x0 * 1.85;
    const yAt = (x: number) => k / x;
    const yMax = yAt(xMin);
    const yMin = yAt(xMax);

    const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (W - 2 * pad);
    const sy = (y: number) => H - pad - ((y - yMin) / (yMax - yMin)) * (H - 2 * pad);

    let d = "";
    const STEPS = 80;
    for (let i = 0; i <= STEPS; i++) {
      const x = xMin + (i / STEPS) * (xMax - xMin);
      const X = sx(x);
      const Y = sy(yAt(x));
      d += `${i === 0 ? "M" : "L"}${X.toFixed(1)},${Y.toFixed(1)} `;
    }

    const px = sx(x0);
    const py = sy(y0);

    // Marginal slope dy/dx = -k/x^2 at the point, in screen space.
    const slope = -k / (x0 * x0);
    const screenSlope = slope * ((W - 2 * pad) / (xMax - xMin)) / -((H - 2 * pad) / (yMax - yMin));
    // build a short tangent segment, fanned by the directional spread on each side
    const L = 78;
    const tangent = (spreadFrac: number, dir: 1 | -1) => {
      // a positive spread tilts the executable line steeper on the with-trend side
      const s = screenSlope * (1 + spreadFrac * 6);
      const dx = (dir * L) / Math.sqrt(1 + s * s);
      const dy = s * dx;
      return { x1: px, y1: py, x2: px + dx, y2: py + dy };
    };
    // zeroForOne = sell-side (USDC->WETH path moves down-right); oneForZero = buy-side
    const ask = tangent(spreadOneForZero, 1); // buy WETH direction
    const bid = tangent(spreadZeroForOne, -1); // sell WETH direction
    return { path: d.trim(), px, py, bid, ask };
  }, [r0, r1, spreadZeroForOne, spreadOneForZero]);

  const leaning = trend !== "none" && (spreadZeroForOne > 0 || spreadOneForZero > 0);
  const accent = trend === "up" ? "var(--up)" : trend === "down" ? "var(--down)" : "var(--lav)";

  return (
    <div className="relative rounded-md overflow-hidden" style={{ background: "var(--scope-bg)", border: "1px solid var(--border)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }}>
        {/* faint grid */}
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g}>
            <line x1={pad + g * (W - 2 * pad)} y1={pad} x2={pad + g * (W - 2 * pad)} y2={H - pad} stroke="var(--divider)" strokeWidth={1} />
            <line x1={pad} y1={pad + g * (H - 2 * pad)} x2={W - pad} y2={pad + g * (H - 2 * pad)} stroke="var(--divider)" strokeWidth={1} />
          </g>
        ))}

        {/* the invariant */}
        <path d={path} fill="none" stroke="var(--lav)" strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />

        {/* executable tangents (the seam). bid = soft/against, ask = hard/with-trend */}
        <line x1={ask.x1} y1={ask.y1} x2={ask.x2} y2={ask.y2} stroke="var(--up)" strokeWidth={2} strokeLinecap="round" opacity={leaning ? 0.95 : 0.4} />
        <line x1={bid.x1} y1={bid.y1} x2={bid.x2} y2={bid.y2} stroke="var(--down)" strokeWidth={2} strokeLinecap="round" opacity={leaning ? 0.95 : 0.4} />

        {/* current reserve point */}
        <circle cx={px} cy={py} r={9} fill={accent} opacity={0.18} />
        <circle cx={px} cy={py} r={4.5} fill={accent} />
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
