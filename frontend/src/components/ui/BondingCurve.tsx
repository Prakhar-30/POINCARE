import { useEffect, useMemo, useRef, useState } from "react";
import { useWidth } from "@/hooks/useWidth";

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
 * The live pool. The curve is the RESERVE display: one x*y=k hyperbola whose shape never
 * changes, with the reserve point sliding along it as trades land. The frame is anchored to a
 * slow-moving reference so that motion stays visible (re-centering instantly would cancel it).
 *
 * The spread is drawn separately, as a quote strip on the right, because that is where it
 * lives. It used to be drawn as two tangents fanning from the reserve point, which was
 * arithmetically fine and read as "the curve bends differently each way" - the depth lever we
 * built, measured across four years and rejected (OPEN_ITEMS E1). A spread is a price, not a
 * shape, so it belongs on a price scale.
 */
export function BondingCurve({
  r0, r1, spreadZeroForOne, spreadOneForZero, trend, height = 260,
}: {
  r0: number; r1: number; spreadZeroForOne: number; spreadOneForZero: number; trend: Regime; height?: number;
}) {
  // Drawn at the measured width: a fixed viewBox letterboxes the plot inside a wide panel.
  const [wrapRef, measured] = useWidth<HTMLDivElement>();
  const W = Math.max(320, measured || 520);
  const H = height;
  const pad = 28;

  // fast tween for the point, slow tween for the frame anchor
  const x0 = useTweened(r1 || 1, 900); // WETH on x
  const y0 = useTweened(r0 || 1, 900); // USDC on y
  const ax = useTweened(r1 || 1, 9000);
  const ay = useTweened(r0 || 1, 9000);
  // token0 is USDC, so zeroForOne (USDC in) is a buy of WETH: the ask side.
  const sAsk = useTweened(spreadZeroForOne, 700);
  const sBid = useTweened(spreadOneForZero, 700);

  // ripple every time the underlying reserves actually change
  const [rippleKey, setRippleKey] = useState(0);
  const lastR = useRef({ r0, r1 });
  useEffect(() => {
    if (r0 !== lastR.current.r0 || r1 !== lastR.current.r1) {
      lastR.current = { r0, r1 };
      setRippleKey((k) => k + 1);
    }
  }, [r0, r1]);

  const { path, px, py, bid, ask, qx, qMid, plotR } = useMemo(() => {
    const k = x0 * y0;
    const xMin = (ax || 1) * 0.4;
    const xMax = (ax || 1) * 1.85;
    const yAt = (x: number) => k / x;
    const yRef = (x: number) => ((ax || 1) * (ay || 1)) / x; // frame scale from the anchor curve
    const yMax = yRef(xMin);
    const yMin = yRef(xMax);

    // the curve gets the panel minus a lane on the right for the quote strip
    const plotR = W - pad - 64;
    const sx = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (plotR - pad);
    const sy = (y: number) => H - pad - ((y - yMin) / (yMax - yMin)) * (H - 2 * pad);

    let d = "";
    const STEPS = 80;
    for (let i = 0; i <= STEPS; i++) {
      const x = xMin + (i / STEPS) * (xMax - xMin);
      d += `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)},${sy(yAt(x)).toFixed(1)} `;
    }

    const px = sx(x0);
    const py = sy(yAt(x0));

    // The QUOTE, as a price offset from the pool price — not as a pair of tangents fanning
    // from the point. Two rays at different slopes on a curved line read as "the curve bends
    // differently each way", which is the depth lever we built, measured over four years and
    // rejected (OPEN_ITEMS E1). The hook never changes the curve's shape; it charges a spread
    // on one side. So the spread is drawn on a price scale, where it actually lives.
    const QH = H - 2 * pad; // usable height of the quote strip
    const qx = W - pad - 20;
    const qMid = pad + QH / 2;
    const span = 0.06; // full strip height = +/- 6% around the pool price
    const qy = (frac: number) => qMid - (frac / span) * (QH / 2);
    const ask = { x: qx, yMid: qMid, y: qy(sAsk) }; // buying WETH pays sAsk
    const bid = { x: qx, yMid: qMid, y: qy(-sBid) }; // selling WETH pays sBid
    return { path: d.trim(), px, py, bid, ask, qx, qMid, plotR };
  }, [x0, y0, ax, ay, sBid, sAsk, H, W]);

  const leaning = trend !== "none" && (spreadZeroForOne > 0 || spreadOneForZero > 0);
  const accent = trend === "up" ? "var(--up)" : trend === "down" ? "var(--down)" : "var(--lav)";
  const accentInk = trend === "up" ? "var(--up-ink)" : trend === "down" ? "var(--down-ink)" : "var(--lav-ink)";

  return (
    <div ref={wrapRef} className="relative rounded-md overflow-hidden" style={{ background: "var(--scope-bg)", border: "1px solid var(--border)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} role="img" aria-label={`Constant-product curve with the pool's current position. ${leaning ? `Leaning ${trend}: buy spread ${(spreadZeroForOne * 100).toFixed(2)}%, sell spread ${(spreadOneForZero * 100).toFixed(2)}%.` : "Calm: no spread on either side."}`}>
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g}>
            <line x1={pad + g * (plotR - pad)} y1={pad} x2={pad + g * (plotR - pad)} y2={H - pad} stroke="var(--divider)" strokeWidth={1} />
            <line x1={pad} y1={pad + g * (H - 2 * pad)} x2={plotR} y2={pad + g * (H - 2 * pad)} stroke="var(--divider)" strokeWidth={1} />
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

        {/* THE QUOTE STRIP: the pool price, and how far each side is quoted from it. */}
        <line x1={qx} y1={pad} x2={qx} y2={H - pad} stroke="var(--divider)" strokeWidth={1} />
        <line x1={qx - 13} y1={qMid} x2={qx + 13} y2={qMid} stroke="var(--lav)" strokeWidth={2.5} strokeLinecap="round" />
        {/* the with-trend side steps away by kappa; the other stays on the pool price */}
        {leaning && <rect x={qx - 5} y={Math.min(ask.y, qMid)} width={10} height={Math.abs(qMid - ask.y)} fill="var(--up)" opacity={0.3} />}
        {leaning && <rect x={qx - 5} y={Math.min(bid.y, qMid)} width={10} height={Math.abs(qMid - bid.y)} fill="var(--down)" opacity={0.3} />}
        <line x1={qx - 11} y1={ask.y} x2={qx + 11} y2={ask.y} stroke="var(--up)" strokeWidth={3} strokeLinecap="round" opacity={leaning ? 1 : 0.45} />
        <line x1={qx - 11} y1={bid.y} x2={qx + 11} y2={bid.y} stroke="var(--down)" strokeWidth={3} strokeLinecap="round" opacity={leaning ? 1 : 0.45} />

        {/* reserve point: halo + trade ripple + pulsing core */}
        <circle cx={px} cy={py} r={9} fill={accent} opacity={0.16} />
        {rippleKey > 0 && <circle key={rippleKey} cx={px} cy={py} r={9} fill="none" stroke={accent} strokeWidth={2} className="curve-ripple" />}
        <circle cx={px} cy={py} r={4.5} fill={accent}>
          <animate attributeName="opacity" values="1;.55;1" dur="2.2s" repeatCount="indefinite" />
        </circle>
      </svg>

      <div className="absolute left-3 top-2.5 hidden sm:block" style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>x · y = k · WETH ↔ USDC</div>
      <div className="absolute right-3 top-2.5 flex items-center gap-3" style={{ fontSize: 12, fontWeight: 600 }}>
        <span style={{ color: "var(--up-ink)" }}>● buy quote</span>
        <span style={{ color: "var(--down-ink)" }}>● sell quote</span>
      </div>
      <div className="absolute left-3 bottom-2" style={{ fontSize: 12, fontWeight: 600, color: leaning ? accentInk : "var(--muted)" }}>
        {leaning ? "trend detected · κ charged on one side" : "calm · both sides at the pool price"}
      </div>
    </div>
  );
}
