import clsx from "clsx";

/** The Poincaré mark: the looping geodesic glyph (public/Logo.png), the whole thesis in one mark. */
export function Mark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/Logo.png"
      alt="Poincaré"
      width={size}
      height={size}
      className={clsx("block", className)}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
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
