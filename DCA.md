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
| App | Trade screen, Market / DCA switch + DCA tab | Create, watch and cancel orders |

## The order

| Field | Meaning |
|---|---|
| `zeroForOne` | `true` buys WETH with USDC, `false` sells WETH for USDC |
| `amountIn` | Total budget in the input token, escrowed at creation |
| `slices`, `interval` | Planned fills, one per `interval` seconds (≥ 60) |
| `startTime`, `deadline` | First slot opens at `startTime` (0 = now); nothing fills after `deadline` |
| `maxSpreadBps` | Skip the slot while the spread on the order's side is above this. `0` = never pay the trend spread; `10000` = no cap |
| `pauseOnTrend` | Hold while the detected trend runs **with** the order's side (the side the hook charges once its spread ramps); resume when it ends |
| `catchUp` | After skipped slots, later slices grow to spread what is left over the slots left, so the order still completes by the deadline |
| `minPriceWad` | Limit: output per 1 input, WAD. The SDK converts a USDC-per-WETH price (max for a buy, min for a sell) |
| `maxSlippageBps` | Bound vs the Lens quote taken in the same transaction |
| `recipient` | Receives every fill (default: the owner) |

### What a slice checks, in order

Every fill calls `canExecute` logic on chain against the hook's projection of the block it lands in
(`previewSpread`, `previewDetector`), so the decision matches what the swap will actually pay:

1. Not cancelled, budget left, not past the deadline, past the start time.
2. This slot not filled yet (`slot = (now - start) / interval`).
3. Spread on the order's side ≤ `maxSpreadBps` (bps, rounded up).
4. If `pauseOnTrend`: the trend does not run with the order's side.
5. Lens quote ≥ the limit price.
6. Swap through the router with `amountOutMin = max(limit, quote × (1 − slippage))`; output goes straight to the recipient.

**Slice size:** `amountIn / slices`; with `catchUp`, never less than `remaining / slotsLeft`; the final
planned slice takes the rounding remainder. The SDK's `planSlice` / `sliceAmount` mirror this
exactly, and every tool (app, API, MCP) previews with them.

**Which side is "with the trend":** the hook's own mapping (`PoincareHook._spreadGiven`). In market
terms (USDC per WETH, what charts show): buyers push an up-trend, sellers push a down-trend. The
hook's internal "Up" is a *falling* market; the SDK does that inversion in one place.

## Security model

- **No admin access to funds.** The contract owner can only add or remove keepers. There is no
  withdraw, sweep or upgrade path.
- **Keepers can only trigger fills that pass every rule above**, and the output always goes to the
  order's recipient. A keeper key that leaks can, at worst, fill slices that were due anyway.
- **Only the order's owner can cancel.** After the deadline anyone may call `closeExpired`, and the
  refund still goes to the owner, never the caller.
- **Exact-amount approvals** everywhere (app, SDK, MCP, API), never unlimited.
- `nonReentrant` on every state-changing entry; effects before the swap; exact-amount escrow check.
- **Unaudited.** PoincareDCA is new periphery code. The hook and Lens it reads were reviewed; this
  contract was not. It is covered by 21 unit/fuzz tests on the real PoolManager + router, and a
  fork test against the live Unichain Sepolia hook where every fill equals the Lens quote to the wei.

The HTTP API and the MCP server never hold keys: writes come back as unsigned transactions. The MCP
server only broadcasts when the user puts *their own* key in `POINCARE_PRIVATE_KEY` **and** the
agent passes `send: true`.

## Going live (runbook)

Nothing below has been done yet. Run in order.

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
forge test --match-path test/dca/PoincareDCA.t.sol                          # 21 unit + fuzz
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
