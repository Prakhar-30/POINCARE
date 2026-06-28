// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title AsymmetricCurve — offset-hyperbola swap engine (the actuator core, CLAUDE.md §2)
/// @notice Prices swaps on a constant-product hyperbola with *virtual offsets*:
///
///             (x + a)·(y + b) = K,    K = (x + a)·(y + b)
///
///         where `x, y` are the real reserves of token0/token1 and `a, b >= 0` are virtual
///         offsets. Writing `X = x + a`, `Y = y + b`, this is ordinary constant-product on
///         the *virtual* reserves. Larger offsets => locally flatter curve => less price
///         impact (deep); zero offsets => pure `x·y` (steep). The Poincaré asymmetry comes
///         from choosing the offsets per swap direction — but THAT mapping is deliberately
///         NOT in this file (see below). This file is only the exact, value-safe swap math.
///
/// @dev    SCOPE / SAFETY BOUNDARY. Everything here operates on a SINGLE curve (one (a,b)).
///         On a single curve, swapping can only ever grow the invariant `K` (the pool never
///         loses), because every output is rounded against the trader. This is the property
///         the fuzz suite proves. What is NOT safe — and is intentionally absent here — is
///         choosing DIFFERENT offsets for the buy vs sell direction and re-anchoring at the
///         current reserves each swap: that lets a buy-then-sell round trip extract value
///         (verified by a concrete counterexample). Preventing that requires a spread in the
///         marginal prices (bid <= ask), i.e. the §4.1 "asymmetric in slope" construction,
///         which is a separate, carefully-proven layer to be added on top of this core.
///
/// @dev    AMOUNTS ARE REAL. The offsets shape the curve but cancel in the swap *amounts*:
///         e.g. `amountOut = Y - Y' = (y+b) - (y'+b) = y - y'`. So inputs/outputs returned
///         here are real token amounts; offsets only change how much you get for them.
///
/// @dev    PRECONDITIONS (caller's responsibility; the hook enforces sizing/feasibility):
///         - `x, y > 0`, `a, b >= 0`.
///         - exact-out: the requested output must not exceed the real reserve on that side
///           (`amountOut <= y` for zeroForOne, `<= x` for oneForZero); otherwise the trade
///           is infeasible. `FullMath` will revert on a zero/!overflowing divisor.
library AsymmetricCurve {
    using FullMath for uint256;

    /// @dev WAD fixed-point unit. The directional spread is a WAD fraction (1e18 = 1.0).
    uint256 internal constant WAD = 1e18;

    /// @notice Exact-input swap: given `amountIn`, return `amountOut` on the offset curve.
    /// @param x Real reserve of token0. @param y Real reserve of token1.
    /// @param a Virtual offset on token0 (>= 0). @param b Virtual offset on token1 (>= 0).
    /// @param amountIn Exact input amount (> 0).
    /// @param zeroForOne True: token0 in, token1 out. False: token1 in, token0 out.
    /// @return amountOut Output amount, rounded DOWN (against the trader).
    function swapExactIn(uint256 x, uint256 y, uint256 a, uint256 b, uint256 amountIn, bool zeroForOne)
        internal
        pure
        returns (uint256 amountOut)
    {
        uint256 X = x + a;
        uint256 Y = y + b;
        if (zeroForOne) {
            // X grows; Y' = K / X' with K = X·Y, rounded UP so amountOut is rounded down.
            uint256 xNew = X + amountIn;
            uint256 yNew = FullMath.mulDivRoundingUp(X, Y, xNew);
            amountOut = Y - yNew;
        } else {
            uint256 yNew = Y + amountIn;
            uint256 xNew = FullMath.mulDivRoundingUp(X, Y, yNew);
            amountOut = X - xNew;
        }
    }

    /// @notice Exact-output swap: given `amountOut`, return the required `amountIn`.
    /// @param amountOut Exact output amount (> 0, and <= the real reserve on the output side).
    /// @param zeroForOne True: token0 in, token1 out. False: token1 in, token0 out.
    /// @return amountIn Input amount, rounded UP (against the trader).
    function swapExactOut(uint256 x, uint256 y, uint256 a, uint256 b, uint256 amountOut, bool zeroForOne)
        internal
        pure
        returns (uint256 amountIn)
    {
        uint256 X = x + a;
        uint256 Y = y + b;
        if (zeroForOne) {
            // token1 out: Y shrinks; X' = K / Y' rounded UP so amountIn is rounded up.
            uint256 yNew = Y - amountOut;
            uint256 xNew = FullMath.mulDivRoundingUp(X, Y, yNew);
            amountIn = xNew - X;
        } else {
            uint256 xNew = X - amountOut;
            uint256 yNew = FullMath.mulDivRoundingUp(X, Y, xNew);
            amountIn = yNew - Y;
        }
    }

    /// @notice Marginal (infinitesimal) price of token0 in token1 at the current point,
    ///         in WAD: `(y + b) / (x + a)`. This is the *slope* the asymmetry layer makes
    ///         direction-dependent to create the bid-ask spread (§4.1).
    /// @dev Reverts if `x + a == 0`. Pure read; does not move along the curve.
    function marginalPriceWad(uint256 x, uint256 y, uint256 a, uint256 b) internal pure returns (uint256) {
        return FullMath.mulDiv(y + b, WAD, x + a);
    }

    // ------------------------------------------------------------------
    // Asymmetry layer — directional spread (CLAUDE.md §3.1, §4.1)
    // ------------------------------------------------------------------
    //
    // The Poincaré asymmetry is realized as a NON-NEGATIVE directional spread applied on top
    // of a SYMMETRIC-DEPTH base curve (same `(a,b)` for both directions). The with-trend side
    // is charged the spread; the stabilising side trades at the base price (spread = 0).
    //
    // ARB-SAFETY (by construction, OPEN_ITEMS A2/D2). Because the base depth is symmetric,
    // a base round trip returns at most the input (proven by `roundTripSameCurve_noProfit`).
    // The spread only ever REDUCES the trader's output and INCREASES their input, so adding it
    // makes every round trip strictly worse for the trader — value flows to the pool. This
    // holds for any `spreadWad`, any direction, and re-anchored reserves. (Contrast: an
    // asymmetric *depth* base is exploitable — see the SAFETY BOUNDARY note above.)

    /// @notice Exact-input swap with a directional spread: base output, then a haircut.
    /// @param spreadWad Spread fraction in [0, WAD). 0 == no spread (stabilising / calm side);
    ///        > 0 == hardened (with-trend) side. Output is multiplied by `(WAD - spreadWad)`.
    /// @return amountOut Output after the spread haircut, rounded DOWN (against the trader).
    function swapExactInWithSpread(
        uint256 x,
        uint256 y,
        uint256 a,
        uint256 b,
        uint256 amountIn,
        bool zeroForOne,
        uint256 spreadWad
    ) internal pure returns (uint256 amountOut) {
        uint256 baseOut = swapExactIn(x, y, a, b, amountIn, zeroForOne);
        amountOut = FullMath.mulDiv(baseOut, WAD - spreadWad, WAD);
    }

    /// @notice Exact-output swap with a directional spread: base input, then a markup.
    /// @param spreadWad Spread fraction in [0, WAD). Input is divided by `(WAD - spreadWad)`,
    ///        i.e. the trader pays more to receive the same output.
    /// @return amountIn Input after the spread markup, rounded UP (against the trader).
    function swapExactOutWithSpread(
        uint256 x,
        uint256 y,
        uint256 a,
        uint256 b,
        uint256 amountOut,
        bool zeroForOne,
        uint256 spreadWad
    ) internal pure returns (uint256 amountIn) {
        uint256 baseIn = swapExactOut(x, y, a, b, amountOut, zeroForOne);
        amountIn = FullMath.mulDivRoundingUp(baseIn, WAD, WAD - spreadWad);
    }
}
