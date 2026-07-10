// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title DirectionalSignal - directional-efficiency ("trend vs chop") signal
/// @notice D = |net displacement| / total variation over a window, in [0, 1].
///         D near 1 means the path marched one way (trend); D near 0 means it moved a
///         lot but went nowhere (chop). D gates the detector as a noise floor; the
///         signed increments themselves are what feed the CUSUM.
///
/// @dev    The window is an O(1) exponentially-weighted accumulator, not a ring buffer:
///         a fixed sample window has a hard edge (an attacker knows exactly when a move
///         falls out of it), while EWMA decays smoothly, costs one slot, and self-bounds
///         given bounded increments, so it can never revert a swap. Increments are
///         log-price returns, which keeps the CUSUM slack/threshold scale-stable across
///         price levels. Computing the log itself happens at the hook boundary; this
///         library stays ln-free and pure.
library DirectionalSignal {
    using DirectionalSignal for DirectionalSignal.State;

    uint256 internal constant WAD = 1e18;

    /// @notice `ewmaNet` is the EW sum of signed increments (net displacement proxy),
    ///         `ewmaTV` the EW sum of magnitudes (total-variation proxy). By the triangle
    ///         inequality |ewmaNet| <= ewmaTV, so `signal()` stays in [0, 1]. With
    ///         lambda < WAD and bounded |r| both are bounded by max|r| / (1 - lambda/WAD).
    struct State {
        int256 ewmaNet;
        uint256 ewmaTV;
    }

    /// @notice Directional efficiency D in WAD from net displacement and total variation.
    function efficiency(uint256 absNet, uint256 totalVariation) internal pure returns (uint256 d) {
        // Zero denominator = no movement; treat as "no trend", the side that keeps the
        // curve symmetric.
        if (totalVariation == 0) {
            return 0;
        }
        // A real path satisfies absNet <= totalVariation; clamp in case a caller doesn't.
        if (absNet >= totalVariation) {
            return WAD;
        }
        d = FullMath.mulDiv(absNet, WAD, totalVariation);
    }

    /// @notice Fold one signed log-return `r` into the accumulators (decay, then add).
    /// @param lambda Decay in (0, WAD); effective window length ~ WAD / (WAD - lambda).
    function update(State memory self, int256 r, uint256 lambda) internal pure returns (State memory) {
        int256 net = _decaySigned(self.ewmaNet, lambda) + r;
        uint256 tv = FullMath.mulDiv(self.ewmaTV, lambda, WAD) + _abs(r);
        return State({ewmaNet: net, ewmaTV: tv});
    }

    /// @notice Current directional efficiency D in [0, WAD].
    function signal(State memory self) internal pure returns (uint256) {
        return efficiency(_abs(self.ewmaNet), self.ewmaTV);
    }

    /// @notice Per-step volatility estimate σ̂ (WAD): the exponentially-weighted mean
    ///         absolute return.
    /// @dev `ewmaTV` is an EW sum whose weights total 1/(1-λ/WAD); multiplying by
    ///      (WAD-λ)/WAD turns it into the weighted mean |r|. Mean-absolute-deviation is
    ///      proportional to σ for a fixed return shape; the Gaussian √(2/π) factor is
    ///      absorbed by whatever coefficient consumes σ̂. Powers the vol-scaled fee and
    ///      the standardized (adaptive) CUSUM increment.
    /// @param lambda Must be the same decay the accumulators were built with.
    function sigmaWad(State memory self, uint256 lambda) internal pure returns (uint256 sigma) {
        sigma = FullMath.mulDiv(self.ewmaTV, WAD - lambda, WAD);
    }

    /// @notice Asserted once at construction; the hot path skips the check.
    /// @dev lambda == 0 makes D degenerate (every step looks perfectly trending);
    ///      lambda >= WAD removes decay and the state grows unbounded.
    function isValidConfig(uint256 lambda) internal pure returns (bool) {
        return lambda > 0 && lambda < WAD;
    }

    /// @dev a * lambda / WAD, sign-preserving. lambda < WAD means the magnitude never
    ///      grows, so the cast back to int256 cannot overflow.
    function _decaySigned(int256 a, uint256 lambda) private pure returns (int256) {
        if (a == 0) return 0;
        bool neg = a < 0;
        uint256 mag = neg ? uint256(-a) : uint256(a);
        uint256 scaled = FullMath.mulDiv(mag, lambda, WAD);
        return neg ? -int256(scaled) : int256(scaled);
    }

    /// @dev `r` is a bounded log-return, never type(int256).min.
    function _abs(int256 x) private pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
    }
}
