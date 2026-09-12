import { supabase, supabaseReady } from "./supabase";
import { CONTRACTS } from "@/config/contracts";
import type { DetectorPoint } from "@/lib/onchain";

/** All rows are scoped to the current hook so redeploys don't mix histories. */
const HOOK = CONTRACTS.hook.toLowerCase();

export type SwapRow = {
  id?: number;
  tx_hash: string;
  block_number?: number;
  ts?: string;
  trader: string;
  zero_for_one: boolean;
  side: "buy_weth" | "sell_weth";
  amount_in: number;
  amount_out: number;
  price: number;
  notional_usdc: number;
  kappa: number;
  trend: "none" | "up" | "down";
  spread_frac: number;
  with_trend: boolean;
  lvr_captured_usdc: number;
};

export type LpEvent = {
  tx_hash: string;
  wallet: string;
  kind: "add" | "remove";
  shares: number;
  amount0: number;
  amount1: number;
  value_usdc: number;
};

export type PoolTotals = {
  lvr_avoided: number;
  volume_usdc: number;
  swap_count: number;
  volume_24h: number;
};

const lc = (a: string) => a.toLowerCase();

/** Executed USDC/WETH price for a swap, derived from the legs so it is always
 *  positive and finite (the stored `price` can be noisy; the amounts are reliable). */
export function priceOf(t: Pick<SwapRow, "side" | "amount_in" | "amount_out" | "price" | "notional_usdc">): number {
  const weth = t.side === "buy_weth" ? t.amount_out : t.amount_in;
  const usdc = t.side === "buy_weth" ? t.amount_in : t.amount_out;
  if (weth > 0 && usdc > 0) return usdc / weth;
  if (Number.isFinite(t.price) && t.price > 0) return t.price;
  if (t.notional_usdc > 0 && weth > 0) return t.notional_usdc / weth;
  return 0;
}

/** Remember a wallet across sessions: first sight inserts it, every later session
 *  bumps last_seen + visit_count (server-side, so the counts survive any client). */
export async function touchWallet(address: string) {
  if (!supabaseReady) return;
  const { error } = await supabase.rpc("touch_wallet", { addr: lc(address) });
  if (error) console.warn("touchWallet", error.message);
}

export type WalletTotals = {
  total_wallets: number;
  new_7d: number;
  returning_wallets: number;
  active_24h: number;
};

/** Aggregate user counts for the dashboard (total / new this week / returning). */
export async function fetchWalletTotals(): Promise<WalletTotals> {
  const empty: WalletTotals = { total_wallets: 0, new_7d: 0, returning_wallets: 0, active_24h: 0 };
  if (!supabaseReady) return empty;
  const { data } = await supabase.from("v_wallet_totals").select("*").single();
  return (data as WalletTotals) ?? empty;
}

/** Record a confirmed swap into the shared order tape. */
export async function recordSwap(row: SwapRow) {
  if (!supabaseReady) return;
  const { error } = await supabase.from("swaps").insert({ ...row, trader: lc(row.trader), hook: HOOK });
  if (error && error.code !== "23505") console.warn("recordSwap", error.message); // ignore dup tx_hash
}

export async function recordLpEvent(evt: LpEvent) {
  if (!supabaseReady) return;
  const { error } = await supabase.from("lp_events").insert({ ...evt, wallet: lc(evt.wallet), hook: HOOK });
  if (error && error.code !== "23505") console.warn("recordLpEvent", error.message);
}

// detector_samples: the on-chain DetectorSample trace, mirrored for history

/** Postgres error for "column does not exist" — migration 004 has not been run. */
const UNDEFINED_COLUMN = "42703";

/** Mirror freshly-read on-chain samples. Idempotent: unique(hook, block_number). */
export async function recordDetectorSamples(points: DetectorPoint[]) {
  if (!supabaseReady || points.length === 0) return;
  const rows = points.map((p) => ({ ...p, hook: HOOK }));

  const { error } = await supabase
    .from("detector_samples")
    .upsert(rows, { onConflict: "hook,block_number", ignoreDuplicates: true });
  if (!error) return;

  // The `wad` column arrives with migration 004. Against a database that has not
  // been migrated yet, drop it and mirror the rest rather than losing the whole
  // sync: history still charts, and the Lab falls back to the float columns.
  if (error.code === UNDEFINED_COLUMN) {
    const { error: retry } = await supabase
      .from("detector_samples")
      .upsert(
        rows.map(({ wad: _wad, ...rest }) => rest),
        { onConflict: "hook,block_number", ignoreDuplicates: true },
      );
    if (retry) console.warn("recordDetectorSamples", retry.message);
    return;
  }
  console.warn("recordDetectorSamples", error.message);
}

