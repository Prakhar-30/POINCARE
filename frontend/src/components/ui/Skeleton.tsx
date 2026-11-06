/**
 * Inline placeholder for a figure that is still loading. It takes the figure's place at roughly
 * its width, so the layout does not jump when the number lands, and uses the shared `.shimmer`
 * (which stops under reduced motion). "—" stays reserved for a value that has loaded and is empty.
 *
 * The shimmer is hidden from screen readers and replaced by plain "Loading…" text, read in place
 * when someone reaches the figure. It is deliberately not a live region: a page shows a dozen of
 * these at once, and a dozen "Loading" announcements is noise.
 */
export function Skel({ w = "5ch", h = "0.9em", r = 6 }: { w?: string | number; h?: string | number; r?: number }) {
  return (
    <>
      <span className="shimmer" aria-hidden="true"
        style={{ display: "inline-block", width: w, height: h, borderRadius: r, verticalAlign: "middle", opacity: 0.55 }} />
      <span className="sr-only">Loading…</span>
    </>
  );
}
