/**
 * Inline placeholder for a figure that is still loading. It takes the figure's place at roughly
 * its width, so the layout does not jump when the number lands, and uses the shared `.shimmer`
 * (which stops under reduced motion). "—" stays reserved for a value that has loaded and is empty.
 */
export function Skel({ w = "5ch", h = "0.9em", r = 6 }: { w?: string | number; h?: string | number; r?: number }) {
  return (
    <span className="shimmer" role="status" aria-label="Loading"
      style={{ display: "inline-block", width: w, height: h, borderRadius: r, verticalAlign: "middle", opacity: 0.55 }} />
  );
}
