// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {Cusum} from "../../src/libraries/Cusum.sol";
import {DirectionalSignal} from "../../src/libraries/DirectionalSignal.sol";

/// @title CalibrationTest — measurement engine for detector parameters (CLAUDE.md §1.3, §4.3)
/// @notice This is the reusable harness referenced by analysis/CALIBRATION.md. It MEASURES
///         the calibration quantities — Average Run Length to false alarm (ARL₀) and detection
///         delay — rather than trusting a formula, and asserts the qualitative laws the design
///         depends on:
///           * ARL₀ is monotone increasing in the threshold h  (=> h is set from a target
///             false-alarm rate by bisection, never as a fixed block count);
///           * stronger drift is detected with a shorter delay (the data-dependent stopping
///             time at the heart of the manipulation argument, §4.2);
///           * the EWMA decay `lambda` maps exactly to an effective window of N steps.
///
/// @dev ILLUSTRATIVE NOISE MODEL. The "no-trend" returns here are a seeded zero-mean *uniform*
///      noise. This is enough to validate the methodology and the monotonic relationships;
///      it is NOT the real return distribution. Absolute ARL₀ numbers are therefore
///      illustrative — at milestone 6 the empirical (heavy-tailed) return distribution of the
///      target pair replaces `_noise`, and the SAME harness yields production `h`.
contract CalibrationTest is Test {
    using Cusum for Cusum.State;
    using DirectionalSignal for DirectionalSignal.State;

    uint256 internal constant WAD = 1e18;

    // ------------------------------------------------------------------
    // measurement primitives
    // ------------------------------------------------------------------

    /// @dev Zero-mean uniform noise in [-sigma, sigma], deterministic in (seed, t).
    /// @dev Hashes in EVM scratch space (0x00..0x3f) so the free-memory pointer never
    ///      advances — essential inside the long measurement loops, otherwise Solidity's
    ///      never-freed memory expands quadratically and the run hits MemoryOOG.
    function _noise(uint256 seed, uint256 t, uint256 sigma) internal pure returns (int256) {
        uint256 u;
        assembly {
            mstore(0x00, seed)
            mstore(0x20, t)
            u := keccak256(0x00, 0x40)
        }
        return int256(u % (2 * sigma + 1)) - int256(sigma);
    }

    /// @dev Run a single CUSUM trajectory with constant `drift` plus noise; return the step
    ///      index of the first alarm, or `maxSteps` if none (right-censored).
    /// @dev Mirrors `Cusum.update` + `alarm` EXACTLY (the same two-sided recursion), inlined
    ///      with scalar locals so this measurement loop stays O(1) in memory. Calling the
    ///      library's `State memory`-returning functions hundreds of thousands of times would
    ///      accrue never-freed memory and hit MemoryOOG. The library's own correctness is
    ///      proven in `test/Cusum.t.sol`; here we only need the statistic of the run length.
    function _runLength(int256 drift, uint256 sigma, int256 k, int256 h, uint256 seed, uint256 maxSteps)
        internal
        pure
        returns (uint256)
    {
        int256 sPos;
        int256 sNeg;
        for (uint256 t = 1; t <= maxSteps; t++) {
            int256 r = drift + _noise(seed, t, sigma);
            sPos += (r - k);
            if (sPos < 0) sPos = 0;
            sNeg += (-r - k);
            if (sNeg < 0) sNeg = 0;
            if (sPos >= h || sNeg >= h) return t; // first alarm (either side)
        }
        return maxSteps;
    }

    /// @dev Mean run length over `runs` independent trajectories (different seeds).
    function _meanRunLength(int256 drift, uint256 sigma, int256 k, int256 h, uint256 runs, uint256 maxSteps)
        internal
        pure
        returns (uint256)
    {
        uint256 total;
        for (uint256 i = 0; i < runs; i++) {
            total += _runLength(drift, sigma, k, h, uint256(keccak256(abi.encode("run", i))), maxSteps);
        }
        return total / runs;
    }

    // ------------------------------------------------------------------
    // ARL0 is monotone in h  (=> h derives from a target false-alarm rate)
    // ------------------------------------------------------------------

    function test_arl0_increasesWithThreshold() public pure {
        uint256 sigma = 4e15; // noise amplitude 0.004
        int256 k = 1e15; //      slack 0.001
        uint256 runs = 48;
        uint256 maxSteps = 4000;

        uint256 arlLow = _meanRunLength(0, sigma, k, 5e15, runs, maxSteps); // low threshold
        uint256 arlHigh = _meanRunLength(0, sigma, k, 15e15, runs, maxSteps); // high threshold

        assertGt(arlLow, 1, "a usable detector should not false-alarm on step 1");
        assertGt(arlHigh, arlLow, "raising h must raise ARL0 (fewer false alarms)");
    }

    // ------------------------------------------------------------------
    // detection delay is data-dependent: stronger drift -> faster
    // ------------------------------------------------------------------

    function test_detectionDelay_shrinksWithDriftStrength() public pure {
        uint256 sigma = 2e15;
        int256 k = 1e15;
        int256 h = 15e15;
        uint256 runs = 48;
        uint256 maxSteps = 4000;

        uint256 delayWeak = _meanRunLength(2e15, sigma, k, h, runs, maxSteps); // drift 0.002
        uint256 delayStrong = _meanRunLength(5e15, sigma, k, h, runs, maxSteps); // drift 0.005

        assertLt(delayStrong, delayWeak, "stronger drift must be detected sooner");
        // And both should detect well before the cap (a real trend, not a false alarm horizon).
        assertLt(delayWeak, maxSteps, "weak but real drift must still be detected before the cap");
    }

    // ------------------------------------------------------------------
    // false-alarm rate dominates detection delay (separation of regimes)
    // ------------------------------------------------------------------

    function test_trendDetectedMuchFasterThanFalseAlarms() public pure {
        uint256 sigma = 3e15;
        int256 k = 1e15;
        int256 h = 15e15;
        uint256 runs = 48;
        uint256 maxSteps = 6000;

        uint256 arl0 = _meanRunLength(0, sigma, k, h, runs, maxSteps); // no trend
        uint256 delay = _meanRunLength(4e15, sigma, k, h, runs, maxSteps); // real up-trend

        // The detector commits to a real trend far faster than it cries wolf on noise.
        assertLt(delay, arl0, "a real trend must be detected faster than the mean false-alarm time");
    }

    // ------------------------------------------------------------------
    // lambda <-> effective window is exact
    // ------------------------------------------------------------------

    function test_lambdaMapsToEffectiveWindow() public pure {
        // Effective window N = 20  =>  lambda = WAD*(N-1)/N = 0.95 WAD.
        uint256 N = 20;
        uint256 lambda = WAD * (N - 1) / N;
        assertEq(lambda, 95e16, "lambda derivation");

        // Drive a constant |r|; total-variation accumulator -> |r| * N at steady state.
        int256 r = 1e15;
        DirectionalSignal.State memory s;
        for (uint256 i = 0; i < 400; i++) {
            s = s.update(r, lambda);
        }
        assertApproxEqRel(s.ewmaTV, uint256(r) * N, 1e15, "ewmaTV steady state must equal |r| * N (1e-3)");
    }
}
