import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { Landing } from "@/pages/Landing";
import { loadAppRoute } from "@/app/preload";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { trackPageview } from "@/lib/telemetry";

// /app (screens, wallet connectors, RainbowKit) is its own chunk: the landing page does not
// download it. The fallback is the app's own background, so the hand-off shows no flash.
const AppRoute = lazy(loadAppRoute);
const docsFallback = <div className="min-h-screen lx" />;

// The docs are their own chunk too. A docs URL opened directly arrives as static HTML (the build
// prerenders every page), so main.tsx loads this chunk BEFORE mounting: React then draws the page
// in its first frame, straight over the identical static copy, instead of flashing the fallback.
let DocsLoaded: ComponentType | null = null;
const loadDocs = () => import("@/pages/Docs").then((m) => { DocsLoaded = m.Docs; return { default: m.Docs }; });
const DocsLazy = lazy(loadDocs);
export const preloadDocs = () => loadDocs().then(() => undefined);
function Docs() {
  const Ready = DocsLoaded;
  return Ready ? <Ready /> : <Suspense fallback={docsFallback}><DocsLazy /></Suspense>;
}

/** The docs lived at /developers until they moved to /docs; old links (npm READMEs, shared URLs)
 *  land on the same page. */
function OldDocsRedirect() {
  const { slug } = useParams();
  return <Navigate to={slug ? `/docs/${slug}` : "/docs"} replace />;
}

/** One PostHog page view per route change (client-side navigation never reloads the page). */
function PageviewTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => trackPageview(pathname, search), [pathname, search]);
  return null;
}

// Real paths (/docs/sdk, /app), so every page has its own URL that search engines and AI
// crawlers can index; vercel.json rewrites unknown paths to index.html, and the build writes
// each docs page out as static HTML (scripts/prerender.mjs). Links from before the move
// (/#/docs/sdk, in published npm READMEs and shared posts) are redirected in main.tsx.
export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Suspense fallback={<div className="min-h-screen" style={{ background: "var(--app-bg)" }} />}><AppRoute /></Suspense>} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:slug" element={<Docs />} />
          <Route path="/developers" element={<OldDocsRedirect />} />
          <Route path="/developers/:slug" element={<OldDocsRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <PageviewTracker />
        <Analytics />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
