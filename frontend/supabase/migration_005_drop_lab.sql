-- ============================================================================
-- Migration 005 — drop the Detector Lab's storage
-- Run in the Supabase SQL editor after migration_004.
--
-- The Detector Lab was removed from the app. Two pieces of schema existed only
-- to serve it:
--
--   * `detector_configs` held slider calibrations saved for sharing by URL.
--     Nothing reads or writes it now.
--   * `detector_samples.wad` carried the DetectorSample event's raw WAD integers
--     as decimal strings, so the Lab's off-chain replay could reproduce the
--     chain exactly rather than approximately. The charts only ever used the
--     numeric columns, which are untouched.
--
-- `ai_notes` is deliberately NOT dropped: the regime narration on the Analytics
-- screen still uses it.
-- ============================================================================

drop table if exists public.detector_configs;

alter table public.detector_samples drop column if exists wad;
