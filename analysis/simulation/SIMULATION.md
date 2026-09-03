# Poincaré: comparative simulation on a Sepolia Uniswap v4 fork

A WETH/USDC stress test run against the **real Uniswap v4 `PoolManager` deployed on Sepolia**
(forked locally with Anvil), comparing two otherwise-identical pools and producing the graphs in
[`public/sim/`](../../public/sim).

```
# 1. run the on-chain simulation (writes the CSVs in this folder)
FOUNDRY_PROFILE=sim forge test --match-path test/sim/ForkSimulation.t.sol -vv
#    (needs SEPOLIA_RPC in the environment; the test forks it via foundry.toml [rpc_endpoints])

# 2. render the graphs into public/sim/
python analysis/simulation/plot.py
```

---

## What is being compared (and why it's a fair test)

Two pools are deployed on the **same real Sepolia v4 PoolManager** (`0xE03A…3543`), seeded with
the **same** liquidity, and fed the **same** fair-price path and the **same** order flow. They
differ in exactly one parameter:

| pool | hook | `κ_max` | behaviour |
|---|---|---|---|
| **POINCARÉ** | `PoincareHook` | 5% | detector + directional spread live |
| **CONTROL** | `PoincareHook` | **0** | identical accounting, asymmetry disabled → **pure constant-product** |

Setting `κ_max = 0` turns the same contract into a plain `x·y=k` AMM, so the control is a true
apples-to-apples baseline: **any difference in LP value is attributable solely to the Poincaré
asymmetry**, not to a different curve model, liquidity layout, or settlement path. (A vanilla
hookless v4 pool would be *concentrated* liquidity (a different curve) and would confound the
comparison.)

Each block: the external fair price advances per a regime schedule; an **arbitrageur** drags each
pool toward fair through real swaps (the LVR channel); and an identical **noise/uninformed order**
hits both pools. Every executed swap is logged (the "order book").

**WETH/USDC** are 18-decimal mock tokens priced at 3000 USDC/WETH. The detector and curve are
decimal-agnostic (they consume **log-returns**, which are scale-invariant), so this does not affect
the result; it only keeps the arbitrage math clean.

## The 8 stress scenarios (130 blocks each, 1040 total)

`calm` · `mild_up` · `strong_up` · `uptrend_pullbacks` · `strong_down` · `flash_crash`
(sharp drop + recovery) · `whipsaw` (high-vol chop) · `recovery_calm`.

---

## Headline results

| metric | POINCARÉ | CONTROL | result |
|---|---:|---:|---|
| Cumulative LVR (arb extraction) | 155,443 USDC | 221,227 USDC | **−29.7%** |
| **Final LP value** (marked at fair) | **10,186,959 USDC** | 9,685,443 USDC | **+501,516 USDC** |
| Orders executed | 3,842 over 1,040 blocks | | |

![LP value retained](../../public/sim/sim_lpvalue.png)

The LP-value advantage is the cleanest, most robust read: it is **flat during `calm`** (nothing to
protect, since the detector correctly does not engage), **grows through the trends**, and **jumps during
the `flash_crash` + `whipsaw`** high-volatility regimes, settling at a **$502k** advantage. The
detector's κ engages only on confirmed trends and returns to zero in calm.

**Per-scenario LVR reduction** (where Poincaré earns its keep):

| scenario | LVR reduction |
|---|---|
| calm | 0% (no lean, correct) |
| strong_up | **54%** |
| flash_crash | **83%** |
| uptrend_pullbacks | 10% |
| whipsaw | 5% |
| strong_down / recovery | 5–9% |

Poincaré helps **most in exactly the high-LVR regimes** (strong trends, flash crashes) where LPs
bleed the most, and is neutral in calm.

### Across seeds, not one lucky path

The table above is a single seed. `test_multiSeed_poincareNeverTrailsControl` re-runs the whole
schedule on **5 independent seeds** — a fresh market, a fresh order book and fresh pools each time
— and asserts `LVR ≤ control` on every one:

