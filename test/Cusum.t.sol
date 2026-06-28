// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {Cusum} from "../src/libraries/Cusum.sol";

/// @title CusumTest — unit + fuzz coverage for the two-sided CUSUM detector (CLAUDE.md §7.1)
/// @notice Verifies the properties the brief gates on:
///         - zero-drift / sub-slack noise -> never fires (low false-alarm side);
///         - a real drift -> fires with a bounded delay;
///         - the firing delay is DATA-DEPENDENT: stronger drift fires sooner;
///         - reset-on-fire gives hysteresis (re-accumulation before re-detection).
contract CusumTest is Test {
    using Cusum for Cusum.State;

    // All quantities are in signed WAD (1e18) for these tests. The library itself is
    // unit-agnostic; WAD is just the convention chosen here.
    int256 internal constant WAD = 1e18;
    int256 internal constant K = 1e15; //   0.001  slack / noise floor
    int256 internal constant H = 2e16; //   0.02   threshold

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    /// @dev Drive a constant return `r` through `step` (reset-on-fire) until the first
    ///      alarm. Returns the 1-based step index of the alarm (0 == never within
    ///      `maxSteps`) and its direction.
    function _stepsToAlarm(int256 r, int256 k, int256 h, uint256 maxSteps)
        internal
        pure
        returns (uint256 steps, Cusum.Trend dir)
    {
        Cusum.State memory s;
        for (uint256 i = 1; i <= maxSteps; i++) {
            (s, dir) = s.step(r, k, h);
            if (dir != Cusum.Trend.None) {
                return (i, dir);
            }
        }
        return (0, Cusum.Trend.None);
    }

    // ---------------------------------------------------------------------
    // no-trend behaviour
    // ---------------------------------------------------------------------

    function test_zeroDrift_neverFires() public pure {
        Cusum.State memory s;
        for (uint256 i = 0; i < 1000; i++) {
            s = s.update(0, K);
        }
        assertEq(s.sPos, 0, "sPos must stay clamped at 0 with zero drift");
        assertEq(s.sNeg, 0, "sNeg must stay clamped at 0 with zero drift");
        assertEq(uint256(s.alarm(H)), uint256(Cusum.Trend.None), "must not fire on zero drift");
    }

    function test_noiseBelowSlack_neverFires() public pure {
        // Alternating +/- moves strictly below the slack k must never accumulate.
        int256 mag = K - 1; // |r| < k
        Cusum.State memory s;
        for (uint256 i = 0; i < 1000; i++) {
            int256 r = (i % 2 == 0) ? mag : -mag;
            (s,) = s.step(r, K, H);
        }
        assertEq(s.sPos, 0, "sub-slack noise must not grow sPos");
        assertEq(s.sNeg, 0, "sub-slack noise must not grow sNeg");
    }

    // ---------------------------------------------------------------------
    // detection
    // ---------------------------------------------------------------------

    function test_positiveDrift_firesUp_atExpectedDelay() public pure {
        // increment per step = r - k = 5e15 - 1e15 = 4e15; need sPos >= 2e16 -> 5 steps.
        (uint256 steps, Cusum.Trend dir) = _stepsToAlarm(5e15, K, H, 100);
        assertEq(steps, 5, "expected up-trend detection at step 5");
        assertEq(uint256(dir), uint256(Cusum.Trend.Up), "expected Up");
    }

    function test_negativeDrift_firesDown_atExpectedDelay() public pure {
        // Symmetric to the positive case: increment per step = -r - k = 4e15.
        (uint256 steps, Cusum.Trend dir) = _stepsToAlarm(-5e15, K, H, 100);
        assertEq(steps, 5, "expected down-trend detection at step 5");
        assertEq(uint256(dir), uint256(Cusum.Trend.Down), "expected Down");
    }

    /// @notice The core property: the stopping time is data-dependent — a stronger drift
    ///         is detected sooner. (CLAUDE.md §1.3 / §7.1)
    function test_firingDelayIsDataDependent() public pure {
        (uint256 slow,) = _stepsToAlarm(5e15, K, H, 100); // weaker drift
        (uint256 fast,) = _stepsToAlarm(9e15, K, H, 100); // stronger drift
        assertEq(slow, 5, "sanity: weak-drift delay");
        assertEq(fast, 3, "sanity: strong-drift delay"); // ceil(2e16 / 8e15) = 3
        assertLt(fast, slow, "stronger drift must be detected strictly sooner");
    }

    // ---------------------------------------------------------------------
    // hysteresis / repeated detection (reset-on-fire)
    // ---------------------------------------------------------------------

    function test_step_resetsAndRedetects() public pure {
        // Constant drift: first fire at step 5, statistic resets, re-accumulates,
        // fires again at step 10. Count detections over 12 steps.
        Cusum.State memory s;
        uint256 fires;
        uint256 firstFire;
        uint256 secondFire;
        for (uint256 i = 1; i <= 12; i++) {
            Cusum.Trend dir;
            (s, dir) = s.step(5e15, K, H);
            if (dir == Cusum.Trend.Up) {
                fires++;
                if (firstFire == 0) firstFire = i;
                else if (secondFire == 0) secondFire = i;
            }
        }
        assertEq(fires, 2, "reset-on-fire should allow exactly two detections in 12 steps");
        assertEq(firstFire, 5, "first detection at step 5");
        assertEq(secondFire, 10, "second detection at step 10 after re-accumulation");
    }

    // ---------------------------------------------------------------------
    // alarm() edge cases
    // ---------------------------------------------------------------------

    function test_alarm_tieBreaksToUp() public pure {
        Cusum.State memory s = Cusum.State({sPos: H, sNeg: H});
        assertEq(uint256(s.alarm(H)), uint256(Cusum.Trend.Up), "exact tie -> Up");
    }

    function test_alarm_strongerSideWins() public pure {
        Cusum.State memory s = Cusum.State({sPos: H, sNeg: H + 1});
        assertEq(uint256(s.alarm(H)), uint256(Cusum.Trend.Down), "stronger statistic wins");
    }

    function test_alarm_belowThreshold_isNone() public pure {
        Cusum.State memory s = Cusum.State({sPos: H - 1, sNeg: H - 1});
        assertEq(uint256(s.alarm(H)), uint256(Cusum.Trend.None), "below threshold -> None");
    }

    // ---------------------------------------------------------------------
    // fuzz
    // ---------------------------------------------------------------------

    /// @notice Any per-step move strictly below the slack can never grow the statistics
    ///         away from zero — k is a hard noise floor. (invariant for CLAUDE.md §1.2)
    function testFuzz_subSlackMovesNeverAccumulate(int256 r) public pure {
        // r % K lands strictly inside (-K, K), i.e. |r| <= K - 1.
        int256 bounded = r % K;
        Cusum.State memory s;
        for (uint256 i = 0; i < 50; i++) {
            s = s.update(bounded, K);
            assertEq(s.sPos, 0, "sub-slack move must keep sPos at 0");
            assertEq(s.sNeg, 0, "sub-slack move must keep sNeg at 0");
        }
    }

    /// @notice `update` never lets a statistic go negative, for any inputs. (clamp invariant)
    function testFuzz_statisticsNeverNegative(int256 sPos0, int256 sNeg0, int256 r, int256 k) public pure {
        // keep the seed state non-negative (its own invariant) and bound magnitudes so the
        // accumulation cannot overflow int256.
        sPos0 = int256(bound(sPos0, 0, 1e30));
        sNeg0 = int256(bound(sNeg0, 0, 1e30));
        r = int256(bound(r, -1e30, 1e30));
        k = int256(bound(k, 0, 1e30));

        Cusum.State memory s = Cusum.State({sPos: sPos0, sNeg: sNeg0});
        s = s.update(r, k);
        assertGe(s.sPos, 0, "sPos clamped >= 0");
        assertGe(s.sNeg, 0, "sNeg clamped >= 0");
    }

    // ---------------------------------------------------------------------
    // updateCapped — bounded accumulation (never-revert + κ saturation)
    // ---------------------------------------------------------------------

    function test_updateCapped_saturatesAtSMax() public pure {
        // Strong sustained drift would, with plain update, grow unbounded. Capped, it
        // must rise to sMax and stay there.
        int256 sMax = H; // cap at the threshold for this test
        Cusum.State memory s;
        for (uint256 i = 0; i < 1000; i++) {
            s = s.updateCapped(5e15, K, sMax);
            assertLe(s.sPos, sMax, "sPos must never exceed sMax");
            assertGe(s.sPos, 0, "sPos must never go below 0");
        }
        assertEq(s.sPos, sMax, "sustained drift must saturate sPos at sMax");
        assertEq(s.sNeg, 0, "opposite side stays at 0");
    }

    function testFuzz_updateCapped_staysInBounds(int256 sPos0, int256 sNeg0, int256 r, int256 k, int256 sMax)
        public
        pure
    {
        sPos0 = int256(bound(sPos0, 0, 1e30));
        sNeg0 = int256(bound(sNeg0, 0, 1e30));
        r = int256(bound(r, -1e30, 1e30));
        k = int256(bound(k, 0, 1e30));
        sMax = int256(bound(sMax, 0, 1e30));
        // seed must respect the [0, sMax] invariant updateCapped maintains
        sPos0 = sPos0 > sMax ? sMax : sPos0;
        sNeg0 = sNeg0 > sMax ? sMax : sNeg0;

        Cusum.State memory s = Cusum.State({sPos: sPos0, sNeg: sNeg0});
        s = s.updateCapped(r, k, sMax);
        assertGe(s.sPos, 0, "sPos >= 0");
        assertLe(s.sPos, sMax, "sPos <= sMax");
        assertGe(s.sNeg, 0, "sNeg >= 0");
        assertLe(s.sNeg, sMax, "sNeg <= sMax");
    }

    // ---------------------------------------------------------------------
    // isValidConfig
    // ---------------------------------------------------------------------

    function test_isValidConfig() public pure {
        assertTrue(Cusum.isValidConfig(0, 1), "k=0,h=1 is valid");
        assertTrue(Cusum.isValidConfig(1e15, 2e16), "typical config is valid");
        assertFalse(Cusum.isValidConfig(-1, 1), "negative slack is invalid");
        assertFalse(Cusum.isValidConfig(1, 0), "zero threshold is invalid");
        assertFalse(Cusum.isValidConfig(1, -1), "negative threshold is invalid");
    }
}
