// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title DirectionalSignal — directional-efficiency ("trend vs chop") signal (CLAUDE.md §1.1)
/// @notice Directional efficiency is a cheap on-chain proxy for how *trending* a price path
///         is over a window:
///
///             D = |P_now - P_window_start| / Σ_i |P_i - P_{i-1}|   ∈ [0, 1]
///
///         D ≈ 1 means the path marched (almost) straight in one direction (a trend);
///         D ≈ 0 means it moved a lot but went nowhere (chop). Per the brief, D is used as
///         the noise floor / diagnostic; the *signed* return increments are what actually
///         feed the CUSUM detector.
///
/// @dev    DESIGN DECISIONS (settled with the project owner; CLAUDE.md §4 "do NOT silently
///         guess"). The stateful window is maintained as an O(1) EXPONENTIALLY-WEIGHTED
///         moving accumulator, NOT a ring buffer of samples. Rationale: a fixed sample
///         window has a hard edge — an attacker knows a move leaves the window at a *known*
///         future block, a predictable boundary that contradicts the data-dependent,
///         unpredictable spirit of the detector (§4.2). EWMA has no edge (old data decays
///         smoothly), is O(1) storage, and is inherently revert-safe (geometric decay
///         self-bounds the state given bounded increments — see §4.5). The increments are
///         LOG-PRICE returns: `r_t = Δ ln(price)`, so D is directional efficiency in
///         log-space and the CUSUM slack/threshold are scale-stable across price levels.
///
/// @dev    SEPARATION OF CONCERNS. This library consumes an already-computed signed
///         increment `r` (the same `r_t` fed to `Cusum`); it does NOT compute the log
///         itself. Deriving `r_t = lnP_t - lnP_{t-1}` from the pool/hook reserves (the one
///         `ln` per swap) lives at the hook boundary, off the curve hot-path. This keeps
///         the library pure, `ln`-free and unit-testable.
///
/// @dev    `absNet` and `totalVariation` must be non-negative and in the SAME units. By the
///         triangle inequality `absNet <= totalVariation` always holds for a real path, so
///         D ∈ [0, 1]; `efficiency` clamps defensively in case a caller violates that.
library DirectionalSignal {
    using DirectionalSignal for DirectionalSignal.State;

    /// @dev WAD fixed-point unit. `efficiency`/`signal` return D scaled so that 1e18 == 1.0.
    uint256 internal constant WAD = 1e18;

    /// @notice O(1) exponentially-weighted accumulators for the directional signal.
    /// @dev `ewmaNet` is the exponentially-weighted sum of *signed* increments (a net
    ///      log-displacement proxy); `ewmaTV` is the exponentially-weighted sum of their
    ///      magnitudes (a total-variation proxy). Per the triangle inequality
    ///      `|ewmaNet| <= ewmaTV`, so `signal()` ∈ [0, 1]. With a decay `lambda ∈ (0, WAD)`
    ///      and bounded `|r|`, both are bounded by `max|r| / (1 - lambda/WAD)` and therefore
    ///      cannot overflow under sustained input — the accumulator never reverts (§4.5).
    struct State {
        int256 ewmaNet; // exponentially-weighted Σ r_i  (signed; net displacement)
        uint256 ewmaTV; // exponentially-weighted Σ |r_i| (total variation)
    }

    /// @notice Directional efficiency D ∈ [0, WAD] from net displacement and total variation.
    /// @param absNet         |P_now - P_window_start|  (>= 0).
    /// @param totalVariation Σ |P_i - P_{i-1}| over the window (>= 0).
    /// @return d Directional efficiency in WAD: WAD == perfectly trending, 0 == pure chop
    ///         (or no movement / undefined denominator, treated as "no trend", the safe side).
    function efficiency(uint256 absNet, uint256 totalVariation) internal pure returns (uint256 d) {
        // No movement over the window: denominator is 0 and the ratio is undefined. Treat
        // it as "no trend" (D = 0) — the conservative choice (keeps the curve symmetric).
        if (totalVariation == 0) {
            return 0;
        }
        // Defensive clamp: a real path satisfies absNet <= totalVariation, so D <= 1.
        if (absNet >= totalVariation) {
            return WAD;
        }
        // 0 <= absNet < totalVariation  =>  0 <= d < WAD. FullMath avoids overflow in absNet*WAD.
        d = FullMath.mulDiv(absNet, WAD, totalVariation);
    }

    /// @notice Fold one signed log-return increment `r` into the EWMA accumulators.
    /// @dev Recursion (decay-then-add, most weight on the newest increment):
    ///        ewmaNet_t = (lambda · ewmaNet_{t-1}) / WAD  +  r
    ///        ewmaTV_t  = (lambda · ewmaTV_{t-1})  / WAD  +  |r|
    ///      The decays use FullMath so the multiply cannot overflow; since `lambda < WAD`
    ///      the decayed magnitude never exceeds the previous one, so with bounded `|r|` the
    ///      state is bounded and this never reverts (§4.5).
    /// @param r      Signed log-return increment this step (WAD-scaled), same `r_t` fed to Cusum.
    /// @param lambda Decay factor in (0, WAD). Larger == longer memory; effective window
    ///               length ≈ WAD / (WAD - lambda). A calibration parameter (§8), injected.
    function update(State memory self, int256 r, uint256 lambda) internal pure returns (State memory) {
        int256 net = _decaySigned(self.ewmaNet, lambda) + r;
        uint256 tv = FullMath.mulDiv(self.ewmaTV, lambda, WAD) + _abs(r);
        return State({ewmaNet: net, ewmaTV: tv});
    }

    /// @notice Current directional efficiency D ∈ [0, WAD] implied by the accumulators.
    /// @dev Reuses the pure `efficiency` ratio with `(|ewmaNet|, ewmaTV)`.
    function signal(State memory self) internal pure returns (uint256) {
        return efficiency(_abs(self.ewmaNet), self.ewmaTV);
    }

    /// @notice Validate the decay parameter. Asserted once at hook construction (§4.3);
    ///         the hot-path `update` skips the check for gas.
    /// @dev `lambda == 0` makes D degenerate (every step looks perfectly trending);
    ///      `lambda >= WAD` removes decay so the state grows unbounded — both are rejected.
    function isValidConfig(uint256 lambda) internal pure returns (bool) {
        return lambda > 0 && lambda < WAD;
    }

    /// @dev `a · lambda / WAD`, sign-preserving and overflow-safe. Since `lambda < WAD` the
    ///      result magnitude never exceeds `|a|`, so re-casting to int256 cannot overflow.
    function _decaySigned(int256 a, uint256 lambda) private pure returns (int256) {
        if (a == 0) return 0;
        bool neg = a < 0;
        uint256 mag = neg ? uint256(-a) : uint256(a);
        uint256 scaled = FullMath.mulDiv(mag, lambda, WAD);
        return neg ? -int256(scaled) : int256(scaled);
    }

    /// @dev Magnitude of a signed value. `r` is a bounded log-return, never `type(int256).min`.
    function _abs(int256 x) private pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
    }
}
