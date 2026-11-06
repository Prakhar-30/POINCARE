-- ============================================================================
-- Migration 009 — DCA orders and fills, indexed from PoincareDCA's events
--
-- The dca-keeper edge function indexes every PoincareDCA event once a minute (after its keeper
-- pass) and writes here with the service role. The app reads these tables FIRST and only asks the
-- chain for what the index has not reached yet and for open orders' live verdict.
--
-- Reads are public (order state is public on chain anyway). Nobody but the service role can
-- write: there is no insert / update / delete policy for anon or authenticated.
--
-- Safe to re-run. Run it before (or right after) deploying the updated dca-keeper function.
-- ============================================================================

create table if not exists public.dca_orders (
  dca            text    not null,             -- PoincareDCA address, lowercase
  order_id       bigint  not null,
  owner          text    not null,             -- lowercase
  recipient      text    not null,
  side           text    not null check (side in ('buy', 'sell')),
  status         text    not null check (status in ('open', 'completed', 'refunded', 'cancelled')),
  paused         boolean not null default false,
  amount_in      numeric not null,             -- deposited, input token (USDC to buy, WETH to sell)
  spent          numeric not null,             -- swapped so far
  remaining      numeric not null,
  refunded       numeric not null default 0,
  amount_out     numeric not null,             -- delivered to the recipient
  fills          integer not null,
  slices         integer not null,             -- planned fills (lifetime, after edits)
  interval_sec   integer not null,
  start_time     timestamptz not null,
  deadline       timestamptz not null,
  max_spread_bps integer not null,
  pause_on_trend boolean not null,
  catch_up       boolean not null,
  created_block  bigint,
  updated_block  bigint  not null,
  updated_at     timestamptz not null default now(),
  primary key (dca, order_id)
);
create index if not exists dca_orders_owner_idx on public.dca_orders (owner, order_id desc);

create table if not exists public.dca_fills (
  id           bigint generated always as identity primary key,
  dca          text    not null,
  order_id     bigint  not null,
  owner        text    not null,
  side         text    not null check (side in ('buy', 'sell')),
  slot         integer not null,
  amount_in    numeric not null,
  amount_out   numeric not null,
  price        numeric not null,               -- USDC per WETH at execution
  spread_bps   integer not null,               -- trend spread this fill paid
  block_number bigint  not null,
  ts           timestamptz not null,
  tx_hash      text    not null,
  log_index    integer not null,
  unique (tx_hash, log_index)
);
create index if not exists dca_fills_owner_idx on public.dca_fills (owner, ts desc);
create index if not exists dca_fills_order_idx on public.dca_fills (dca, order_id);

-- where the indexer resumes, per PoincareDCA deployment
create table if not exists public.dca_index_cursor (
  dca        text primary key,
  last_block bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.dca_orders       enable row level security;
alter table public.dca_fills        enable row level security;
alter table public.dca_index_cursor enable row level security;

drop policy if exists "anon_read_dca_orders" on public.dca_orders;
drop policy if exists "anon_read_dca_fills"  on public.dca_fills;
create policy "anon_read_dca_orders" on public.dca_orders for select using (true);
create policy "anon_read_dca_fills"  on public.dca_fills  for select using (true);
-- the cursor is internal: no policy, so anon cannot read or write it

revoke insert, update, delete, truncate on public.dca_orders, public.dca_fills, public.dca_index_cursor from anon, authenticated;
grant select on public.dca_orders, public.dca_fills to anon, authenticated;

-- Check (after a keeper tick):
--   select * from public.dca_index_cursor;
--   select order_id, owner, status, spent, refunded from public.dca_orders order by order_id desc limit 10;
--   select order_id, ts, amount_in, amount_out, spread_bps from public.dca_fills order by ts desc limit 10;
