/**
 * Reveal the thin scrollbar only on the scroll area the pointer is over (or that holds keyboard
 * focus), by toggling `.sb-on` on it and its scrolling ancestors.
 *
 * CSS alone cannot do this in Blink: `:hover::-webkit-scrollbar-thumb` is matched but the
 * scrollbar is not repainted when the hover state changes, so the thumb never appears. A class
 * change does trigger the repaint. Firefox has no ::-webkit-scrollbar and is handled in CSS.
 */

const ON = "sb-on";

function scrollersFrom(start: Element | null): Set<Element> {
  const out = new Set<Element>();
  for (let el = start; el && el !== document.documentElement; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) continue;
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) out.add(el);
  }
  return out;
}

export function installSoftScrollbars() {
  if (typeof window === "undefined" || !CSS.supports("selector(::-webkit-scrollbar)")) return;
  let lit = new Set<Element>();

  const light = (target: EventTarget | null) => {
    const next = scrollersFrom(target instanceof Element ? target : null);
    for (const el of lit) if (!next.has(el)) el.classList.remove(ON);
    for (const el of next) if (!lit.has(el)) el.classList.add(ON);
    lit = next;
  };

  const root = document.documentElement;
  // the page's own scrollbar is shown while the pointer is anywhere in the window
  document.addEventListener("pointerover", (e) => { root.classList.add(ON); light(e.target); }, { passive: true });
  document.addEventListener("focusin", (e) => light(e.target));
  root.addEventListener("pointerleave", () => {
    root.classList.remove(ON);
    light(null);
  });
}