| seed | LVR reduction |
|---|---:|
| `0xBEEF` (the headline run) | 29.7% |
| `0xC0FFEE` | 22.7% |
| `0xDECAF` | 19.3% |
| `0xFEED` | 21.6% |
| `0x1234` | 21.2% |
| **mean** | **22.9%** |

So the honest synthetic figure is **22.9% mean, range 19.3–29.7%**, and the 29.7% this study
originally quoted was the top of that range rather than a typical draw. Quote the mean. The
qualitative result is seed-independent: every path shows a reduction (asserted), and the ranking
never inverts.

Graphs: `sim_lpvalue.png` (headline), `sim_lvr.png`, `sim_price.png`, `sim_kappa.png`,
`sim_scenarios.png`, `sim_orderbook.png` (the two order books), `sim_dashboard.png` (combined).

---

## Honest caveats

- **Synthetic regime path**, not real WETH/USDC tick history. It is a controlled stress
  environment (calm + trend bursts + a flash crash + whipsaw), reproducible from one seed, not a
  claim about a specific historical window. The economics (real v4 settlement, real swaps) are
  authentic; the *price path* is generated.
- **Stylised flow**: one profit-seeking arb + one uninformed noise order per block.
- **Per-scenario LVR is noisy.** Because the live pool runs a no-arb band (it skips arbs inside the
  spread) and is left slightly mispriced between arbs, the *per-scenario* arb-extraction figure
  wobbles (in `mild_up` it is even marginally higher than the control). The **aggregate LVR** and
  the **LP-value** curve (which is monotonically ≥ the control throughout) are the robust
  metrics; LP value is the ground truth and Poincaré never trails it.
- **The benign-flow trade-off is real and shown**: with-trend noise orders pay the spread on the
  live pool (a cost to those traders, revenue to LPs); against-trend and calm flow are untaxed.
- **18-decimal mock USDC** (not the real 6-decimal token), immaterial to the detector/curve.
- **The price path is synthetic and trend-dense by construction**, which flatters a design that
  only acts on trends. The real-data study below is the counterweight and should be read with it.
- This complements, not replaces, the in-repo proofs: the in-memory back-test
  (`analysis/backtest/`), the 384k-op invariant suite, and the end-to-end manipulation sims
  (`test/manipulation/`).

---

## Real-data run: 12 months of actual ETH/USDC

The same comparative engine, but `fair` is driven by **real Binance ETHUSDC 4h closes** instead of
a synthetic path, with the detector **calibrated on this pair's own return distribution** and a
**third pool** added as the baseline that makes the comparison mean something.
Test: `test/sim/ForkRealData.t.sol`. Reproduce:

```
python analysis/simulation/fetch_realdata.py        # pulls 12 months of ETHUSDC 4h candles (DAYS env)
forge test --match-path test/calibration/RealDataCalibration.t.sol -vv   # derives k and h
FOUNDRY_PROFILE=sim forge test --match-path test/sim/ForkRealData.t.sol -vv
python analysis/simulation/plot_realdata.py          # -> public/sim/real/
```

**Window:** 2025-07-19 → 2026-07-19, 2,190 candles. ETH went **$3,554 → $1,868** through several
distinct regimes: a rally to a **$4,833** peak, a multi-leg bear with the February crash, and a
June leg-down.

### The three pools

| pool | what it is |
|---|---|
| **POINCARÉ** | the detector-gated **directional** spread, `κ_max` 5%, no vol fee |
| **CONTROL** | `κ_max = 0`, no fee: plain `x·y=k`, the LVR floor |
| **VOLFEE** | no directional spread, a **symmetric** vol-scaled fee `min(γ·σ̂, cap)` charged both ways |

The vol-fee pool is the point of this run. **Any** spread reduces LVR, so "LVR below constant
product" proves nothing on its own — the earlier version of this study, which compared only
against `x·y=k`, could not distinguish the detector's contribution from the mere presence of
friction. The question worth answering is whether spending a friction budget **directionally**
(only on the toxic side, only while the detector is confident) beats spending it **symmetrically**.

### Calibration

