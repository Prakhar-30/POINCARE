import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { Landing } from "@/pages/Landing";
import { loadAppRoute } from "@/app/preload";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// /app (screens, wallet connectors, RainbowKit) is its own chunk: the landing page does not
// download it. The fallback is the app's own background, so the hand-off shows no flash.
const AppRoute = lazy(loadAppRoute);
const Developers = lazy(() => import("@/pages/Developers").then((m) => ({ default: m.Developers })));

// HashRouter (URLs like /#/app) so a hard refresh on any route always loads
// index.html; works on any static host with no server rewrite config.
export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Suspense fallback={<div className="min-h-screen" style={{ background: "var(--app-bg)" }} />}><AppRoute /></Suspense>} />
          <Route path="/developers" element={<Suspense fallback={<div className="min-h-screen" style={{ background: "var(--page)" }} />}><Developers /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Analytics />
      </HashRouter>
    </ErrorBoundary>
  );
}
