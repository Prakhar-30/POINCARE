// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title ControlLaw — CUSUM evidence -> bounded curve asymmetry κ (CLAUDE.md §3)
/// @notice Maps the detector's accumulated evidence `S` (a one-sided CUSUM statistic, fed in
///         *capped* form via `Cusum.updateCapped`, see OPEN_ITEMS D1) to the curve's asymmetry
///         intensity `κ`, with three safety properties baked in:
///           1. **Engages only past the threshold.** `κ = κ_min` (symmetric, deep) while
///              `S ≤ h`; it ramps up only as evidence exceeds the detection threshold.
///           2. **Hard-capped.** `κ` never exceeds `κ_max` — a *security* parameter
///              (§4.2), here treated as a spread fraction so `κ_max < WAD`.
///           3. **Rate-limited + hysteretic.** `|κ_t − κ_{t-1}| ≤ Δκ_max` per step, so the
///              executable curve can only inch between blocks. This bounds the bid-ask "seam"
///              (§4.1) and, together with the ramp, gives hysteresis: κ cannot snap.
///
/// @dev    κ is a WAD fraction (1e18 = 1.0). In the current MVP it is consumed as the
///         directional spread fraction by `AsymmetricCurve.*WithSpread` (arb-safe by
///         construction). `κ_max < WAD` is therefore required (a spread of 1.0 would zero the
///         output). The mapping `S → κ` is monotone; the ramp is linear between `h` and `sMax`.
///
/// @dev    UNITS. `S, h, sMax` share the CUSUM statistic's fixed-point scale (signed, but
///         `S, h, sMax ≥ 0`). `κ_min, κ_max, Δκ_max` are WAD fractions.
library ControlLaw {
    uint256 internal constant WAD = 1e18;

    /// @notice Control-law configuration. Injected/governable (§8); validate with `isValidConfig`.
    struct Config {
        int256 h; // evidence level where asymmetry begins (the CUSUM threshold)
        int256 sMax; // evidence level where asymmetry reaches κ_max (the statistic cap)
        uint256 kappaMin; // asymmetry at/below h (≈ 0: symmetric, deep)
        uint256 kappaMax; // hard cap (< WAD; a security parameter, §4.2)
        uint256 dMax; // max change in κ per step (seam/safety rate limit, §4.1)
    }

    /// @notice The unclamped target asymmetry for evidence `s`: a linear ramp from `κ_min`
    ///         at `h` to `κ_max` at `sMax`, flat outside that band. Monotone non-decreasing.
    function targetKappa(int256 s, Config memory c) internal pure returns (uint256) {
        if (s <= c.h) return c.kappaMin; // below detection: stay symmetric
        if (s >= c.sMax) return c.kappaMax; // saturated: full (capped) asymmetry
        uint256 span = uint256(c.sMax - c.h);
        uint256 into = uint256(s - c.h);
        return c.kappaMin + FullMath.mulDiv(c.kappaMax - c.kappaMin, into, span);
    }

    /// @notice Move `prev` toward `target` by at most `dMax` (the per-step rate limit).
    function rateLimit(uint256 prev, uint256 target, uint256 dMax) internal pure returns (uint256) {
        if (target > prev) {
            uint256 up = prev + dMax;
            return target < up ? target : up;
        }
        uint256 down = prev > dMax ? prev - dMax : 0;
        return target > down ? target : down;
    }

    /// @notice One control-law step: ramp the evidence to a target κ, then rate-limit from the
    ///         previous κ and clamp into `[κ_min, κ_max]`.
    /// @param prevKappa κ from the previous step (the rate-limit anchor).
    /// @param s Current (capped) CUSUM evidence on the active side.
    /// @return kappa The new asymmetry intensity, in WAD, within `[κ_min, κ_max]`.
    function step(uint256 prevKappa, int256 s, Config memory c) internal pure returns (uint256 kappa) {
        kappa = rateLimit(prevKappa, targetKappa(s, c), c.dMax);
        // A prev κ outside the band (e.g. after a config change) could otherwise escape it.
        if (kappa < c.kappaMin) kappa = c.kappaMin;
        else if (kappa > c.kappaMax) kappa = c.kappaMax;
    }

    /// @notice Validate the configuration. Assert once at hook construction (§4.3).
    /// @dev `kappaMax < WAD` because κ is used as a spread fraction; `sMax > h` so the ramp
    ///      has positive width; `dMax > 0` so κ can actually move.
    function isValidConfig(Config memory c) internal pure returns (bool) {
        return c.h >= 0 && c.sMax > c.h && c.kappaMax >= c.kappaMin && c.kappaMax < WAD && c.dMax > 0;
    }
}
