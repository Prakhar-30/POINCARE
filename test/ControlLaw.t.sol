// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {ControlLaw} from "../src/libraries/ControlLaw.sol";

/// @title ControlLawTest — bounded kappa from CUSUM evidence (CLAUDE.md §7.4)
/// @notice Proves the control-law guarantees: symmetric below threshold, hard cap at kappa_max,
///         monotone ramp, and the per-step rate limit (seam safety) + hysteresis.
contract ControlLawTest is Test {
    using ControlLaw for uint256;

    uint256 internal constant WAD = 1e18;

    function _cfg() internal pure returns (ControlLaw.Config memory) {
        return ControlLaw.Config({
            h: 2e16, // detection threshold
            sMax: 1e17, // saturation evidence
            kappaMin: 0, // symmetric below threshold
            kappaMax: 2e17, // 0.2 max spread
            dMax: 1e16 // 0.01 max change per step
        });
    }

    // ---------------------------------------------------------------------
    // target kappa ramp
    // ---------------------------------------------------------------------

    function test_target_belowThreshold_isMin() public pure {
        assertEq(ControlLaw.targetKappa(0, _cfg()), 0, "no evidence -> kappa_min");
        assertEq(ControlLaw.targetKappa(2e16, _cfg()), 0, "exactly at h -> still kappa_min");
    }

    function test_target_atOrAboveSMax_isMax() public pure {
        assertEq(ControlLaw.targetKappa(1e17, _cfg()), 2e17, "at sMax -> kappa_max");
        assertEq(ControlLaw.targetKappa(5e17, _cfg()), 2e17, "above sMax -> still kappa_max (capped)");
    }

    function test_target_midpoint_isHalf() public pure {
        // s = 6e16 is halfway between h=2e16 and sMax=1e17 -> kappa = kappa_max/2 = 1e17.
        assertEq(ControlLaw.targetKappa(6e16, _cfg()), 1e17, "midpoint evidence -> half asymmetry");
    }

    function testFuzz_target_monotoneInEvidence(int256 s1, int256 s2) public pure {
        s1 = bound(s1, 0, 2e17);
        s2 = bound(s2, 0, 2e17);
        if (s1 > s2) (s1, s2) = (s2, s1);
        assertLe(ControlLaw.targetKappa(s1, _cfg()), ControlLaw.targetKappa(s2, _cfg()), "kappa must be monotone in S");
    }

    // ---------------------------------------------------------------------
    // rate limit + hysteresis
    // ---------------------------------------------------------------------

    function test_step_rateLimitsRise() public pure {
        // Evidence jumps straight to saturation; kappa may rise by at most dMax this step.
        uint256 k = ControlLaw.step(0, 1e17, _cfg());
        assertEq(k, 1e16, "kappa rises by at most dMax from 0");
    }

    function test_step_rampsUpOverManySteps() public pure {
        ControlLaw.Config memory c = _cfg();
        uint256 k;
        for (uint256 i = 0; i < 100; i++) {
            k = ControlLaw.step(k, 1e17, c); // sustained saturation evidence
        }
        assertEq(k, c.kappaMax, "sustained max evidence eventually reaches kappa_max");
    }

    function test_step_decaysBackWhenEvidenceFalls() public pure {
        ControlLaw.Config memory c = _cfg();
        // Ramp up to the cap, then evidence collapses to 0: kappa must ease DOWN, rate-limited.
        uint256 k = c.kappaMax;
        uint256 kAfterOne = ControlLaw.step(k, 0, c);
        assertEq(kAfterOne, c.kappaMax - c.dMax, "kappa falls by at most dMax (hysteresis, no snap)");

        for (uint256 i = 0; i < 100; i++) {
            k = ControlLaw.step(k, 0, c);
        }
        assertEq(k, c.kappaMin, "with no evidence kappa returns to symmetric");
    }

    // ---------------------------------------------------------------------
    // invariants
    // ---------------------------------------------------------------------

    function testFuzz_stepStaysInBoundsAndRateLimited(uint256 prev, int256 s) public pure {
        ControlLaw.Config memory c = _cfg();
        prev = bound(prev, c.kappaMin, c.kappaMax);
        s = bound(s, 0, 2e17);

        uint256 k = ControlLaw.step(prev, s, c);
        assertGe(k, c.kappaMin, "kappa >= kappa_min");
        assertLe(k, c.kappaMax, "kappa <= kappa_max");

        uint256 delta = k > prev ? k - prev : prev - k;
        assertLe(delta, c.dMax, "kappa change per step <= dMax");
    }

    // ---------------------------------------------------------------------
    // config validation
    // ---------------------------------------------------------------------

    function test_isValidConfig() public pure {
        assertTrue(ControlLaw.isValidConfig(_cfg()), "baseline config is valid");

        ControlLaw.Config memory bad = _cfg();
        bad.sMax = bad.h; // zero-width ramp
        assertFalse(ControlLaw.isValidConfig(bad), "sMax must exceed h");

        bad = _cfg();
        bad.kappaMax = WAD; // spread of 1.0 would zero the output
        assertFalse(ControlLaw.isValidConfig(bad), "kappa_max must be < WAD");

        bad = _cfg();
        bad.dMax = 0; // kappa frozen
        assertFalse(ControlLaw.isValidConfig(bad), "dMax must be > 0");

        bad = _cfg();
        bad.kappaMin = 3e17; // kappa_min > kappa_max (both < WAD): inverted bounds
        bad.kappaMax = 2e17;
        assertFalse(ControlLaw.isValidConfig(bad), "kappa_max must be >= kappa_min");
    }
}
