import { useEffect, useRef } from "react";

type Regime = "none" | "up" | "down";

const COLORS: Record<Regime, string> = {
  none: "#8E88D8", // lavender — calm
  up: "#6BB89A", // mint — up-trend
  down: "#E58CA0", // pink — down-trend
};

/**
 * The Brain: a live "log-return micro-structure" oscilloscope. A scrolling noise
 * waveform whose drift bias and amplitude follow the detector's regime + intensity.
 * Stylised (the real CUSUM runs on-chain) but reads the live trend/κ so it tells the truth.
 */
export function Oscilloscope({ trend, intensity, height = 180 }: { trend: Regime; intensity: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ trend, intensity });
  stateRef.current = { trend, intensity };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const N = 200;
    const samples: number[] = new Array(N).fill(0);
    let phase = 0;
    let raf = 0;

    const cssColor = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    const draw = () => {
      const { trend: tr, intensity: it } = stateRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // new sample: smooth multi-octave noise + drift bias from the regime
      phase += 0.08;
      const drift = tr === "up" ? 0.18 + it * 0.5 : tr === "down" ? -(0.18 + it * 0.5) : 0;
      const amp = 0.55 + (tr === "none" ? 0.0 : it * 0.6);
      const noise =
        Math.sin(phase * 1.7) * 0.5 + Math.sin(phase * 3.3 + 1) * 0.28 + Math.sin(phase * 6.1 + 2) * 0.16 + (Math.random() - 0.5) * 0.5;
      samples.push(noise * amp + drift);
      samples.shift();

      const color = COLORS[tr];
      const mid = h * 0.55;
      const scale = h * 0.3;

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

      // waveform
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * w;
        const y = mid - samples[i] * scale;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // soft fill under the curve
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative rounded-md overflow-hidden" style={{ height, background: "var(--scope-bg)", border: "1px solid var(--border)" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      <div className="absolute left-3 top-2.5" style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>signal · log-return micro-structure</div>
      <div className="absolute right-3 bottom-2" style={{ fontSize: 10, fontWeight: 600, color: "var(--faint)" }}>drift bias →</div>
    </div>
  );
}