const SAMPLE_COLUMNS = "block_number,price,r,s_pos,s_neg,d,sigma,kappa,trend,fee";

/** Detector history for this hook, ascending by block (newest `limit` samples). */
export async function fetchDetectorSeries(limit = 240): Promise<DetectorPoint[]> {
  if (!supabaseReady) return [];

  const query = (columns: string) =>
    supabase
      .from("detector_samples")
      .select(columns)
      .eq("hook", HOOK)
      .order("block_number", { ascending: false })
      .limit(limit);

  let { data, error } = await query(`${SAMPLE_COLUMNS},wad`);
  if (error?.code === UNDEFINED_COLUMN) ({ data } = await query(SAMPLE_COLUMNS));
  return ((data as unknown as DetectorPoint[]) ?? []).reverse();
}

// detector_configs: calibrations dialled in the Lab, shareable by slug

/** A saved parameter set. Values are decimal numbers, as the Lab's sliders hold them. */
export type SavedConfig = {
  slug: string;
  label: string | null;
  author: string | null;
  created_at?: string;
  params: Record<string, number | boolean>;
};

/** Short, URL-safe, collision-resistant enough for a share link. */
const slugOf = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

/**
 * Persist a calibration and return its share slug. Rows are immutable by
 * convention: saving again mints a new slug rather than rewriting one, so a link
 * someone already shared cannot change meaning underneath them.
 */
export async function saveLabConfig(
  params: Record<string, number | boolean>,
  label?: string,
  author?: string,
): Promise<string | null> {
  if (!supabaseReady) return null;
  const slug = slugOf();
  const { error } = await supabase.from("detector_configs").insert({
    slug,
    hook: HOOK,
    label: label?.slice(0, 60) || null,
    author: author ? lc(author) : null,
    params,
  });
  if (error) {
    console.warn("saveLabConfig", error.message);
    return null;
  }
  return slug;
}

export async function fetchLabConfig(slug: string): Promise<SavedConfig | null> {
  if (!supabaseReady) return null;
  const { data } = await supabase
    .from("detector_configs")
    .select("slug,label,author,created_at,params")
    .eq("slug", slug)
    .maybeSingle();
  return (data as SavedConfig) ?? null;
}

/** Recently shared calibrations for this hook. */
export async function fetchRecentConfigs(limit = 6): Promise<SavedConfig[]> {
  if (!supabaseReady) return [];
  const { data } = await supabase
    .from("detector_configs")
    .select("slug,label,author,created_at,params")
    .eq("hook", HOOK)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as SavedConfig[]) ?? [];
}

// ai_notes: the narration endpoint (the Gemini key lives server-side, never here)

export type Explanation = { body: string; model: string | null; cached: boolean };

/** Why a narration request did not produce text. Shown as a badge tooltip. */
export type ExplainFailure = { reason: string };

/**
 * Ask the `explain` edge function to narrate a set of facts.
 *
 * Never throws and never blocks rendering: every caller has a deterministic
 * local narration to fall back to, so a failure returns the REASON rather than
 * an error. Surfacing it matters — a retired model or an unset secret otherwise
 * looks identical to "no model configured" from the UI, and the difference is
 * only visible in the function logs.
 */
export async function requestExplanation(
  kind: "regime" | "lab",
  cacheKey: string,
  facts: unknown,
): Promise<Explanation | ExplainFailure> {
  if (!supabaseReady) return { reason: "backend not configured" };
  try {
    const { data, error } = await supabase.functions.invoke("explain", {
      body: { kind, hook: HOOK, cacheKey, facts },
    });
    if (data?.body) {
      return { body: data.body as string, model: data.model ?? null, cached: Boolean(data.cached) };
    }

    // The function answers failures with a JSON body ("cooling down", "generation
    // failed", "not configured"), but supabase-js turns any non-2xx into a
    // FunctionsHttpError and leaves that body unread on the Response. Pull it out,
    // or the UI only ever learns "Edge Function returned a non-2xx status code".
    let reason = (data?.error as string | undefined) ?? error?.message ?? "no response";
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        if (typeof body?.error === "string") reason = body.error;
      } catch {
        // Non-JSON error body; the status-derived message is the best available.
      }
    }
    console.warn("requestExplanation", reason);
    return { reason };
  } catch (e) {
    console.warn("requestExplanation", e);
    return { reason: e instanceof Error ? e.message : "request failed" };
  }
}

