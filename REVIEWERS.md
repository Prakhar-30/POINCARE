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

---

## Run it

```bash
forge test                      # 131 tests: unit, fuzz, invariant, manipulation, calibration, regression
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
target, not chosen: `k = 0.25σ`, `h = 6.25σ`, measured ARL₀ = 124 bars, delay at the design drift
= 23 bars. Calibration uses the **first half** of the series only, so the replay's second half is
out-of-sample.

**2. The comparison has a real baseline, and it does not always flatter us.** Any spread reduces
LVR, so "below constant product" proves nothing on its own. The real-data replay runs a **third
pool**: a symmetric vol-scaled fee sized to cost uninformed traders the *same* as Poincaré's
directional spread. Over the full 12 months **the symmetric fee edges it** (LVR −3.27% vs −2.37%,
LP value within 1.5%); in the trend-heavy, out-of-sample second half **the directional lever wins**
(−4.09% vs −3.28%). That is the thesis working where it claims to and being dead weight where it
does not, reported rather than hidden. Numbers and caveats:
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
| Directional vs symmetric at equal trader cost | `test/backtest/Backtest.t.sol` (synthetic: directional wins), `test/sim/ForkRealData.t.sol` (12 months of real ETH/USDC: **a wash over the year, directional ahead in the trending half**) |
| Never worse than constant product | asserted in both fork replays (`assertLe(lvrOn, lvrOff)`) |
| No value creation / always solvent | `test/invariant/` — 3 invariants x 128k ops, ghost accounting to the wei |
| Faking a trend is unprofitable | `test/manipulation/`, `test/backtest/` |
| Quotes match execution | `test/PoincareLens.t.sol` |
| Detector overhead is affordable | `test/Gas.t.sol` — ~96k gas on the first swap of a block, 0 after |
| Reported findings were fixed | `test/regression/OlympixFindings.t.sol` — one test per finding, each fails pre-fix |

---

## Live

Unichain Sepolia (chain id 1301), testnet only:

| | |
|---|---|
| Hook | [`0x9F110F6cC0dfE0CE47f3d49CaF22e9E3220e6A88`](https://sepolia.uniscan.xyz/address/0x9F110F6cC0dfE0CE47f3d49CaF22e9E3220e6A88) |
| Lens | `0x1ca28a5de680109513ce26c861e049116a2643c2` |
| PoolManager | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` (canonical v4) |
| Deployed | block 57598397 |

Every sampled block emits a `DetectorSample` event carrying the full detector trace (price, `r`,
S⁺/S⁻, D, σ̂, κ, trend, fee), so the frontend in `frontend/` charts the *real* on-chain statistic
rather than a re-simulation. The demo pool's flow is script-driven (`frontend/replay.mjs`,
`frontend/trend.mjs`) — it is a demonstration, not organic volume.

---

## Open, and deliberately so

| Item | Status |
|---|---|
| External human security audit | **Required before mainnet.** An Olympix security review, sponsored by the Uniswap Foundation Security Fund, was run and every finding fixed (`SECURITY.md`), which is not a substitute for an independent audit. |
| Adaptive (σ-normalized) detector | Built, tested, backtested — but gated OFF in the live deployment until its quantitative manipulation-cost bound is derived (OPEN_ITEMS **V1**). |
| Depth / curvature lever | Deferred (**E1**). The naive version is arb-drainable; we reproduced the drain and shipped the provably-safe spread lever instead. See `AsymmetricCurve.sol`'s safety note. |
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
