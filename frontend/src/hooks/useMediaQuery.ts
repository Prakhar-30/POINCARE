import { useEffect, useState } from "react";

/** Reactive `window.matchMedia`. SSR-safe (defaults to false on the server). */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

// Both end one pixel below Tailwind's `lg` (1024) and `sm` (640), so a JS layout switch and a CSS
// utility at the same breakpoint always agree; at exactly 1024 or 640 they used to disagree.
/** Stack two/three-column app layouts below the `lg` breakpoint. */
export const useIsNarrow = () => useMediaQuery("(max-width: 1023px)");
/** Phones: below Tailwind's `sm`. */
export const useIsMobile = () => useMediaQuery("(max-width: 639px)");
/** Tablets: wide enough for two columns, too narrow for the desktop terminal. */
export const useIsTablet = () => useMediaQuery("(min-width: 640px) and (max-width: 1023px)");