/** Narrow an explanation result to the success case. */
export const isExplanation = (r: Explanation | ExplainFailure): r is Explanation => "body" in r;

export async function fetchTape(limit = 24): Promise<SwapRow[]> {
  if (!supabaseReady) return [];
  const { data } = await supabase.from("swaps").select("*").eq("hook", HOOK).order("ts", { ascending: false }).limit(limit);
  return (data as SwapRow[]) ?? [];
}

/** Paged history (newest first) for the "load more" tape. */
export async function fetchTapePage(limit: number, offset: number): Promise<SwapRow[]> {
  if (!supabaseReady) return [];
  const { data } = await supabase
    .from("swaps")
    .select("*")
    .eq("hook", HOOK)
    .order("ts", { ascending: false })
    .range(offset, offset + limit - 1);
  return (data as SwapRow[]) ?? [];
}

/** Timestamp of the newest recorded trade; the anchor for chart windows (replayed
 *  history carries historical timestamps, so "now" is the wrong anchor). */
export async function fetchLatestTradeTs(): Promise<string | null> {
  if (!supabaseReady) return null;
  const { data } = await supabase.from("swaps").select("ts").eq("hook", HOOK).order("ts", { ascending: false }).limit(1);
  return data?.[0]?.ts ?? null;
}

/** Drop duplicate tx hashes, keeping the first occurrence. */
export const dedupeByTx = (list: SwapRow[]) => {
  const seen = new Set<string>();
  return list.filter((r) => (seen.has(r.tx_hash) ? false : (seen.add(r.tx_hash), true)));
};

/** The fields the price chart needs from a swap (a projection of SwapRow). */
export type PricePoint = Pick<SwapRow, "ts" | "side" | "amount_in" | "amount_out" | "price" | "notional_usdc">;

/**
 * Price history for the chart, straight from the backend rather than the loaded tape
 * (whose depth depends on how many pages the user happened to load). Hook-scoped;
 * `sinceIso` null = all time. Returns ascending by time, newest `limit` rows.
 */
export async function fetchPriceSeries(sinceIso: string | null, limit = 2000): Promise<PricePoint[]> {
  if (!supabaseReady) return [];
  let q = supabase
    .from("swaps")
    .select("ts,side,amount_in,amount_out,price,notional_usdc")
    .eq("hook", HOOK)
    .order("ts", { ascending: false })
    .limit(limit);
  if (sinceIso) q = q.gte("ts", sinceIso);
  const { data } = await q;
  return ((data as PricePoint[]) ?? []).reverse();
}

export async function fetchPoolTotals(): Promise<PoolTotals> {
  const empty: PoolTotals = { lvr_avoided: 0, volume_usdc: 0, swap_count: 0, volume_24h: 0 };
  if (!supabaseReady) return empty;
  const { data } = await supabase.from("v_pool_totals").select("*").single();
  return (data as PoolTotals) ?? empty;
}

export async function fetchLpEvents(address: string): Promise<LpEvent[]> {
  if (!supabaseReady) return [];
  const { data } = await supabase.from("lp_events").select("*").eq("wallet", lc(address)).order("ts", { ascending: false });
  return (data as LpEvent[]) ?? [];
}

/** Live tape: invoke cb whenever a new swap is inserted. Returns an unsubscribe fn.
 *  Uses a unique channel name per call so React 18 StrictMode's double-mount can't
 *  reuse an already-subscribed channel (which makes `.on()` throw). */
export function subscribeSwaps(cb: (row: SwapRow) => void): () => void {
  if (!supabaseReady) return () => {};
  try {
    const channel = supabase
      .channel(`swaps-tape-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "swaps", filter: `hook=eq.${HOOK}` }, (payload) => cb(payload.new as SwapRow))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  } catch (e) {
    console.warn("subscribeSwaps", e); // realtime is a nice-to-have; polling still refreshes the tape
    return () => {};
  }
}
