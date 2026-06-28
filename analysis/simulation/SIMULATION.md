# Poincaré — comparative simulation on a Sepolia Uniswap v4 fork

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
hookless v4 pool would be *concentrated* liquidity — a different curve — and would confound the
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
protect — the detector correctly does not engage), **grows through the trends**, and **jumps during
the `flash_crash` + `whipsaw`** high-volatility regimes, settling at a **$502k** advantage. The
detector's κ engages only on confirmed trends and returns to zero in calm.

**Per-scenario LVR reduction** (where Poincaré earns its keep):

| scenario | LVR reduction |
|---|---|
| calm | 0% (no lean — correct) |
| strong_up | **54%** |
| flash_crash | **83%** |
| uptrend_pullbacks | 10% |
| whipsaw | 5% |
| strong_down / recovery | 5–9% |

Poincaré helps **most in exactly the high-LVR regimes** (strong trends, flash crashes) where LPs
bleed the most, and is neutral in calm.

Graphs: `sim_lpvalue.png` (headline), `sim_lvr.png`, `sim_price.png`, `sim_kappa.png`,
`sim_scenarios.png`, `sim_orderbook.png` (the two order books), `sim_dashboard.png` (combined).

---

## Honest caveats

- **Synthetic regime path**, not real WETH/USDC tick history. It is a controlled stress
  environment (calm + trend bursts + a flash crash + whipsaw), reproducible from one seed — not a
  claim about a specific historical window. The economics (real v4 settlement, real swaps) are
  authentic; the *price path* is generated.
- **Stylised flow**: one profit-seeking arb + one uninformed noise order per block.
- **Per-scenario LVR is noisy.** Because the live pool runs a no-arb band (it skips arbs inside the
  spread) and is left slightly mispriced between arbs, the *per-scenario* arb-extraction figure
  wobbles (in `mild_up` it is even marginally higher than the control). The **aggregate LVR** and
  the **LP-value** curve — which is monotonically ≥ the control throughout — are the robust
  metrics; LP value is the ground truth and Poincaré never trails it.
- **The benign-flow trade-off is real and shown**: with-trend noise orders pay the spread on the
  live pool (a cost to those traders, revenue to LPs); against-trend and calm flow are untaxed.
- **18-decimal mock USDC** (not the real 6-decimal token) — immaterial to the detector/curve.
- **Single seed / single path** for the headline; a production report should average many seeds.
- This complements, not replaces, the in-repo proofs: the in-memory back-test
  (`analysis/backtest/`), the 384k-op invariant suite, and the end-to-end manipulation sims
  (`test/manipulation/`).

---

## Real-data run — 6 months of actual ETH/USDC

The same comparative engine, but `fair` is driven by **real Binance ETHUSDC 4h closes** instead of
a synthetic path. Test: `test/sim/ForkRealData.t.sol`. Reproduce:

```
python analysis/simulation/fetch_realdata.py        # pulls ~6 months of ETHUSDC 4h candles
FOUNDRY_PROFILE=sim forge test --match-path test/sim/ForkRealData.t.sol -vv
python analysis/simulation/plot_realdata.py          # -> public/sim/real/
```

**Window:** 2025-12-30 → 2026-06-28, 1,080 candles. ETH fell **$2,987 → $1,568** (≈ −47%, with a
$3,367 high) — a genuine multi-leg bear market with rallies.

| metric | POINCARÉ | CONTROL | result |
|---|---:|---:|---|
| Cumulative LVR | 104,721 USDC | 114,807 USDC | **−8.8%** |
| **Final LP value advantage** | | | **+14,697 USDC** |
| Noise-flow tax (cost to with-trend benign flow) | | | 3,254 USDC |

![Real ETH/USDC LP value](../../public/sim/real/real_lpvalue.png)

**The honest read:** the advantage is **flat through the choppy January**, **jumps at the February
crash**, holds through the chop, and **jumps again at the June leg-down** — the detector engaged on
the two real sustained downtrends and stayed neutral in chop, ending **+$15k** for Poincaré LPs on
a ~$6M pool. The reduction (8.8%) is smaller than on the synthetic stress path (29.7%) precisely
because real markets are noisier with fewer clean trends — the conservative detector engages less,
so it helps less, **but it never hurts** (LVR ≤ control held the whole way; assertion enforced).
This is the expected, defensible behaviour: protection concentrated on the real directional moves
that actually drain LPs, nothing during chop. Graphs in `public/sim/real/`: `real_lpvalue.png`,
`real_lvr.png`, `real_price_kappa.png`, `real_months.png`.

> Calibration note: the detector params here (`k, h, λ, κ_max`) are sensible-but-not-optimised for
> 4h ETH returns. Tuning them to the pair's real return distribution (the milestone-6 calibration
> step) would raise the captured fraction; this run shows the **out-of-the-box** behaviour.
