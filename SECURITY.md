# Security review scope

## In scope

All contracts under `src/` — 7 files, ~685 source lines (cloc), Solidity 0.8.30, Foundry project (`via_ir = true` for the hook build):

| Contract | SLOC | Role |
|---|---|---|
| `src/PoincareHook.sol` | 361 | v4 hook: detector state, pricing, hook-owned liquidity, ERC-20 LP shares |
| `src/PoincareLens.sol` | 67 | read-only quoter; must match hook execution to the wei |
| `src/libraries/AsymmetricCurve.sol` | 96 | curve math: offset constant-product, fee + spread pipeline |
| `src/libraries/Cusum.sol` | 58 | two-sided CUSUM change detector |
| `src/libraries/DirectionalSignal.sol` | 43 | EWMA directional efficiency + volatility estimate |
| `src/libraries/ControlLaw.sol` | 39 | evidence to bounded, rate-limited spread intensity |
| `src/libraries/PriceLib.sol` | 21 | log-price math |

## Out of scope

- `lib/` — third-party dependencies. Settlement (ERC-6909 claims, take/settle, unlock) is inherited from OpenZeppelin `uniswap-hooks` `BaseCustomCurve`; this repo implements only pricing and liquidity logic on top.
- `test/`, `script/`, `frontend/`, `analysis/`, `pitch/` — tests, deploy tooling, UI, research.

## Key invariants (violations are findings)

1. **Solvency.** The hook's ERC-6909 claim balances always cover what LP shares can withdraw; reserves are read from claim balances, never a shadow variable.
2. **No value creation.** No swap sequence (including round trips) may extract more than it puts in, net of fees. Rounding is always against the trader: fee rounds up, output rounds down, exact-out input rounds up. Output must stay strictly below the real reserve.
3. **Offset anchoring.** Virtual depth offsets are anchored at the first deposit and scale only with LP share supply (homothetically, preserving the mid). They must never be re-anchored to current reserves — a per-swap re-anchoring variant is round-trip drainable and was removed by design.
4. **Once-per-block sampling.** The detector samples at most once per block, on pre-swap reserves, so an atomic push-and-unwind within one block can never feed it.
5. **Bounded asymmetry.** The spread intensity kappa stays within `[kappaMin, kappaMax]` and moves at most `dMax` per block; the vol fee is capped at `feeCap`.
6. **Quote fidelity.** `PoincareLens` quotes through the same libraries and per-block projection (`previewSpread` / `previewDetector`) as the swap path and must match execution exactly, including in a fresh block before the first swap.

## Existing coverage

118 passing Foundry tests: unit, fuzz, invariant (solvency, no value creation), fork simulations, and adversarial manipulation simulations (fake-trend attacks must cost more than the spread advantage returns).

## Deployment

Testnet only (Unichain Sepolia, since 3 July 2026). Not on mainnet; no live funds at risk.

## Contact

Prakhar Srivastava — srivastavaprakhar3010@gmail.com / Telegram @prakhar_3010
