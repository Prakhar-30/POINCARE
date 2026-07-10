// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title ControlLaw - CUSUM evidence to bounded curve asymmetry κ
/// @notice Maps the detector's capped evidence `S` to the asymmetry intensity κ with
///         three properties: it engages only past the detection threshold (κ = κ_min
///         while S <= h), it is hard-capped at κ_max (a security parameter, not a
///         tuning one), and it is rate-limited (|κ_t − κ_{t-1}| <= dMax per step) so
///         the executable curve can only inch between blocks, bounding the bid-ask
///         seam and giving hysteresis.
///
/// @dev    κ is a WAD fraction consumed as the directional spread, so κ_max < WAD is
///         required (a spread of 1.0 would zero the output). `S, h, sMax` share the
///         CUSUM statistic's scale; the ramp S -> κ is linear between h and sMax.
library ControlLaw {
    uint256 internal constant WAD = 1e18;

    /// @notice Injected/governable; validate with `isValidConfig`.
    struct Config {
        int256 h; // evidence level where asymmetry begins (the CUSUM threshold)
        int256 sMax; // evidence level where asymmetry reaches kappaMax (the statistic cap)
        uint256 kappaMin; // asymmetry at/below h
        uint256 kappaMax; // hard cap, < WAD
        uint256 dMax; // max change in kappa per step
    }

    /// @notice Unclamped target for evidence `s`: linear ramp from κ_min at h to κ_max
    ///         at sMax, flat outside the band. Monotone non-decreasing.
    function targetKappa(int256 s, Config memory c) internal pure returns (uint256) {
        if (s <= c.h) return c.kappaMin;
        if (s >= c.sMax) return c.kappaMax;
        uint256 span = uint256(c.sMax - c.h);
        uint256 into = uint256(s - c.h);
        return c.kappaMin + FullMath.mulDiv(c.kappaMax - c.kappaMin, into, span);
    }

    /// @notice Move `prev` toward `target` by at most `dMax`.
    function rateLimit(uint256 prev, uint256 target, uint256 dMax) internal pure returns (uint256) {
        if (target > prev) {
            uint256 up = prev + dMax;
            return target < up ? target : up;
        }
        uint256 down = prev > dMax ? prev - dMax : 0;
        return target > down ? target : down;
    }

    /// @notice One step: ramp the evidence to a target, rate-limit from the previous κ,
    ///         clamp into [κ_min, κ_max].
    function step(uint256 prevKappa, int256 s, Config memory c) internal pure returns (uint256 kappa) {
        kappa = rateLimit(prevKappa, targetKappa(s, c), c.dMax);
        // A prev kappa outside the band (e.g. after a config change) could otherwise escape it.
        if (kappa < c.kappaMin) kappa = c.kappaMin;
        else if (kappa > c.kappaMax) kappa = c.kappaMax;
    }

    /// @notice Assert once at hook construction; sMax > h gives the ramp positive width,
    ///         dMax > 0 lets kappa actually move.
    function isValidConfig(Config memory c) internal pure returns (bool) {
        return c.h >= 0 && c.sMax > c.h && c.kappaMax >= c.kappaMin && c.kappaMax < WAD && c.dMax > 0;
    }

    /// @notice Volatility-scaled base fee: min(γ·σ̂, feeCap). The fee is never a constant;
    ///         it is produced each block from the pool's own realized volatility, so it
    ///         tightens when calm and widens when turbulent. Unlike κ it is symmetric;
    ///         both directions pay it. Monotone and hard-capped, so pumping σ̂ raises the
    ///         attacker's own fee and never past feeCap.
    function volFee(uint256 sigmaWad, uint256 feeGamma, uint256 feeCap) internal pure returns (uint256 feeWad) {
        feeWad = FullMath.mulDiv(feeGamma, sigmaWad, WAD);
        if (feeWad > feeCap) feeWad = feeCap;
    }
}
