import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** True when Supabase env is configured; lets the app degrade gracefully without it. */
export const supabaseReady = Boolean(url && key);

// A single shared client. Anon/publishable key only — never the service key.
export const supabase = createClient(url ?? "http://localhost", key ?? "anon", {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 5 } },
});
