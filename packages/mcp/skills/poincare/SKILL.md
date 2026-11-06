---
name: poincare
description: Read the Poincaré pool's trend regime, quote swaps and run spread-aware DCA orders through the Poincaré MCP server (Uniswap v4 hook on Unichain Sepolia, testnet). Use when the user asks whether the Poincaré WETH/USDC pool is trending, which side pays the trend spread, what a swap would return, or wants to plan, create, check, pause, resume, edit, cancel or refund a Poincaré DCA order, or to wait for a trend onset.
license: MIT
metadata:
  version: "0.1.0"
  requires: "@poincaretrade/mcp (MCP server, 15 tools)"
---

# Poincaré

Poincaré is a Uniswap v4 hook on the WETH/USDC pool. A CUSUM detector on the pool's own price
confirms trends at a data-dependent moment; once one is confirmed, swaps pushing **with** the trend
pay a spread of up to 5% (kept by liquidity providers), and the other side trades at the plain
price. PoincareDCA runs DCA orders whose slices can wait that spread out.

This skill tells you how to drive the `poincare` MCP server well. Everything is on **Unichain
Sepolia, a testnet**: test tokens carry no value. Say so when it matters (before any transaction).

## Setup

The tools below come from the Poincaré MCP server. If they are not available, tell the user to add
it and restart the client:

```sh
claude mcp add poincare -- npx -y @poincaretrade/mcp
```

For Claude Desktop or another client, the server is `npx -y @poincaretrade/mcp` (stdio). Optional
environment: `POINCARE_RPC_URL`, `POINCARE_DCA_ADDRESS`, and `POINCARE_PRIVATE_KEY` (only if the
user wants the server to broadcast; see Safety).

## Orientation (never mix these up)

- Prices are **USDC per WETH**; "up" means the chart goes up.
- `buy` pays USDC for WETH. `sell` pays WETH for USDC.
- Amounts going in are **decimal strings** in the input token: `"100"` USDC, `"0.05"` WETH.
- Spreads from tools are fractions (`0.0466` = 4.66%); order caps are basis points (`0` = never pay).

## Ground rules

1. **Read before you claim.** Every number you state comes from a tool result in this
   conversation. Never estimate a price, spread or fill.
2. **Unsigned by default.** Write tools return unsigned transactions unless called with
   `send: true`. Only pass `send: true` when the user has explicitly asked you to send *this*
   action in this turn **and** a key is configured. Otherwise, hand back the transactions and say
   they must be signed in order from the owner's wallet.
