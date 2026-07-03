-- ============================================================================
-- Migration 003 — wallet analytics (new vs returning users)
-- Run in the Supabase SQL editor after migration_002.
--
-- `touch_wallet` is called once per browser session per connected wallet: it
-- inserts the wallet on first sight and bumps last_seen + visit_count after.
-- `v_wallet_totals` aggregates the numbers the dashboard shows.
-- ============================================================================

alter table public.wallets add column if not exists visit_count integer not null default 1;

create or replace function public.touch_wallet(addr text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.wallets (address, first_seen, last_seen, visit_count)
  values (lower(addr), now(), now(), 1)
  on conflict (address) do update
    set last_seen = now(),
        visit_count = public.wallets.visit_count + 1;
$$;

grant execute on function public.touch_wallet(text) to anon;

create or replace view public.v_wallet_totals
with (security_invoker = true) as
select
  count(*)::int                                          as total_wallets,
  count(*) filter (where first_seen > now() - interval '7 days')::int  as new_7d,
  count(*) filter (where visit_count > 1)::int           as returning_wallets,
  count(*) filter (where last_seen > now() - interval '24 hours')::int as active_24h
from public.wallets;
