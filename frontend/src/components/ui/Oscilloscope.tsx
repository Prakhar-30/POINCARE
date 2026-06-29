import { useEffect, useRef } from "react";

type Regime = "none" | "up" | "down";

const COLORS: Record<Regime, string> = {
  none: "#8E88D8", // lavender, calm
  up: "#6BB89A", // mint, up-trend
  down: "#E58CA0", // pink, down-trend
};

/**
 * The Brain oscilloscope. The left portion is the REAL captured signal: signed
 * log-returns of every swap recorded so far (passed in via `real`). The right
 * portion is a live synthetic continuation whose drift bias and amplitude follow
 * the detector's regime + intensity. The synthetic tail advances slowly in calm
 * markets and speeds up under a detected trend. A seam divides captured from live.
 */
export function Oscilloscope({ trend, intensity, real = [], height = 180 }: { trend: Regime; intensity: number; real?: number[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ trend, intensity, real });
  stateRef.current = { trend, intensity, real };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const N = 220;
    const synth: number[] = [];
    let phase = 0;
    let frame = 0;
    let raf = 0;

    const cssColor = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    const draw = () => {
      const { trend: tr, intensity: it, real: rl } = stateRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // real captured region (left), synthetic continuation (right)
      const R = Math.min(rl.length, Math.floor(N * 0.42));
      const realSamples = R > 0 ? rl.slice(rl.length - R) : [];
      const synthLen = N - R;

      // speed: advance one synthetic sample every `every` frames. Slow when calm,
      // fast under a trend (scaled by detected intensity).
      const every = tr === "none" ? 7 : Math.max(2, Math.round(6 - it * 4));
      frame++;
      if (frame % every === 0) {
        phase += 0.2;
        const drift = tr === "up" ? 0.16 + it * 0.5 : tr === "down" ? -(0.16 + it * 0.5) : 0;
        const amp = 0.5 + (tr === "none" ? 0.0 : it * 0.6);
        const noise =
          Math.sin(phase * 1.7) * 0.5 + Math.sin(phase * 3.3 + 1) * 0.28 + Math.sin(phase * 6.1 + 2) * 0.16 + (Math.random() - 0.5) * 0.5;
        synth.push(noise * amp + drift);
      }
      while (synth.length > synthLen) synth.shift();
      while (synth.length < synthLen) synth.unshift(0);

      const samples = realSamples.concat(synth);
      const color = COLORS[tr];
      const mid = h * 0.55;
      const scale = h * 0.3;
      const xOf = (i: number) => (i / (N - 1)) * w;

      // threshold (top) + baseline
      ctx.strokeStyle = cssColor("--honey") || "#E6B25F";
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.16);
      ctx.lineTo(w, h * 0.16);
      ctx.stroke();

      ctx.strokeStyle = cssColor("--lav-dim") || "#C5C1ED";
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();

      // seam between captured and live
      const seamX = R > 0 ? xOf(R) : 0;
      if (R > 0) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(seamX, h * 0.1);
        ctx.lineTo(seamX, h * 0.92);
        ctx.stroke();
        ctx.setLineDash([]);
        // shade the captured region faintly
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, seamX, h);
      }

      // captured waveform (solid, brighter)
      if (R > 1) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i < R; i++) {
          const x = xOf(i);
          const y = mid - samples[i] * scale;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // live continuation (lighter, leads from the seam)
      ctx.globalAlpha = R > 0 ? 0.78 : 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = Math.max(0, R - 1); i < N; i++) {
        const x = xOf(i);
        const y = mid - samples[i] * scale;
        i === Math.max(0, R - 1) ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // soft fill under the whole curve
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = color;
      ctx.fill();

      // leading dot
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(xOf(N - 1), mid - samples[N - 1] * scale, 2.6, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const captured = real.length;
  return (
    <div className="relative rounded-md overflow-hidden" style={{ height, background: "var(--scope-bg)", border: "1px solid var(--border)" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      <div className="absolute left-3 top-2.5" style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>
        signal · log-return micro-structure
      </div>
      <div className="absolute right-3 top-2.5" style={{ fontSize: 10, fontWeight: 700, color: "var(--faint)" }}>
        {captured > 0 ? `${captured} captured · live` : "live"}
      </div>
      <div className="absolute right-3 bottom-2" style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>drift bias →</div>
    </div>
  );
}
