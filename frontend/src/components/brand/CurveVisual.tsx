import { motion } from "framer-motion";

// Landing illustration: the two-sided QUOTE, drawn the way a market maker draws a spread.
//
// This has now been wrong twice, and the reason is worth leaving here. It first drew two
// hyperbolas, a calm one and a "leaning" one bent on the buy side, which is a picture of a
// mechanism the hook does not implement: a depth/curvature lever was built, measured over four
// years of real ETH/USDC and lost by roughly thirty to one (OPEN_ITEMS E1). It was then redrawn
// as one hyperbola with two rays fanning from the operating point. That was accurate and STILL
// read as a curvature change, because the constant-product curve is curved, so anything drawn
// near it looks like another curve.
//
// A spread is not a shape, it is a price. So there is no hyperbola here at all. One horizontal
// line is the pool's price, which never moves. When the detector fires, the side pushing WITH
// the trend is quoted kappa worse; the side pushing against it stays on the pool price. That
// one-sidedness is the whole mechanism, and it is what makes every round trip unprofitable.
const W = 460;
const H = 340;
const P = 42;

const MID = H * 0.56;
const KAPPA = 62; // exaggerated for legibility; the deployed cap is 5%
const LANE = 96;
const BAR = 54;

const CALM_X = W * 0.31;
const TREND_X = W * 0.72;

export function CurveVisual() {
  return (
    <div
      className="relative grain rounded-xl overflow-hidden"
      style={{ background: "var(--scope-bg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        <defs>
          <linearGradient id="kappaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--honey)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--honey)" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <text x={P - 6} y={P - 12} fontSize="10" fontWeight="700" fill="var(--faint)">
          executable price →
        </text>

        {/* THE pool price. One line, dead flat, never moves. */}
        <motion.line
          x1={P}
          y1={MID}
          x2={W - P}
          y2={MID}
          stroke="var(--lav)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />
        <text x={P} y={MID + 20} fontSize="9.5" fontWeight="700" fill="var(--lav)">
          the pool price · x·y = k · unchanged
        </text>

        {/* calm: both sides quoted the same */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
          <line
            x1={CALM_X - LANE / 2}
            y1={MID}
            x2={CALM_X - 4}
            y2={MID}
            stroke="var(--honey)"
            strokeWidth="6"
            strokeLinecap="butt"
          />
          <line
            x1={CALM_X + 4}
            y1={MID}
            x2={CALM_X + LANE / 2}
            y2={MID}
            stroke="var(--up)"
            strokeWidth="6"
            strokeLinecap="butt"
          />
          <text x={CALM_X} y={H - P + 6} textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--text)">
            calm
          </text>
          <text x={CALM_X} y={H - P + 20} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-3)">
            both sides, same price
          </text>
        </motion.g>

        {/* trend detected: one side steps away by kappa, the other does not move */}
        <motion.g initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.15 }}>
          <rect
            x={TREND_X - LANE / 2}
            y={MID - KAPPA}
            width={BAR}
            height={KAPPA}
            fill="url(#kappaFill)"
            rx="2"
          />
          <line
            x1={TREND_X - LANE / 2}
            y1={MID - KAPPA}
            x2={TREND_X - 4}
            y2={MID - KAPPA}
            stroke="var(--honey)"
            strokeWidth="6"
            strokeLinecap="butt"
          />
          <line
            x1={TREND_X + 4}
            y1={MID}
            x2={TREND_X + LANE / 2}
            y2={MID}
            stroke="var(--up)"
            strokeWidth="6"
            strokeLinecap="butt"
          />
          {/* the kappa measure */}
          <line
            x1={TREND_X - LANE / 2 + BAR / 2}
            y1={MID - KAPPA + 3}
            x2={TREND_X - LANE / 2 + BAR / 2}
            y2={MID - 3}
            stroke="var(--honey-deep)"
            strokeWidth="1.4"
            markerStart="url(#a)"
          />
          <text
            x={TREND_X - LANE / 2 + BAR / 2 + 7}
            y={MID - KAPPA / 2 + 4}
            fontSize="13"
            fontWeight="800"
            fill="var(--honey-deep)"
          >
            κ
          </text>
          <text x={TREND_X} y={H - P + 6} textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--text)">
            trend detected
          </text>
          <text x={TREND_X} y={H - P + 20} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-3)">
            κ on one side only
          </text>
        </motion.g>
      </svg>

      <div className="absolute left-4 top-3 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ fontSize: 10.5, fontWeight: 700 }}>
        <span className="flex items-center gap-1.5" style={{ color: "var(--honey-deep)" }}>
          <span style={{ width: 16, height: 3, background: "var(--honey)", display: "inline-block", borderRadius: 2 }} />
          with the trend · pays κ
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--up)" }}>
          <span style={{ width: 16, height: 3, background: "var(--up)", display: "inline-block", borderRadius: 2 }} />
          against it · pool price
        </span>
      </div>
    </div>
  );
}
