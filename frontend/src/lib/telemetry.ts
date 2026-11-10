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
 * - Never sends wallet addresses, balances or amounts: events carry only coarse, non-identifying
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
      capture_pageview: false, // the HashRouter changes only the hash; pageviews are sent from the router
      capture_pageleave: true,
      autocapture: true, // clicks on buttons and links; input values are never captured
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true, // no feature flags in use: skip that request
      respect_dnt: true,
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

/** A page view for the hash route (`/#/app?tab=trade` → path "/app", query "tab=trade"). */
export function trackPageview(pathname: string, search: string): void {
  track("$pageview", {
    $current_url: typeof window !== "undefined" ? window.location.href : undefined,
    path: pathname,
    query: search.replace(/^\?/, "") || undefined,
  });
}
