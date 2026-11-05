import clsx from "clsx";

/** `decorative` when a visible wordmark or label already names it, so it is not read twice. */
export function Mark({ size = 34, className, decorative }: { size?: number; className?: string; decorative?: boolean }) {
  return (
    <img
      // 128px WebP (4 KB): crisp up to 64px on 2x screens; the 500px Logo.png stays for other uses
      src={`${import.meta.env.BASE_URL}logo-mark.webp`}
      alt={decorative ? "" : "Poincaré"}
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
      <Mark size={size} decorative />
      <span className="font-display text-text" style={{ fontWeight: 700, fontSize: size * 0.56, letterSpacing: ".5px" }}>
        Poincaré
      </span>
      {tag && (
        <span
          className="text-lav-ink"
          style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".5px", background: "var(--lav-soft)", borderRadius: 20, padding: "3px 9px" }}
        >
          {tag}
        </span>
      )}
    </div>
  );
}
