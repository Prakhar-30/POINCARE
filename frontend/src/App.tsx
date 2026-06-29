import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "@/pages/Landing";
import { AppShell } from "@/app/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// HashRouter (URLs like /#/app) so a hard refresh on any route always loads
// index.html — works on every static host / IPFS with no server rewrite config.
export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<AppShell />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}
