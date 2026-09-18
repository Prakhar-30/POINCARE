# Poincaré: Open Items / Audit Tracker

Living checklist of every known gap, deferred decision, placeholder, and security concern, so
none is lost before MVP done (CLAUDE.md §11). Reviewed across all libraries built to date.
Status keys: 🔴 blocking-for-MVP · 🟠 must-resolve-before-deploy · 🟡 track / calibrate · ✅ done.

Last full review: through M8 (hardening) + fork simulations (synthetic + real ETH/USDC) + an
item-closeout pass (A5, A7, B3, B5, C3, C4, C5 closed on existing evidence; A9 kept for external
audit) + the Olympix security review sponsored by the Uniswap Foundation Security Fund (all
findings fixed, see H below).

**2026-07 feature pass** (suite now 131 tests, 0 failures; invariants run in TWO flavors —
plain MVP and full-feature: deep base + vol fee + adaptive detector — 128k calls each, 0 reverts):
- **E0 shipped**: deep symmetric base via SUPPLY-SCALED virtual offsets (see E0 below for why the
  two obvious parameterisations are unsafe). Output-feasibility guards added for both swap kinds.
- **E2 shipped**: always-on Huber clip on the detector increment (`clipWad`, injected).
- **v2 adaptive detector shipped** as a deploy-time mode (`adaptive`): CUSUM increments
  standardized by the live σ̂ (from `ewmaTV`), `k/h/sMax` in σ-units, `sigmaFloor` guard.
  Backtest: −29.6% LVR vs CPMM on the synthetic path (vs −14.3% for the absolute mode) with NO
  absolute-scale calibration. σ-inflation attack simulated in `Manipulation.t.sol` (costs value
  every block; blindness decays with λ). The full §9.2 manipulation-cost bound for production
  remains open — see V1 below.
- **Vol-scaled base fee** (`feeGamma`, `feeCap`): `fee = min(γ·σ̂, cap)`, charged input-side in
  pricing (accrues to reserves/LPs), reported via `_getSwapFeeAmount` for the HookSwap event.
  Calm-market LP revenue generated from data, never a constant.
- **Detector exposure**: `DetectorSample` event (one per sampled block: price, r, S⁺/S⁻, D, σ̂,
  κ, trend, fee), `cusumState`/`signalState`/`sigmaWad`/`currentFeeWad`/`baseOffsets` views.
- **Projection architecture**: detector logic lives in the view `_projectDetector`; the swap
  path persists it, `previewSpread`/`previewDetector` expose it, and the Lens quotes through it —
  quotes now match execution to the wei even in a FRESH block (proven in `PoincareLens.t.sol`).
- **G8 resolved**: detector state packed 8 slots → 4; per-block overhead ~120k → ~96k gas
  (including the new event + fee law).
- **Native-ETH pairs covered**: `PoincareNativeEth.t.sol` (seed with msg.value + refund, swaps
  both directions, Lens parity, removal pays ETH).
- **Config struct**: constructor takes `PoincareConfig`; all new params injected + validated.
- Template leftovers (`Counter` test/scripts) removed; build compiles clean from a fresh clone.

---

## A. Security

