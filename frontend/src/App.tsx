import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { Landing } from "@/pages/Landing";
import { loadAppRoute } from "@/app/preload";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { trackPageview } from "@/lib/telemetry";

// /app (screens, wallet connectors, RainbowKit) is its own chunk: the landing page does not
// download it. The fallback is the app's own background, so the hand-off shows no flash.
const AppRoute = lazy(loadAppRoute);
const Docs = lazy(() => import("@/pages/Docs").then((m) => ({ default: m.Docs })));
const docsFallback = <div className="min-h-screen lx" />;

/** The docs lived at /developers until they moved to /docs; old links (npm READMEs, shared URLs)
 *  land on the same page. */
function OldDocsRedirect() {
  const { slug } = useParams();
  return <Navigate to={slug ? `/docs/${slug}` : "/docs"} replace />;
}

/** One PostHog page view per route change (the HashRouter never reloads the page). */
function PageviewTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => trackPageview(pathname, search), [pathname, search]);
  return null;
}

// HashRouter (URLs like /#/app) so a hard refresh on any route always loads
// index.html; works on any static host with no server rewrite config.
export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Suspense fallback={<div className="min-h-screen" style={{ background: "var(--app-bg)" }} />}><AppRoute /></Suspense>} />
          <Route path="/docs" element={<Suspense fallback={docsFallback}><Docs /></Suspense>} />
          <Route path="/docs/:slug" element={<Suspense fallback={docsFallback}><Docs /></Suspense>} />
          <Route path="/developers" element={<OldDocsRedirect />} />
          <Route path="/developers/:slug" element={<OldDocsRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <PageviewTracker />
        <Analytics />
      </HashRouter>
    </ErrorBoundary>
  );
}
