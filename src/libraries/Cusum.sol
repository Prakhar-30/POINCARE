// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title Cusum — two-sided CUSUM quickest-change detector (Poincaré detector core)
/// @notice Implements the sequential change-point detector described in CLAUDE.md §1.
///         It runs two one-sided CUSUM statistics on a stream of signed return
///         increments `r_t`: `sPos` accumulates evidence for a sustained *up* drift,
///         `sNeg` for a sustained *down* drift. A trend is declared when a statistic
///         crosses the threshold `h`. The firing moment is a data-dependent stopping
///         time (a strong drift crosses `h` quickly, weak noise never does) — there is
///         no fixed "after N blocks", which is the basis of the manipulation argument
///         in CLAUDE.md §4.2.
///
/// @dev    FIXED-POINT / UNITS. This library performs only integer arithmetic and makes
///         NO scaling assumptions. The caller must supply `r` (the signed return
///         increment), `k` (slack) and `h` (threshold) in the *same* fixed-point scale
///         (e.g. signed WAD, 1e18). The library does not know or care what that scale is.
///         How `r_t` is derived from the pool price (`sqrtPriceX96`) is intentionally NOT
///         this library's concern — that belongs to DirectionalSignal / the hook, keeping
///         this primitive pure and unit-testable.
///
/// @dev    PRECONDITIONS (responsibility of the caller, not checked here for gas reasons):
///         - `k >= 0`. `k` is the noise floor: any per-step move with `|r| <= k` cannot
///           grow either statistic, so it is ignored as noise.
///         - `h > 0`.
///         - OVERFLOW: plain `update` never resets, so under a long sustained drift
///           `sPos`/`sNeg` grow without bound and could, in the extreme, overflow int256
///           and revert. A hook that must never revert a swap (CLAUDE.md §4.5) must keep
///           the statistic bounded. Two safe options are provided: `step` (resets on fire,
///           so it self-bounds to ~h + one increment) and `updateCapped` (clamps to a
///           caller-supplied `sMax`). Reach for plain `update` only on the off-chain /
///           back-test path where unbounded accumulation is acceptable.
///
/// @dev    RESET vs ACCUMULATE — a real design choice, not silently resolved here.
///         CLAUDE.md §1.2 says "reset to 0 after firing (… gives hysteresis for free)";
///         CLAUDE.md §3 drives the curve asymmetry `κ` from "S past threshold", which a
///         reset would zero out. These are two different policies:
///           * `step(...)`        — update + fire + reset-on-fire. Gives repeated discrete
///                                  detections with built-in hysteresis (the §1.2 reading).
///           * `update(...)` + `alarm(...)` — accumulate only, never auto-reset, so the
///                                  statistic magnitude persists and can drive `κ` (the §3
///                                  reading); the caller latches/clears trend state itself.
///         This library exposes both and picks neither by fiat. The choice is a calibration
///         decision for ControlLaw / the hook (CLAUDE.md §4.3).
library Cusum {
    /// @notice Declared trend direction. `None` until a statistic crosses the threshold.
    enum Trend {
        None,
        Up,
        Down
    }

    /// @notice Per-pool detector state: the two one-sided CUSUM accumulators.
    /// @dev Both are kept `>= 0` by `update`. Two int256 words; not packed (premature).
    struct State {
        int256 sPos; // S⁺ : accumulated evidence of a sustained positive drift (up-trend)
        int256 sNeg; // S⁻ : accumulated evidence of a sustained negative drift (down-trend)
    }

    /// @notice Accumulate one signed return increment `r` with slack `k`.
    /// @dev Implements, with a clamp at zero (CLAUDE.md §1.2):
    ///        S⁺_t = max(0, S⁺_{t-1} + (r_t - k))
    ///        S⁻_t = max(0, S⁻_{t-1} + (-r_t - k))
    ///      Does not reset and does not read the threshold; pure accumulation.
    /// @param self Current detector state.
    /// @param r    Signed return increment this step (caller's fixed-point scale).
    /// @param k    Slack / reference (>= 0). Moves with `|r| <= k` are ignored as noise.
    /// @return The updated state with both statistics clamped to be `>= 0`.
    function update(State memory self, int256 r, int256 k) internal pure returns (State memory) {
        int256 sPos = self.sPos + (r - k);
        if (sPos < 0) sPos = 0;

        int256 sNeg = self.sNeg + (-r - k);
        if (sNeg < 0) sNeg = 0;

        return State({sPos: sPos, sNeg: sNeg});
    }

    /// @notice Accumulate one signed return increment `r` with slack `k`, clamping each
    ///         statistic into `[0, sMax]`.
    /// @dev Same recursion as `update` but with an upper clamp. This serves two purposes
    ///      simultaneously (CLAUDE.md §3, §4.2, §4.5):
    ///        * never-revert safety — bounded growth cannot overflow int256, so a hook can
    ///          accumulate on every swap without risking a reverting swap; and
    ///        * κ saturation — capping the evidence at `sMax` is exactly the saturation
    ///          point past which the control law's asymmetry `κ` should stop increasing.
    ///      The plain (uncapped) `update` is kept for the off-chain / back-test path.
    /// @param sMax Upper bound for each statistic (>= 0; intended `>= h` so an alarm is
    ///             still reachable). Statistics are clamped to `[0, sMax]`.
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

    /// @notice Which direction (if any) has crossed the threshold `h`.
    /// @dev Pure read; does not mutate or reset. `>=` so exactly hitting `h` fires.
    /// @param self Detector state (typically just after `update`).
    /// @param h    Threshold (> 0), derived from a target false-alarm rate / ARL₀ (§1.3).
    /// @return The declared trend, or `Trend.None` if neither side has crossed.
    function alarm(State memory self, int256 h) internal pure returns (Trend) {
        bool up = self.sPos >= h;
        bool down = self.sNeg >= h;

        if (up && down) {
            // Practically unreachable: for k >= 0 a single increment (r - k) and (-r - k)
            // cannot both be positive, so the two statistics cannot grow in the same step.
            // Defensive tie-break to the stronger statistic; `Up` on an exact tie.
            return self.sPos >= self.sNeg ? Trend.Up : Trend.Down;
        }
        if (up) return Trend.Up;
        if (down) return Trend.Down;
        return Trend.None;
    }

    /// @notice Update, then fire-and-reset if a statistic crossed `h`.
    /// @dev The "reset on fire" policy (CLAUDE.md §1.2): on an alarm the firing statistic
    ///      is zeroed so it must re-accumulate before firing again — built-in hysteresis,
    ///      and it keeps the statistic bounded (no overflow under sustained drift).
    /// @return s The new state (firing side zeroed if an alarm occurred).
    /// @return t The declared trend this step (`None` if no crossing).
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

    /// @notice Validate the detector configuration. Intended to be asserted once, at the
    ///         hook's construction (CLAUDE.md §4.3) — the hot-path functions skip these
    ///         checks for gas and rely on this invariant holding.
    /// @return ok True iff `k` is a non-negative noise floor and `h` is a positive
    ///         threshold; both are required for the recursion and `alarm` to be meaningful.
    function isValidConfig(int256 k, int256 h) internal pure returns (bool ok) {
        return k >= 0 && h > 0;
    }
}