| # | Item | Where | Status | Notes |
|---|------|-------|--------|-------|
| A1 | **Single-block / flash manipulation of the detector.** §4.2 requires sampling so *one block cannot move the statistic*. | hook | ✅ | **Implemented** in `_sampleAndUpdateDetector` (samples once per block off pre-swap reserves) AND **tested** end-to-end: `test/manipulation/Manipulation.t.sol::test_singleBlockFlash_doesNotMoveDetector` dumps 30 ether and buys it back in one block and asserts κ stays 0 / the sampled price tracks the settled price, not the spike. Holding a move across a block boundary is still possible (the intended, arbitraged cost). |
| A2 | **Curvature-only asymmetry is arb-exploitable.** Proven by a concrete buy-shallow/sell-deep round-trip counterexample. | `AsymmetricCurve` | ✅ (mitigated) | Resolved by implementing the asymmetry as a **non-negative directional spread on a symmetric-depth base** (arb-safe by construction; round-trip fuzz gate). See E1 for the deferred curvature lever. |
| A3 | **`κ_max` security-sizing: resolved for the spread lever, open for the depth lever.** | `ControlLaw` cfg | ✅ (spread) / 🟠 (depth E1) | For the **spread** lever shipped in the MVP the §4.2 inequality holds *by construction*: the soft (against-trend) side trades at the base constant-product price, so `max_soft_gain ≡ 0 < min_trigger_cost` with margin = the entire trigger cost (proven in `test/backtest/Backtest.t.sol`). `κ_max` therefore need not be security-sized for the spread lever; it is a pure tuning/seam cap. The sizing IS required before deploying the depth/curvature lever (E1), which would create a non-zero soft-side prize. |
| A4 | **Manipulation simulation: present (spread lever).** | `test/backtest/` + `test/manipulation/` | ✅ (spread) / 🟠 (depth E1) | `Backtest.t.sol::test_manipulation_softGainIsZero_triggerCostPositive` proves soft-side output == constant-product output (no prize) + positive trigger cost. `Manipulation.t.sol` adds two END-TO-END (real PoolManager) sims: a fake-trend round trip loses money (`test_fakeTrendRoundTrip_isUnprofitable`), and the single-block flash guard (A1). The depth-lever adversarial suite is deferred with E1. |
| A5 | **PriceLib reverts on zero reserve / zero price.** | `PriceLib` / hook | ✅ (mitigated) | Reserves provably stay > 0 under the constant-product base: `swapExactIn` output is always strictly `< reserve` (math), `swapExactOut` rejects impossible requests (A7), and the `MINIMUM_LIQUIDITY` lock (A10) leaves a dust floor `removeLiquidity` cannot withdraw. Confirmed empirically by `invariant_reservesStayPositive` (384k ops). The `require(r0>0 && r1>0)` guard means the only revert is the legitimate "swap into an empty pool" case, not a detector-induced one, so §4.5 holds. (Residual: an extreme-imbalance pool with `r1 > 1e6·r0` could round a dust reserve to 0 → clean `require` revert, not a fund loss; not reachable for sane pairs like ETH/USDC.) |
| A6 | **`Cusum.update` (uncapped) can overflow-revert** under sustained drift on the hot path. | `Cusum` | ✅ (mitigated) | Hook MUST use `updateCapped` (or `step`) on-chain; plain `update` is back-test only. Enforced by convention (see D1). |
| A7 | **Swap feasibility.** | `AsymmetricCurve` / hook | ✅ | On the shipped `a=b=0` base the "infeasible output" case **cannot occur**: `swapExactIn` gives `amountOut = Y − ⌈XY/(X+amountIn)⌉ < Y` (strictly less than the output reserve), and the spread haircut only shrinks it further. `swapExactOut` reverting when the requested output ≥ reserve is **correct AMM behaviour** (you cannot buy more than the pool holds; the router's `amountInMax` also bounds it), so it is the AMM's revert, not a detector/§4.5 revert. Exercised by the invariant handler (random exact-in/out) and the Lens + manipulation exact-out tests, all with feasible amounts succeeding. |
| A8 | **Rounding direction preserved end-to-end.** | hook | ✅ | The invariant suite (`test/invariant/`) drives 384k randomized swaps/liquidity ops and asserts (a) the hook's reserves equal independent ghost accounting to the wei (no favorable rounding leak), and (b) the constant-product invariant never decreases on a swap (no value creation by traders). |
| A9 | **Reentrancy / settlement correctness** (ERC-6909 claims, `take`/`settle`/`sync`). | hook | 🟠 (external audit only) | **Accounting correctness: ✅ proven.** The invariant suite shows exact ghost-conservation across 384k ops with 0 reverts, and now also that the shadow reserves equal the claims backing them. **Reentrancy: no vector in our code.** The hook's mutating path makes NO external calls except the view `poolManager.balanceOf` in `claimReserves()`; settlement runs inside `PoolManager.unlock`'s own reentrancy lock via the audited OZ `BaseCustomCurve`. The only residual is the **standard external security audit before mainnet**, which is not self-certifiable, so it is kept open for that reason alone. |
| A10 | **First-deposit / share-inflation.** | hook | ✅ | Resolved: a fixed `MINIMUM_LIQUIDITY = 1000` is locked to `0xdead` on the first mint (UniV2-standard guard), so the share supply can never be driven to dust. Also note reserves are ERC-6909 **claims** (not raw `balanceOf`), so a plain token donation cannot skew them. |

## B. Conceptual / design decisions (settled vs open)

| # | Item | Status | Resolution / plan |
|---|------|--------|-------------------|
| B1 | Detector window = O(1) EWMA (no sample buffer). | ✅ settled | Manipulation-resistance + gas. |
| B2 | Return space = log-price (`r_t = Δln price`). | ✅ settled | One `ln`/swap at hook boundary. |
| B3 | Price source = **hook reserves**, not PoolManager `slot0`. | ✅ settled | Confirmed in M5 and used throughout: reserves = `poolManager.balanceOf(hook, currencyId)` (ERC-6909 claims); `slot0` is bypassed by the custom curve. Exercised by the integration, invariant, and both fork simulations. |
| B4 | **Reset-on-fire vs accumulate-for-κ** (the Cusum policy tension). | ✅ settled | κ is driven by `updateCapped` (accumulate, capped at `sMax`) so the statistic *magnitude* persists for `ControlLaw`. CUSUM `reset` is used only to end a trend episode, not per-fire. The hook owns this. |
| B5 | With/against-trend mapping per swap. | ✅ settled | Implemented in `_spreadFor`: up-trend ⇒ `oneForZero` (buying token0) is with-trend; down-trend ⇒ `zeroForOne` (selling token0) is. Tested in `PoincareHook` / `PoincareLens` (asymmetric spreads) / `Manipulation` and re-verified in the M7 review. |
| B6 | Asymmetry realized as **directional spread** (this turn), not yet curvature. | 🟠 see E1 | Faithful to §3.1/§4.1 "bid-ask spread"; the §10 "curvature lever" is deferred (E1). |

## C. Hardcoded / placeholder values

| # | Item | Status | Notes |
|---|------|--------|-------|
| C1 | `WAD = 1e18` literal/constant across libs. | ✅ ok | Standard; now a named constant in each lib (incl. `AsymmetricCurve`). |
| C2 | All detector/curve params (`lambda, k, h, sMax, kappaMin/Max, dMax`) are **injected**, never baked. | ✅ ok | Validated by `*.isValidConfig`. |
| C3 | **Test parameter values are illustrative, not calibrated.** | ✅ (by design) | Correct as-is: tests deliberately use illustrative configs, and ALL params are injected + `isValidConfig`-validated, never baked into the contracts. Production calibration is a deploy-time step with the tooling now built (`CALIBRATION.md`, the back-test, and the real-data fork run). Not a code gap. |
| C4 | Calibration harness noise model is **uniform / illustrative**. | ✅ | The **empirical (real, heavy-tailed) return distribution** now flows through the detector in the fork real-data run (`test/sim/ForkRealData.t.sol`, 6 months of real ETH/USDC). The uniform model in `Calibration.t.sol` is intentionally for the qualitative-law tests (ARL₀ monotone in `h`, delay shrinks with drift), which don't need real tails. |
| C5 | `ControlLaw` ramp is **linear**. | ✅ (decided) | Linear is monotone and sufficient; the bid-ask seam is bounded by the rate-limit `Δκ_max`, not the ramp shape. Smoothstep stays an optional future refinement, not a gap. |

## D. Conventions the hook MUST honor (or safety breaks)

- **D1.** Drive κ from `Cusum.updateCapped(..., sMax)`, never uncapped `update` on-chain (A6).
- **D2.** Keep the curve's base depth **symmetric** (same `(a,b)` for both swap directions); put ALL asymmetry in the non-negative directional spread. Asymmetric base depth is arb-unsafe (A2/E1).
- **D3.** Sample `r_t` at most once per block (A1).
- **D4.** Guarantee reserves > 0 (A5) and size trades for feasibility (A7).
- **D5.** Round against the trader everywhere, including the delta accounting (A8).
- **D6.** Source `sMax` and the spread (`κ`) only from validated config (`isValidConfig`): `sMax ≥ 0`, `κ ≤ κ_max < WAD`. The hot-path math is guard-free and relies on this (G3).

## E. Deferred features (post-MVP-core or pending analysis)

- **E0. Deep "stableswap-like" calm base (§2.1).** ✅ **Shipped (2026-07)** via `alphaWad`:
  offsets are anchored at the first deposit (`a₀ = α·r0_seed, b₀ = α·r1_seed`) and thereafter
  scale ONLY with the LP share supply. Why this exact parameterisation, recorded so it is never
  "simplified" away:
  * offsets ∝ CURRENT reserves recomputed per swap are round-trip **drainable** (at α = 1 a
    100/100 pool is emptied in two swaps — the re-anchoring shifts the mid);
  * FIXED absolute offsets shift the mid on every ratio deposit/withdrawal (free arb per LP op);
  * supply-scaled offsets are constant within/between swaps (one fixed curve, K conserved, no
    seam) and scale homothetically with ratio liquidity ops (mid preserved EXACTLY — asserted).
  New feasibility guards reject outputs ≥ the REAL reserve (the virtual reserve is larger, A7
  extended to exact-in). Covered by unit + fuzz + the full-feature invariant flavor. The Lens
  reads `baseOffsets()` live, so quotes keep matching.
- **E1. Curvature / depth-asymmetry lever (§3.1, §10).** The brief's headline lever (small vs large offsets) is arb-unsafe alone (A2). Deploying it safely needs the manipulation-cost sizing (A4) to bound the depth-arb with a dominating spread. Deferred until §4.2 analysis exists. Current MVP uses the spread lever, which is safe and still implements the bid-ask asymmetry.
- **E2. Robust / heavy-tailed CUSUM increment (§1.4).** ✅ **Shipped (2026-07)**: an always-on
  Huber clip (`clipWad`, injected; absolute units in fixed mode, σ-units in adaptive mode) bounds
  any single block's influence on the signal, σ̂ AND the evidence. Doubles as the σ-inflation
  guard for the adaptive mode (σ̂ can grow at most a clip-bounded factor per block).
- **V1. Adaptive-mode (v2) manipulation-cost bound (README §9.2).** 🟠 The adaptive detector is
  implemented, tested (incl. the σ-inflation sim) and backtested, but the *quantitative*
  worst-case bound for σ-driven attacks (inflate-to-blind / suppress-to-trigger) has not been
  derived analytically. Fine for the testnet demo (which deploys the absolute mode); required
  before deploying `adaptive = true` with real value. Guards in place: `sigmaFloor` (suppression),
  clip (per-block inflation rate), once-per-block sampling, D-gate, absolute κ/fee caps.
- **E3. ~~Lens/Quoter (§5, M7)~~ ✅, ~~back-test harness (§6, M6)~~ ✅, invariant suite (§9.3), gas profiling (§9.6).**
  Lens DONE: `src/PoincareLens.sol` + `test/PoincareLens.t.sol` (8 tests). Reads reserves + the
  directional spread (`hook.effectiveSpread`) from the hook and runs the SAME `AsymmetricCurve`
  library, with quotes proven to match execution to the wei (calm + trend, exact-in + exact-out).
  Mirrors the `a=b=0` base (E0).
  Back-test DONE: `test/backtest/Backtest.t.sol` + `analysis/backtest/BACKTEST.md`. On the synthetic
  regime path, Poincaré reduces LVR **14.3 %** vs constant-product (vs 11.5 % for a same-spread
  symmetric vol-fee) while taxing uninformed flow **~2× less**; detection delay 6 blocks; §4.2
  inequality demonstrated for the spread lever. Real-data calibration of `k,h,window,κ` still
  pending a price series (the engine is data-ready, just drop into `_pathReturn`).

## G. Pre-M5 self-review (adversarial pass over all libraries)

| # | Finding | Severity | Disposition |
|---|---------|----------|-------------|
| G1 | **`DirectionalSignal` (D) is ORPHANED from the pipeline.** The detection path is `PriceLib → r_t → Cusum.updateCapped → ControlLaw → κ → spread`. Nothing consumes `DirectionalSignal.signal()`. The brief (§1.1) positions D as the "noise floor / diagnostic," and CUSUM is fed `r_t` directly, so D was never the CUSUM input, but its actual ROLE is currently undefined and unwired. Milestone 2 *looks* complete but contributes nothing to detection yet. | conceptual, important | **Resolve in M5.** Recommendation: gate the asymmetry on `D ≥ D_floor` (a second confirmation that the move is directional, not just that CUSUM crossed), AND expose D via the Lens as a diagnostic. This is a real design decision, so confirm before wiring. |
| G2 | **`int256(ratioWad)` cast + `lnWad` domain** (`PriceLib.logReturnWad`). A single-step price move beyond ~5.7e58× would cast to a negative int256 and revert `lnWad`; a >1e18× single-step *drop* makes `ratioWad == 0` and also reverts. | low | Infeasible in one step with finite reserves + per-block sampling (A1). Acceptable; relies on those bounds. No guard added (would cost gas on every swap). |
| G3 | **Defense-in-depth on config-derived inputs.** `Cusum.updateCapped` assumes `sMax ≥ 0`; `AsymmetricCurve.*WithSpread` assume `spreadWad < WAD` (else underflow / div-by-zero → revert, violating §4.5). No in-function guards, since both rely on upstream `isValidConfig` (`sMax = ControlLaw.sMax > h ≥ 0`; `spreadWad = κ ≤ κ_max < WAD`). | low | Documented as a hard convention (added to D-list, D6). Kept guard-free for gas; the hook MUST source these from validated config. |
| G4 | **No security breach in the pure libraries.** K-invariant (never decreases), arb-safe spread (round-trip never profits, now tested both directions), bounded EWMA (`|net| ≤ tv` preserved under flooring), validated configs, all hold. The real risks are **system-level** (A1 single-block manipulation, A3/A4 manipulation sizing) and surface only once the hook assembles the parts. | n/a | Tracked in §A; gated on M5/M8. |
| G5 | ~~**All libraries are proven in ISOLATION; zero integration tests.**~~ | ✅ resolved (M8) | Integration coverage now: hook (M5), Lens quote-match (M7), and the invariant suite (`test/invariant/`, 384k randomized ops, solvency + bounds). |
| G8 | ~~**Per-block detector gas ~120k (warm).**~~ | ✅ resolved (2026-07) | Detector state packed 8 slots → 4 (`sPos/sNeg` int128 pair; `ewmaNet/ewmaTV` int128/uint128 pair; `kappa` uint64 + `trend` + `lastSampledBlock` uint64 in one slot). Downcast safety: `sMax ≤ int128.max` enforced at construction; EWMA bound `|r| ≤ ~94e18` (lnWad domain, G2) × `WAD/(WAD−λ)` stays under int128.max for every valid λ. Measured ~96k/block warm INCLUDING the new `DetectorSample` event + fee law (`test/Gas.t.sol`). |
| G6 | **Stale trend label during a reversal.** `trend = dir` was assigned every sample, even when evidence was gated off (chop / D below floor) while `κ` was still ramping down from a prior episode, a noise-driven flip of the dominant statistic could briefly harden the wrong side. | low | ✅ **Fixed** (M6 review): `trend` is now re-labelled only when `gatedEvidence > 0`, so the label always matches the side κ was built for; once κ reaches 0 the label is irrelevant. Arb-safe either way (non-negative haircut), so this was a market-quality nit, not a solvency bug. |
| G7 | **Dead code sweep (M6 review).** `Cusum.reset()` was unused in `src` and `test` (the reset-on-fire path is inside `step()`; the hook ends episodes via the D-gate ramp-down, not an explicit reset). | cleanup | ✅ **Removed.** Kept (test-only / reserved): `Cusum.step`/`alarm`/uncapped `update` (reset-on-fire + back-test paths), `marginalPriceWad` (reserved for the Lens, M7), `PriceLib.logReturnFromReserves` (back-test). All exercised by the M6 harness or M7. |

## F. Testing gaps (vs §9 "definition of done")

- ✅ Unit + fuzz for `Cusum`, `DirectionalSignal`, `AsymmetricCurve` core, `PriceLib`, `ControlLaw`, spread.
- ✅ Invariant suite (`test/invariant/PoincareInvariant.t.sol`): solvency/no-leak + bounds across 384k randomized ops.
- ✅ Hook integration coverage now includes exact-output via router (Lens + manipulation tests), multiple LPs / fair dilution (invariant handler add/remove), and the delta-accounting rounding direction (A8). NOT yet covered: native-ETH pairs.
- ✅ G1 resolved (D gates the asymmetry, implemented + tested). ✅ B3 resolved (reserves = 6909 balances).
- ✅ Manipulation sim for the spread lever (A4); depth-lever suite deferred with E1.
- ✅ Back-test (LVR reduction vs CPMM and vs vol-fee) via `test/backtest/Backtest.t.sol` (M6 done on
  synthetic path; real-data calibration pending a price series).
- ✅ Integration via PoolManager + gas profiling (`test/Gas.t.sol`; ~120k/block detector overhead, see G8).

## I. Real-data calibration and the baseline it exposed (2026-09)

The detector's `k` and `h` are now **derived from the target pair's own return distribution**
rather than hand-set, and the real-data replay gained the baseline that makes its number
interpretable. Both changed the honest reading of the result, so it is recorded here in full.

| # | Item | Status | Notes |
|---|------|--------|-------|
| I1 | **Empirical calibration harness.** CALIBRATION.md's stated milestone-6 gap ("still pending: a real return series"). | ✅ | `test/calibration/RealDataCalibration.t.sol` measures ARL₀ and detection delay by bootstrapping the **demeaned real returns** (drift removed, kurtosis ≈ 7 kept), on the **first half** of the series only. Derives `k = μ₁/2 = 0.25σ` and finds `h = 6.25σ` by search against a target ARL₀ ≥ 120 bars. Achieved: ARL₀ = 124 bars (≈20 days), delay 23 bars. |
| I2 | **The previous replay config was firing every 2½ days.** | ✅ (recorded) | `k = 0.005, h = 0.03` measures ARL₀ = **15 bars** on this distribution. A detector that re-arms inside chop turns the directional lever into an indiscriminate spread. `test_preCalibrationConfig_wasFiringFarTooOften` keeps it on record. |
| I3 | **Symmetric vol-fee baseline added to the real-data replay.** | ✅ | Third pool, `min(γ·σ̂, cap)` both ways, γ sized to match the cost to uninformed flow. Any spread cuts LVR, so the old "beats `x·y=k`" comparison could not separate the detector's contribution from the mere presence of friction. |
| I4 | **Re-measured on a fresh 12 months with a properly matched friction budget (2026-09).** | 🟠 **open finding, changed** | On the 2025-09-13 → 2026-09-12 window, with `FEE_GAMMA` retuned so both pools cost uninformed flow 3,521 USDC (matched to 0.01%, asserted): LVR −4.27% (Poincaré) vs −4.41% (vol-fee); LP value advantage **+23,706 vs +18,184**, i.e. 6.73 vs 5.17 of LP value per unit of trader cost. The two metrics disagree and both are published. Note the first run of this window tripped the equal-friction assertion at 28.5% (Poincaré was spending 40% more), which would have produced a flattering but unfair "Poincaré wins on LVR" headline; the assertion is what caught it. |
| I5 | **Captive uninformed flow biases I4 against Poincaré.** | 🟠 next | The harness forces the same noise order through every pool, so a benign trader pushing with the trend pays the full `κ` (up to 5%) instead of routing away from it, which is what README §8 says routers should do. This inflates Poincaré's measured cost to benign flow and so understates its advantage per unit of *real* trader cost. A routing-aware flow model (uninformed order skips a pool quoting beyond a tolerance) is the single change most likely to move I4. Not attempted yet; note it cuts in our favour, which is exactly why it needs doing carefully rather than assumed. |
| I6 | **Friction budgets matched only approximately.** | 🟡 | Realised: 3,925 (Poincaré) vs 3,100 (vol-fee) USDC. The test asserts within 25% and prints both. The direction matters: the baseline did better on a *smaller* budget, so closing the gap would favour the baseline, not us. `FEE_GAMMA` can be retuned if the flow model changes. |
| I7 | **Synthetic study is now seed-swept.** | ✅ | `test_multiSeed_poincareNeverTrailsControl` runs the 8-regime path on 5 independent seeds with fresh pools each, asserting `LVR ≤ control` on **every** path and reporting min/mean/max, retiring the "single seed" caveat the write-up carried. |

**What this means for the claims.** The synthetic stress path (−29.7%) is trend-dense by
construction and should be quoted as what it is: a stress test, not a forecast. The defensible
real-data claims are (a) LVR ≤ constant product always, asserted; (b) the advantage concentrates
in genuine trends, shown by the half-window split; and (c) against-trend and calm-market flow pays
**nothing**, which no LVR aggregate captures but a symmetric fee can never match.

## J. The Detector Lab: built, then removed (2026-09)

An in-app replay of the pool's recorded `DetectorSample` trace under arbitrary detector
parameters, backed by an exact TypeScript port of `Cusum.sol`, `DirectionalSignal.sol` and
`ControlLaw.sol`. It was built, shipped and then **removed** as not carrying its weight in the
product: it was a verification tool for one reviewer's question rather than something a trader or
LP used. The code is in git history (`frontend/src/lib/detector.ts`, `replay.ts`,
`app/screens/Lab.tsx` and their tests) if the approach is ever wanted again.

Two things are worth keeping from it, because they were real and are cheap to redo:

- **The port reproduced the chain exactly.** Replaying the deployed parameters over 362 real
  Unichain Sepolia blocks matched the emitted trace to **0 wei** on both CUSUM statistics, with no
  trend mismatches. That is evidence the on-chain detector is deterministic and portable, and it
  would be the basis of any future off-chain simulator or calibration tool.
- **Three real defects surfaced while building it**, all fixed at the time: `toWad` used
  `toFixed(18)`, which prints a float's binary expansion and put parameters several wei off; the
  narration cache had no invalidation path, so one truncated answer would have been served
  permanently (now namespaced by `CACHE_VERSION`); and enabling the adaptive detector against a
  pool deployed with `sigmaFloor = 0` divided by zero, which is a configuration the hook's own
  constructor would refuse.

**What survives in the product:** the plain-English narration of the live detector state on the
Analytics screen, and its `ai_notes` cache. `detector_configs` and `detector_samples.wad` existed
only for the Lab and are dropped by `frontend/supabase/migration_005_drop_lab.sql`.

## K. Shadow-accounted reserves (2026-09, closes the UHI10 judge's note)

The UHI10 hookathon judge's single improvement (scores: 4.35/5 overall) was that `_reserves()`
read live ERC-6909 claim balances, which anyone can move by transferring claims to the hook,
biasing the once-per-block detector sample without touching share supply. Their prescription was
specific: keep shadow reserves in storage, update them in the swap and mint/burn paths, and have
`invariant_reservesMatchGhostAccounting` compare them against the claim balances.

Implemented, with one deviation and one simplification worth recording.

| # | Item | Status | Notes |
|---|------|--------|-------|
| K1 | **Shadow reserves.** `_res0`/`_res1`, one packed slot, moved only by `_settleReserves` (swaps) and `_bookLiquidity` (add/remove) through a single checked write path. | ✅ | Each applies the exact amount `BaseCustomCurve` settles in the same call, so the shadow tracks the claims rather than predicting them. `_bookLiquidity` applies `-callerDelta`, which is the flow that actually settled rather than the one we asked for, and makes add and remove one line of arithmetic instead of two branches that could disagree. |
| K2 | **The invariant the judge asked for.** | ✅ | Added as `invariant_shadowReservesBackedByClaims` rather than folded into the existing ghost check, because the two assert different things: the ghost check is "did we account for every flow", this is "is what we price from backed by what we hold". Asserts `shadow <= claims` (the safety direction) *and* exact equality, since the handler never donates. Runs in both invariant flavours at 128k calls. |
| K3 | **The exact-out fee replay had to go.** | ✅ | `_getSwapFeeAmount` recovered the fee by re-running the pricing, which required `_reserves()` to still hold its pre-swap value. With the shadow updated during pricing, that replay would read post-swap state and report a wrong fee in `HookSwap`. The pricing already returns the exact split, so it is now carried across in a transient variable. Strictly better: one less place for the event to drift from reality. |
| K4 | **Gas went down, not up.** | ✅ | Per-block detector overhead 96k → **94.7k**. Two external `balanceOf` staticcalls per reserve read became one packed SLOAD, and the exact-out replay disappeared. |
| K5 | **Donated claims are now stranded, not gifted.** | 🟡 (behaviour change, intended) | Previously a donation accrued pro-rata to existing LPs. Now nothing can withdraw it, because redemption is priced off the shadow. This is the stronger position: it removes any reason to donate. The regression test `test_L3_claimDonation_cannotMoveReservesOrDetector` asserts the claims really arrive, and that reserves, the sampled price, share pricing and redemption are all unmoved. |
| K6 | **The risk this introduces.** | 🟡 (guarded) | A shadow that drifts from real claims would be a worse, solvency-class bug than the donation surface it replaces — which is exactly why it was deferred before. Guards: the shadow moves in two functions through one checked write; it can only ever sit *below* the claims, which is the safe direction, since the only unbooked inflow is a donation; and equality is asserted across 384k randomized ops. `claimReserves()` exposes the live balances so the two can always be compared on-chain. |

---

## H. Olympix security review (2026-07, all findings fixed)

Sponsored by the **Uniswap Foundation Security Fund** and run before the current Unichain Sepolia
deployment. Every finding is fixed and carries a regression test that fails on the pre-fix code
and passes now (`test/regression/OlympixFindings.t.sol`; L-2/L-4 live in `PriceLib.t.sol`).

| # | Finding | Status | Fix |
|---|---------|--------|-----|
| M-1 | Reentrancy: a native-ETH payout recipient can reenter a swap mid-withdrawal and price against half-settled reserves. | ✅ | Transient `_liquidityLock` set across the whole add/remove incl. settlement; `_beforeSwap` reverts while it is set. |
| M-2 | LP mint priced off token0 while the token1 counterpart floored down, minting claims token1 never backed. | ✅ | Shares priced off the scarcer funded side (`min` of both ratios); zero-counterpart adds rejected. |
| L-1 | Lens returned a quote for a zero amount that a real swap would revert on. | ✅ | Lens mirrors the PoolManager `SwapAmountCannotBeZero` guard, so quotes stay execution-faithful. |
| L-2 / L-4 | Log-return domain: an extreme move could make `lnWad` revert, i.e. the detector could revert a swap (violating §4.5). | ✅ | Ratio clamped into the safe domain; a mid that floors to zero skips the sample instead of reverting. |
| L-3 / L-6 | Docs claimed full donation-resistance; ERC-6909 claims are transferable, so a claim donation can move `_reserves()`. | ✅ **closed (2026-09)** | Originally documented as a bounded residual. Now **fixed**: reserves are shadow-accounted, so a donation moves nothing the hook prices from. See K below. |
| L-5 | A first deposit small enough to floor one anchored virtual offset to zero anchors the curve off the seeded ratio (arb seam). | ✅ | Seeds where either offset rounds to zero are rejected. |
| L-7 | Exact-out routing could dodge part of the directional spread (input-side markup undercharges on a convex curve). | ✅ | Exact-out spread reimplemented as the exact inverse of the exact-in haircut (gross-out grossing). |

Scope note: a sponsored review is not a full independent audit. A9 (human audit before mainnet) stays open.
