# Poincaré — Parameter Calibration Methodology

Every detector/curve parameter is **injected, never hard-coded** (CLAUDE.md §8), and every one is
**derived from an interpretable target**, not picked by feel. This document defines those
derivations. It does *not* commit final numbers: the authoritative values come from the
milestone-6 back-test on the **target pair's real return distribution** (§6). What is settled
here is the *method* — so calibration is reproducible rather than guessed.

> Status (current): no calibrated numbers are baked into any contract. Parameters are
> constructor/governable inputs, validated by `Cusum.isValidConfig` and
> `DirectionalSignal.isValidConfig`. The measurement engine that pins `h` from data lives in
> `test/calibration/Calibration.t.sol`; it currently runs on an **illustrative zero-mean
> noise model** to validate the methodology and the qualitative laws. Swap in the empirical
> return distribution at milestone 6 to obtain production values.

All quantities are signed WAD (1e18 = 1.0). Returns `r_t` are **log-returns** of the
reserve-implied price (see `PriceLib`), so parameters are scale-stable across price levels.

---

## `lambda` — EWMA decay of the directional signal  *(EXACT, no data needed)*

The window is an O(1) EWMA, not a sample buffer (chosen for manipulation-resistance: no hard
window edge to game — see `DirectionalSignal`). Its memory is set by a single decay
`lambda ∈ (0, WAD)`.

- **Interpretable target:** an *effective window* of `N` steps of memory.
- **Derivation (exact):** the EWMA weights are `λ^0, λ^1, …`, summing to `1/(1-λ)`. Define the
  effective window as that weight-mass: `N = 1 / (1 - λ/WAD)`, i.e.

  ```
  lambda = WAD · (N - 1) / N        N = WAD / (WAD - lambda)
  ```

- **Verification (in the harness):** feeding a constant `|r|` drives the total-variation
  accumulator to its steady state `ewmaTV → |r| · N`. The test asserts exactly this, tying the
  abstract `lambda` to a concrete "N steps of memory."

Example: `N = 20` ⇒ `lambda = 0.95·WAD`.

---

## `k` — CUSUM slack / noise floor  *(interpretable directly; refine on data)*

`k` is the per-step drift, in log-return units, below which moves are ignored as noise. In the
recursion `S⁺ += (r - k)`, any step with `r ≤ k` cannot grow `S⁺`.

- **Interpretable target:** the smallest sustained per-step drift worth treating as a trend.
- **Classic CUSUM choice:** `k = (μ₀ + μ₁) / 2`, the half-distance between the no-trend mean
  return `μ₀ ≈ 0` and the smallest trend drift `μ₁` you want to detect ⇒ `k ≈ μ₁ / 2`.
- **From data:** set relative to the no-trend per-step volatility `σ` of the target pair
  (typically `k` a small multiple of `σ`); larger `k` ignores more, detects slower.

---

## `h` — CUSUM threshold  *(set from a target false-alarm rate; measured, not guessed)*

`h` is the **only** real knob of the detector and is set by the tolerable false-alarm rate,
expressed as **ARL₀** — the mean number of steps between false alarms under no-trend
conditions (CLAUDE.md §1.3). **Never** expressed as "trend after N blocks": the firing time
must stay a data-dependent stopping time.

- **Authoritative method — measurement:** under the no-trend return distribution, run the CUSUM
  and measure the empirical ARL₀; raise `h` until `ARL₀ ≥ target` (e.g. 10⁴ steps). `ARL₀` is
  **monotone increasing in `h`** (asserted in the harness), so a bisection on `h` converges.
- **Analytic cross-check — Siegmund's approximation:** for a CUSUM on standardized increments,
  ARL₀ grows ~exponentially in `h`; Siegmund (1985), *Sequential Analysis*, gives the closed
  form used as a sanity check on the measured value. The measurement is authoritative because
  it uses the *actual* (heavy-tailed) return distribution, which the Gaussian approximation
  does not capture (CLAUDE.md §1.4).
