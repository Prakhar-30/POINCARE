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
    <figure className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 92 92" role="img" aria-label={`${label}: ${display}${suffix} of ${Math.round(max * scale)}${suffix}`}>
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
        <text x="46" y="44" textAnchor="middle" fontSize="18" fontWeight="650" style={{ fill: "var(--text)", fontFamily: "var(--font-sans)" }}>
          {display}
          {suffix}
        </text>
        <text x="46" y="58" textAnchor="middle" fontSize="10" fontWeight="600" style={{ fill: "var(--muted)", fontFamily: "var(--font-sans)" }}>
          of {Math.round(max * scale)}
          {suffix}
        </text>
      </svg>
      <figcaption style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>{label}</figcaption>
    </figure>
  );
}
