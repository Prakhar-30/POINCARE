import { useCallback, useEffect, useState } from "react";

/** Live content box of an element (callback ref, so it attaches whenever the node mounts). */
export function useBox<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, box] as const;
}

/**
 * Height from an element's top to the bottom of the viewport, minus `reserve` pixels left free
 * below it (e.g. so the next panel's header shows above the fold), never below `min`.
 */
export function useFillHeight(reserve = 16, min = 480) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [h, setH] = useState(0);
  const measure = useCallback(() => {
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    setH(Math.max(min, window.innerHeight - top - reserve));
  }, [el, reserve, min]);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  return [setEl, h] as const;
}
