import { motion } from "framer-motion";

// Landing illustration: ONE constant-product hyperbola, never reshaped, with the directional
// spread drawn where it actually lives — in the executable quote at the operating point.
//
// This used to draw two curves, a calm one and a "leaning" one bent on the buy side. That was
// a picture of a mechanism the hook does not implement. A depth/curvature lever was built and
// measured over four years of real ETH/USDC and lost by roughly thirty to one; what ships is a
// non-negative spread on a single symmetric curve (README section 3.1, OPEN_ITEMS E1). The
// pool's curve is the same shape in every regime. What changes under a detected trend is the
// price the with-trend side is quoted: it pays kappa, which the LP keeps. The against-trend
// side keeps trading at the plain curve price, which is what makes every round trip
// unprofitable by construction.
const W = 460;
const H = 340;
const P = 34;

const XMIN = 0.2;
const XMAX = 1.0;
const YMIN = 0.1;
const YMAX = 1.0;

// Visual exaggeration of the spread so the wedge reads at this size. The deployed cap is
// kappa_max = 0.05; this is a diagram, not a scale drawing.
const SPREAD = 0.55;
const RAY = 92;

const sx = (x: number) => P + ((x - XMIN) / (XMAX - XMIN)) * (W - 2 * P);
const sy = (y: number) => H - P - ((y - YMIN) / (YMAX - YMIN)) * (H - 2 * P);

const K = 0.2;
const OX = 0.55;

function hyperbola() {
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = XMIN + (i / 60) * (XMAX - XMIN);
    pts.push(`${sx(x).toFixed(1)},${sy(K / x).toFixed(1)}`);
  }
  return pts.join(" ");
}

/** The curve's own tangent at the operating point, in screen space. */
function screenSlope() {
  const slope = -K / (OX * OX); // dy/dx of k/x
  const dXdx = (W - 2 * P) / (XMAX - XMIN);
  const dYdy = -((H - 2 * P) / (YMAX - YMIN));
  return (slope * dYdy) / dXdx;
}

/** A ray from the operating point at a given slope; dir picks which way along the curve. */
function ray(slope: number, dir: 1 | -1) {
  const dx = (dir * RAY) / Math.sqrt(1 + slope * slope);
  return { x: sx(OX) + dx, y: sy(K / OX) + slope * dx };
}

export function CurveVisual() {
  const curve = hyperbola();
  const ox = sx(OX);
  const oy = sy(K / OX);

  const s = screenSlope();
  // against-trend: quoted at the curve price, so its ray lies exactly along the tangent.
  const soft = ray(s, -1);
  // with-trend: pays the spread, so its ray is steeper — worse execution, kept by the LP.
  const hard = ray(s * (1 + SPREAD), 1);
  const tangentEnd = ray(s, 1); // where the with-trend side WOULD have been quoted

  return (
    <div
      className="relative grain rounded-xl overflow-hidden"
      style={{ background: "var(--scope-bg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {/* axes */}
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="var(--divider)" strokeWidth="1.5" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="var(--divider)" strokeWidth="1.5" />
        <text x={W - P} y={H - P + 18} textAnchor="end" fontSize="10" fontWeight="700" fill="var(--faint)">
          WETH reserve →
        </text>
        <text
          x={P - 8}
          y={P + 4}
          textAnchor="end"
          fontSize="10"
          fontWeight="700"
          fill="var(--faint)"
          transform={`rotate(-90 ${P - 8} ${P + 4})`}
        >
          USDC reserve →
        </text>

        {/* THE curve. One of them, always. */}
        <motion.polyline
          points={curve}
          fill="none"
          stroke="var(--lav)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.9 }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
        />

        {/* the spread: the wedge between the two executable quotes */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0, duration: 0.6 }}>
          <path d={`M${ox},${oy} L${tangentEnd.x},${tangentEnd.y} L${hard.x},${hard.y} Z`} fill="var(--honey)" opacity="0.18" />
          {/* where the with-trend side would have traded without a detected trend */}
          <line
            x1={ox}
            y1={oy}
            x2={tangentEnd.x}
            y2={tangentEnd.y}
            stroke="var(--faint)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.8"
          />
          {/* against-trend: quoted at the curve price, unpenalised */}
          <line x1={ox} y1={oy} x2={soft.x} y2={soft.y} stroke="var(--up)" strokeWidth="3" strokeLinecap="round" />
          {/* with-trend: pays kappa */}
          <line x1={ox} y1={oy} x2={hard.x} y2={hard.y} stroke="var(--honey)" strokeWidth="3.5" strokeLinecap="round" />
        </motion.g>

        {/* operating point + callout */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>
          <circle cx={ox} cy={oy} r="11" fill="rgba(142,136,216,.16)" />
          <circle cx={ox} cy={oy} r="5" fill="var(--lav)" />
          <line x1={ox} y1={oy} x2={ox + 74} y2={oy - 62} stroke="var(--text-3)" strokeWidth="1.2" strokeDasharray="3 3" />
          <g transform={`translate(${ox + 80}, ${oy - 84})`}>
            <rect width="150" height="42" rx="11" fill="var(--surface)" stroke="var(--border)" />
            <text x="12" y="17" fontSize="10.5" fontWeight="800" fill="var(--text)">
              the spread, not the curve
            </text>
            <text x="12" y="31" fontSize="9.5" fontWeight="600" fill="var(--text-3)">
              same x·y=k in every regime
            </text>
          </g>
        </motion.g>
      </svg>

      <div className="absolute left-4 top-3 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ fontSize: 10.5, fontWeight: 700 }}>
        <span className="flex items-center gap-1.5" style={{ color: "var(--lav)" }}>
          <span style={{ width: 16, height: 3, background: "var(--lav)", display: "inline-block", borderRadius: 2 }} /> the pool (x·y=k)
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--up)" }}>
          <span style={{ width: 16, height: 3, background: "var(--up)", display: "inline-block", borderRadius: 2 }} /> against trend · base price
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--honey-deep)" }}>
          <span style={{ width: 16, height: 3, background: "var(--honey)", display: "inline-block", borderRadius: 2 }} /> with trend · pays κ
        </span>
      </div>
    </div>
  );
}