3. **Confirm destructive actions.** Before `dca_cancel_order` (or `dca_close_expired` on someone
   else's behalf), restate what will be refunded and ask for a yes.
4. **One line first, details on request.** Lead with a plain sentence ("Buys are free right now;
   sells pay 4.66% because a down-trend is confirmed."), then the figures.

## Workflows

### What is the market doing?

Call `get_regime`. Report, in one line: the trend (none / up / down), which side pays and how much
(`spread.buy`, `spread.sell`), and how close the evidence is to the threshold (`evidence.progress`,
0 to 1). If `gated` is true, explain that the moves read as chop, so nothing is charged. For the
recent past use `get_regime_history` (`blocks`, 100 to 20,000).

### What would a swap give me?

Call `quote` with `side` and `amount`. Report what comes out, the spread and the fee. If the user's
side is the charged side, mention the alternative: a spread-guarded DCA waits the spread out.

### Plan a spread-aware DCA

1. Translate the request into an order (table below), then call **`dca_plan_order`** first. It
   validates exactly like the contract and says what the first fill would do right now.
2. Present the plan: total, number of fills, interval, end time, protection, first-fill verdict.
3. On the user's go-ahead, call **`dca_create_order`** with the same fields plus `owner`
   (their address; omit only if a key is configured). It returns `[approve, createOrder]`
   (exact-amount approval, never unlimited).

| The user says | Fields |
|---|---|
| "buy 500 USDC of WETH over a day, hourly" | `side: "buy"`, `amount: "500"`, `slices: 24`, `intervalSec: 3600` |
| "sell 2 WETH evenly over 4 hours" | `side: "sell"`, `amount: "2"`, `slices: 4`, `intervalSec: 3600` |
| "every 15 minutes, 10 times, 50 USDC each" | `amount: "500"`, `slices: 10`, `intervalSec: 900` |
| "never pay the trend spread" (default to this) | `maxSpreadBps: 0` |
| "also wait while a trend runs my way" | `maxSpreadBps: 0`, `pauseOnTrend: true` |
| "fill every slot whatever the spread" | `maxSpreadBps: 10000` |
| "don't pay more than 2,400" (buy) / "not below 2,200" (sell) | `limitPrice: "2400"` / `"2200"` |

`catchUp` defaults to true (later fills grow so the order still finishes on time); `maxSlippageBps`
defaults to 50. `intervalSec` must be at least 60.

### Check on orders

- `dca_list_orders` (`owner`) lists an address's orders with spent, progress and next-fill status.
- `dca_get_order` (`id`) for one order; `dca_preview_slice` (`id`) for the contract's verdict on
  the next fill.

| Status | Say |
|---|---|
| `ready` | The next fill is due; the keeper fills it within a minute. |
| `waiting-for-slot` | This slot is done; the next opens at `nextSlotAt`. |
| `not-started` | Before the start time. |
| `spread-too-high` | Held: this side pays more than the order's cap. It fills when the spread drops; later fills catch up. |
| `trend-against` | Held: trend pause is on and a trend runs with this side. |
| `below-limit` | Held: the pool price is beyond the order's limit. |
| `paused` | Paused by the owner; nothing fills until resumed. |
| `expired` | Past the deadline; the rest can be refunded with `dca_close_expired`. |
| `filled` / `cancelled` | Closed. If `refunded > 0`, part of the budget was returned, not spent. |

### Change an order (owner only)

- `dca_pause_order` / `dca_resume_order` (`id`).
- `dca_edit_order` (`id` plus any of `slices`, `intervalSec`, `durationSec`, `deadline`,
  `maxSpreadBps`, `pauseOnTrend`, `catchUp`, `maxSlippageBps`, `limitPrice`; `limitPrice: "none"`
  removes the limit). It re-plans the **remaining** budget from now; side, recipient and budget are
  fixed, and a paused order stays paused.
- `dca_cancel_order` (`id`): refunds what is left at once. Confirm first.
- `dca_close_expired` (`id`): after the deadline, anyone may call it; the refund always goes to the
  owner.
- `dca_execute_slice` (`id`): the owner can fill their own due slice; refused unless `ready`.

### Wait for something to happen

`wait_for_regime_change` blocks until one of `events` happens or `timeoutSec` (5 to 300) passes:
`trend-started`, `trend-ended`, `trend-flipped`, `evidence-building`, `spread-engaged`,
`spread-released`. For longer watches, call it again in a loop and summarise each event as it
comes; stop when the user's condition is met.

## When a call fails

- An invalid order comes back with the contract's own reason: `deadline` (the end leaves no room
  for every fill), `interval` (under 60 s), `slices` (1 to 10,000), `bps` (0 to 10,000),
  `amountIn` (no amount). Explain it in those words and suggest the fix.
- "needs POINCARE_PRIVATE_KEY": the user asked to send but no key is configured. Return the
  unsigned transactions instead.
- An action refused because it would revert now (closed order, not yet expired, already paused,
  fill held): report the current status from `dca_get_order` rather than retrying.

## Safety

- Only suggest configuring `POINCARE_PRIVATE_KEY` with a **testnet** key the user is comfortable
  delegating. Never ask the user to paste a key into the chat.
- PoincareDCA is unaudited periphery code on a testnet; the hook and Lens it reads were reviewed
  (SFS-Labs scoped review, Olympix pre-audit scan). Say this if the user treats it as production.
- Docs: https://www.poincaretrade.in/#/docs
