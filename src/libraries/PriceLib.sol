// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

/// @title PriceLib — reserve price and log-return derivation for the detector (CLAUDE.md §1.1)
/// @notice Turns the hook's own reserves into the inputs the detector consumes:
///         a spot price (WAD) and the signed log-return increment `r_t = Δ ln(price)`.
///         This is the ONE place an `ln` is taken per swap. It sits at the hook boundary,
///         off the curve's pricing hot-path (CLAUDE.md §2.1), and feeds the SAME `r_t` to
///         both `Cusum` and `DirectionalSignal`, so the two detectors stay consistent.
///
/// @dev    PRICE SOURCE. The price is derived from the hook's reserves, NOT the PoolManager's
///         `slot0` sqrtPrice. A custom-curve hook overrides native pricing, so `slot0` may
///         sit frozen at its initialization value and is not a trustworthy series. The hook
///         holds the canonical reserves (as ERC-6909 claims) and is the price of record.
///         This is asserted as a design decision here; the hook milestone wires it.
///
/// @dev    ORIENTATION. `price = reserve1 / reserve0` in WAD (units of token1 per token0).
///         The choice is arbitrary but must be *consistent*: an up-move in this price means
///         token0 is appreciating in token1 terms. The CUSUM up/down statistics inherit this
///         orientation. Using log-returns makes the two directions symmetric, so the choice
///         does not bias detection.
library PriceLib {
    using FixedPointMathLib for int256;

    uint256 internal constant WAD = 1e18;

    /// @notice Spot price of token0 in token1, in WAD: `reserve1 * 1e18 / reserve0`.
    /// @dev Reverts if `reserve0 == 0` (a live pool always holds non-zero reserves; the hook
    ///      guarantees this before sampling). `mulDiv` avoids overflow in `reserve1 * WAD`.
    function priceWad(uint256 reserve0, uint256 reserve1) internal pure returns (uint256) {
        return FullMath.mulDiv(reserve1, WAD, reserve0);
    }

    /// @notice Signed log-return between two WAD prices: `ln(newPrice / prevPrice)`, in WAD.
    /// @dev `r > 0` when the price rose, `r < 0` when it fell, `r == 0` when unchanged.
    ///      Both prices must be > 0 (WAD prices from a live pool always are). The ratio is
    ///      formed in WAD via `mulDiv` (no overflow), then `lnWad` is applied once.
    /// @param prevPriceWad Previous spot price (WAD), > 0.
    /// @param newPriceWad  Current spot price (WAD), > 0.
    /// @return r The log-return increment `r_t` fed to the detector.
    function logReturnWad(uint256 prevPriceWad, uint256 newPriceWad) internal pure returns (int256 r) {
        // ratio = newPrice / prevPrice, in WAD. lnWad(WAD) == 0, so an unchanged price -> 0.
        uint256 ratioWad = FullMath.mulDiv(newPriceWad, WAD, prevPriceWad);
        r = FixedPointMathLib.lnWad(int256(ratioWad));
    }

    /// @notice Convenience: the log-return directly from old and new reserves.
    /// @dev Equivalent to `logReturnWad(priceWad(x0,y0), priceWad(x1,y1))`. Useful for the
    ///      hook, which has reserves on hand. All reserves must be > 0.
    function logReturnFromReserves(uint256 x0, uint256 y0, uint256 x1, uint256 y1)
        internal
        pure
        returns (int256 r)
    {
        return logReturnWad(priceWad(x0, y0), priceWad(x1, y1));
    }
}
