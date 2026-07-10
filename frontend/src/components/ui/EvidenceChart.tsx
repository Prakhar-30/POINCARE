import { useMemo } from "react";
import type { DetectorPoint } from "@/lib/onchain";

/**
 * The detector's state over time: both one-sided CUSUM statistics against the firing
 * threshold h, with the blocks where the curve was leaning (kappa > 0) shaded.
 *
 * Left of the seam: real on-chain DetectorSample points. Right of the seam: a short
 * projected continuation, each statistic extended along its recent drift with the
 * increment decaying toward the CUSUM's natural drain (-k per quiet block), drawn
 * dashed and faded and replaced by real samples as they arrive. The projection keeps
 * the chart legible between trades without pretending to be data.
 *
 * Orientation: the hook's internal price is WETH/USDC, the inverse of the UI's
 * USDC/WETH chart. s_pos (hook "up") is therefore evidence of a falling chart price
 * and s_neg of a rising one; the series are labelled by chart direction to match
 * everything else the user sees.
 */
export function EvidenceChart({
  points,
  thresholdH,
  height = 180,
  loading = false,
}: {
  points: DetectorPoint[];
  thresholdH: number; // WAD-fraction units, same scale as s_pos / s_neg
  height?: number;
  loading?: boolean;
}) {
  const W = 640; // viewBox units; SVG scales to the container
  const H = 180;
  const PAD = { top: 18, right: 8, bottom: 16, left: 8 };
  const PROJ = 20; // projected steps appended after the last real sample

  const model = useMemo(() => {
    const n = points.length;
    if (n < 2) return null;

    // Projected continuation: recent per-step drift, decaying 12%/step, floored at 0.
    const drift = (get: (p: DetectorPoint) => number) => {
      const tail = points.slice(-6);
      let d = 0;
      for (let i = 1; i < tail.length; i++) d += get(tail[i]) - get(tail[i - 1]);
      return d / Math.max(tail.length - 1, 1);
    };
    const extend = (get: (p: DetectorPoint) => number) => {
      const out: number[] = [];
      let v = get(points[n - 1]);
      let d = drift(get);
      for (let i = 0; i < PROJ; i++) {
        v = Math.max(0, v + d);
        d *= 0.88;
        out.push(v);
      }
      return out;
    };
    const projDown = extend((p) => p.s_pos); // hook s_pos = chart down evidence
    const projUp = extend((p) => p.s_neg); // hook s_neg = chart up evidence

    const total = n + PROJ;
    const top = Math.max(
      thresholdH * 1.6,
      ...points.map((p) => Math.max(p.s_pos, p.s_neg) * 1.15),
      ...projDown,
      ...projUp,
      1e-9,
    );
    const x = (i: number) => PAD.left + (i / (total - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - (Math.min(v, top) / top) * (H - PAD.top - PAD.bottom);
    const path = (vals: number[], startIdx: number) =>
      vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(startIdx + i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

    // Contiguous kappa > 0 stretches in the real region become shaded lean bands.
    const bands: { x0: number; x1: number }[] = [];
    let start = -1;
    points.forEach((p, i) => {
      if (p.kappa > 0 && start < 0) start = i;
      if ((p.kappa === 0 || i === n - 1) && start >= 0) {
        bands.push({ x0: x(start), x1: x(p.kappa > 0 ? i : Math.max(i - 1, start)) });
        start = -1;
      }
    });

    const last = points[n - 1];
    return {
      downReal: path(points.map((p) => p.s_pos), 0),
      upReal: path(points.map((p) => p.s_neg), 0),
      downProj: path([last.s_pos, ...projDown], n - 1),
      upProj: path([last.s_neg, ...projUp], n - 1),
      leanBands: bands,
      seamX: x(n - 1),
      yOfH: y(thresholdH),
      dotDown: { cx: x(n - 1), cy: y(last.s_pos) },
      dotUp: { cx: x(n - 1), cy: y(last.s_neg) },
      maxY: top,
    };
  }, [points, thresholdH]);

  if (!model) {
    return (
      <div
        className="relative rounded-md overflow-hidden flex items-center justify-center gap-2"
        style={{ height, background: "var(--scope-bg)", border: "1px solid var(--border)" }}
      >
        {loading && <span className="anim-pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--lav)" }} />}
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--faint)" }}>
          {loading ? "Loading detector history…" : "Waiting for detector samples (one is recorded per traded block)."}
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-md overflow-hidden"
      style={{ height, background: "var(--scope-bg)", border: "1px solid var(--border)" }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
        {/* blocks where the curve was actually leaning */}
        {model.leanBands.map((b, i) => (
          <rect key={i} x={b.x0} y={PAD.top} width={Math.max(b.x1 - b.x0, 2)} height={H - PAD.top - PAD.bottom} fill="var(--honey)" opacity={0.1} />
        ))}
        {/* projected region tint + seam */}
        <rect x={model.seamX} y={PAD.top} width={W - PAD.right - model.seamX} height={H - PAD.top - PAD.bottom} fill="var(--lav)" opacity={0.045} />
        <line x1={model.seamX} x2={model.seamX} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--lav)" strokeWidth={1} strokeDasharray="2 4" opacity={0.55} />
        {/* firing threshold h */}
        <line x1={PAD.left} x2={W - PAD.right} y1={model.yOfH} y2={model.yOfH} stroke="var(--honey)" strokeWidth={1.4} strokeDasharray="5 4" opacity={0.85} />
        {/* real evidence trajectories */}
        <path d={model.upReal} fill="none" stroke="var(--up)" strokeWidth={1.8} strokeLinejoin="round" />
        <path d={model.downReal} fill="none" stroke="var(--down)" strokeWidth={1.8} strokeLinejoin="round" />
        {/* projected continuations (dashed, faded) */}
        <path d={model.upProj} fill="none" stroke="var(--up)" strokeWidth={1.5} strokeDasharray="3 4" opacity={0.45} />
        <path d={model.downProj} fill="none" stroke="var(--down)" strokeWidth={1.5} strokeDasharray="3 4" opacity={0.45} />
        {/* live-edge markers */}
        <circle {...model.dotUp} r={3} fill="var(--up)">
          <animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <circle {...model.dotDown} r={3} fill="var(--down)">
          <animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>

      <div className="absolute left-3 top-2" style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>
        CUSUM evidence · per sampled block
      </div>
      <div className="absolute right-3 top-2 flex items-center gap-3" style={{ fontSize: 10, fontWeight: 700 }}>
        <span style={{ color: "var(--up)" }}>▬ up evidence</span>
        <span style={{ color: "var(--down)" }}>▬ down evidence</span>
        <span style={{ color: "var(--honey)" }}>┅ threshold h</span>
      </div>
      <div className="absolute left-3 bottom-1.5" style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>
        {points[0].block_number} → {points[points.length - 1].block_number}
      </div>
      <div className="absolute right-3 bottom-1.5" style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>
        shaded: spread active · dashed right of seam: projected
      </div>
    </div>
  );
}
