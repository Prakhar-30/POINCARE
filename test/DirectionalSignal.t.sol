// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {DirectionalSignal} from "../src/libraries/DirectionalSignal.sol";

/// @title DirectionalSignalTest — coverage for the directional-efficiency ratio (CLAUDE.md §7.2)
/// @notice Verifies the brief's gates for the signal core: a pure trend -> ~1, chop -> ~0,
///         and the [0,1] / no-movement behaviour. The stateful windowing is intentionally
///         not built yet (pending an architectural decision), so only the pure ratio is tested.
contract DirectionalSignalTest is Test {
    using DirectionalSignal for uint256;

    uint256 internal constant WAD = 1e18;

    function test_pureTrend_isOne() public pure {
        // A perfectly straight path: net displacement equals total variation -> D == 1.
        uint256 d = DirectionalSignal.efficiency(100e18, 100e18);
        assertEq(d, WAD, "straight path must give D = 1");
    }

    function test_pureChop_isZero() public pure {
        // Moved a lot in total but ended where it started: net = 0 -> D == 0.
        uint256 d = DirectionalSignal.efficiency(0, 100e18);
        assertEq(d, 0, "round trip must give D = 0");
    }

    function test_noMovement_isZero() public pure {
        // Degenerate window (no movement at all): denominator 0 -> treated as no trend.
        uint256 d = DirectionalSignal.efficiency(0, 0);
        assertEq(d, 0, "no movement must give D = 0 (not a revert)");
    }

    function test_halfEfficient_isHalf() public pure {
        // Net move is half the path length -> D = 0.5.
        uint256 d = DirectionalSignal.efficiency(50e18, 100e18);
        assertEq(d, WAD / 2, "half-efficient path must give D = 0.5");
    }

    function test_clampsWhenNetExceedsVariation() public pure {
        // Defensive: a caller that (incorrectly) passes absNet > totalVariation gets a
        // clamped D = 1 rather than a value above 1.
        uint256 d = DirectionalSignal.efficiency(150e18, 100e18);
        assertEq(d, WAD, "D must clamp to 1 when absNet > totalVariation");
    }

    /// @notice For any valid path (absNet <= totalVariation), D is in [0, WAD]; and it is
    ///         monotone in absNet for a fixed denominator.
    function testFuzz_efficiencyInRange(uint256 absNet, uint256 totalVariation) public pure {
        absNet = bound(absNet, 0, 1e40);
        totalVariation = bound(totalVariation, 0, 1e40);

        uint256 d = DirectionalSignal.efficiency(absNet, totalVariation);
        assertLe(d, WAD, "D must never exceed 1");

        // Monotonicity check on a fixed, non-zero denominator with a valid numerator.
        if (totalVariation > 0 && absNet < totalVariation) {
            uint256 dMore = DirectionalSignal.efficiency(absNet + 1, totalVariation);
            assertGe(dMore, d, "D must be non-decreasing in absNet");
        }
    }

    // ---------------------------------------------------------------------
    // EWMA accumulator (the stateful directional signal, CLAUDE.md §7.2)
    // ---------------------------------------------------------------------

    using DirectionalSignal for DirectionalSignal.State;

    uint256 internal constant LAMBDA = 9e17; // 0.9 decay -> effective window ~10 steps
    int256 internal constant R = 1e16; //   a 1% log-return step

    function test_ewma_pureUpTrend_isOne() public pure {
        DirectionalSignal.State memory s;
        for (uint256 i = 0; i < 200; i++) {
            s = s.update(R, LAMBDA);
        }
        // For a constant-sign series, |ewmaNet| == ewmaTV identically, so D == 1 exactly.
        assertEq(s.signal(), WAD, "sustained up-trend must give D = 1");
    }

    function test_ewma_pureDownTrend_isOne() public pure {
        DirectionalSignal.State memory s;
        for (uint256 i = 0; i < 200; i++) {
            s = s.update(-R, LAMBDA);
        }
        assertEq(s.signal(), WAD, "sustained down-trend must give D = 1");
        assertLt(s.ewmaNet, 0, "net displacement must be negative for a down-trend");
    }

    function test_ewma_chop_isLow() public pure {
        // Strict alternation +R, -R, ... : the path thrashes but goes nowhere.
        DirectionalSignal.State memory s;
        for (uint256 i = 0; i < 200; i++) {
            s = s.update(i % 2 == 0 ? R : -R, LAMBDA);
        }
        // Closed-form steady state for lambda=0.9: D = |net|/tv = (r/(1+λ)) / (r/(1-λ))
        //                                            = (1-λ)/(1+λ) = 0.1/1.9 ≈ 0.0526.
        uint256 d = s.signal();
        assertLt(d, 6e16, "chop must give a low D (< 0.06)");
    }

    function test_ewma_trendDominatesChop() public pure {
        DirectionalSignal.State memory trend;
        DirectionalSignal.State memory chop;
        for (uint256 i = 0; i < 200; i++) {
            trend = trend.update(R, LAMBDA);
            chop = chop.update(i % 2 == 0 ? R : -R, LAMBDA);
        }
        assertGt(trend.signal(), chop.signal(), "a trend must read more efficient than chop");
    }

    function test_ewma_singleStep_isTriviallyTrending() public pure {
        // One increment from rest: net == r, tv == |r| -> D == 1 (nothing to be inefficient about).
        DirectionalSignal.State memory s;
        s = s.update(R, LAMBDA);
        assertEq(s.signal(), WAD, "a single move is trivially efficient");
        assertEq(s.ewmaNet, R, "net equals the increment");
        assertEq(s.ewmaTV, uint256(R), "tv equals |increment|");
    }

    function test_ewma_isValidConfig() public pure {
        assertTrue(DirectionalSignal.isValidConfig(1), "smallest positive lambda is valid");
        assertTrue(DirectionalSignal.isValidConfig(WAD - 1), "just below WAD is valid");
        assertFalse(DirectionalSignal.isValidConfig(0), "lambda = 0 is invalid");
        assertFalse(DirectionalSignal.isValidConfig(WAD), "lambda = WAD (no decay) is invalid");
        assertFalse(DirectionalSignal.isValidConfig(WAD + 1), "lambda > WAD is invalid");
    }

    /// @notice The accumulator stays bounded and `signal()` stays in [0, WAD] for any
    ///         bounded log-return stream — no revert, no out-of-range D. (CLAUDE.md §4.5)
    function testFuzz_ewma_boundedAndInRange(int256[16] calldata rs) public pure {
        DirectionalSignal.State memory s;
        for (uint256 i = 0; i < rs.length; i++) {
            int256 r = int256(bound(rs[i], -1e18, 1e18)); // |log-return| <= 1.0 (a ~172% move)
            s = s.update(r, LAMBDA);
            assertLe(s.signal(), WAD, "D must stay <= 1");
            // |ewmaNet| <= ewmaTV is the structural invariant behind D <= 1.
            uint256 absNet = s.ewmaNet >= 0 ? uint256(s.ewmaNet) : uint256(-s.ewmaNet);
            assertLe(absNet, s.ewmaTV, "|net| must never exceed total variation");
        }
    }
}
