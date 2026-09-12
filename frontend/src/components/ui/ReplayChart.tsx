import { useMemo } from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useWidth } from "@/hooks/useWidth";
import type { ReplayPoint } from "@/lib/replay";

/**
 * The live detector's trace against a candidate configuration's, over the same
 * real blocks.
 *
 * Evidence is plotted as a MULTIPLE OF EACH CONFIGURATION'S OWN THRESHOLD rather
 * than in raw statistic units. Two detectors tuned differently have different
 * `h`, so raw statistics are not comparable and a shared axis would flatter
 * whichever one happens to run on a larger scale — worse, in adaptive mode the
 * units are σ-multiples rather than log-returns. Dividing by `h` puts both on one
 * axis where the only line that matters, "this is where it fires", sits at 1.0
 * for both.
 *
 * The price path is drawn faintly behind on its own scale, because the question
 * a reader actually has is whether a firing lines up with a real move.
 */
export function ReplayChart({
  live,
  candidate,
  liveH,
  candidateH,
  height = 240,
  loading = false,
}: {
  live: ReplayPoint[];
  candidate: ReplayPoint[];
  liveH: number;
  candidateH: number;
  height?: number;
  loading?: boolean;
}) {
  const [wrapRef, measuredW] = useWidth<HTMLDivElement>();
  const mobile = useIsMobile();
  const W = measuredW || 640;
  const H = mobile ? Math.min(height, 190) : height;
  const PAD = { top: 12, right: 8, bottom: 12, left: 8 };

  const model = useMemo(() => {
    const n = Math.min(live.length, candidate.length);
    if (n < 2 || W <= PAD.left + PAD.right) return null;

    // Dominant statistic, as a multiple of that configuration's firing threshold.
    const norm = (p: ReplayPoint, h: number) => (h > 0 ? Math.max(p.s_pos, p.s_neg) / h : 0);
    const liveVals = live.slice(0, n).map((p) => norm(p, liveH));
    const candVals = candidate.slice(0, n).map((p) => norm(p, candidateH));

    // A saturated statistic can sit far above the threshold and would squash the
    // interesting region against the axis, so the view is capped and lines clip.
    const CAP = 4;
    const top = Math.min(CAP, Math.max(1.5, ...liveVals, ...candVals) * 1.12);

    const x = (i: number) => PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - (Math.min(v, top) / top) * (H - PAD.top - PAD.bottom);
    const path = (vals: number[]) =>
      vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

    // Price on its own scale, as background context only.
    const prices = live.slice(0, n).map((p) => p.price);
    const pMin = Math.min(...prices);
    const pMax = Math.max(...prices);
    const pSpan = pMax - pMin || 1;
    const priceY = (v: number) =>
      H - PAD.bottom - ((v - pMin) / pSpan) * (H - PAD.top - PAD.bottom) * 0.9;
    const pricePath = prices
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${priceY(v).toFixed(1)}`)
      .join(" ");

    // Contiguous stretches where each configuration was actually leaning.
    const bandsOf = (pts: ReplayPoint[]) => {
      const out: { x0: number; x1: number }[] = [];
      let start = -1;
      for (let i = 0; i < n; i++) {
        const leaning = pts[i].kappa > 0;
        if (leaning && start < 0) start = i;
        if ((!leaning || i === n - 1) && start >= 0) {
          out.push({ x0: x(start), x1: x(leaning ? i : Math.max(i - 1, start)) });
          start = -1;
        }
      }
      return out;
    };

    // Rising edges only: the moment each detector declared a trend.
    const firesOf = (pts: ReplayPoint[], vals: number[]) => {
      const out: { cx: number; cy: number }[] = [];
      for (let i = 0; i < n; i++) {
        if (pts[i].firing && !(i > 0 && pts[i - 1].firing)) out.push({ cx: x(i), cy: y(vals[i]) });
      }
      return out;
    };

    return {
      livePath: path(liveVals),
      candPath: path(candVals),
      pricePath,
      liveBands: bandsOf(live.slice(0, n)),
      candBands: bandsOf(candidate.slice(0, n)),
      candFires: firesOf(candidate.slice(0, n), candVals),
      liveFires: firesOf(live.slice(0, n), liveVals),
      yOfThreshold: y(1),
      clipped: Math.max(...liveVals, ...candVals) > top,
      firstBlock: live[0].block_number,
      lastBlock: live[n - 1].block_number,
    };
  }, [live, candidate, liveH, candidateH, W, H]);

  return (
    <div ref={wrapRef} style={{ minWidth: 0 }}>
      <div className="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap mb-1.5">
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>
          evidence ÷ firing threshold · per sampled block
        </span>
        <span className="flex items-center gap-3 flex-wrap" style={{ fontSize: 10, fontWeight: 700 }}>
          <span style={{ color: "var(--lav)" }}>▬ live</span>
          <span style={{ color: "var(--honey-deep)" }}>▬ candidate</span>
          <span style={{ color: "var(--down)" }}>┅ fires at 1.0</span>
        </span>
      </div>

      <div
        className="relative rounded-md overflow-hidden"
        style={{ height: H, background: "var(--scope-bg)", border: "1px solid var(--border)" }}
      >
        {!model ? (
          <div className="flex items-center justify-center gap-2 px-4 text-center" style={{ height: "100%" }}>
            {loading && (
              <span
                className="anim-pulse-dot"
                style={{ width: 7, height: 7, borderRadius: 99, background: "var(--lav)", flexShrink: 0 }}
              />
            )}
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--faint)" }}>
              {loading
                ? "Loading detector history…"
                : "Needs at least two sampled blocks to replay (one is recorded per traded block)."}
            </span>
          </div>
        ) : (
          <svg width={W} height={H} style={{ display: "block" }}>
            {/* where each configuration actually leaned */}
            {model.liveBands.map((b, i) => (
              <rect
                key={`l${i}`}
                x={b.x0}
                y={PAD.top}
                width={Math.max(b.x1 - b.x0, 2)}
                height={H - PAD.top - PAD.bottom}
                fill="var(--lav)"
                opacity={0.1}
              />
            ))}
            {model.candBands.map((b, i) => (
              <rect
                key={`c${i}`}
                x={b.x0}
                y={PAD.top}
                width={Math.max(b.x1 - b.x0, 2)}
                height={H - PAD.top - PAD.bottom}
                fill="var(--honey)"
                opacity={0.16}
              />
            ))}

            {/* the price path, background context on its own scale */}
            <path d={model.pricePath} fill="none" stroke="var(--text-3)" strokeWidth={1} opacity={0.25} />

            {/* the only line that matters: both detectors fire here */}
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={model.yOfThreshold}
              y2={model.yOfThreshold}
              stroke="var(--down)"
              strokeWidth={1.4}
              strokeDasharray="5 4"
              opacity={0.8}
            />

            <path d={model.livePath} fill="none" stroke="var(--lav)" strokeWidth={1.7} strokeLinejoin="round" />
            <path
              d={model.candPath}
              fill="none"
              stroke="var(--honey-deep)"
              strokeWidth={2}
              strokeLinejoin="round"
            />

            {model.liveFires.map((f, i) => (
              <circle key={`lf${i}`} {...f} r={3} fill="var(--lav)" opacity={0.85} />
            ))}
            {model.candFires.map((f, i) => (
              <circle key={`cf${i}`} {...f} r={4} fill="var(--honey-deep)" stroke="var(--surface)" strokeWidth={1.2} />
            ))}
          </svg>
        )}
      </div>

      {model && (
        <div
          className="flex items-center justify-between gap-x-3 gap-y-0.5 flex-wrap mt-1.5"
          style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}
        >
          <span>
            blocks {model.firstBlock} → {model.lastBlock}
          </span>
          <span>
            shaded: spread active · dots: firing{model.clipped ? " · axis clipped" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
