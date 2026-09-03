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

## Known, bounded residual (documented, not a fix)

Reserves are the hook's ERC-6909 claim balances. Raw ERC20 transfers to the hook are
ignored, but ERC-6909 claims are themselves transferable, so a claim donation *can* move
`_reserves()` outside the add-liquidity path. This is bounded, not free: donated claims
become pool reserves owned pro-rata by all LP shares, so the donor forfeits them and only
recovers their own share fraction — the same "manipulation must move real value at real
cost" property the detector relies on. Share pricing was hardened to price off the scarcer
funded side (rejecting zero-counterpart adds). Fully removing this surface needs
shadow-accounted reserves, a core-model change intentionally deferred to the paid audit
(a shadow reserve diverging from real claims would be a worse, solvency-class bug).
Reviewers should size the shadow-accounting trade-off explicitly.

## Prior review

The contracts were scanned by **Olympix BugPoCer** (automated pre-audit) before the current
deployment. Every reported finding was fixed, and each fix carries a regression test that fails
on the pre-fix code and passes now:

| Finding | Fix | Test |
|---|---|---|
| M-1 reentrancy: a native-ETH payout recipient reentering a swap mid-withdrawal | transient `_liquidityLock`; `_beforeSwap` reverts while a liquidity op is settling | `OlympixReentrancyTest::test_M1_reentrantSwapDuringRemove_isBlocked` |
| M-2 LP mint priced off an under-funded side | price shares off the scarcer funded side (`min`), reject zero-counterpart adds | `test_M2_zeroCounterpartAdd_reverts`, `test_M2_balancedAdd_stillWorks` |
| L-1 Lens quoted zero amounts the PoolManager would reject | Lens mirrors the `SwapAmountCannotBeZero` guard | `test_L1_lensZeroAmountQuote_reverts` |
| L-2 / L-4 log-return domain: an extreme move could revert the swap | clamp the ratio into the `lnWad` domain; skip the sample when the mid floors to zero | `PriceLib.t.sol` |
| L-3 / L-6 claim-donation resistance overstated in the docs | corrected the claim and documented the bounded residual (below) | `test_L3_claimDonation_isForfeitedToLPs` |
| L-5 first-deposit seed flooring a virtual offset to zero | reject seeds where either anchored offset rounds to zero | `test_L5_offsetSeedFloorsToZero_reverts` |
| L-7 exact-out routing dodging part of the spread | exact-out spread made the exact inverse of the exact-in haircut | `test_L7_exactOutSpread_notCheaperThanExactInInverse` |

An automated scan is not a substitute for the external human audit, which remains required
before mainnet.

## Existing coverage

131 passing Foundry tests: unit, fuzz, invariant (solvency, no value creation; 3 invariants x 128k randomized calls, 0 reverts), fork simulations, adversarial manipulation simulations (fake-trend attacks must cost more than the spread advantage returns), and the Olympix regression suite above.

## Deployment

Testnet only. Current deployment: Unichain Sepolia (chain id 1301), hook
`0x9F110F6cC0dfE0CE47f3d49CaF22e9E3220e6A88`, Lens `0x1ca28a5de680109513ce26c861e049116a2643c2`,
from block 57598397 (19 July 2026, the Olympix-fixed build; an earlier build ran there from
3 July 2026). Not on mainnet; no live funds at risk.

## Contact

Prakhar Srivastava — srivastavaprakhar3010@gmail.com / Telegram @prakhar_3010
