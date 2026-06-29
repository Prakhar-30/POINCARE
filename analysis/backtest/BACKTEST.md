# Poincaré: Back-test & manipulation-cost study (milestone 6)

The headline deliverable (CLAUDE.md §6, §9.5): replay a price path through the assembled
detector + curve and quantify the edge: **LVR reduction vs constant-product and vs a vol-fee
baseline**, plus detection delay, false-alarm behaviour, and the **§4.2 manipulation-cost
inequality**.

Runnable harness: [`test/backtest/Backtest.t.sol`](../../test/backtest/Backtest.t.sol).
Reproduce with:

```
forge test --match-path test/backtest/Backtest.t.sol -vv
```

---

## What is faithful, and what is illustrative (read this first)

**Faithful.** The detector, control law, and curve are the **exact same library code the hook
runs**: `Cusum`, `DirectionalSignal`, `ControlLaw`, `AsymmetricCurve`, `PriceLib`. The
back-test cannot diverge from on-chain detection or pricing in the novel parts. Every block, each
pool's arbitrageur executes the **profit-maximising swap through the real curve**
(`swapExactInWithSpread`), and the spread haircut is genuinely retained in the reserves, so the
simulation captures *both* economic effects of a directional spread (see "LVR model" below), not
a linearised proxy.

**Illustrative.** There is no oracle and we ship no proprietary price file, so the price path is a
**seeded, regime-switching synthetic** (mostly-calm background with periodic trend bursts). It is
the controlled environment where a trend detector should earn its keep and where false alarms are
observable. **The numbers below are on this synthetic path: reproducible, but not a claim about a
specific real pair.** The parameters are chosen *methodically* (per `analysis/CALIBRATION.md`),
not fitted. To produce calibrated production numbers, drop a real return series into
`_pathReturn` (e.g. `vm.readLine` over a CSV) and re-run the **same** engine; that is the
remaining data step of milestone-6 calibration.

---

## The LVR model

LVR (loss-versus-rebalancing) = arbitrageur profit = the LP's adverse-selection loss. Each block:

1. the external **fair price** advances one step of the path;
2. every pool's **arbitrageur** does the profit-maximising trade to the no-arb edge, *through the
   actual curve*, paying the directional spread which the LP keeps;
3. the **detector** advances on the pool's own (post-arb) price, once per block;
4. a stream of uninformed **"benign" flow** is charged the spread it faces, to measure collateral
   damage to honest users.

Because the arb trades the real curve with the haircut retained, a directional spread `s` has two
opposing, both-real effects, and the sim nets them honestly:

- **(a) retained spread:** the arb pays `s` on the toxic side, the LP keeps it → lowers LVR;
- **(b) lag:** the pool tracks a trend ~`s` behind fair → can be picked off → raises LVR.

For a modest, rate-limited `κ`, (a) dominates and net LVR falls. For an over-wide *symmetric*
spread, (b) can dominate (a symmetric vol-fee that lags the pool in **both** directions, including
benign mean-reverting flow, can actually *raise* LVR). This is why the lever must be **directional
and trend-gated**, not just "wide when volatile".

The optimal arb input is closed-form (no search): pushing price up to fair `f` on reserves
`(X,Y)=(r0,r1)` with a with-trend haircut `s`, the profit-maximising token1 input is
`d* = sqrt((1-s)·f·X·Y) - Y`; pushing down, `d* = sqrt((1-s)·X·Y/f) - X`. Below the no-arb edge
`d* ≤ 0` and the pool is left untouched.

---

## Results (synthetic regime path, seed `0xC0FFEE`, 1800 blocks)

Three independent AMMs over the **same** fair-price path:

- **constant-product:** `x·y=k`, no spread (the LVR floor / worst case);
- **vol-fee:** symmetric spread `s ∝` realised volatility (EWMA), applied to **both** directions,
  with its gain tuned so its **average spread matches Poincaré's** (a same-friction-budget baseline);
- **Poincaré:** directional spread `κ`, applied **only** to the with-trend (toxic) side, gated by
  the CUSUM detector and the directional-efficiency confirmation.

