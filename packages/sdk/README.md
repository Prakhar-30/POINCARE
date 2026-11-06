# @poincaretrade/sdk

TypeScript SDK for **Poincaré**, a Uniswap v4 hook whose pool charges a spread only to swaps that push
**with** a confirmed trend. Read the trend regime, quote exactly what the router will execute, and run
**spread-aware DCA** orders that wait the spread out and still finish on time.

Live on Unichain Sepolia (testnet). Full docs: **https://www.poincaretrade.in/#/docs**

```sh
npm i @poincaretrade/sdk viem
```

```ts
import { createPoincareClient, recurringOrder } from "@poincaretrade/sdk";

const poincare = createPoincareClient();              // live deployment, public RPC, no keys

const r = await poincare.regime();
// { trend: "down", level: "engaged", chargedSide: "sell", spread: { buy: 0, sell: 0.0431 }, ... }

const q = await poincare.quote("buy", "100");          // 100 USDC -> WETH, to the wei

// With a viem walletClient: 100 USDC of WETH every hour, 10 times, never paying the trend spread
const dca = createPoincareClient({ walletClient });
const id = await dca.dca.create(recurringOrder({ side: "buy", amountPerBuy: "100", frequency: "1h", count: 10 }));
await dca.dca.pause(id);
await dca.dca.edit(id, { slices: 12, interval: 1800 }); // re-plan what is left
await dca.dca.resume(id);
```

Every write also exists unsigned under `dca.build.*` (`{ to, data, value, gas }`) for browser wallets,
multisigs and agents. Prices are USDC per WETH; `buy` pays USDC for WETH, `sell` pays WETH for USDC.

- [Quickstart](https://www.poincaretrade.in/#/docs/quickstart) ·
  [SDK guide](https://www.poincaretrade.in/#/docs/sdk) ·
  [Order lifecycle](https://www.poincaretrade.in/#/docs/order-lifecycle)
- Source: https://github.com/Prakhar-30/POINCARE/tree/main/packages/sdk

**Status:** testnet research preview. PoincareDCA is unaudited periphery code; the hook and the Lens it
reads were reviewed. Licensed under the Business Source License 1.1 (see LICENSE): production use needs a
commercial license from the licensor.
