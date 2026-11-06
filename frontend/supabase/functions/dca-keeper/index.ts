/**
 * `dca-keeper` — fills due DCA slices. Invoked every minute by pg_cron (migration_008).
 *
 * Each pass asks the PoincareDCA contract which open orders may fill right now (schedule, spread
 * cap, trend pause, limit price: all enforced on chain) and sends executeSlice for those, plus a
 * refund for any order past its deadline. The keeper key can do nothing else: the contract only
 * lets it trigger fills that pass every rule, the output goes to the order's recipient, and
 * refunds go to the order's owner. Fund the key with a little testnet ETH for gas only.
 *
 * Deploy:
 *   supabase functions deploy dca-keeper --no-verify-jwt
 *   supabase secrets set POINCARE_DCA_ADDRESS=0x... KEEPER_PRIVATE_KEY=0x... DCA_KEEPER_SECRET=<long random string>
 *     # optional: POINCARE_RPC_URL=https://...   KEEPER_MAX_TX=20
 *   then allowlist the key's address:  cast send <dca> "setKeeper(address,bool)" <keeper> true
 *
 * The function only runs with the right `x-keeper-secret` header, so outsiders cannot make the
 * keeper spend gas.
 */
import { json, makeKeeper } from "../_shared/poincare.js";

const SECRET = Deno.env.get("DCA_KEEPER_SECRET") ?? "";
const DCA = Deno.env.get("POINCARE_DCA_ADDRESS") ?? "";
const KEY = Deno.env.get("KEEPER_PRIVATE_KEY") ?? "";

/** Constant-time string comparison, so the secret cannot be guessed byte by byte. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const pass = DCA && KEY
  ? makeKeeper({
      rpcUrl: Deno.env.get("POINCARE_RPC_URL") ?? undefined,
      dcaAddress: DCA,
      privateKey: KEY,
      maxTx: Number(Deno.env.get("KEEPER_MAX_TX") ?? "20") || 20,
    })
  : null;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SECRET || !sameSecret(req.headers.get("x-keeper-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);
  if (!pass) return json({ error: "not configured: set POINCARE_DCA_ADDRESS and KEEPER_PRIVATE_KEY" }, 503);
  try {
    return json(await pass());
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
});
