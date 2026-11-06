/**
 * `poincare-api` — the public HTTP API for Poincaré's trend regime and spread-aware DCA orders.
 *
 * Stateless and read-only toward the chain: every answer is read at request time, and every
 * write comes back as an UNSIGNED transaction for the caller's own wallet. It never holds keys or
 * funds. The logic lives in packages/api (tested there) and ships as the self-contained bundle
 * in ../_shared/poincare.js.
 *
 *   GET  /regime   /regime/history?blocks=   /quote?side=&amount=   /health
 *   GET  /dca/orders?owner=   /dca/orders/:id
 *   POST /dca/plan   /dca/tx/create   /dca/tx/execute   /dca/tx/cancel   /dca/tx/close-expired
 *
 * Deploy:
 *   supabase functions deploy poincare-api --no-verify-jwt
 *   supabase secrets set POINCARE_DCA_ADDRESS=0x...        # from deployments/unichain-sepolia-dca.json
 *     # optional: POINCARE_RPC_URL=https://...            # defaults to the public Unichain Sepolia RPC
 */
import { makeApi } from "../_shared/poincare.js";

const handle = makeApi({
  rpcUrl: Deno.env.get("POINCARE_RPC_URL") ?? undefined,
  dcaAddress: Deno.env.get("POINCARE_DCA_ADDRESS") ?? undefined,
});

Deno.serve(handle);
