import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.css";
import { App } from "./App";
import { Providers } from "./providers/Providers";
import { installSoftScrollbars } from "./lib/softScrollbars";
import { initAnalytics } from "./lib/telemetry";

installSoftScrollbars();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);

// after the first render, so analytics never delays the page; inert without VITE_POSTHOG_KEY
void initAnalytics();
