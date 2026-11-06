/** Small browser facts shared by the app and the docs (kept out of CommandMenu so the docs chunk
 *  does not pull in the app's command menu just to print a key hint). */

type NavigatorUAData = { userAgentData?: { platform?: string } };

const platform = (): string => {
  if (typeof navigator === "undefined") return "";
  return (navigator as Navigator & NavigatorUAData).userAgentData?.platform || navigator.userAgent || "";
};

/** The platform's modifier, for hint text only: ⌘ on Apple devices, Ctrl elsewhere. */
export const MOD = /Mac|iPhone|iPad|iOS/i.test(platform()) ? "⌘" : "Ctrl";

/** "smooth" unless the reader asked the OS for less motion. Scripted smooth scrolling is not
 *  covered by the CSS `scroll-behavior` override, so every scrollIntoView / scrollTo uses this. */
export const scrollBehavior = (): ScrollBehavior =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