- **Detection delay** is reported alongside ARL₀: stronger drift is detected sooner (data
  dependence), the property the security argument rests on (§4.2). The harness asserts this.

---

## `sMax` — CUSUM statistic cap / κ saturation  *(safety + control law)*

`Cusum.updateCapped` clamps each statistic to `[0, sMax]`. This serves two ends at once
(CLAUDE.md §3, §4.5):

- **never-revert safety:** bounded growth cannot overflow on the hot path;
- **κ saturation:** `sMax` is the evidence level at which the curve asymmetry `κ` reaches
  `κ_max`. Set `sMax ≥ h` with headroom so an alarm is reachable and the κ ramp (`h → sMax`)
  has resolution.

---

## `κ_min`, `κ_max`, `Δκ_max` — curve asymmetry bounds + rate limit  *(pending)*

Belong to the control-law / curve layer (milestone 4) and the manipulation analysis:

- `κ_min ≈ 0` (symmetric/deep when no trend).
- `κ_max` is a **security cap**, fixed by the §4.2 inequality
  `max_soft_side_gain(κ_max) < min_cost_to_trigger(k, h)` — the prize an attacker could
  extract on the soft side must stay below the cost of genuinely moving the price to `h`.
- `Δκ_max` (max κ change per block) is small, for bid-ask **seam** safety (§4.1).

These are derived once the arb-safe asymmetry parameterization (the §4.1 "spread in the
slopes" construction) is settled and the manipulation simulation (§4.2) is in place.

---

## How the final numbers get produced (milestone 6)

1. Collect the target pair's historical price path; compute the no-trend log-return distribution.
2. `lambda` from the chosen effective window (exact, above).
3. `k` from the no-trend volatility / smallest detectable drift.
4. `h` by feeding the **empirical** return distribution into the measurement harness and
   bisecting to the target ARL₀; cross-check against Siegmund.
5. `sMax`, then the κ bounds from the manipulation inequality.
6. Re-run the harness to report: achieved ARL₀, detection-delay distribution, and (with the
   curve) the LVR reduction vs constant-product and vs a vol-fee baseline.

---

## Milestone-6 status — methodology demonstrated, real numbers pending data

The end-to-end harness now exists (`test/backtest/Backtest.t.sol`, write-up in
`analysis/backtest/BACKTEST.md`) and the full method runs against a **seeded synthetic
regime-switching path**. On that path, with a methodically-chosen (not fitted) parameter set —
`k=0.005` (between noise σ=0.004 and trend drift 0.008), `h=0.02`, `sMax=0.08`, `λ=0.8` (≈5-step
window), `D_floor=0.6`, `κ_max=0.05`, `Δκ_max=0.02` — the detector fires ~6 blocks after a trend
onset and the curve cuts LVR **14.3 %** vs constant-product (vs 11.5 % for a same-average-spread
symmetric vol-fee) while taxing uninformed flow ~2× less.

Two principled calibration facts surfaced and are now baked into the methodology above:

- **`k` must sit strictly between the noise floor and the trend drift.** With `k` below σ the
  CUSUM accumulates on noise alone (a near-always-on detector); the demonstration only became
  selective once the signal/noise gap was opened (drift = 2σ) and `k` placed between them. This is
  the classic `k = (μ₀+μ₁)/2` choice made concrete.
- **`κ_max` is bounded by a *seam/lag* consideration, not only the manipulation inequality.** An
  over-large κ makes the pool lag the trend enough to be picked off on reversal, eroding the LVR
  gain — so κ_max trades off (a) retained-spread benefit against (b) lag cost. The back-test is the
  tool that locates that optimum on real data.

**Still pending (the only missing piece): a real return series.** Drop it into the harness's
`_pathReturn` and the SAME engine yields production `k, h (via ARL₀), window, κ_max` and the
real-pair LVR-reduction headline. No contract changes are needed — every parameter is already an
injected constructor argument.