| Pool | avg spread | LVR (token0 wei) | LVR vs CPMM | benign-flow cost (wei) |
|---|---:|---:|---:|---:|
| constant-product | 0 | 7.856e18 | baseline | 0 |
| vol-fee (symmetric) | 0.01953 | 6.949e18 | **−11.5 %** | 35.15e18 |
| **Poincaré** | 0.01939 | **6.731e18** | **−14.3 %** | **17.59e18** |

**Headline.** At an essentially identical average spread (0.0194 vs 0.0195), Poincaré:

- reduces LVR **14.3 %** vs constant-product, *more* than the symmetric vol-fee's 11.5 %; and
- taxes uninformed flow **~2× less** (17.6e18 vs 35.2e18).

The directional, trend-gated spread therefore dominates a symmetric vol-fee on **both** axes
simultaneously: it leans the *right* way (only against the toxic, with-trend flow), so it buys
the same-or-better LVR protection without taxing honest, against-trend, or calm-time traders.

### Detector behaviour (on the same path)

- **Detections:** 7 of 7 trend bursts detected.
- **Mean detection delay:** **6 blocks** from trend onset (a *data-dependent* stopping time; see
  `test/calibration/Calibration.t.sol`, which shows stronger drift ⇒ shorter delay and ARL₀
  monotone in `h`).
- **Calm-time engagement:** κ>0 for ~47 % of calm blocks. This is dominated by the **post-trend
  re-equilibration tail:** immediately after a burst the laggy pool is still mean-reverting, so
  the detector remains (correctly) cautious; in *deep* calm it disengages. The **formal**
  false-alarm calibration is the ARL₀ machinery in `Calibration.t.sol`, not this diagnostic.

---

## Manipulation-cost study (§4.2: `max_soft_gain(κ_max) < min_trigger_cost(k,h)`)

Test: `test_manipulation_softGainIsZero_triggerCostPositive`.

For the **spread lever shipped in the MVP**, the inequality holds *by construction with margin =
the entire trigger cost*:

- **`max_soft_gain ≡ 0`.** The spread is a one-sided, **non-negative** haircut on the with-trend
  side; the against-trend ("soft") side trades at the **base constant-product price**. The test
  proves `swapExactInWithSpread(..., s=0)` equals the plain `swapExactIn` output exactly, so an
  attacker who fakes a trend gets **no** extractable advantage on the other side. The best they
  can do post-trigger is trade at constant-product prices: zero edge.
- **`min_trigger_cost > 0`.** Driving the CUSUM to `h` requires genuinely moving the price for
  several blocks; each block the attacker eats round-trip price impact. Measured: ~5 blocks,
  **~0.045 token0** of impact, to reach `h`, and that buys them nothing.

Since `0 < min_trigger_cost`, faking a trend is strictly unprofitable. **Caveat (honest):** this
argument is specific to the **spread** lever. The deferred **depth/curvature** lever (OPEN_ITEMS
E1) *would* create a soft-side discount and a real prize, and deploying it safely requires the
quantitative `κ_max` sizing the inequality demands. That is precisely why the MVP ships the spread
lever and defers the depth lever until the sizing exists.

---

## Honest limitations

- **Synthetic path.** Headline percentages are on the regime model above, not a named pair. The
  engine is data-ready; calibrated numbers need a real return series dropped into `_pathReturn`.
- **Single seed / single path** for the headline. The qualitative claims (LVR↓ vs CPMM, benign
  cost ≪ vol-fee at equal spread, bounded detection delay) are structural, but a production report
  should average over many seeds / real windows.
- **Arb + benign flow are stylised.** One profit-maximising arb to the edge per block; benign flow
  is a fixed-size uninformed stream charged the spread it faces (a collateral-damage proxy, it does
  not itself move reserves).
- **Calm-time engagement (~47 %)** is higher than an idealised detector because of the post-trend
  lag tail; it passes the "minority of calm" bar but is the main thing tighter calibration (and a
  real return distribution) would improve.
- The vol-fee baseline is *one* reasonable symmetric design (vol-EWMA scaled, capped at `κ_max`),
  tuned to equal average spread; it is not the universe of dynamic-fee designs.
