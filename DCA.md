# Spread-aware DCA (T-1)

A DCA / TWAP order that knows about Poincaré's trend spread. The pool charges a spread only to
swaps that push **with** a confirmed trend; a DCA order can wait those moments out, fill for free
on the other side of them, and still finish on time.

It ships as one new periphery contract plus tooling. **The hook, the Lens and the pool are not
changed**: PoincareDCA only reads their public views and trades through the canonical v4 router,
like any other user.

| Piece | Where | What it does |
|---|---|---|
| `PoincareDCA` | `src/periphery/PoincareDCA.sol` | Escrows each order's budget and fills it slice by slice, re-checking the order's rules on chain every time |
| Keeper | `frontend/supabase/functions/dca-keeper` | Every minute, fills the slices the contract says are due |
| HTTP API | `frontend/supabase/functions/poincare-api` | Regime data, quotes, orders, and unsigned transactions |
| SDK | `packages/sdk` (`@poincare/sdk`) | TypeScript: regime and trend-onset signals, quotes, DCA orders |
| MCP server | `packages/mcp` (`@poincare/mcp`) | Lets AI agents read the regime and run DCA orders |
| App | Trade screen, Market / DCA switch + DCA tab | Create, watch, pause / resume / edit and cancel orders |
| Docs | `/#/developers` on the site (`frontend/src/pages/Developers.tsx`) | The SDK, MCP server and HTTP API on one page |

