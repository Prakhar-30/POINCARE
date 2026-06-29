-- ============================================================================
-- Poincaré backend schema (Supabase / Postgres)
-- Run once in the Supabase SQL editor (Dashboard -> SQL -> New query -> Run).
--
-- Two jobs (per the product brief):
--   1. Identify a returning wallet and remember its positions.
--   2. Track every swap order so the app can show the tape AND quantify the
--      LVR retained for LPs vs a normal constant-product pool.
--
-- Security note: this is a public testnet demo with no private data, so RLS is
-- enabled with permissive anon policies (read-all + insert). Wallet ownership is
-- proven by the connected signer client-side; we don't gate writes by identity.
-- Do NOT store anything sensitive here.
-- ============================================================================

-- ---- wallets: identity across sessions -------------------------------------
create table if not exists public.wallets (
  address     text primary key,                 -- lowercased 0x address
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  label       text
);

-- ---- swaps: the order tape + per-trade LVR accounting ----------------------
create table if not exists public.swaps (
  id            bigint generated always as identity primary key,
  tx_hash       text unique not null,
  block_number  bigint,
  ts            timestamptz not null default now(),
  trader        text not null,                   -- wallet address
  zero_for_one  boolean not null,                -- input is currency0 (USDC)
  side          text not null,                   -- 'buy_weth' | 'sell_weth'
  amount_in     numeric not null,                -- human units of input token
  amount_out    numeric not null,                -- human units of output token
  price         numeric not null,                -- USDC per WETH at execution
  notional_usdc numeric not null,                -- USDC value of the trade
  kappa         numeric not null default 0,      -- lean intensity at execution
  trend         text    not null default 'none', -- none | up | down
  spread_frac   numeric not null default 0,      -- directional spread applied
  with_trend    boolean not null default false,  -- pushed with the detected trend
  -- LVR retained for LPs vs a 0-spread constant-product pool: the spread the
  -- Poincaré pool charged toxic (with-trend) flow, which a normal pool leaks to arbs.
  lvr_captured_usdc numeric not null default 0
);
create index if not exists swaps_ts_idx on public.swaps (ts desc);
create index if not exists swaps_trader_idx on public.swaps (trader);

-- ---- lp_events: add / remove liquidity (positions) -------------------------
create table if not exists public.lp_events (
  id          bigint generated always as identity primary key,
  tx_hash     text unique not null,
  ts          timestamptz not null default now(),
  wallet      text not null,
  kind        text not null,                     -- 'add' | 'remove'
  shares      numeric not null default 0,
  amount0     numeric not null default 0,        -- USDC
  amount1     numeric not null default 0,        -- WETH
  value_usdc  numeric not null default 0
);
create index if not exists lp_events_wallet_idx on public.lp_events (wallet);

-- ---- pool_snapshots: periodic state for charts -----------------------------
create table if not exists public.pool_snapshots (
  id            bigint generated always as identity primary key,
  ts            timestamptz not null default now(),
  block_number  bigint,
  r0            numeric,   -- USDC reserve
  r1            numeric,   -- WETH reserve
  price         numeric,   -- USDC per WETH
  kappa         numeric,
  trend         text
);
create index if not exists pool_snapshots_ts_idx on public.pool_snapshots (ts desc);

-- ---- aggregate view: pool-wide totals for the dashboard --------------------
create or replace view public.v_pool_totals
with (security_invoker = true) as
select
  coalesce(sum(lvr_captured_usdc), 0)::numeric as lvr_avoided,
  coalesce(sum(notional_usdc), 0)::numeric     as volume_usdc,
  count(*)::bigint                              as swap_count,
  coalesce(sum(notional_usdc) filter (where ts > now() - interval '24 hours'), 0)::numeric as volume_24h
from public.swaps;

-- ============================================================================
-- Row Level Security — permissive anon access for the public demo
-- ============================================================================
alter table public.wallets        enable row level security;
alter table public.swaps          enable row level security;
alter table public.lp_events      enable row level security;
alter table public.pool_snapshots enable row level security;

do $$
declare t text;
begin
  foreach t in array array['wallets','swaps','lp_events','pool_snapshots'] loop
    execute format('drop policy if exists "anon_read_%1$s" on public.%1$s;', t);
    execute format('drop policy if exists "anon_write_%1$s" on public.%1$s;', t);
    execute format('create policy "anon_read_%1$s"  on public.%1$s for select using (true);', t);
    execute format('create policy "anon_write_%1$s" on public.%1$s for insert with check (true);', t);
  end loop;
end $$;

-- wallets also needs UPDATE (to bump last_seen) under the demo policy
drop policy if exists "anon_update_wallets" on public.wallets;
create policy "anon_update_wallets" on public.wallets for update using (true) with check (true);

-- expose the aggregate view to the anon role
grant select on public.v_pool_totals to anon;

-- realtime: stream new swaps to the live tape (idempotent)
do $$ begin
  alter publication supabase_realtime add table public.swaps;
exception when duplicate_object then null;
end $$;
