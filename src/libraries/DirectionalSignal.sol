// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

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

    /**
     * @notice The directional-efficiency gate implied by a noise-width target and the EWMA decay.
     *
     * @dev `dFloor` and `lambda` are not independent parameters, and treating them as if they
     *      were is how a gate silently moves when someone retunes the memory.
     *
     *      D is `|sum r| / sum |r|`. For an iid symmetric series of n samples the numerator is
     *      the absolute value of a random walk, `E|S_n| = sigma*sqrt(2n/pi)`, and the denominator
     *      is `n*E|r| = n*sigma*sqrt(2/pi)`. So under NO TREND
     *
     *          E[D] = sqrt(2n/pi) / (n*sqrt(2/pi)) = 1/sqrt(n)
     *
     *      and with EWMA decay the effective sample count is `n = 1/(1 - lambda)`. A fixed
     *      threshold on D therefore means nothing on its own; the quantity with meaning is the
     *      ratio of the gate to that noise floor,
     *
     *          r = dFloor / E[D] = dFloor / sqrt(1 - lambda)
     *
     *      how many noise-widths of directionality the detector demands before it acts. This
     *      inverts that: given the target `r`, return the gate it implies.
     *
     *      Verified empirically as well as derived: holding r fixed while lambda moves from 0.90
     *      to 0.98 - a five-fold change in effective window - moves LP value by under 0.5% on
     *      four years of real ETH/USDC. The derivation fails exactly where it predicts it should,
     *      at lambda = 0.70 where n = 3.3 and the CLT has not engaged, which is why `r` is
     *      bounded below by a lambda that keeps n >= 10. See README section 9.4.
     *
     * @param rWad   Noise-widths of directionality required, WAD.
     * @param lambda EWMA decay, WAD, strictly between 0 and WAD.
     * @return       The implied `dFloor`, WAD.
     */
    function gateFloorWad(uint256 rWad, uint256 lambda) internal pure returns (uint256) {
        // sqrt of a WAD quantity: sqrt(x * WAD) is sqrt(x) in WAD.
        uint256 noiseFloor = Math.sqrt((WAD - lambda) * WAD);
        return FullMath.mulDiv(rWad, noiseFloor, WAD);
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
