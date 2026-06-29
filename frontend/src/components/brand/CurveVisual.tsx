import { motion } from "framer-motion";

// Signature illustration: a constant-product hyperbola (calm, grey) and the same curve
// "leaning" on the with-trend side (honey), the directional spread drawn as the kink at
// the operating point. This is the whole product in one picture.
const W = 460;
const H = 340;
const P = 34;

// chart domain. YMIN sits below the leaning curve's lowest point so it never clips the frame.
const XMIN = 0.2;
const XMAX = 1.0;
const YMIN = 0.1;
const YMAX = 1.0;
const LEAN = 0.34;

const sx = (x: number) => P + ((x - XMIN) / (XMAX - XMIN)) * (W - 2 * P);
const sy = (y: number) => H - P - ((y - YMIN) / (YMAX - YMIN)) * (H - 2 * P);

function hyperbola(k: number, lean = 0) {
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = XMIN + (i / 60) * (XMAX - XMIN);
    // lean steepens the right (buy) side: y reduced as x grows past the midpoint
    const t = Math.max(0, (x - 0.55) / 0.45);
    const y = (k / x) * (1 - lean * t);
    pts.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
  }
  return pts.join(" ");
}

export function CurveVisual() {
  const k = 0.2;
  const calm = hyperbola(k, 0);
  const lean = hyperbola(k, LEAN);

  // operating point ~ middle (on the calm curve)
  const ox = sx(0.55);
  const oy = sy(k / 0.55);

  return (
    <div className="relative grain rounded-xl overflow-hidden" style={{ background: "var(--scope-bg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {/* axes */}
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="var(--divider)" strokeWidth="1.5" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="var(--divider)" strokeWidth="1.5" />
        <text x={W - P} y={H - P + 18} textAnchor="end" fontSize="10" fontWeight="700" fill="var(--faint)">WETH reserve →</text>
        <text x={P - 8} y={P + 4} textAnchor="end" fontSize="10" fontWeight="700" fill="var(--faint)" transform={`rotate(-90 ${P - 8} ${P + 4})`}>USDC reserve →</text>

        {/* calm curve */}
        <motion.polyline
          points={calm}
          fill="none"
          stroke="var(--faint)"
          strokeWidth="2.5"
          strokeDasharray="4 5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.8 }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
        />
        {/* leaning curve */}
        <motion.polyline
          points={lean}
          fill="none"
          stroke="var(--honey)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.3, ease: "easeInOut", delay: 0.3 }}
        />

        {/* operating point + kink callout */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>
          <circle cx={ox} cy={oy} r="11" fill="rgba(142,136,216,.16)" />
          <circle cx={ox} cy={oy} r="5" fill="var(--lav)" />
          <line x1={ox} y1={oy} x2={ox + 78} y2={oy - 54} stroke="var(--text-3)" strokeWidth="1.2" strokeDasharray="3 3" />
          <g transform={`translate(${ox + 84}, ${oy - 74})`}>
            <rect width="118" height="40" rx="11" fill="var(--surface)" stroke="var(--border)" />
            <text x="12" y="17" fontSize="10.5" fontWeight="800" fill="var(--text)">the kink = spread</text>
            <text x="12" y="31" fontSize="9.5" fontWeight="600" fill="var(--text-3)">leans vs the trend</text>
          </g>
        </motion.g>
      </svg>

      <div className="absolute left-4 top-3 flex items-center gap-4" style={{ fontSize: 10.5, fontWeight: 700 }}>
        <span className="flex items-center gap-1.5" style={{ color: "var(--faint)" }}>
          <span style={{ width: 16, height: 2.5, background: "var(--faint)", display: "inline-block", borderRadius: 2 }} /> calm (x·y=k)
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--honey-deep)" }}>
          <span style={{ width: 16, height: 3, background: "var(--honey)", display: "inline-block", borderRadius: 2 }} /> leaning
        </span>
      </div>
    </div>
  );
}
