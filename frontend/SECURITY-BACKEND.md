# Backend and web security: what to apply

Each step is written out for you to run; status is noted per section. Contract security is
covered in `../SECURITY.md`.

## 1. Supabase: `supabase/migration_006_harden.sql` (applied)

Applied in the SQL editor; every check of the verification query passed. Safe while the site is live. It removes the write paths the app never uses (direct
INSERT/UPDATE on `wallets`, INSERT on `pool_snapshots`) and revokes UPDATE/DELETE/TRUNCATE from
the public roles. It adds shape constraints for new rows, validates the address in
`touch_wallet()`, and adds the composite indexes the app's queries use. It also creates
`v_pool_totals_by_hook`, which `fetchPoolTotals` already reads when it exists (until then it
falls back to paging).

## 2. Supabase, next: verified writes

Today anyone holding the public anon key, which ships in the bundle, can INSERT a well-formed
fake row into `swaps`, `lp_events` or `detector_samples`. That moves the "Kept for LPs" figure
and every other aggregate the site shows. The fix takes the write path server-side:

The client side is done: `recordSwap`, `recordLpEvent` and `recordDetectorSamples` in
`src/lib/db.ts` call the function with the transaction hash only (samples: a block range, split
into 1000-block chunks). The function re-reads amounts, sender, block time and spread from the
receipt. A write that fails on our side (RPC outage, network, function down) is queued in
`localStorage` and retried the next time the app opens; one the function rejects (bad or
foreign transaction, HTTP 400/422) is dropped.

Remaining, in this order:

1. Deploy the function and set its secrets, from `frontend/`:

   ```sh
   npx supabase login
   npx supabase link --project-ref gogjpdgluflntcgsarhn
   npx supabase functions deploy record --no-verify-jwt
   npx supabase secrets set RECORD_ALLOWED_HOOKS=0x89a520e7faed35cb6f89b0040f5bc5ade035aa88 \
     RECORD_USDC=0x1b4034d6c443eff3d2e9051a08147ef9ed8ebc70 RECORD_WETH=0x26b5d554c8118f247d5fa8a469ff3a3d3084a449 \
     RECORD_ALLOWED_ORIGINS=https://www.poincaretrade.in,https://poincaretrade.in,https://poincare-beta.vercel.app
   # optional, recommended: a dedicated RPC first, the public one as fallback
   npx supabase secrets set RECORD_RPC_URL=https://<provider-url>,https://sepolia.unichain.org
   ```

   `--no-verify-jwt` is required: the site's publishable key is not a JWT.
2. Smoke-test: post an already-recorded swap's hash. Expect `{"stored":false,"duplicate":true}`
   (verified on chain, nothing written).
3. Ship this frontend, make one test swap, and confirm it reaches the tape.
4. Run `supabase/migration_007_verified_writes.sql`. The tables are then read-only to the
   public. Confirm with an anon insert of a deliberately invalid row: it must fail with
   `42501` (permission denied), not `23514` (a constraint).

Scripts: `trend.mjs` records through the function like the app. `replay.mjs` and
`probe-replay-cex.mjs` stamp each row with the historical candle's date, which the function
cannot do (it uses block time), so they write directly with the admin key from
`frontend/.env.local` (`SUPABASE_SERVICE_ROLE_KEY=...`, gitignored). Never put that key in a
`VITE_` variable.

To undo migration 007:

```sql
grant insert on public.swaps, public.lp_events, public.detector_samples to anon, authenticated;
create policy "anon_write_swaps" on public.swaps for insert with check (true);
create policy "anon_write_lp_events" on public.lp_events for insert with check (true);
create policy "anon insert detector_samples" on public.detector_samples for insert with check (true);
```

## 3. Vercel: `vercel.json` (in this folder)

`vercel.json` adds HSTS (two years, deliberately without `includeSubDomains` or `preload`:
preloading is hard to undo and binds every future subdomain to HTTPS), nosniff, `X-Frame-Options: DENY`, a referrer policy and a
permissions policy. It also sets long-lived caching for hashed `/assets/*`.

- **Project root:** Vercel only reads `vercel.json` from the project's root directory.
  Confirm the project's Root Directory is `frontend`. If it is the repo root, move the file
  there.
- **CSP is report-only for now:** the Content Security Policy ships as
  `Content-Security-Policy-Report-Only`, so it cannot break a wallet flow.
- **Before enforcing it:**
  1. On a preview deploy, open the console.
  2. Connect with MetaMask, WalletConnect (QR) and Coinbase.
  3. Do a swap and a deposit.
  4. Add any host the console reports as blocked.
  5. Rename the header to `Content-Security-Policy`.

## 4. Dependencies

`pnpm audit --prod` reports 16 high, 29 moderate and 2 low findings, all transitive through the
wallet connectors (wagmi → @wagmi/connectors → MetaMask SDK / Porto / WalletConnect): axios,
follow-redirects, ws, socket.io-parser, decode-uri-component, zod, hono.

Most of these sit on Node-only code paths (HTTP adapters, websocket servers) and are not
reachable in the browser bundle. The clean fix is upgrading `wagmi` and `@rainbow-me/rainbowkit`
to their latest 2.x releases, then running `pnpm install && pnpm build` and smoke-testing a
connect, a swap and a deposit.

If the upgrade does not clear them, pin the patched versions with these overrides in
`package.json`:

```json
"pnpm": { "overrides": { "axios": "^1.20.0", "follow-redirects": "^1.16.2", "socket.io-parser": "^4.2.7", "ws@8": "^8.21.0" } }
```

Leave `zod` alone unless the tree is already on zod 4: its patched line is a major version.

## 5. Small follow-ups

- **Supabase dashboard:**
  - Turn on the API rate limits (Auth → Rate Limits).
  - Keep "Enforce SSL" on.
  - Make sure no service-role key exists outside the edge-function secrets.
  - Rotate the publishable key only if you ever suspect a leak. It is public by design.
- **Wallet privacy:** `wallets` is readable by anyone: addresses, first/last seen and visit
  counts. If that matters, drop `anon_read_wallets` and serve `fetchWalletProfile` through an
  RPC that returns one row for one address.
- **CI:** `.github/workflows/test.yml` runs only Foundry. Add a frontend job:
  `pnpm install --frozen-lockfile && pnpm typecheck && pnpm build && pnpm audit --prod --audit-level=high`.
