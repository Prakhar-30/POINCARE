# Reviewing Poincaré in five minutes

A map for anyone evaluating this repo under time pressure: what to run, what each claim rests on,
and what is honestly still open. The full argument is in [`README.md`](./README.md); this is the
short path through it.

---

## What it is, in three sentences

Poincaré is a two-asset **custom-curve Uniswap v4 hook** that reduces LVR without an oracle. It
runs a **CUSUM quickest-change detector** on the pool's own price to decide *when* a genuine
directional trend has begun — firing at a data-dependent stopping time, never after a fixed
number of blocks — and while a trend is confirmed it charges a bounded **directional spread**
on the with-trend (toxic) side while the stabilising side keeps trading at the base price.

**The detector is the contribution.** The curve is where its decision lands.

**Recognition and review.** A winner at the **Uniswap Hook Incubator 10 (UHI10)** hookathon, and
**1st place in Uniswap's Continuity track at ETHGlobal Mumbai 2026**. Security-reviewed by
**Olympix** (sponsored by the Uniswap Foundation Security Fund) and independently scoped and
reviewed by **SFS-Labs**; every finding from both is fixed with a regression test. App:
[www.poincaretrade.in](https://www.poincaretrade.in).

---

## Run it

```bash
forge test                      # 243 tests: unit, fuzz, invariant, manipulation, calibration, regression
FOUNDRY_PROFILE=fork forge test --match-path "test/sim/Fork*.t.sol"
                                # 6 more, against a live Sepolia fork: quote-vs-execution
                                # through the CANONICAL router. Needs SEPOLIA_RPC.
forge test --match-path test/invariant/PoincareInvariant.t.sol -vv    # 3 x 128k randomized ops, 0 reverts
forge test --match-path test/calibration/RealDataCalibration.t.sol -vv # ARL0 + delay on real ETH/USDC returns
forge test --match-path test/manipulation/Manipulation.t.sol -vv      # fake-trend attacks must lose money
```

The two fork replays need an archive RPC and the IR pipeline, so they sit outside the default
profile:

```bash
export SEPOLIA_RPC=...   # any Sepolia archive endpoint
FOUNDRY_PROFILE=sim forge test --match-path test/sim/ForkRealData.t.sol -vv    # 12 months of real ETH/USDC
FOUNDRY_PROFILE=sim forge test --match-path test/sim/ForkSimulation.t.sol -vv  # 8-regime synthetic stress
```

Both deploy the hook against the **real Uniswap v4 `PoolManager`** on a Sepolia fork and trade it
with real router swaps — not a mock.

---

## The four things worth checking

**1. The detector is a real change-point detector, not a threshold with a nice name.**
`src/libraries/Cusum.sol` is the two-sided CUSUM recursion; `test/calibration/` measures its
**ARL₀** (mean bars between false alarms) and **detection delay** — on the illustrative noise
model in `Calibration.t.sol`, and on the **real, heavy-tailed ETH/USDC return distribution** in
`RealDataCalibration.t.sol`. The threshold `h` is *derived* there from a stated false-alarm
target, not chosen: `k = 0.25σ`, `h = 6.00σ` (σ = 0.014443 per 4h bar), measured ARL₀ = 120 bars (about
20 days between false alarms), delay at the design drift = 21 bars. Calibration uses the **first half** of the series only, so the replay's second half is
out-of-sample.

**2. The comparison has a real baseline, and it does not always flatter us.** Any spread reduces
LVR, so "below constant product" proves nothing on its own. The real-data replay runs a **third
pool**: a symmetric vol-scaled fee sized to cost uninformed traders the *same* as Poincaré's
directional spread (matched to 0.13%: 4,535 against 4,529). The two headline metrics point
different ways, and both are reported. On raw LVR **the symmetric fee wins** (−5.66% vs −4.67%
against constant product), in both halves and by more out-of-sample (−5.28% vs −3.23%). On **LP
value retained**, marked at fair, **Poincaré wins by 45%** (+34,032 vs +23,401), or 7.51 against
5.17 per unit of trader cost, because it charges only the flow that is taking value out of LPs.
LVR stays at or below constant product throughout, which the test asserts.

The longer study is **four years of real ETH/USDC** (2022-09 to 2026-09, 7,776 four-hour bars),
which the deployed configuration comes from: **+644 bps of LP value against a 30 bps pool**, 32%
less taken by arbitrageurs, and ahead in every one of the four years
(`test/optimal/GammaFourYear.t.sol`, README §9.3 and §9.4). Numbers and caveats:
[`analysis/simulation/SIMULATION.md`](analysis/simulation/SIMULATION.md),
[`analysis/backtest/BACKTEST.md`](analysis/backtest/BACKTEST.md).

**3. The manipulation bound is structural, not hoped for.** The shipped lever is a
**non-negative** spread on a **symmetric** base, so the soft (against-trend) side trades at
exactly the constant-product price: `max_soft_gain ≡ 0`, proven in
`Backtest.t.sol::test_manipulation_softGainIsZero_triggerCostPositive`. Driving the CUSUM to `h`
costs real, arbitraged price movement. End-to-end attacks against the live `PoolManager` are in
`test/manipulation/`: a fake-trend round trip, a single-block flash that the once-per-block
sampling ignores, and a σ-inflation attack on the adaptive mode.

**4. Quotes match execution.** A custom curve can't be priced by the vanilla v4 quoter.
`PoincareLens` prices through the *same* libraries and the same per-block detector projection as
the swap path, so a quote matches execution **to the wei even in a fresh block** before anyone has
swapped that block (`test/PoincareLens.t.sol`).

---

## Where each headline claim is proven

| Claim | Proof |
|---|---|
| CUSUM fires at a data-dependent moment | `test/calibration/` — delay shrinks as drift grows; ARL₀ monotone in `h` |
| Detector parameters are calibrated, not guessed | `test/calibration/RealDataCalibration.t.sol` (real returns, first half only) |
| Directional vs symmetric at equal trader cost | `test/backtest/Backtest.t.sol` (synthetic: directional wins), `test/sim/ForkRealData.t.sol` (12 months of real ETH/USDC: **the symmetric fee wins on raw LVR, Poincaré wins on LP value**), `test/optimal/GammaFourYear.t.sol` (four years: **+644 bps vs a 30 bps pool**) |
| Never worse than constant product | asserted in both fork replays (`assertLe(lvrOn, lvrOff)`) |
| No value creation / always solvent | `test/invariant/` — 3 invariants x 128k ops, ghost accounting to the wei |
| Faking a trend is unprofitable | `test/manipulation/`, `test/backtest/` |
| Quotes match execution | `test/PoincareLens.t.sol` (via `PoolSwapTest`) and `test/sim/ForkRouterLens.t.sol` (via the **canonical router**, on a fork) |
| The canonical `V4Quoter` also prices this pool correctly | `test/sim/ForkRouterLens.t.sol::test_canonicalQuoterAgreesWithLens`. We previously claimed it could not; that was wrong and is retracted (README §8) |
| Detector overhead is affordable | `test/Gas.t.sol` — ~96k gas on the first swap of a block, 0 after |
| Reported findings were fixed | `test/regression/OlympixFindings.t.sol` and `test/regression/SfsLabsFindings.t.sol` — one test per code finding, each fails pre-fix |

---

## Live

Unichain Sepolia (chain id 1301), testnet only:

| | |
|---|---|
| Hook | [`0x89A520e7faEd35CB6F89b0040F5Bc5ADe035Aa88`](https://sepolia.uniscan.xyz/address/0x89A520e7faEd35CB6F89b0040F5Bc5ADe035Aa88) |
| Lens | `0xe685a9e01a46f6ff581ffbd6b409e1cef4ab2fa2` |
| PoolManager | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` (canonical v4) |
| Deployed | block 66190311 (26 October 2026) |
| PoincareDCA | [`0x1E2ad927D95F284fB588eAA3f56D031f92AAe50a`](https://sepolia.uniscan.xyz/address/0x1E2ad927D95F284fB588eAA3f56D031f92AAe50a) (block 67080020; periphery, not covered by either review, see [`DCA.md`](./DCA.md)) |
| App | [www.poincaretrade.in](https://www.poincaretrade.in) |

Every sampled block emits a `DetectorSample` event carrying the full detector trace (price, `r`,
S⁺/S⁻, D, σ̂, κ, trend, fee), so the frontend in `frontend/` charts the *real* on-chain statistic
rather than a re-simulation. The demo pool's flow is script-driven (`frontend/replay.mjs`,
`frontend/trend.mjs`) — it is a demonstration, not organic volume.

---

## Open, and deliberately so

| Item | Status |
|---|---|
| Independent scoped review | **Done (2026-10).** An Olympix security review, sponsored by the Uniswap Foundation Security Fund, was run first and every finding fixed. An independent scoped review by SFS-Labs (Mathias Steinbach) followed, with a remediation follow-up: no Critical, High or Medium issue confirmed within the reviewed scope; its two Lows and the code-level Notes are fixed with regression tests, and the rest are dispositioned (`SECURITY.md`). It is not a certification. The fixes are live in the deployment above. |
| Adaptive (σ-normalized) detector | Built, tested, backtested — but gated OFF in the live deployment until its quantitative manipulation-cost bound is derived (OPEN_ITEMS **V1**). |
| Depth / curvature lever | **Closed (E1), not deferred.** The naive version is arb-drainable; we reproduced the drain, then built a round-trip-safe version anyway and measured it across four years of real ETH/USDC. It lost by roughly thirty to one. No depth-asymmetry mode exists in the codebase and none is planned; `test/DeployedConfig.t.sol` pins `alphaWad == 0`. See `AsymmetricCurve.sol`'s safety note. |
| ERC-6909 claim donations | **Closed.** Reserves are shadow-accounted, so a donation moves nothing the hook prices from: not the detector's sampled price, not share pricing, not redemption. Donated claims are stranded. See `SECURITY.md` and `invariant_shadowReservesBackedByClaims`. |

Full tracker, including everything closed and why: [`analysis/OPEN_ITEMS.md`](analysis/OPEN_ITEMS.md).

---

## Repo map

```
src/libraries/Cusum.sol             two-sided CUSUM            <- the contribution
src/libraries/DirectionalSignal.sol EWMA directional efficiency D + volatility sigma-hat
src/libraries/ControlLaw.sol        evidence -> bounded, rate-limited kappa; vol fee
src/libraries/AsymmetricCurve.sol   offset constant-product + directional spread + fee
src/libraries/PriceLib.sol          reserves -> price -> log-return
src/PoincareHook.sol                the hook: detector state, pricing, hook-owned liquidity
src/PoincareLens.sol                quoter; must match execution exactly
analysis/                           calibration method, back-test, fork simulations
frontend/                           the live demo app
```
