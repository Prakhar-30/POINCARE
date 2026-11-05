-- ============================================================================
-- Migration 007 — make the tape read-only to the public
-- Run ONLY after:
--   1. the `record` edge function is deployed with its secrets set
--      (see supabase/functions/record/index.ts), and
--   2. the frontend calls it instead of inserting directly (recordSwap,
--      recordLpEvent and recordDetectorSamples in src/lib/db.ts invoke
--      "record"; see SECURITY-BACKEND.md for the exact change).
-- Running it before step 2 is safe for the chain and the data, but the live
-- site would stop adding new swaps to the tape until the client is updated.
--
-- After this, every row in swaps / lp_events / detector_samples was written by
-- the edge function (service role, which bypasses RLS) after it checked the
-- transaction on chain. The anon key can read, and can call touch_wallet().
-- Nothing else.
-- ============================================================================

drop policy if exists "anon_write_swaps"               on public.swaps;
drop policy if exists "anon_write_lp_events"           on public.lp_events;
drop policy if exists "anon insert detector_samples"   on public.detector_samples;

revoke insert on public.swaps, public.lp_events, public.detector_samples, public.pool_snapshots, public.wallets
from anon, authenticated;
