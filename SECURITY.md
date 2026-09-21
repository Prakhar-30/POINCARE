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

1. **Solvency.** Reserves are shadow-accounted: the hook books every amount it settles rather than reading a live balance. The shadow must never exceed the ERC-6909 claims backing it, so every payout is covered. Absent donations the two are exactly equal, which `invariant_shadowReservesBackedByClaims` asserts across randomized sequences.
2. **No value creation.** No swap sequence (including round trips) may extract more than it puts in, net of fees. Rounding is always against the trader: fee rounds up, output rounds down, exact-out input rounds up. Output must stay strictly below the real reserve.
3. **Offset anchoring.** Virtual depth offsets are anchored at the first deposit and scale only with LP share supply (homothetically, preserving the mid). They must never be re-anchored to current reserves — a per-swap re-anchoring variant is round-trip drainable and was removed by design.
4. **Once-per-block sampling.** The detector samples at most once per block, on pre-swap reserves, so an atomic push-and-unwind within one block can never feed it.
5. **Bounded asymmetry.** The spread intensity kappa stays within `[kappaMin, kappaMax]` and moves at most `dMax` per block; the vol fee is capped at `feeCap`.
6. **Quote fidelity.** `PoincareLens` quotes through the same libraries and per-block projection (`previewSpread` / `previewDetector`) as the swap path and must match execution exactly, including in a fresh block before the first swap.

## Claim donations: closed by shadow accounting

Reserves used to be read live from the hook's ERC-6909 claim balances. Raw ERC20 transfers
were ignored, but claims are themselves transferable, so a donation could move `_reserves()`
outside the add-liquidity path — and therefore move the price the detector samples once per
block, and the divisor share pricing uses, without the donor ever trading.

Reserves are now **shadow-accounted**: `_res0` / `_res1` record every amount the hook itself
settles, applied in `_settleReserves` (swaps) and `_bookLiquidity` (add/remove), each using
the exact amount `BaseCustomCurve` settles in the same call. Anything the hook did not settle
is invisible to pricing, to the detector, and to redemption.

What reviewers should check, since this is the risk the change introduces: the shadow can only
be wrong by drifting from the claims that back it. Three things guard that. The shadow moves in
exactly two private functions and through one checked write path (`_writeReserves`). It can only
ever be **below** the claim balance, which is the safe direction, because the only unbooked
inflow is a donation. And `invariant_shadowReservesBackedByClaims` asserts equality across
128k randomized calls in both invariant flavours, so drift fails a test rather than becoming a
silent solvency gap. `claimReserves()` exposes the live balances for comparison.

Consequence worth stating plainly: donated claims are now **stranded**. They back the pool,
they are owned by nobody, and nothing can withdraw them, because withdrawals are priced off
the shadow. That is intended — it leaves no reason to donate at all.

## Prior review

Poincaré was selected by the **Uniswap Foundation Security Fund**, which sponsored a security
review by **Olympix**, run on the 2026-07 build. The currently deployed build carries one
piece of contract logic added after that review — shadow-accounted reserves — which exists to
close the claim-donation finding below; the 2026-09 parameter recalibration changed no contract
code, only constructor arguments. The review reports only what it can
demonstrate: each finding arrives as a runnable Foundry proof of concept. Nine findings were
reported, none high-severity. Every one was fixed, and each fix carries a regression test that
fails on the pre-fix code and passes now:

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

228 passing Foundry tests: unit, fuzz, invariant (solvency, no value creation; 4 invariants x 128k randomized calls, 0 reverts), fork simulations (including quote-versus-execution through the canonical router, `FOUNDRY_PROFILE=fork`), adversarial manipulation simulations (fake-trend attacks must cost more than the spread advantage returns), and the Olympix regression suite above.

## Deployment

Testnet only. Current deployment: Unichain Sepolia (chain id 1301), hook
`0xa5ABa524A96695Dc4E36BacfF3048aD2F24AAa88`, Lens `0x5d360309c7564270c5604067d7fa85e7d2508e02`,
from block 62883477 (18 September 2026, the recalibrated build of README §9.3). Earlier builds
ran there from 3 July and 19 July 2026. Not on mainnet; no live funds at risk.

## Contact

Prakhar Srivastava — srivastavaprakhar3010@gmail.com / Telegram @prakhar_3010
