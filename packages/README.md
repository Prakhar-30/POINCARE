# Poincaré developer tooling

Three ways to build on Poincaré's trend detector and its spread-aware DCA orders. All of them read
the live pool on Unichain Sepolia; none of them needs an API key. See [`../DCA.md`](../DCA.md) for
the strategy, the contract rules and the deploy runbook. The same material, for integrators, is on
the site at **[poincaretrade.in/#/docs](https://www.poincaretrade.in/#/docs)**.

| Package | For |
|---|---|
| [`sdk`](sdk) `@poincaretrade/sdk` | TypeScript apps, bots and scripts |
| [`mcp`](mcp) `@poincaretrade/mcp` | AI agents (Claude, any MCP client) |
| [`api`](api) `@poincaretrade/api` | The HTTP API and the keeper, deployed as Supabase edge functions |

```sh
pnpm install          # in this folder
pnpm check            # build + typecheck + test all three
```

### Publishing to npm

`@poincaretrade/sdk` and `@poincaretrade/mcp` are publishable (`@poincaretrade/api` stays private: it ships as Supabase
edge functions). Use **pnpm** to publish, so the MCP server's `workspace:*` dependency on the SDK becomes
the real version:

```sh
npm login                       # an account that owns the "poincaretrade" npm org
pnpm pack:npm                   # optional dry run: tarballs in ../.npm-pack
pnpm publish:npm                # builds, type-checks and tests each package first (prepublishOnly)
```

Bump `version` in both package.json files for later releases (the MCP server's SDK dependency follows).

Orientation everywhere: prices are **USDC per WETH**, and "up" means the chart goes up. `buy`
pays USDC for WETH; `sell` pays WETH for USDC.

## SDK

```ts
import { createPoincareClient } from "@poincaretrade/sdk";

const poincare = createPoincareClient({
  // walletClient,  // only to send: create / pause / resume / edit / cancel / execute / closeExpired
}); // the live Unichain Sepolia deployment, PoincareDCA included (withDca() points elsewhere)

// What the next swap of this block sees
const r = await poincare.regime();
// { trend: "down", level: "engaged", chargedSide: "sell", spread: { buy: 0, sell: 0.0431 },
//   evidence: { up, down, threshold, progress }, price: 2307.6, fee: 0.003, ... }

// React to the onset of a trend (data-dependent CUSUM crossing, not a fixed block count)
const stop = poincare.watchRegime({
  onEvent: (e) => console.log(e.type, e), // trend-started | trend-ended | trend-flipped |
});                                        // evidence-building | spread-engaged | spread-released

// Quotes match router execution in the same block, to the wei
const q = await poincare.quote("buy", "100");

// A DCA order: buy 1000 USDC of WETH over 6 hours, never paying the trend spread
const txs = await poincare.dca.build.create("0x<owner>", {
  side: "buy", amount: "1000", slices: 6, interval: 3600, maxSpreadBps: 0, catchUp: true,
}); // [approve exact amount, createOrder], unsigned; or poincare.dca.create(input) with a walletClient

await poincare.dca.preview(1n); // { status: "spread-too-high" | "ready" | "paused" | ..., amountIn, quoteOut, ... }

// Owner controls (also unsigned under dca.build.*)
await poincare.dca.pause(1n);
await poincare.dca.edit(1n, { slices: 12, interval: 1800, limitPrice: null }); // re-plan what is left
await poincare.dca.resume(1n);
```

Lower level: `readRegime`, `diffRegime`, `regimeHistory`, `trendOnsets`, `buildOrderParams`
(validates exactly like the contract, same reason strings), `planSlice` / `sliceAmount` (offline
mirror of the contract's slice rules), `build*Tx` (unsigned, with explicit gas), and the ABIs.

`pnpm --dir sdk test:live` runs read-only checks against the live chain.

## MCP server

From npm (or, from this repo, `node /abs/path/to/packages/mcp/dist/index.js` after `pnpm --dir mcp build`):

**Claude Code**

```sh
claude mcp add poincare -- npx -y @poincaretrade/mcp
```

**Claude Desktop / any MCP client** (`mcpServers` in the client's config):

```json
{
  "mcpServers": {
    "poincare": {
      "command": "npx",
      "args": ["-y", "@poincaretrade/mcp"],
      "env": {}
    }
  }
}
```

| Tool | Does |
|---|---|
| `get_regime` | Trend, evidence, which side pays the spread, in one plain-English line plus the data |
| `get_regime_history` | Detector samples and trend onsets over recent blocks |
| `wait_for_regime_change` | Blocks until a trend starts / ends / flips or the spread engages (or times out) |
| `quote` | Exact-input quote with this side's spread and fee |
| `dca_plan_order` | Validates an order like the contract and says what its first fill would do now |
| `dca_create_order` | Approve + create (unsigned unless `send: true`) |
| `dca_get_order`, `dca_list_orders`, `dca_preview_slice` | Order state and the contract's verdict on the next fill |
| `dca_pause_order`, `dca_resume_order`, `dca_edit_order` | Owner controls; edit re-plans what is left (unsigned unless `send: true`) |
| `dca_execute_slice`, `dca_cancel_order`, `dca_close_expired` | Order actions (unsigned unless `send: true`) |

**Sending transactions.** By default every write tool returns unsigned transactions for you to
sign. To let your agent send them, add your own key as `POINCARE_PRIVATE_KEY` in the server's
`env`; it then broadcasts only when a tool is called with `send: true`, and only orders owned by
that key. Use a testnet key you are comfortable delegating.

## HTTP API

Base: `https://gogjpdgluflntcgsarhn.supabase.co/functions/v1/poincare-api`

| Method | Path | Returns |
|---|---|---|
| GET | `/health` | Chain, block, whether DCA is configured |
| GET | `/regime` | Regime + summary |
| GET | `/regime/history?blocks=3000` | Detector samples + trend onsets (100..20000 blocks) |
| GET | `/quote?side=buy&amount=100` | Exact-input quote |
| GET | `/dca/orders?owner=0x...` | An address's orders with next-fill status |
| GET | `/dca/orders/:id` | One order + the contract's verdict on its next fill |
| POST | `/dca/plan` | Validate an order, preview its first fill |
| POST | `/dca/tx/create` | Unsigned approve + createOrder (`{ owner, side, amount, slices, intervalSec, ... }`) |
| POST | `/dca/tx/execute` · `/dca/tx/cancel` · `/dca/tx/close-expired` | Unsigned tx (`{ id }`); 409 while a fill would be held, the order is closed, or it has not expired |
| POST | `/dca/tx/pause` · `/dca/tx/resume` | Unsigned tx (`{ id }`); 409 if already in that state |
| POST | `/dca/tx/edit` | Unsigned editOrder (`{ id, slices?, intervalSec?, durationSec?, deadline?, maxSpreadBps?, pauseOnTrend?, catchUp?, maxSlippageBps?, limitPrice? }`; `limitPrice: null` removes it) |

Bigints are returned as decimal strings. Errors are `{ "error": "..." }` with 400 for bad input
(plus `reason`, the contract's own, for invalid orders), 404, 405, 409, 502 for upstream RPC
failures and 503 when the DCA address is not configured.

```sh
curl "$BASE/regime"
curl -X POST "$BASE/dca/plan" -H 'content-type: application/json' \
  -d '{"side":"sell","amount":"1","slices":4,"intervalSec":3600,"maxSpreadBps":0}'
```
