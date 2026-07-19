// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

/// @title PriceLib - reserve price and log-return derivation for the detector
/// @notice Turns the hook's reserves into the detector's inputs: a WAD spot price and
///         the signed log-return r_t = Δ ln(price). The one place `ln` is taken per
///         swap, at the hook boundary, off the curve's pricing hot path. Both Cusum
///         and DirectionalSignal are fed the same r_t.
///
/// @dev    The price comes from the hook's own reserves, not the PoolManager's slot0: a
///         custom-curve hook overrides native pricing, so slot0 can sit frozen at its
///         initialization value. Orientation is price = reserve1/reserve0 (token1 per
///         token0); log-returns make up/down symmetric so the choice doesn't bias
///         detection, it just has to stay consistent.
library PriceLib {
    using FixedPointMathLib for int256;

    uint256 internal constant WAD = 1e18;

    /// @notice Spot price of token0 in token1, WAD. Reverts if reserve0 == 0 (a live
    ///         pool always holds non-zero reserves).
    function priceWad(uint256 reserve0, uint256 reserve1) internal pure returns (uint256) {
        return FullMath.mulDiv(reserve1, WAD, reserve0);
    }

    /// @notice Signed log-return between two WAD prices: ln(newPrice / prevPrice), WAD.
    ///         Both prices must be > 0.
    /// @dev    `lnWad` needs a positive `int256`. An extreme move can floor the ratio to 0 or
    ///         push it past `int256.max` (the cast wraps negative), both reverting `lnWad`.
    ///         Clamp into the safe domain; the detector Huber-clips this increment right
    ///         after, so clamping only touches moves already beyond the clip.
    function logReturnWad(uint256 prevPriceWad, uint256 newPriceWad) internal pure returns (int256 r) {
        uint256 ratioWad = FullMath.mulDiv(newPriceWad, WAD, prevPriceWad);
        if (ratioWad == 0) ratioWad = 1;
        else if (ratioWad > uint256(type(int256).max)) ratioWad = uint256(type(int256).max);
        r = FixedPointMathLib.lnWad(int256(ratioWad));
    }

    /// @notice Log-return directly from old and new reserves (all > 0).
    function logReturnFromReserves(uint256 x0, uint256 y0, uint256 x1, uint256 y1)
        internal
        pure
        returns (int256 r)
    {
        return logReturnWad(priceWad(x0, y0), priceWad(x1, y1));
    }
}
