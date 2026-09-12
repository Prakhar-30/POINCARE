-- ============================================================================
-- Migration 004 — Detector Lab: shared calibrations + the AI explanation cache
-- Run in the Supabase SQL editor after migration_003.
--
-- 1. `detector_configs`: a parameter set someone dialled in, saved under a short
--    slug so a calibration can be shared as a URL (#/app?lab=<slug>) instead of
--    described in prose. Rows are immutable once written — a "change" is a new
--    slug, so a shared link can never silently mean something else later.
-- 2. `ai_notes`: the Gemini explanation cache. Generation is metered by a free
--    tier, and the same question (same block, or same configuration) has the
--    same answer, so every note is written once and served from here after.
--    The cache is the rate-limit strategy, not an optimisation.
-- ============================================================================

-- ---- exact replay inputs on detector_samples ---------------------------------
-- The existing numeric columns are for charting, and a float round-trip costs the
-- low digits of an 18-decimal fixed-point value. The Lab's claim is that
-- replaying the deployed parameters reproduces the chain EXACTLY, so the raw WAD
-- integers are kept verbatim as decimal strings alongside them.
--
-- Nullable and additive: rows synced before this migration keep working, and the
-- replay falls back to the numeric columns for them (approximate, but charted
-- identically). One jsonb column rather than six text ones, so a future field in
-- the event does not need another migration.
alter table public.detector_samples add column if not exists wad jsonb;

-- ---- detector_configs: shareable calibrations --------------------------------
create table if not exists public.detector_configs (
  slug        text primary key,                  -- short, URL-safe, client-generated
  hook        text not null,                     -- lowercased hook address
  created_at  timestamptz not null default now(),
  label       text,                              -- optional human name
  author      text,                              -- lowercased wallet, optional
  params      jsonb not null                     -- WAD values as decimal strings
);
create index if not exists detector_configs_hook_idx
  on public.detector_configs (hook, created_at desc);

-- ---- ai_notes: cached model output -------------------------------------------
create table if not exists public.ai_notes (
  id          bigint generated always as identity primary key,
  hook        text not null,
  kind        text not null,                     -- 'regime' | 'lab'
  cache_key   text not null,                     -- block number, or a config digest
  model       text,
  body        text not null,
  created_at  timestamptz not null default now(),
  unique (hook, kind, cache_key)
);
create index if not exists ai_notes_lookup_idx
  on public.ai_notes (hook, kind, created_at desc);

-- ---- RLS: public demo, read-all -----------------------------------------------
-- Notes are written ONLY by the `explain` edge function (service role, which
-- bypasses RLS), so there is deliberately no anon insert policy here: the model
-- budget is not something an anonymous client should be able to spend or forge.
alter table public.detector_configs enable row level security;
alter table public.ai_notes         enable row level security;

drop policy if exists "anon_read_detector_configs" on public.detector_configs;
create policy "anon_read_detector_configs" on public.detector_configs for select using (true);

drop policy if exists "anon_write_detector_configs" on public.detector_configs;
create policy "anon_write_detector_configs" on public.detector_configs for insert with check (true);

drop policy if exists "anon_read_ai_notes" on public.ai_notes;
create policy "anon_read_ai_notes" on public.ai_notes for select using (true);
