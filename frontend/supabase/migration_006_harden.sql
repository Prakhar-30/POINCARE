-- ============================================================================
-- Migration 006 — harden the public demo without changing the app
-- Run in the Supabase SQL editor after migration_005. Safe to run while the
-- current frontend is live: nothing the app does today stops working.
--
-- What it does, and why:
--  1. Removes write paths the app never uses. `wallets` is only written through
--     the touch_wallet() RPC (security definer), so the anon INSERT and the
--     anon UPDATE "using (true)" policy (which let anyone rewrite ANY wallet's
--     row, label and first_seen included) go. `pool_snapshots` has no writer.
--  2. Revokes UPDATE / DELETE / TRUNCATE from anon and authenticated on every
--     table. RLS already refuses them (no policy), this is defence in depth in
--     case a permissive policy is ever added by mistake.
--  3. Adds CHECK constraints so a row has to look like a real trade: hex
--     formats, enums, non-negative amounts, spreads within [0, 1], an LVR that
--     cannot exceed the trade's notional. They are NOT VALID, so existing rows
--     are not re-checked (no risk of the migration failing on a legacy row);
--     every new row is. Run the VALIDATE block at the end once you are happy.
--  4. Hardens touch_wallet(): rejects anything that is not a 0x address, so the
--     RPC cannot be used to fill `wallets` with arbitrary text.
--  5. Adds the composite indexes the app's queries actually use (every read is
--     "this hook, newest first", often also "this wallet"), and a per-hook
--     totals view so the client does not page every swap to sum them.
--
-- This does NOT stop a caller with the anon key from inserting a well-formed
-- but fake swap. That needs the `record` edge function + migration_007.
-- ============================================================================

-- ---- 1. drop unused write paths ---------------------------------------------
drop policy if exists "anon_write_wallets"        on public.wallets;
drop policy if exists "anon_update_wallets"       on public.wallets;
drop policy if exists "anon_write_pool_snapshots" on public.pool_snapshots;

-- ---- 2. defence in depth: no destructive verbs for public roles -------------
revoke update, delete, truncate on
  public.wallets, public.swaps, public.lp_events, public.pool_snapshots,
  public.detector_samples, public.ai_notes
from anon, authenticated;

-- ---- 3. shape constraints (NOT VALID: new rows only) -------------------------
alter table public.swaps
  add constraint swaps_tx_hash_fmt   check (tx_hash ~ '^0x[0-9a-fA-F]{64}$') not valid,
  add constraint swaps_trader_fmt    check (trader ~ '^0x[0-9a-f]{40}$') not valid,
  add constraint swaps_hook_fmt      check (hook is null or hook ~ '^0x[0-9a-f]{40}$') not valid,
  add constraint swaps_side_enum     check (side in ('buy_weth', 'sell_weth')) not valid,
  add constraint swaps_trend_enum    check (trend in ('none', 'up', 'down')) not valid,
  add constraint swaps_amounts_pos   check (amount_in >= 0 and amount_out >= 0 and price >= 0) not valid,
  add constraint swaps_notional_rng  check (notional_usdc >= 0 and notional_usdc < 1e12) not valid,
  add constraint swaps_kappa_rng     check (kappa >= 0 and kappa <= 1 and spread_frac >= 0 and spread_frac <= 1) not valid,
  add constraint swaps_lvr_rng       check (lvr_captured_usdc >= 0 and lvr_captured_usdc <= notional_usdc) not valid,
  add constraint swaps_block_pos     check (block_number is null or block_number > 0) not valid;

alter table public.lp_events
  add constraint lp_tx_hash_fmt  check (tx_hash ~ '^0x[0-9a-fA-F]{64}$') not valid,
  add constraint lp_wallet_fmt   check (wallet ~ '^0x[0-9a-f]{40}$') not valid,
  add constraint lp_hook_fmt     check (hook is null or hook ~ '^0x[0-9a-f]{40}$') not valid,
  add constraint lp_kind_enum    check (kind in ('add', 'remove')) not valid,
  add constraint lp_amounts_pos  check (shares >= 0 and amount0 >= 0 and amount1 >= 0 and value_usdc >= 0 and value_usdc < 1e12) not valid;

