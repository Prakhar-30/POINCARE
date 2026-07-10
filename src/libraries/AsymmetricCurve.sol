// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title AsymmetricCurve - offset-hyperbola swap engine
/// @notice Prices swaps on (x + a)·(y + b) = K, i.e. constant-product on virtual
///         reserves. Larger offsets flatten the curve (deeper, less impact); zero
///         offsets recover pure x·y. Offsets cancel in the swap amounts themselves
///         (amountOut = (y+b) − (y'+b) = y − y'), so everything returned here is a
///         real token amount.
///
/// @dev    Safety boundary: everything in this file operates on a SINGLE curve (one
///         (a,b) per swap). On one curve the invariant K can only grow, because every
///         amount rounds against the trader. Giving the buy and sell directions
///         DIFFERENT depth offsets and re-anchoring each swap is NOT safe: a
///         buy-then-sell round trip extracts value (concrete counterexample in the
///         manipulation suite). Directionality is therefore expressed only as a
///         non-negative spread on top of the shared base curve, below.
///
///         Caller preconditions: x, y > 0; a, b >= 0; exact-out amounts must not
///         exceed the real reserve on the output side.
library AsymmetricCurve {
    using FullMath for uint256;

    uint256 internal constant WAD = 1e18;

    /// @notice Exact-input swap on the offset curve. Output rounds DOWN.
    function swapExactIn(uint256 x, uint256 y, uint256 a, uint256 b, uint256 amountIn, bool zeroForOne)
        internal
        pure
        returns (uint256 amountOut)
    {
        uint256 X = x + a;
        uint256 Y = y + b;
        if (zeroForOne) {
            // Y' = K / X' rounded UP so amountOut rounds down.
            uint256 xNew = X + amountIn;
            uint256 yNew = FullMath.mulDivRoundingUp(X, Y, xNew);
            amountOut = Y - yNew;
        } else {
            uint256 yNew = Y + amountIn;
            uint256 xNew = FullMath.mulDivRoundingUp(X, Y, yNew);
            amountOut = X - xNew;
        }
    }

    /// @notice Exact-output swap on the offset curve. Input rounds UP.
    function swapExactOut(uint256 x, uint256 y, uint256 a, uint256 b, uint256 amountOut, bool zeroForOne)
        internal
        pure
        returns (uint256 amountIn)
    {
        uint256 X = x + a;
        uint256 Y = y + b;
        if (zeroForOne) {
            uint256 yNew = Y - amountOut;
            uint256 xNew = FullMath.mulDivRoundingUp(X, Y, yNew);
            amountIn = xNew - X;
        } else {
            uint256 xNew = X - amountOut;
            uint256 yNew = FullMath.mulDivRoundingUp(X, Y, xNew);
            amountIn = yNew - Y;
        }
    }

    /// @notice Marginal price of token0 in token1 at the current point, WAD: (y+b)/(x+a).
    function marginalPriceWad(uint256 x, uint256 y, uint256 a, uint256 b) internal pure returns (uint256) {
        return FullMath.mulDiv(y + b, WAD, x + a);
    }

    // Directional spread layer. The with-trend side is charged a non-negative spread on
    // top of the symmetric base curve; the stabilising side trades at the base price.
    // Arb-safe by construction: a base round trip already returns at most the input, and
    // the spread only reduces the trader's output / increases their input, for any
    // spreadWad, direction, or re-anchored reserves.

    /// @notice Exact-in with spread: base output haircut by (WAD − spreadWad). Rounds DOWN.
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

    /// @notice Exact-out with spread: base input marked up by 1/(WAD − spreadWad). Rounds UP.
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

    // Full pricing pipeline: vol fee -> curve -> spread. The single path both the hook's
    // swap and the Lens quote through, so they cannot drift. The fee is charged on the
    // input side (matching the HookSwap event's fee-in-input-currency convention) and
    // stays in reserves, accruing to LP shares with no extra accounting. Fee rounds UP,
    // curve output DOWN, exact-out input UP: always against the trader.
    //
    // Feasibility: with a deep base (b > 0) the curve can quote an output exceeding the
    // REAL reserve. That trade cannot settle, so both swap kinds reject against the real
    // reserve; strict `<` keeps reserves positive.

    /// @notice Exact-input through fee + curve + spread.
    /// @return amountOut Output after fee and spread.
    /// @return feeAmount Fee charged, in the input currency.
    function swapExactInPriced(
        uint256 x,
        uint256 y,
        uint256 a,
        uint256 b,
        uint256 amountIn,
        bool zeroForOne,
        uint256 spreadWad,
        uint256 feeWad
    ) internal pure returns (uint256 amountOut, uint256 feeAmount) {
        feeAmount = FullMath.mulDivRoundingUp(amountIn, feeWad, WAD);
        amountOut = swapExactInWithSpread(x, y, a, b, amountIn - feeAmount, zeroForOne, spreadWad);
        require(amountOut < (zeroForOne ? y : x), "AsymmetricCurve: output exceeds reserve");
    }

    /// @notice Exact-output through fee + curve + spread.
    /// @return amountIn Total input including fee and spread.
    /// @return feeAmount Fee charged, in the input currency.
    function swapExactOutPriced(
        uint256 x,
        uint256 y,
        uint256 a,
        uint256 b,
        uint256 amountOut,
        bool zeroForOne,
        uint256 spreadWad,
        uint256 feeWad
    ) internal pure returns (uint256 amountIn, uint256 feeAmount) {
        require(amountOut < (zeroForOne ? y : x), "AsymmetricCurve: output exceeds reserve");
        uint256 baseIn = swapExactOutWithSpread(x, y, a, b, amountOut, zeroForOne, spreadWad);
        amountIn = FullMath.mulDivRoundingUp(baseIn, WAD, WAD - feeWad);
        feeAmount = amountIn - baseIn;
    }
}
