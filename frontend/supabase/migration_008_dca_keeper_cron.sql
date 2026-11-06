-- ============================================================================
-- Migration 008 — run the DCA keeper every minute
-- Run in the Supabase SQL editor AFTER:
--   1. PoincareDCA is deployed and the keeper address is allowlisted on it, and
--   2. the `dca-keeper` edge function is deployed with its secrets
--      (POINCARE_DCA_ADDRESS, KEEPER_PRIVATE_KEY, DCA_KEEPER_SECRET).
--
-- Before running, replace <DCA_KEEPER_SECRET> below with the SAME value you set as the function's
-- DCA_KEEPER_SECRET secret. It is stored in Supabase Vault (encrypted), not in this file's
-- history: do not commit the real value.
--
-- Safe to re-run: the job is unscheduled first, and the secret is only created if missing.
-- Nothing here touches the tape tables (swaps, lp_events, detector_samples).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- the shared secret the function checks in its x-keeper-secret header
select vault.create_secret('<DCA_KEEPER_SECRET>', 'dca_keeper_secret', 'Shared secret for the dca-keeper edge function')
where not exists (select 1 from vault.secrets where name = 'dca_keeper_secret');

select cron.unschedule('dca-keeper') where exists (select 1 from cron.job where jobname = 'dca-keeper');

select cron.schedule(
  'dca-keeper',
  '* * * * *', -- every minute; orders' slots are at least 60 s apart
  $$
  select net.http_post(
    url := 'https://gogjpdgluflntcgsarhn.supabase.co/functions/v1/dca-keeper',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-keeper-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dca_keeper_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Check it is running (each row is one tick; status_code 200 = a keeper pass completed):
--   select * from cron.job where jobname = 'dca-keeper';
--   select id, status_code, left(content::text, 300) from net._http_response order by id desc limit 10;
-- Stop it:
--   select cron.unschedule('dca-keeper');
