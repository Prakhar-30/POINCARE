import clsx from "clsx";

/** The Poincaré mark: a hyperbolic disk with a leaning geodesic — the whole thesis in one glyph. */
export function Mark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <div
      className={clsx("flex items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.34,
        background: "linear-gradient(140deg,#8E88D8,#6BB89A)",
        boxShadow: "0 4px 12px rgba(142,136,216,.32)",
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="13" stroke="#fff" strokeWidth="1.7" opacity="0.7" />
        <path d="M16 3 C 8 9.5, 24 22.5, 16 29" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" />
        <circle cx="16" cy="16" r="2.3" fill="#fff" />
      </svg>
    </div>
  );
}

export function Wordmark({ size = 34, tag }: { size?: number; tag?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Mark size={size} />
      <span className="font-display text-text" style={{ fontWeight: 700, fontSize: size * 0.56, letterSpacing: ".5px" }}>
        Poincaré
      </span>
      {tag && (
        <span
          className="text-lav"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".5px", background: "var(--lav-soft)", borderRadius: 20, padding: "3px 9px" }}
        >
          {tag}
        </span>
      )}
    </div>
  );
}
