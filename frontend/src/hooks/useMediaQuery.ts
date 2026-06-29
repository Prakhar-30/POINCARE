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

/** Stack two/three-column app layouts below the tablet breakpoint. */
export const useIsNarrow = () => useMediaQuery("(max-width: 1024px)");
/** Phone breakpoint for tighter, single-column packing. */
export const useIsMobile = () => useMediaQuery("(max-width: 640px)");