alter table public.detector_samples
  add constraint ds_hook_fmt    check (hook ~ '^0x[0-9a-f]{40}$') not valid,
  add constraint ds_block_pos   check (block_number > 0) not valid,
  add constraint ds_trend_enum  check (trend in ('none', 'up', 'down')) not valid,
  add constraint ds_ranges      check (price >= 0 and d >= 0 and d <= 1 and kappa >= 0 and kappa <= 1 and sigma >= 0 and fee >= 0) not valid;

alter table public.wallets
  add constraint wallets_address_fmt check (address ~ '^0x[0-9a-f]{40}$') not valid,
  add constraint wallets_label_len   check (label is null or length(label) <= 64) not valid;

-- ---- 4. touch_wallet: only ever a lowercased 0x address ----------------------
create or replace function public.touch_wallet(addr text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare a text := lower(addr);
begin
  if a !~ '^0x[0-9a-f]{40}$' then
    raise exception 'touch_wallet: not an address' using errcode = '22023';
  end if;
  insert into public.wallets (address, first_seen, last_seen, visit_count)
  values (a, now(), now(), 1)
  on conflict (address) do update
    set last_seen = now(),
        visit_count = public.wallets.visit_count + 1;
end;
$$;
revoke all on function public.touch_wallet(text) from public;
grant execute on function public.touch_wallet(text) to anon, authenticated;

-- ---- 5. indexes for the real query shapes -------------------------------------
-- tape / totals / history:   where hook = $1 order by ts desc
create index if not exists swaps_hook_ts_idx        on public.swaps (hook, ts desc);
-- "your activity":           where hook = $1 and trader = $2 order by ts desc
create index if not exists swaps_hook_trader_ts_idx on public.swaps (hook, trader, ts desc);
-- "your liquidity history":  where hook = $1 and wallet = $2 order by ts desc
create index if not exists lp_events_hook_wallet_ts_idx on public.lp_events (hook, wallet, ts desc);

-- per-hook totals in one row, so the client stops paging every swap to add them up
-- (v_pool_totals sums ALL hooks, which is why the client stopped using it)
create or replace view public.v_pool_totals_by_hook
with (security_invoker = true) as
select
  hook,
  coalesce(sum(lvr_captured_usdc), 0)::numeric as lvr_avoided,
  coalesce(sum(notional_usdc), 0)::numeric     as volume_usdc,
  count(*)::bigint                              as swap_count,
  coalesce(sum(notional_usdc) filter (where ts > now() - interval '24 hours'), 0)::numeric as volume_24h
from public.swaps
group by hook;
grant select on public.v_pool_totals_by_hook to anon, authenticated;

-- ---- optional, once you have checked the legacy rows -------------------------
-- Each line fails (harmlessly, nothing changes) if an old row breaks the rule;
-- find it with the matching WHERE NOT (...) query before re-running.
-- alter table public.swaps            validate constraint swaps_tx_hash_fmt;
-- alter table public.swaps            validate constraint swaps_trader_fmt;
-- alter table public.swaps            validate constraint swaps_side_enum;
-- alter table public.swaps            validate constraint swaps_trend_enum;
-- alter table public.swaps            validate constraint swaps_amounts_pos;
-- alter table public.swaps            validate constraint swaps_notional_rng;
-- alter table public.swaps            validate constraint swaps_kappa_rng;
-- alter table public.swaps            validate constraint swaps_lvr_rng;
-- alter table public.lp_events        validate constraint lp_kind_enum;
-- alter table public.detector_samples validate constraint ds_trend_enum;
-- alter table public.wallets          validate constraint wallets_address_fmt;
