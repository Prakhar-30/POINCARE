// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.26;

/// @title Cusum - two-sided CUSUM quickest-change detector
/// @notice Two one-sided CUSUM statistics over signed return increments: `sPos`
///         accumulates evidence of a sustained up drift, `sNeg` of a down drift.
///         A trend is declared when a statistic crosses the threshold `h`, so the
///         firing moment is a data-dependent stopping time, never "after N blocks".
///
/// @dev    Pure integer math, no scaling assumptions: `r`, `k` and `h` just have to
///         share one fixed-point scale (signed WAD here). Deriving `r` from the pool
///         price is the caller's job, which keeps this primitive unit-testable.
///
///         Not checked on the hot path (assert once at construction via `isValidConfig`):
///         `k >= 0` (moves with |r| <= k are ignored as noise) and `h > 0`.
///
///         Overflow: plain `update` never resets, so a long sustained drift can grow a
///         statistic without bound. On-chain callers that must never revert a swap should
///         use `step` (resets on fire, self-bounding) or `updateCapped` (clamps to sMax);
///         plain `update` is for the off-chain / back-test path.
///
///         Reset vs accumulate is a policy choice, exposed as both: `step` fires and
///         resets (built-in hysteresis), while `update` + `alarm` only accumulates so the
///         statistic magnitude can keep driving the control law. The hook picks.
library Cusum {
    enum Trend {
        None,
        Up,
        Down
    }

    /// @notice Per-pool detector state; both statistics are kept >= 0 by `update`.
    struct State {
        int256 sPos;
        int256 sNeg;
    }

    /// @notice S⁺ = max(0, S⁺ + (r - k)); S⁻ = max(0, S⁻ + (-r - k)). No reset, no threshold.
    function update(State memory self, int256 r, int256 k) internal pure returns (State memory) {
        int256 sPos = self.sPos + (r - k);
        if (sPos < 0) sPos = 0;

        int256 sNeg = self.sNeg + (-r - k);
        if (sNeg < 0) sNeg = 0;

        return State({sPos: sPos, sNeg: sNeg});
    }

    /// @notice Same recursion as `update`, clamped into [0, sMax].
    /// @dev The cap does double duty: bounded growth cannot overflow (a swap can never
    ///      revert on detector math), and sMax is the saturation point past which the
    ///      control law's asymmetry stops increasing. Intended sMax >= h.
    function updateCapped(State memory self, int256 r, int256 k, int256 sMax)
        internal
        pure
        returns (State memory)
    {
        int256 sPos = self.sPos + (r - k);
        if (sPos < 0) sPos = 0;
        else if (sPos > sMax) sPos = sMax;

        int256 sNeg = self.sNeg + (-r - k);
        if (sNeg < 0) sNeg = 0;
        else if (sNeg > sMax) sNeg = sMax;

        return State({sPos: sPos, sNeg: sNeg});
    }

    /// @notice Which direction, if any, has crossed the threshold. `>=` so exactly hitting h fires.
    function alarm(State memory self, int256 h) internal pure returns (Trend) {
        bool up = self.sPos >= h;
        bool down = self.sNeg >= h;

        if (up && down) {
            // Unreachable for k >= 0 (one increment cannot grow both sides in the same
            // step); defensive tie-break to the stronger statistic.
            return self.sPos >= self.sNeg ? Trend.Up : Trend.Down;
        }
        if (up) return Trend.Up;
        if (down) return Trend.Down;
        return Trend.None;
    }

    /// @notice Update, then fire-and-reset if a statistic crossed `h`. Zeroing the firing
    ///         side forces re-accumulation before the next alarm (hysteresis) and keeps
    ///         the statistic bounded under sustained drift.
    function step(State memory self, int256 r, int256 k, int256 h)
        internal
        pure
        returns (State memory s, Trend t)
    {
        s = update(self, r, k);
        t = alarm(s, h);
        if (t == Trend.Up) {
            s.sPos = 0;
        } else if (t == Trend.Down) {
            s.sNeg = 0;
        }
    }

    /// @notice Config sanity check, asserted once at construction; the hot path relies on it.
    function isValidConfig(int256 k, int256 h) internal pure returns (bool ok) {
        return k >= 0 && h > 0;
    }
}
