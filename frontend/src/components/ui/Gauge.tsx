/** A soft circular progress ring with a value in the middle. */
export function Gauge({
  value,
  max,
  label,
  color,
  suffix = "",
  scale = 1,
  size = 96,
}: {
  value: number;
  max: number;
  label: string;
  color: string;
  suffix?: string;
  scale?: number;
  size?: number;
}) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const offset = circ * (1 - pct);
  const display = Math.round(value * scale);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 92 92">
        <circle cx="46" cy="46" r={r} fill="none" strokeWidth="8" style={{ stroke: "var(--track)" }} />
        <circle
          cx="46"
          cy="46"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 46 46)"
          style={{ transition: "stroke-dashoffset .4s cubic-bezier(.4,0,.2,1)" }}
        />
        <text x="46" y="44" textAnchor="middle" fontSize="18" fontWeight="800" fontFamily="Nunito" style={{ fill: "var(--text)" }}>
          {display}
          {suffix}
        </text>
        <text x="46" y="58" textAnchor="middle" fontSize="8.5" fontWeight="700" fontFamily="Nunito" style={{ fill: "var(--muted)" }}>
          of {Math.round(max * scale)}
          {suffix}
        </text>
      </svg>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{label}</div>
    </div>
  );
}
