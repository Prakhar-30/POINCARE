import { AppProviders } from "@/providers/AppProviders";
import { AppShell } from "./AppShell";

/** /app with its wallet layer: one lazily loaded chunk, so the landing page never ships it. */
export default function AppRoute() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}
