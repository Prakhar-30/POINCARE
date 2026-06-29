import { supabase, supabaseReady } from "./supabase";

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

/** Remember a wallet across sessions (first_seen kept, last_seen bumped). */
export async function upsertWallet(address: string) {
  if (!supabaseReady) return;
  await supabase
    .from("wallets")
    .upsert({ address: lc(address), last_seen: new Date().toISOString() }, { onConflict: "address" });
}

/** Record a confirmed swap into the shared order tape. */
export async function recordSwap(row: SwapRow) {
  if (!supabaseReady) return;
  const { error } = await supabase.from("swaps").insert({ ...row, trader: lc(row.trader) });
  if (error && error.code !== "23505") console.warn("recordSwap", error.message); // ignore dup tx_hash
}

export async function recordLpEvent(evt: LpEvent) {
  if (!supabaseReady) return;
  const { error } = await supabase.from("lp_events").insert({ ...evt, wallet: lc(evt.wallet) });
  if (error && error.code !== "23505") console.warn("recordLpEvent", error.message);
}

export async function fetchTape(limit = 24): Promise<SwapRow[]> {
  if (!supabaseReady) return [];
  const { data } = await supabase.from("swaps").select("*").order("ts", { ascending: false }).limit(limit);
  return (data as SwapRow[]) ?? [];
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

/** Live tape: invoke cb whenever a new swap is inserted. Returns an unsubscribe fn. */
export function subscribeSwaps(cb: (row: SwapRow) => void): () => void {
  if (!supabaseReady) return () => {};
  const channel = supabase
    .channel("swaps-tape")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "swaps" }, (payload) => cb(payload.new as SwapRow))
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
