# Poincaré — Open Items / Audit Tracker

Living checklist of every known gap, deferred decision, placeholder, and security concern, so
none is lost before MVP done (CLAUDE.md §11). Reviewed across all libraries built to date.
Status keys: 🔴 blocking-for-MVP · 🟠 must-resolve-before-deploy · 🟡 track / calibrate · ✅ done.

Last full review: through M8 (hardening) + fork simulations (synthetic + real ETH/USDC) + an
item-closeout pass (A5, A7, B3, B5, C3, C4, C5 closed on existing evidence; A9 kept for external audit).

---

## A. Security

| # | Item | Where | Status | Notes |
|---|------|-------|--------|-------|
| A1 | **Single-block / flash manipulation of the detector.** §4.2 requires sampling so *one block cannot move the statistic*. | hook | ✅ | **Implemented** in `_sampleAndUpdateDetector` (samples once per block off pre-swap reserves) AND **tested** end-to-end: `test/manipulation/Manipulation.t.sol::test_singleBlockFlash_doesNotMoveDetector` dumps 30 ether and buys it back in one block and asserts κ stays 0 / the sampled price tracks the settled price, not the spike. Holding a move across a block boundary is still possible (the intended, arbitraged cost). |
| A2 | **Curvature-only asymmetry is arb-exploitable.** Proven by a concrete buy-shallow/sell-deep round-trip counterexample. | `AsymmetricCurve` | ✅ (mitigated) | Resolved by implementing the asymmetry as a **non-negative directional spread on a symmetric-depth base** (arb-safe by construction; round-trip fuzz gate). See E1 for the deferred curvature lever. |
| A3 | **`κ_max` security-sizing — resolved for the spread lever, open for the depth lever.** | `ControlLaw` cfg | ✅ (spread) / 🟠 (depth E1) | For the **spread** lever shipped in the MVP the §4.2 inequality holds *by construction*: the soft (against-trend) side trades at the base constant-product price, so `max_soft_gain ≡ 0 < min_trigger_cost` with margin = the entire trigger cost (proven in `test/backtest/Backtest.t.sol`). `κ_max` therefore need not be security-sized for the spread lever — it is a pure tuning/seam cap. The sizing IS required before deploying the depth/curvature lever (E1), which would create a non-zero soft-side prize. |
| A4 | **Manipulation simulation — present (spread lever).** | `test/backtest/` + `test/manipulation/` | ✅ (spread) / 🟠 (depth E1) | `Backtest.t.sol::test_manipulation_softGainIsZero_triggerCostPositive` proves soft-side output == constant-product output (no prize) + positive trigger cost. `Manipulation.t.sol` adds two END-TO-END (real PoolManager) sims: a fake-trend round trip loses money (`test_fakeTrendRoundTrip_isUnprofitable`), and the single-block flash guard (A1). The depth-lever adversarial suite is deferred with E1. |
| A5 | **PriceLib reverts on zero reserve / zero price.** | `PriceLib` / hook | ✅ (mitigated) | Reserves provably stay > 0 under the constant-product base: `swapExactIn` output is always strictly `< reserve` (math), `swapExactOut` rejects impossible requests (A7), and the `MINIMUM_LIQUIDITY` lock (A10) leaves a dust floor `removeLiquidity` cannot withdraw. Confirmed empirically by `invariant_reservesStayPositive` (384k ops). The `require(r0>0 && r1>0)` guard means the only revert is the legitimate "swap into an empty pool" case — not a detector-induced one, so §4.5 holds. (Residual: an extreme-imbalance pool with `r1 > 1e6·r0` could round a dust reserve to 0 → clean `require` revert, not a fund loss; not reachable for sane pairs like ETH/USDC.) |
| A6 | **`Cusum.update` (uncapped) can overflow-revert** under sustained drift on the hot path. | `Cusum` | ✅ (mitigated) | Hook MUST use `updateCapped` (or `step`) on-chain; plain `update` is back-test only. Enforced by convention — see D1. |
| A7 | **Swap feasibility.** | `AsymmetricCurve` / hook | ✅ | On the shipped `a=b=0` base the "infeasible output" case **cannot occur**: `swapExactIn` gives `amountOut = Y − ⌈XY/(X+amountIn)⌉ < Y` (strictly less than the output reserve), and the spread haircut only shrinks it further. `swapExactOut` reverting when the requested output ≥ reserve is **correct AMM behaviour** (you cannot buy more than the pool holds; the router's `amountInMax` also bounds it) — it is the AMM's revert, not a detector/§4.5 revert. Exercised by the invariant handler (random exact-in/out) and the Lens + manipulation exact-out tests, all with feasible amounts succeeding. |
| A8 | **Rounding direction preserved end-to-end.** | hook | ✅ | The invariant suite (`test/invariant/`) drives 384k randomized swaps/liquidity ops and asserts (a) the hook's reserves equal independent ghost accounting to the wei (no favorable rounding leak), and (b) the constant-product invariant never decreases on a swap (no value creation by traders). |
| A9 | **Reentrancy / settlement correctness** (ERC-6909 claims, `take`/`settle`/`sync`). | hook | 🟠 (external audit only) | **Accounting correctness: ✅ proven** — the invariant suite shows exact ghost-conservation across 384k ops with 0 reverts. **Reentrancy: no vector in our code** — the hook's mutating path makes NO external calls except the view `poolManager.balanceOf`; settlement runs inside `PoolManager.unlock`'s own reentrancy lock via the audited OZ `BaseCustomCurve`. The only residual is the **standard external security audit before mainnet**, which is not self-certifiable — kept open for that reason alone. |
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
| C3 | **Test parameter values are illustrative, not calibrated.** | ✅ (by design) | Correct as-is — tests deliberately use illustrative configs, and ALL params are injected + `isValidConfig`-validated, never baked into the contracts. Production calibration is a deploy-time step with the tooling now built (`CALIBRATION.md`, the back-test, and the real-data fork run). Not a code gap. |
| C4 | Calibration harness noise model is **uniform / illustrative**. | ✅ | The **empirical (real, heavy-tailed) return distribution** now flows through the detector in the fork real-data run (`test/sim/ForkRealData.t.sol` — 6 months of real ETH/USDC). The uniform model in `Calibration.t.sol` is intentionally for the qualitative-law tests (ARL₀ monotone in `h`, delay shrinks with drift), which don't need real tails. |
| C5 | `ControlLaw` ramp is **linear**. | ✅ (decided) | Linear is monotone and sufficient; the bid-ask seam is bounded by the rate-limit `Δκ_max`, not the ramp shape. Smoothstep stays an optional future refinement, not a gap. |

## D. Conventions the hook MUST honor (or safety breaks)

- **D1.** Drive κ from `Cusum.updateCapped(..., sMax)` — never uncapped `update` on-chain (A6).
- **D2.** Keep the curve's base depth **symmetric** (same `(a,b)` for both swap directions); put ALL asymmetry in the non-negative directional spread. Asymmetric base depth is arb-unsafe (A2/E1).
- **D3.** Sample `r_t` at most once per block (A1).
- **D4.** Guarantee reserves > 0 (A5) and size trades for feasibility (A7).
- **D5.** Round against the trader everywhere, including the delta accounting (A8).
- **D6.** Source `sMax` and the spread (`κ`) only from validated config (`isValidConfig`): `sMax ≥ 0`, `κ ≤ κ_max < WAD`. The hot-path math is guard-free and relies on this (G3).

## E. Deferred features (post-MVP-core or pending analysis)

- **E0. Deep "stableswap-like" calm base (§2.1).** The brief wants both sides to use *large* offsets in calm regimes (deep, low-impact, stableswap-like), with the asymmetry layered on top. The MVP passes `a=b=0` to the curve (plain `x·y=k`) as the base, so calm trading is constant-product, not deep. The curve library already supports offsets (`swapExactIn(x,y,a,b,…)`); wiring a non-zero calm base is a config/parameterisation change, not new math. Deferred — orthogonal to the detector (the novel part) and to arb-safety. The Lens (M7) mirrors the same `a=b=0` base so quotes match.
- **E1. Curvature / depth-asymmetry lever (§3.1, §10).** The brief's headline lever (small vs large offsets) is arb-unsafe alone (A2). Deploying it safely needs the manipulation-cost sizing (A4) to bound the depth-arb with a dominating spread. Deferred until §4.2 analysis exists. Current MVP uses the spread lever, which is safe and still implements the bid-ask asymmetry.
- **E2. Robust / heavy-tailed CUSUM increment (§1.4).** Only the Gaussian-form increment exists. Add a Huberised/clipped variant behind the same interface.
- **E3. ~~Lens/Quoter (§5, M7)~~ ✅, ~~back-test harness (§6, M6)~~ ✅, invariant suite (§9.3), gas profiling (§9.6).**
  Lens DONE: `src/PoincareLens.sol` + `test/PoincareLens.t.sol` (8 tests). Reads reserves + the
  directional spread (`hook.effectiveSpread`) from the hook and runs the SAME `AsymmetricCurve`
  library — quotes proven to match execution to the wei (calm + trend, exact-in + exact-out).
  Mirrors the `a=b=0` base (E0).
  Back-test DONE: `test/backtest/Backtest.t.sol` + `analysis/backtest/BACKTEST.md` — on the synthetic
  regime path, Poincaré reduces LVR **14.3 %** vs constant-product (vs 11.5 % for a same-spread
  symmetric vol-fee) while taxing uninformed flow **~2× less**; detection delay 6 blocks; §4.2
  inequality demonstrated for the spread lever. Real-data calibration of `k,h,window,κ` still
  pending a price series (engine is data-ready — drop into `_pathReturn`).

## G. Pre-M5 self-review (adversarial pass over all libraries)

| # | Finding | Severity | Disposition |
|---|---------|----------|-------------|
| G1 | **`DirectionalSignal` (D) is ORPHANED from the pipeline.** The detection path is `PriceLib → r_t → Cusum.updateCapped → ControlLaw → κ → spread`. Nothing consumes `DirectionalSignal.signal()`. The brief (§1.1) positions D as the "noise floor / diagnostic," and CUSUM is fed `r_t` directly — so D was never the CUSUM input, but its actual ROLE is currently undefined and unwired. Milestone 2 *looks* complete but contributes nothing to detection yet. | conceptual, important | **Resolve in M5.** Recommendation: gate the asymmetry on `D ≥ D_floor` (a second confirmation that the move is directional, not just that CUSUM crossed), AND expose D via the Lens as a diagnostic. This is a real design decision — confirm before wiring. |
| G2 | **`int256(ratioWad)` cast + `lnWad` domain** (`PriceLib.logReturnWad`). A single-step price move beyond ~5.7e58× would cast to a negative int256 and revert `lnWad`; a >1e18× single-step *drop* makes `ratioWad == 0` and also reverts. | low | Infeasible in one step with finite reserves + per-block sampling (A1). Acceptable; relies on those bounds. No guard added (would cost gas on every swap). |
| G3 | **Defense-in-depth on config-derived inputs.** `Cusum.updateCapped` assumes `sMax ≥ 0`; `AsymmetricCurve.*WithSpread` assume `spreadWad < WAD` (else underflow / div-by-zero → revert, violating §4.5). No in-function guards — both rely on upstream `isValidConfig` (`sMax = ControlLaw.sMax > h ≥ 0`; `spreadWad = κ ≤ κ_max < WAD`). | low | Documented as a hard convention (added to D-list, D6). Kept guard-free for gas; the hook MUST source these from validated config. |
| G4 | **No security breach in the pure libraries.** K-invariant (never decreases), arb-safe spread (round-trip never profits, now tested both directions), bounded EWMA (`|net| ≤ tv` preserved under flooring), validated configs — all hold. The real risks are **system-level** (A1 single-block manipulation, A3/A4 manipulation sizing) and surface only once the hook assembles the parts. | — | Tracked in §A; gated on M5/M8. |
| G5 | ~~**All libraries are proven in ISOLATION; zero integration tests.**~~ | ✅ resolved (M8) | Integration coverage now: hook (M5), Lens quote-match (M7), and the invariant suite (`test/invariant/`, 384k randomized ops, solvency + bounds). |
| G8 | **Per-block detector gas ~120k (warm), not "trivial."** Dominated by ~8 cold storage writes (`_cusum` 2 slots, `_signal` 2 slots, `kappa`, `trend`, `lastSampled*`) + `lnWad`. Measured in `test/Gas.t.sol`. | low / optimization | Paid ONCE per block (first swapper), not per swap, and within the 400k budget. Future optimization: pack `sPos/sNeg` (int128 each) into one slot, and `kappa`/`trend`/`lastSampledBlock` into another, to cut writes. Not MVP-blocking. |
| G6 | **Stale trend label during a reversal.** `trend = dir` was assigned every sample, even when evidence was gated off (chop / D below floor) while `κ` was still ramping down from a prior episode — a noise-driven flip of the dominant statistic could briefly harden the wrong side. | low | ✅ **Fixed** (M6 review): `trend` is now re-labelled only when `gatedEvidence > 0`, so the label always matches the side κ was built for; once κ reaches 0 the label is irrelevant. Arb-safe either way (non-negative haircut), so this was a market-quality nit, not a solvency bug. |
| G7 | **Dead code sweep (M6 review).** `Cusum.reset()` was unused in `src` and `test` (the reset-on-fire path is inside `step()`; the hook ends episodes via the D-gate ramp-down, not an explicit reset). | cleanup | ✅ **Removed.** Kept (test-only / reserved): `Cusum.step`/`alarm`/uncapped `update` (reset-on-fire + back-test paths), `marginalPriceWad` (reserved for the Lens, M7), `PriceLib.logReturnFromReserves` (back-test). All exercised by the M6 harness or M7. |

## F. Testing gaps (vs §9 "definition of done")

- ✅ Unit + fuzz for `Cusum`, `DirectionalSignal`, `AsymmetricCurve` core, `PriceLib`, `ControlLaw`, spread.
- ✅ Invariant suite (`test/invariant/PoincareInvariant.t.sol`) — solvency/no-leak + bounds across 384k randomized ops.
- ✅ Hook integration coverage now includes exact-output via router (Lens + manipulation tests), multiple LPs / fair dilution (invariant handler add/remove), and the delta-accounting rounding direction (A8). NOT yet covered: native-ETH pairs.
- ✅ G1 resolved (D gates the asymmetry, implemented + tested). ✅ B3 resolved (reserves = 6909 balances).
- ✅ Manipulation sim for the spread lever (A4); depth-lever suite deferred with E1.
- ✅ Back-test (LVR reduction vs CPMM and vs vol-fee) — `test/backtest/Backtest.t.sol` (M6 done on
  synthetic path; real-data calibration pending a price series).
- ✅ Integration via PoolManager + gas profiling (`test/Gas.t.sol`; ~120k/block detector overhead, see G8).
