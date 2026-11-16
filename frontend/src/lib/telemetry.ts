import type { PostHog } from "posthog-js";

/**
 * Product analytics (PostHog), privacy-first and inert without a key.
 *
 * - Off unless VITE_POSTHOG_KEY is set; the PostHog client is loaded in its own chunk only then,
 *   so the landing page pays nothing for it when analytics is off.
 * - Cookieless: persistence lives in memory, so there is nothing to consent to and a returning
 *   visitor is a new anonymous session. `person_profiles: "always"` gives each session an
 *   anonymous profile (a random ID, no identify() call), so a visit's journey can be followed.
 * - Respects Do Not Track; no session recording; no remote scripts (surveys, toolbar) are pulled
 *   in, which also keeps the content-security policy simple.
 * - Never sends wallet addresses, balances or amounts (the amount in the trade URL is stripped
 *   before anything is sent): events carry only coarse, non-identifying
 *   properties (side, plan kind, slice count).
 *
 * Vercel Analytics (page views, Web Vitals) keeps running alongside; PostHog adds product events.
 */

type Props = Record<string, string | number | boolean | null | undefined>;

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

let ph: PostHog | null = null;
let started = false;
// events fired before the client finishes loading, replayed once it does (bounded)
const queue: [string, Props | undefined][] = [];

const dntOn = () => {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { msDoNotTrack?: string };
  return n.doNotTrack === "1" || n.msDoNotTrack === "1" || (window as Window & { doNotTrack?: string }).doNotTrack === "1";
};

export const analyticsEnabled = () => Boolean(KEY) && !dntOn();

export async function initAnalytics(): Promise<void> {
  if (started || !analyticsEnabled() || typeof window === "undefined") return;
  started = true;
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.init(KEY!, {
      api_host: HOST,
      persistence: "memory",
      person_profiles: "always",
      capture_pageview: false, // client-side navigation: pageviews are sent from the router
      capture_pageleave: true,
      autocapture: true, // clicks on buttons and links; input values are never captured
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true, // no feature flags in use: skip that request
      respect_dnt: true,
      // every event carries the page URL; keep the trade amount out of it
      before_send: (event) => {
        const url = event?.properties?.$current_url;
        if (event && typeof url === "string") event.properties.$current_url = publicUrl(url);
        return event;
      },
    });
    ph = posthog;
    for (const [e, p] of queue.splice(0)) ph.capture(e, p);
  } catch {
    /* analytics must never break the app */
  }
}

/** Record a product event. A no-op when analytics is off. */
export function track(event: string, props?: Props): void {
  if (!analyticsEnabled()) return;
  if (ph) ph.capture(event, props);
  else if (queue.length < 50) queue.push([event, props]);
}

/** URL parameters that never go to analytics. `amt` is the amount typed on the trade ticket,
 *  which lives in the URL so a link can carry a trade. */
const PRIVATE_PARAMS = ["amt"];

/** The query string without the private parameters ("?tab=trade&amt=5" → "?tab=trade"). */
export function publicSearch(search: string): string {
  const p = new URLSearchParams(search);
  for (const k of PRIVATE_PARAMS) p.delete(k);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function publicUrl(href: string): string {
  try {
    const u = new URL(href);
    u.search = publicSearch(u.search);
    return u.toString();
  } catch {
    return href;
  }
}

/** A page view for the route (`/app?tab=trade` → path "/app", query "tab=trade"). `search` is
 *  expected already stripped of private parameters (see `publicSearch`). */
export function trackPageview(pathname: string, search: string): void {
  track("$pageview", {
    $current_url: typeof window !== "undefined" ? publicUrl(window.location.href) : undefined,
    path: pathname,
    query: search.replace(/^\?/, "") || undefined,
  });
}
