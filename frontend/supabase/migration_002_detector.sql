-- ============================================================================
-- Migration 002 — detector history + multi-deployment support
-- Run in the Supabase SQL editor (Dashboard -> SQL -> New query -> Run).
--
-- 1. `detector_samples`: the hook's per-block DetectorSample event, mirrored from
--    chain so the detector chart has history beyond the RPC's log window. Rows are
--    derived purely from on-chain logs (any client can sync them; the unique key
--    makes the sync idempotent and duplicate-proof).
-- 2. A `hook` column on the existing tables so rows from different deployments
--    don't mix after a redeploy (old rows keep hook = null).
-- ============================================================================

create table if not exists public.detector_samples (
  id            bigint generated always as identity primary key,
  hook          text not null,                    -- lowercased hook address
  block_number  bigint not null,
  ts            timestamptz not null default now(),
  price         numeric not null,                 -- USDC per WETH (UI orientation)
  r             numeric not null default 0,       -- clipped log-return consumed
  s_pos         numeric not null default 0,       -- CUSUM up-evidence
  s_neg         numeric not null default 0,       -- CUSUM down-evidence
  d             numeric not null default 0,       -- directional efficiency
  sigma         numeric not null default 0,       -- live volatility estimate
  kappa         numeric not null default 0,       -- asymmetry intensity
  trend         text not null default 'none',     -- none | up | down (UI orientation)
  fee           numeric not null default 0,       -- vol fee in force
  unique (hook, block_number)
);
create index if not exists detector_samples_hook_block_idx
  on public.detector_samples (hook, block_number desc);

alter table public.detector_samples enable row level security;
drop policy if exists "anon read detector_samples" on public.detector_samples;
create policy "anon read detector_samples" on public.detector_samples for select using (true);
drop policy if exists "anon insert detector_samples" on public.detector_samples;
create policy "anon insert detector_samples" on public.detector_samples for insert with check (true);

-- ---- scope existing tables to a deployment ---------------------------------
alter table public.swaps add column if not exists hook text;
alter table public.lp_events add column if not exists hook text;
create index if not exists swaps_hook_idx on public.swaps (hook);
create index if not exists lp_events_hook_idx on public.lp_events (hook);
