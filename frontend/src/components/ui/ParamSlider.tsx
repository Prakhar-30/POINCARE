/**
 * One detector parameter, with the deployed value marked on the track.
 *
 * The marker is the point of the control: every slider here starts at what the
 * pool is actually running, so "how far have I moved from the real thing" is
 * readable at a glance and a click returns to it.
 */
export function ParamSlider({
  label,
  symbol,
  hint,
  value,
  liveValue,
  min,
  max,
  step,
  format,
  onChange,
  disabled = false,
}: {
  label: string;
  symbol: string;
  hint?: string;
  value: number;
  /** The value the hook was deployed with; rendered as a tick and the reset target. */
  liveValue: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const span = max - min;
  const pctOf = (v: number) => (span > 0 ? Math.max(0, Math.min(1, (v - min) / span)) * 100 : 0);
  const moved = Math.abs(value - liveValue) > step / 2;

  return (
    <div style={{ opacity: disabled ? 0.45 : 1 }}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-display" style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            {symbol}
          </span>
          <span className="truncate" style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)" }}>
            {label}
          </span>
        </div>
        <div className="flex items-baseline gap-2 shrink-0">
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: moved ? "var(--honey-deep)" : "var(--text-2)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {format(value)}
          </span>
          {moved && !disabled && (
            <button
              onClick={() => onChange(liveValue)}
              style={{ fontSize: 10, fontWeight: 700, color: "var(--lav-deep)" }}
              title={`Reset to the deployed value (${format(liveValue)})`}
            >
              reset
            </button>
          )}
        </div>
      </div>

      <div className="relative" style={{ height: 18 }}>
        {/* the deployed value, so any deviation from it is visible on the track */}
        <span
          className="absolute"
          style={{
            left: `${pctOf(liveValue)}%`,
            top: 2,
            width: 2,
            height: 12,
            marginLeft: -1,
            borderRadius: 2,
            background: "var(--lav-dim)",
            pointerEvents: "none",
          }}
          title={`deployed: ${format(liveValue)}`}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: moved ? "var(--honey-deep)" : "var(--lav)", cursor: disabled ? "not-allowed" : "pointer" }}
        />
      </div>

      {hint && (
        <p style={{ fontSize: 10.5, lineHeight: 1.5, color: "var(--faint)", marginTop: 2 }}>{hint}</p>
      )}
    </div>
  );
}
