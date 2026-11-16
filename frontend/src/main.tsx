import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.css";
import { App, preloadDocs } from "./App";
import { Providers } from "./providers/Providers";
import { installSoftScrollbars } from "./lib/softScrollbars";
import { initAnalytics } from "./lib/telemetry";

// The site used hash routes (/#/docs/sdk) until every page got a real path. Old links are still
// out there (npm READMEs, shared posts), so rewrite them to the new path before the router reads
// the URL. An in-page anchor (#section) is left alone.
if (window.location.hash.startsWith("#/")) {
  window.history.replaceState(null, "", window.location.hash.slice(1));
}

installSoftScrollbars();

const root = document.getElementById("root")!;
const mount = () =>
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Providers>
        <App />
      </Providers>
    </React.StrictMode>,
  );

// A prerendered docs page is already on screen as static HTML. Fetch the docs chunk first, so the
// app replaces it with the same page in one frame; every other entry mounts at once, as before.
if (root.hasChildNodes() && window.location.pathname.startsWith("/docs")) void preloadDocs().then(mount, mount);
else mount();

// after the first render, so analytics never delays the page; inert without VITE_POSTHOG_KEY
void initAnalytics();
