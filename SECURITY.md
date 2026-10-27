# Security review scope

## In scope

All contracts under `src/` — 7 files, 1,369 lines (`wc -l`, comments included; the 2026-10
SFS-Labs independent scoped review counted 1,298 the same way at its pinned commit), Solidity
0.8.30, Foundry project (`via_ir = true` for the hook build):

| Contract | Lines | Role |
|---|---|---|
| `src/PoincareHook.sol` | 748 | v4 hook: detector state, pricing, hook-owned liquidity, ERC-20 LP shares |
| `src/PoincareLens.sol` | 126 | read-only quoter; must match hook execution to the wei |
| `src/libraries/AsymmetricCurve.sol` | 172 | curve math: offset constant-product, fee + spread pipeline, detector mid |
| `src/libraries/Cusum.sol` | 105 | two-sided CUSUM change detector |
| `src/libraries/DirectionalSignal.sol` | 93 | EWMA directional efficiency + volatility estimate |
| `src/libraries/ControlLaw.sol` | 74 | evidence to bounded, rate-limited spread intensity |
| `src/libraries/PriceLib.sol` | 51 | log-price math |

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
7. **Pool binding.** The hook binds only the PoolKey fixed at construction (`expectedPoolId`); any other key's `initialize` reverts, so nobody can bind a freshly deployed hook to a pool of their choosing before the intended one.

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

## Prior review: Olympix (2026-07)

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

An automated scan is not a substitute for a human review; an independent scoped review
followed in 2026-10 (below).

## Independent scoped review by SFS-Labs (2026-10)

An independent scoped review (manual, pre-launch) by **SFS-Labs** (Mathias Steinbach;
[github.com/SFS-Labs](https://github.com/SFS-Labs), [x.com/sfs_labs](https://x.com/sfs_labs)),
report `POINCARE-MSR-78d75e24` revision 3.0, dated 24 October 2026, pinned to commit `78d75e24`.
Scope: the seven files above. The reviewer also ran the 222-test suite, Slither, Aderyn and
Echidna in a private CI runner, and 50,000 off-chain integer-model trials of the curve
arithmetic. It is an independent scoped review, not a firm audit, certification or guarantee,
and is presented here as exactly that.

**Result: no Critical, High or Medium issue confirmed within the reviewed scope. Two Lows and
eight Notes.** Both Lows, N-4 and N-5 are fixed in code, each with a regression test in
`test/regression/SfsLabsFindings.t.sol` that fails against the pre-fix code, and N-6's stale comment is corrected. The rest are dispositioned
below with the evidence behind each call. None of the changes touches an Olympix
fix: those regression tests pass unchanged, and the log-domain clamp and the zero-mid skip
(Olympix L-2 / L-4) are reused as they were.

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| L-1 | The inherited initializer binds whichever PoolKey arrives first, and deploy and initialize are separate transactions | **Fixed.** The constructor fixes both the intended key (`expectedPoolId`) and the one address allowed to initialize it (`initializer`); `_beforeInitialize` rejects any other sender or key. Both deploy paths pass their broadcaster and confirm `poolKey()` before publishing | `test_L1_unexpectedPoolKey_cannotBindHook`, `test_L1_outsiderCannotInitializeEvenTheIntendedKey`, `test_L1_constructorRejectsMalformedKey` |
| L-2 | The detector's WAD mid quantizes small raw-unit ratios (near 10, one unit is a ~9.5% log-return) | **Fixed.** The detector samples the mid at `MID_SCALE = 1e36`. Every WAD price field (`lastSampledPriceWad`, `DetectorSample.priceWad`, and `priceWad` in `previewDetector()`'s `DetectorSnap`, at its original position) stays WAD and unchanged to the wei; the 1e36 `mid` is appended as the struct's last field | `test_L2_detectorReturnMatchesTrueMove_atSmallRawRatios`, `test_L2_wadMidWouldHaveAliasedTheSameMove`, `test_L2_zeroMid_skipsThenRecovers`, `test_L2_zeroMidAfterEstablishedBaseline_retainsStateThenRecovers`, `test_L2_previewDetectorKeepsWadPriceInPlace`, `testFuzz_L2_reportedPriceIsUnchanged` |
| N-1 | The trend label can flip before evidence reaches `h`, leaving residual κ on the new side when `dMax < kappaMax` | **Not reachable in the deployed configuration; no code change.** See below | `DeployedConfig.t.sol::test_rateLimitNeverBinds` |
| N-2 | `dMax == kappaMax`, so the rate limit never binds | **Intentional, and re-verified.** See below | `GammaFourYear.t.sol::test_compose_deployedDMaxSweep` (sweep-only: a no-op unless `POINCARE_SWEEP=1`) |
| N-3 | `_liquidityLock` is a flag, not a nesting-safe counter | **Acknowledged; no reachable nesting today.** See below | — |
| N-4 | A dust share burn can pay out zero of both tokens | **Fixed.** A burn that would pay nothing on either side reverts. Only reachable with deep virtual offsets (`alphaWad > 0`); at the deployed `alphaWad = 0` one share is always worth at least one unit (20,000 fuzzed sequences found no case) | `test_N4_dustBurnPayingNothing_reverts` |
| N-5 | `rateLimit` could overflow on an extreme `dMax`; a `dFloor` above WAD makes the gate unreachable | **Fixed.** Overflow-free `rateLimit`; the constructor rejects `dFloor > WAD` | `testFuzz_N5_rateLimitNeverOverflows`, `test_N5_unboundedDMax_stillSwaps`, `test_N5_constructorRejectsUnreachableGate` |
| N-6 | Arithmetic edge cases, and a stale NatSpec on reserves | **Comment fixed; arithmetic acknowledged.** See below | — |
| N-7 | Fee-on-transfer and rebasing tokens need an explicit policy | **Documented.** See *Supported tokens* below | — |
| N-8 | JIT liquidity and multi-block MEV economics not established | **Acknowledged residual risk.** See below | — |

The reviewer's five client questions (same-block manipulation, round-trip draining,
first-depositor inflation, Lens-versus-execution divergence, κ or fee beyond caps) all came back
with no exploitable path found, each with the stated caveat that cross-block, multi-party and
economic sequences were not proven safe.