`k` and `h` are no longer hand-set. `test/calibration/RealDataCalibration.t.sol` measures ARL₀ and
detection delay on the real, heavy-tailed returns of the **first half** of this series and derives
`k = 0.25σ`, `h = 6.25σ` (measured ARL₀ = 124 bars ≈ 20 days, detection delay 23 bars). The second
half is therefore **out-of-sample**, and reported separately below. Method and justification:
[`analysis/CALIBRATION.md`](../CALIBRATION.md).

For reference, the configuration this study used before calibration (`k = 0.005, h = 0.03`,
labelled "illustrative, not optimised" in the code) measures an **ARL₀ of 15 bars** on this
distribution — a false alarm every 2½ days.

### Results

| metric | POINCARÉ | CONTROL | VOLFEE | |
|---|---:|---:|---:|---|
| Cumulative LVR (USDC) | 319,186 | 326,924 | 316,236 | lower is better |
| LVR vs control | **−2.37%** | — | **−3.27%** | |
| Cost to uninformed flow (USDC) | 3,925 | 0 | 3,100 | the friction budget |
| LP value advantage vs control (USDC) | **+11,141** | — | **+11,314** | ground truth |

![Real ETH/USDC LP value](../../public/sim/real/real_lpvalue.png)

**Read this honestly: over the full year, the directional lever does not beat the symmetric one.**
The two finish within 1.5% of each other on LP value, and Poincaré gets there while costing
uninformed traders ~27% *more* — so per unit of trader cost the plain symmetric fee is ahead on
this window (2.84 vs 3.65 USDC of LP value per USDC of trader cost). We are reporting the number
the harness produced, not the one the thesis wanted.

### Where it does hold: the trending half

Splitting the window at the calibration boundary separates the two regimes cleanly. The first half
is the 2025 rally — choppy, few clean sustained moves. The second half carries the February crash
and the June leg-down, and is also the **out-of-sample** half.

| half | POINCARÉ | CONTROL | VOLFEE | POINCARÉ vs control | VOLFEE vs control |
|---|---:|---:|---:|---:|---:|
| H1 (calibration sample, chop-heavy) | 199,109 | 201,722 | 195,138 | −1.30% | −3.26% |
| **H2 (out-of-sample, trend-heavy)** | 120,077 | 125,203 | 121,098 | **−4.09%** | −3.28% |

So the mechanism behaves exactly as the thesis predicts — it earns its keep **when there are real
trends to lean against**, and it is dead weight in chop — but a full year of ETH/USDC contains
enough chop that the annual average washes out against an always-on fee. The synthetic stress path
above (−29.7%) is trend-dense by construction, which is why it flatters the design; this is the
honest counterweight to it.

The floor claim survives everywhere and is asserted in the test: **LVR ≤ control throughout**.
Leaning against detected trends never costs LPs more than doing nothing.

### Caveats specific to this run

- **Uninformed flow is captive.** The harness forces the same noise order through every pool, so a
  benign trader who happens to be pushing with the trend pays the full `κ` (up to 5%). In reality
  they would route elsewhere — which is what §8 of the README says routers *should* do — and never
  pay it. This materially overstates Poincaré's cost to benign flow, and therefore understates its
  advantage per unit of real trader cost. A routing-aware flow model is the obvious next
  refinement, and it is the single change most likely to move this result.
- **The friction budgets did not match exactly.** `FEE_GAMMA` was pre-computed to equalise them;
  realised, the vol-fee pool spent 3,100 against Poincaré's 3,925. The test asserts they land
  within 25% and reports both, so the gap is visible rather than assumed. Note the direction: the
  baseline achieved more LVR reduction with a *smaller* budget, so correcting the mismatch would
  favour the baseline further, not Poincaré.
- **One pair, one year, one seed of noise flow.** The synthetic study is seed-swept
  (`test_multiSeed_poincareNeverTrailsControl`); this one is not — it is a single historical path,
  which is the point, but it is still n=1 as evidence about markets in general.
- **18-decimal mock USDC**, immaterial to the detector and curve.

Graphs in `public/sim/real/`: `real_lpvalue.png`, `real_lvr.png`, `real_price_kappa.png`,
`real_months.png`.
