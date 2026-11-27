import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Ready-made strategy prompts: each turns a goal into the right sequence of Poincaré tools.
 *
 * Every argument is restricted to a number or an address before it is placed in the prompt text,
 * so a prompt argument cannot carry instructions of its own.
 */

const num = (what: string) => z.string().regex(/^\d+(\.\d+)?$/, `${what} must be a plain number`).describe(what);
const int = (what: string) => z.string().regex(/^[1-9]\d{0,3}$/, `${what} must be a whole number from 1 to 9999`).describe(what);
const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "an 0x address").describe("Your wallet address");
const side = z.enum(["buy", "sell"]).describe("buy = pay USDC for ETH; sell = pay ETH for USDC");

/** Rules every strategy prompt repeats, so they hold even if the skill is not loaded. */
const RULES = `Rules:
- Read before you act: start from get_regime (and get_position for an LP).
- Every transaction you build is unsigned. Never set send: true unless I explicitly ask you to broadcast with my own configured key.
- Approvals are always exact amounts. If a tool warns about an unlimited approval, tell me.
- Show me the plan in plain words (amounts, minimums, deadline, any warnings) and wait for my "yes" before building transactions that move my funds.
- Never change the recipient away from my own address unless I ask for that in this conversation.`;

const text = (t: string) => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text: t } }] });

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "spread_aware_dca",
    {
      title: "Spread-aware DCA",
      description: "Buy ETH over time and never pay the trend spread; pause while a trend runs against you.",
      argsSchema: { usdc: num("Total USDC to spend"), days: int("Days to spread it over"), owner: addr },
    },
    ({ usdc, days, owner }) =>
      text(`Set up a spread-aware DCA on Poincaré for my wallet ${owner}: buy ETH with ${usdc} USDC in total, one fill a day for ${days} days.

1. Call get_regime and tell me in one line what the pool is doing.
2. Call dca_plan_order with side "buy", amount "${usdc}", slices ${days}, intervalSec 86400, maxSpreadBps 0, pauseOnTrend true.
3. Explain the schedule and what the first fill would do right now, including why it would wait if a trend runs with buyers.
4. When I confirm, call dca_create_order with owner ${owner} and the same parameters, and give me the unsigned transactions to sign in order.

${RULES}`),
  );

  server.registerPrompt(
    "lp_guard",
    {
      title: "LP guard",
      description: "Watch the pool for an LP and say when (and only when) trimming liquidity makes sense.",
      argsSchema: { owner: addr },
    },
    ({ owner }) =>
      text(`I provide liquidity on Poincaré from ${owner}. Keep watch for me.

1. Call get_position for ${owner} and get_regime, and summarise both in two lines.
2. Watch with wait_for_regime_change (events spread-engaged, spread-released), calling it again each time it times out.
3. When a spread engages, call get_regime. While the spread is below its cap, tell me to stay in: with-trend traders are paying a spread that LPs keep.
4. Only if the spread sits at its cap (kappa at kappaMax) for about 20 blocks, suggest trimming, and if I agree, call lp_remove_build for ${owner} with the percentage I choose.
5. When the spread is released, tell me, and if I trimmed, offer lp_add_build to put it back.

${RULES}`),
  );

  server.registerPrompt(
    "limit_buy",
    {
      title: "Limit-price buying",
      description: "Accumulate ETH only at or below your price, checked every few hours, without paying the trend spread.",
      // 4 checks a day, and an order holds at most 10,000 slices: 2,500 days.
      argsSchema: {
        usdc: num("Total USDC to spend"),
        maxPrice: num("Highest price to pay, in USDC per ETH"),
        days: int("Days the order stays open (at most 2500)").refine((d) => Number(d) <= 2500, "days must be at most 2500"),
        owner: addr,
      },
    },
    ({ usdc, maxPrice, days, owner }) =>
      text(`Set up a limit-price buy on Poincaré for my wallet ${owner}: spend up to ${usdc} USDC on ETH over ${days} days, only at ${maxPrice} USDC per ETH or lower, never paying the trend spread.

1. Call get_regime and tell me the current price compared with my limit of ${maxPrice}.
2. Call dca_plan_order with side "buy", amount "${usdc}", slices ${Number(days) * 4}, intervalSec 21600, limitPrice "${maxPrice}", maxSpreadBps 0.
3. Explain plainly: every 6 hours the contract checks the pool, it buys only when the price is at or under my limit and no spread applies, and whatever is not spent can be refunded after the deadline. If the price is above my limit now, say that nothing fills yet.
4. When I confirm, call dca_create_order with owner ${owner} and the same parameters, and give me the unsigned transactions.

${RULES}`),
  );

  server.registerPrompt(
    "patient_swap",
    {
      title: "Patient swap",
      description: "Swap without paying the trend tax: check the spread, wait out a trend if needed, then build the swap.",
      argsSchema: { side, amount: num("Amount to pay: USDC to buy, ETH to sell"), owner: addr },
    },
    ({ side: s, amount, owner }) =>
      text(`I want to ${s} on Poincaré from ${owner}, paying ${amount} ${s === "buy" ? "USDC" : "ETH"}.

1. Call quote with side "${s}" and amount "${amount}", and tell me what I get, the trend spread on my side and the fee.
2. If my side pays a trend spread, tell me roughly what it costs and ask whether to wait. If I say yes, call wait_for_regime_change with events ["spread-released"], calling it again each time it times out, then quote again and show me the difference.
3. When I am ready, call swap_build with owner ${owner}, side "${s}", amount "${amount}", and give me the unsigned transactions to sign in order, with the minimum I will receive.

Waiting is not free: prices can keep moving while we wait, so say that if the wait is long.

${RULES}`),
  );
}