### Remediation follow-up (2026-10-26)

SFS-Labs reviewed the remediation branch at `7699f626` against the original report: a read-only,
source-level follow-up, not a new audit or deployment clearance. It confirmed the L-1, L-2, N-4
and N-5 source changes and their regression cases, and ran 200,000 off-chain arithmetic-model
cases each for the WAD-conversion identity and the overflow-safe rate limit, all passing. The
reviewer could not run Foundry in their environment, so the test-suite and fix-removal results
here are this project's own runs, not independently verified ones.

It raised three points, all addressed:

- **L-1 residual: anyone could still initialize the intended key first.** Pinning the key stopped
  a wrong pool from binding, but the right key could be initialized by an outsider at a price of
  their choosing, making the deployer's own call revert. The pool would still have worked (when
  the hook absorbs the whole swap, v4's `Pool.swap` returns before any slot0 or price-limit
  check), but deployment order was open to interference and integrators would see an arbitrary
  slot0 price. The constructor now also fixes an `initializer`, the only address allowed to
  initialize; it has no power after that. `test_L1_outsiderCannotInitializeEvenTheIntendedKey`.
- **L-2: `previewDetector()` changed shape.** The fix had replaced the WAD `priceWad` field of the
  public `DetectorSnap` with a 1e36 `mid`, so a positional decoder would have read the wrong
  units. `priceWad` is restored in place; `mid` is appended. `test_L2_previewDetectorKeepsWadPriceInPlace`
  checks the raw return word. The earlier claim that every reported price was unchanged was wrong
  for this view until this fix.
- **L-2: recovery after an established baseline.** Now tested: a zero-mid interval leaves every
  persisted detector field untouched, and the first representable sample afterwards reads one
  return spanning the gap against the last good sample, clipped like any other. That is intended
  behaviour. `test_L2_zeroMidAfterEstablishedBaseline_retainsStateThenRecovers`.

The reviewer's attribution and wording notes are applied: the reviewer is SFS-Labs, and public
wording (README, the frontend strip) describes an independent scoped review, not an audit or
certification.

### N-1 and N-2: the rate limit, and why it stays non-binding

`ControlLaw.step` moves κ toward the target for the current evidence by at most `dMax` a block.
The deployed configuration sets `dMax = kappaMax = 0.05` with `kappaMin = 0`, so any two values in
the band are at most `dMax` apart and κ always lands exactly on its target. κ carries no memory
from one sample to the next.

That settles N-1. A residual can only exist when κ lags its target. Here it never does: when
the label flips on evidence below `h`, the target is `kappaMin = 0` and κ is 0; when the evidence
is above `h`, κ is the target built from the new direction's evidence, so it lands on the
correct side.

For N-2, the question was whether a binding limit would serve LPs better, so it was measured.
Four years of real ETH/USDC (7,776 four-hour bars, $2M seeded, LP value marked at the external
price), at the deployed gate, changing only `dMax`:

| `dMax` | LP value | vs deployed |
|---|---:|---:|
| 0.01 | 3,039,815 | −58 bps |
| 0.02 | 3,047,668 | −32 bps |
| 0.03 | 3,051,860 | −19 bps |
| 0.04 | 3,055,551 | −7 bps |
| **0.05 (deployed)** | **3,057,581** | — |

LP value falls with every step of tightening. The earlier one-at-a-time sweep had shown that
`dMax = 0.01` helps under the old gate but hurts once the gate is lowered: the two are
sub-additive. A one-off variant of the harness (not committed) that also applied either N-1
fix (relabel only past `h`, or reset κ on a direction flip) moved the binding rows by under
7 bps and changed nothing at `dMax = 0.05`, as the argument above predicts.

So the limit stays non-binding, and `test_rateLimitNeverBinds` pins it. Anyone who later makes
it bind has to deal with N-1 first. Caveat: the study runs on 4-hour bars while the hook samples
every block, so the ordering is the evidence here, not the exact basis points.

### N-3: the liquidity lock

`lockLiquidity` sets the transient flag to 1 and clears it to 0, so a nested liquidity call would
clear it early for the outer one. That nesting is not reachable. Inside `removeLiquidity` the
payout happens within `PoolManager.unlock`, and any nested `addLiquidity` or `removeLiquidity`
must unlock again and reverts. The only external call outside an unlock is the native-ETH
refund at the end of `addLiquidity`, after shares are minted and reserves booked, so nothing is
left half-settled for a nested call to exploit. Saving and restoring the previous value would be
more robust under future edits; any change to the liquidity call order should revisit this.

### N-6: arithmetic edge cases

- `Math.sqrt(amount0 * amount1)` on the first deposit can only overflow if both amounts are near
  2^128, and an amount that large already fails the uint128 reserve check, so the deposit reverts
  either way.
- `PoincareLens.effectivePriceWad` multiplies `WAD * amountIn`, which overflows only for
  `amountIn` above about 2^196. No swap can carry that (amounts are int128), so the view reverting
  there costs nothing. Returning 0 for a zero amount is intentional: there is no price to report.
- The stale header that described reserves as live claim balances is corrected.

### Supported tokens (N-7)

Supported: standard ERC-20s that transfer exactly the amount requested, and native ETH.

Not supported:

- **Fee-on-transfer tokens.** They fail safely. The PoolManager's `settle` credits what actually
  arrived, the hook's delta is left unsettled, and the transaction reverts.
- **Rebasing tokens.** A rebase changes the PoolManager's real balance but not the fixed claims
  the hook holds, so a positive rebase accrues to nobody in the pool and a negative one leaves
  those claims under-backed at the PoolManager.
- **Tokens with transfer hooks** (ERC-777 style). They were not considered in this review.

Claims donated to the hook are deliberately stranded (see above).

### N-8: residual economic risk

LP shares accrue fees and the retained spread, so liquidity added just before order flow and
removed after captures part of it, as on any v4 pool. Bounding κ and the fee bounds what any
single swap pays. It does not prove that every multi-block or sequencer-ordered strategy is
unprofitable. The manipulation suite shows fake trends cost more than the spread they earn back,
under the scenarios it models. Fully adversarial MEV, adversarial JIT, and Unichain/Base
sequencer ordering remain open economic questions. They are listed as residual risk, not closed.

## Existing coverage

243 passing Foundry tests in the default suite: unit, fuzz, invariant (solvency, no value creation; 4 invariants x 128k randomized calls, 0 reverts), adversarial manipulation simulations (fake-trend attacks must cost more than the spread advantage returns), and both regression suites above. The fork simulations (including quote-versus-execution through the canonical router, `FOUNDRY_PROFILE=fork`) need a Sepolia RPC and run separately.

## Deployment

Testnet only. Current deployment: Unichain Sepolia (chain id 1301), hook
`0x89A520e7faEd35CB6F89b0040F5Bc5ADe035Aa88`, Lens `0xe685a9e01a46f6ff581ffbd6b409e1cef4ab2fa2`,
from block 66190311 (26 October 2026). This is the build carrying every fix from the 2026-10
independent scoped review above, merged to `main` in PR #1. On chain: the hook is bound to the
USDC/WETH dynamic-fee pool (tick spacing 60) it was pinned to, its `initializer` is the deployer,
and it is seeded at 3,000,000 USDC : 1,000 WETH. Earlier builds ran there from 3 July,
19 July and 18 September 2026 (block 62883477, hook `0xa5ABa524…AAa88`, which predates these
fixes). Not on mainnet; no live funds at risk.

## Contact

Prakhar Srivastava — srivastavaprakhar3010@gmail.com / Telegram @prakhar_3010