**Live on Unichain Sepolia:** PoincareDCA [`0x1E2ad927D95F284fB588eAA3f56D031f92AAe50a`](https://sepolia.uniscan.xyz/address/0x1E2ad927D95F284fB588eAA3f56D031f92AAe50a)
(block 67080020, source verified on Blockscout). Owner `0x49aB…52aC`, keeper `0x813E…Bcbb`. The SDK ships this
address as its default; `deployments/unichain-sepolia-dca.json` is the record.

## The order

| Field | Meaning |
|---|---|
| `zeroForOne` | `true` buys WETH with USDC, `false` sells WETH for USDC |
| `amountIn` | Total budget in the input token, escrowed at creation |
| `slices`, `interval` | Planned fills, one per `interval` seconds (≥ 60) |
| `startTime`, `deadline` | First slot opens at `startTime` (0 = now); nothing fills after `deadline`. Every planned slot must open strictly before the deadline; the default (`start + slices × interval`) gives the last slice a full interval |
| `maxSpreadBps` | Skip the slot while the spread on the order's side is above this. `0` = never pay the trend spread; `10000` = no cap |
| `pauseOnTrend` | Hold while the detected trend runs **with** the order's side (the side the hook charges once its spread ramps); resume when it ends |
| `catchUp` | After skipped slots, later slices grow to spread what is left over the slots left, so the order still completes by the deadline |
| `minPriceWad` | Limit: output per 1 input, WAD. The SDK converts a USDC-per-WETH price (max for a buy, min for a sell) |
| `maxSlippageBps` | Bound vs the Lens quote taken in the same transaction |
| `recipient` | Receives every fill (default: the owner) |

### What a slice checks, in order

Every fill calls `canExecute` logic on chain against the hook's projection of the block it lands in
(`previewSpread`, `previewDetector`), so the decision matches what the swap will actually pay:

1. Not cancelled, budget left, not past the deadline, not paused, past the start time.
2. This slot not filled yet (`slot = (now - start) / interval`). Only slots that open strictly
   before the deadline count (`lastSlot = (deadline - start - 1) / interval`); at the deadline instant
   the clock is clamped to the last slot.
3. Spread on the order's side ≤ `maxSpreadBps` (bps, rounded up).
4. If `pauseOnTrend`: the trend does not run with the order's side.
5. Lens quote ≥ the limit price.
6. Swap through the router with `amountOutMin = max(limit, quote × (1 − slippage))`; output goes straight to the recipient.

**Slice size:** `scheduleBudget / slices` (the budget, or what was left at the latest edit); with
`catchUp`, never less than `remaining / slotsLeft`; the final planned slice takes the rounding remainder. The SDK's `planSlice` / `sliceAmount` mirror this
exactly, and every tool (app, API, MCP) previews with them.

**Which side is "with the trend":** the hook's own mapping (`PoincareHook._spreadGiven`). In market
terms (USDC per WETH, what charts show): buyers push an up-trend, sellers push a down-trend. The
hook's internal "Up" is a *falling* market; the SDK does that inversion in one place.

## Managing an order

All owner-only; keepers and the contract owner cannot touch a user's order.

| Call | Effect |
|---|---|
| `pause(id)` / `resume(id)` | Hold and release fills. A paused order can still be cancelled, and refunds after its deadline. With catch-up, the slots it missed are made up over the slots left |
| `editOrder(id, p)` | Re-plan the **remaining** budget from now (or `p.startTime`): slices, interval, deadline, spread cap, trend pause, catch-up, slippage, limit. Validated like `createOrder`. Side, recipient and budget are fixed; a paused order stays paused |
| `cancel(id)` | Refund what is left now |

The order keeps `amountIn` (deposited, never changes), `remaining`, `refunded` (what cancel / expiry
returned) and `amountOut`, so what was swapped is `amountIn - remaining - refunded` from the order alone.
`filled` counts fills over the order's life; `slices` / `scheduleFilled` describe the current schedule.

## Security model

- **No admin access to funds.** The contract owner can only add or remove keepers. There is no
  withdraw, sweep or upgrade path.
- **Keepers can only trigger fills that pass every rule above**, and the output always goes to the
  order's recipient. A keeper key that leaks can, at worst, fill slices that were due anyway.
- **Only the order's owner can cancel, pause, resume or edit.** An edit cannot change the side, the
  recipient or the budget. After the deadline anyone may call `closeExpired`, and the refund still
  goes to the owner, never the caller.
- **Exact-amount approvals** everywhere (app, SDK, MCP, API), never unlimited.
- `nonReentrant` on every state-changing entry; effects before the swap; exact-amount escrow check.
- **Unaudited.** PoincareDCA is new periphery code. The hook and Lens it reads were reviewed; this
  contract was not. It is covered by 32 unit/fuzz tests on the real PoolManager + router, a fork
  test against the live Unichain Sepolia hook where every fill equals the Lens quote to the wei,
  and the live run below.

The HTTP API and the MCP server never hold keys: writes come back as unsigned transactions. The MCP
server only broadcasts when the user puts *their own* key in `POINCARE_PRIVATE_KEY` **and** the
agent passes `send: true`.

## Live run (2026-11-06)

Three deployments, each tested end to end on Unichain Sepolia with a separate keeper wallet running
every 30 s, real trend pushes (one swap per block until the detector confirmed a trend), random
market noise, and every owner action. Every order's budget was checked against the chain's events:
filled + refunded = deposited on all of them, and the contract ended holding nothing.

- Spread-guarded orders never paid the spread: sells held through a down-trend and filled free once
  it ended; buys filled free, then held as soon as an up-trend charged buyers (2.4% → 4.65%).
  "Always fill" orders paid the live spread (4.32%, then 1.83%, 0.81%, 0) as designed.
- Sixteen random trades never formed a trend: the gate stayed shut and no swap paid a spread.
- Found and fixed: the SDK skipped an approval when a lagging RPC replica reported an allowance
  already spent (reads after a transaction are now pinned to its block); a slot opening at the
  deadline made catch-up refund part of an order instead of buying it (`lastSlot` fix); a refund was
  not recorded, so a refunded order looked complete (`Order.refunded`); cancel / refund requests the
  API would hand out for closed orders (now 404 / 409).
- Known: a keeper fill that lands one second past the deadline reverts as expired (the next pass
  refunds). No funds at risk; it costs the keeper ~38k gas.

Retired deployments (empty, every order closed): `0x412C…E78A`, `0x6aB9…23dD`.

## Going live (runbook)

Steps 1 and 2 are done for Unichain Sepolia (above). Steps 3 to 5 need the Supabase CLI login.

### 1. Deploy the contract

```sh
# a fresh key for the keeper, funded with a little testnet ETH for gas only
cast wallet new

KEEPER=0x<keeper address> FOUNDRY_PROFILE=deploy forge script script/DeployPoincareDCA.s.sol \
  --rpc-url unichain_sepolia --private-key $PK --broadcast
```

This writes `deployments/unichain-sepolia-dca.json` (contract address, owner, keeper, block). The
broadcaster becomes the owner.

### 2. Point the app at it

Put the address in `frontend/src/config/contracts.ts` (`dca: "0x..."` in the Unichain entry), or
set `VITE_POINCARE_DCA_ADDRESS` in Vercel. The DCA ticket and tab switch from "not live yet" to live.

### 3. Deploy the edge functions

From `frontend/`:

```sh
npx supabase functions deploy poincare-api --no-verify-jwt
npx supabase functions deploy dca-keeper --no-verify-jwt
npx supabase secrets set POINCARE_DCA_ADDRESS=0x<dca> KEEPER_PRIVATE_KEY=0x<keeper key> DCA_KEEPER_SECRET=<long random string>
# optional: POINCARE_RPC_URL=https://<dedicated rpc>   KEEPER_MAX_TX=20
```

`KEEPER_PRIVATE_KEY` and `DCA_KEEPER_SECRET` live only in Supabase secrets; never in the repo or a
`VITE_` variable.

### 4. Schedule the keeper

Open `frontend/supabase/migration_008_dca_keeper_cron.sql`, replace `<DCA_KEEPER_SECRET>` with the
same value as the function secret, and run it in the SQL editor. Don't commit the edited file.

Check it: `select id, status_code, left(content::text, 300) from net._http_response order by id desc limit 5;`
A 200 with `"checked": N` is a keeper pass.

### 5. Smoke test

```sh
curl https://gogjpdgluflntcgsarhn.supabase.co/functions/v1/poincare-api/health   # "dca": "0x..."
```

Then open a small DCA order in the app (e.g. 100 USDC, 2 slices, every 1 min, "Never" pay the
spread) and watch the DCA tab: the first slice fills within a minute if your side is free.

### Rehearsing locally

The whole loop runs against a local fork, nothing touches the real chain:

```sh
anvil --fork-url https://sepolia.unichain.org          # chain id stays 1301
forge create src/periphery/PoincareDCA.sol:PoincareDCA --rpc-url http://127.0.0.1:8545 --private-key <anvil key> --broadcast \
  --constructor-args <lens> <router> <owner>
cast send <dca> "setKeeper(address,bool)" <keeper> true --rpc-url http://127.0.0.1:8545 --private-key <owner key>
# create orders with the SDK against http://127.0.0.1:8545, then run the keeper under Deno:
POINCARE_RPC_URL=http://127.0.0.1:8545 POINCARE_DCA_ADDRESS=<dca> KEEPER_PRIVATE_KEY=<anvil key> DCA_KEEPER_SECRET=test \
  npx deno@2.9.6 run --allow-net --allow-env --allow-read frontend/supabase/functions/dca-keeper/index.ts
curl -X POST localhost:8000 -H 'x-keeper-secret: test'
```

Use `forge create` here, not the deploy script, so `deployments/unichain-sepolia-dca.json` is not
overwritten with a fork address.

## Tests

```sh
forge test --match-path test/dca/PoincareDCA.t.sol                          # 32 unit + fuzz
FOUNDRY_PROFILE=fork forge test --match-path test/sim/ForkDCALive.t.sol     # live hook, fork
pnpm --dir packages install && pnpm --dir packages check                    # SDK, API, MCP
pnpm --dir packages/sdk test:live                                           # read-only, live chain
```

## Keeping the copies in sync

The app and the edge functions run generated copies of the TypeScript, so they stay
self-contained (the Vercel build reads only `frontend/`; the Deno functions resolve no imports):

```sh
forge build && pnpm --dir packages/sdk gen:abi        # contract ABIs -> SDK
pnpm --dir packages/sdk sync:frontend                 # SDK -> frontend/src/lib/poincare-sdk
pnpm --dir packages/api bundle:edge                   # API + SDK + viem -> functions/_shared/poincare.js
```
