/**
 * `dca-keeper` — fills due DCA slices, then indexes DCA events into the database. Invoked every
 * minute by pg_cron (migration_008); the index tables come from migration_009.
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
 * After the keeper pass it reads every PoincareDCA event since its cursor (1,000-block pages, at most
 * DCA_INDEX_MAX_CHUNKS per tick, default 10) and upserts public.dca_orders and public.dca_fills with
 * the service role key Supabase provides to every function. The app reads those tables first. A
 * failing pass does not stop the index, and the other way round.
 *
 * The function only runs with the right `x-keeper-secret` header, so outsiders cannot make the
 * keeper spend gas.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, makeIndexer, makeKeeper } from "../_shared/poincare.js";

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

const indexer = makeIndexer({
  rpcUrl: Deno.env.get("POINCARE_RPC_URL") ?? undefined,
  dcaAddress: DCA || undefined,
  maxChunks: Number(Deno.env.get("DCA_INDEX_MAX_CHUNKS") ?? "10") || 10,
});
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

/** Index PoincareDCA events from the stored cursor and write orders + fills. */
async function indexOnce() {
  const dca = (indexer.deployment.dca ?? "").toLowerCase();
  if (!dca) return { skipped: "no DCA address" };
  const { data: cur, error: curErr } = await admin.from("dca_index_cursor").select("last_block").eq("dca", dca).maybeSingle();
  if (curErr) throw new Error(`cursor: ${curErr.message}`);
  const from = cur ? BigInt(cur.last_block) + 1n : indexer.startBlock;
  const run = await indexer.run(from);
  if (run.orders.length) {
    // created_block is only known in the run that saw OrderCreated: never overwrite it with null
    const withCreated = run.orders.filter((o) => o.created_block !== null);
    const without = run.orders.filter((o) => o.created_block === null).map(({ created_block: _c, ...o }) => o);
    for (const rows of [withCreated, without]) {
      if (!rows.length) continue;
      const { error } = await admin.from("dca_orders").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "dca,order_id" });
      if (error) throw new Error(`orders: ${error.message}`);
    }
  }
  if (run.fills.length) {
    const { error } = await admin.from("dca_fills").upsert(run.fills, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
    if (error) throw new Error(`fills: ${error.message}`);
  }
  if (run.toBlock >= from) {
    const { error } = await admin.from("dca_index_cursor").upsert({ dca, last_block: Number(run.toBlock), updated_at: new Date().toISOString() });
    if (error) throw new Error(`cursor: ${error.message}`);
  }
  return { fromBlock: from, toBlock: run.toBlock, orders: run.orders.length, fills: run.fills.length };
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SECRET || !sameSecret(req.headers.get("x-keeper-secret") ?? "", SECRET)) return json({ error: "unauthorized" }, 401);
  // keeper first (so fills it just sent are indexed in the same tick), then the index
  let keeper: unknown;
  try {
    keeper = pass ? await pass() : { error: "keeper not configured: set POINCARE_DCA_ADDRESS and KEEPER_PRIVATE_KEY" };
  } catch (e) {
    keeper = { error: errText(e) };
  }
  let index: unknown;
  try {
    index = await indexOnce();
  } catch (e) {
    index = { error: errText(e) };
  }
  const failed = (x: unknown) => typeof x === "object" && x !== null && "error" in x;
  return json({ keeper, index }, failed(keeper) && failed(index) ? 502 : 200);
});
