import { useMemo } from "react";
import type { DetectorPoint } from "@/lib/onchain";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useWidth } from "@/hooks/useWidth";

/**
 * Both one-sided CUSUM statistics against the firing threshold h; kappa > 0 stretches
 * shaded, a dashed drift projection right of the seam. Series are labelled in chart
 * orientation (hook s_pos = chart down evidence, price is inverted). Geometry is in
 * real pixels from the measured width; legend/captions sit in flow so nothing overlaps.
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
  const [wrapRef, measuredW] = useWidth<HTMLDivElement>();
  const mobile = useIsMobile();
  const W = measuredW || 640;
  const H = mobile ? Math.min(height, 150) : height;
  const PAD = { top: 10, right: 8, bottom: 10, left: 8 };
  const PROJ = mobile ? 12 : 20; // projected steps appended after the last real sample

  const model = useMemo(() => {
    const n = points.length;
    if (n < 2 || W <= PAD.left + PAD.right) return null;

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
  }, [points, thresholdH, W, H, PROJ]);

  return (
    <div ref={wrapRef} style={{ minWidth: 0 }}>
      {/* legend in normal flow so it can never collide with the plot on narrow screens */}
      <div className="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap mb-1.5">
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>
          CUSUM evidence · per sampled block
        </span>
        <span className="flex items-center gap-3 flex-wrap" style={{ fontSize: 10, fontWeight: 700 }}>
          <span style={{ color: "var(--up)" }}>▬ up</span>
          <span style={{ color: "var(--down)" }}>▬ down</span>
          <span style={{ color: "var(--honey)" }}>┅ threshold h</span>
        </span>
      </div>

      <div
        className="relative rounded-md overflow-hidden"
        style={{ height: H, background: "var(--scope-bg)", border: "1px solid var(--border)" }}
      >
        {!model ? (
          <div className="flex items-center justify-center gap-2 px-4 text-center" style={{ height: "100%" }}>
            {loading && <span className="anim-pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--lav)", flexShrink: 0 }} />}
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--faint)" }}>
              {loading ? "Loading detector history…" : "Waiting for detector samples (one is recorded per traded block)."}
            </span>
          </div>
        ) : (
          <svg width={W} height={H} style={{ display: "block" }}>
            {/* blocks where the curve was actually leaning */}
            {model.leanBands.map((b, i) => (
              <rect key={i} x={b.x0} y={PAD.top} width={Math.max(b.x1 - b.x0, 2)} height={H - PAD.top - PAD.bottom} fill="var(--honey)" opacity={0.1} />
            ))}
            {/* projected region tint + seam */}
            <rect x={model.seamX} y={PAD.top} width={Math.max(0, W - PAD.right - model.seamX)} height={H - PAD.top - PAD.bottom} fill="var(--lav)" opacity={0.045} />
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
        )}
      </div>

      {model && (
        <div className="flex items-center justify-between gap-x-3 gap-y-0.5 flex-wrap mt-1.5" style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>
          <span>
            blocks {points[0].block_number} → {points[points.length - 1].block_number}
          </span>
          <span>shaded: spread active · dashed: projected</span>
        </div>
      )}
    </div>
  );
}
