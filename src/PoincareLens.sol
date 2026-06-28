// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoincareHook} from "./PoincareHook.sol";
import {AsymmetricCurve} from "./libraries/AsymmetricCurve.sol";
import {Cusum} from "./libraries/Cusum.sol";

/// @title PoincareLens — read-only quoter for the Poincaré hook (CLAUDE.md §5, milestone 7)
/// @notice Prices swaps and exposes detector state for routers / front-ends. It quotes using the
///         EXACT same inputs the hook's swap path uses:
///           * reserves          — read from the hook (`hook.reserves()`, the ERC-6909 claims);
///           * directional spread — read from the hook (`hook.effectiveSpread`), the SAME value
///                                  `_getUnspecifiedAmount` applies (no duplicated spread logic);
///           * curve math         — the SAME `AsymmetricCurve` library the hook calls.
///         So a same-block quote matches on-chain execution to the wei (rounding included).
///
/// @dev    BASE CURVE. The hook's MVP base is plain constant-product (virtual offsets a=b=0,
///         OPEN_ITEMS E0); the Lens mirrors that exactly with `_A = _B = 0`. If a future hook
///         version uses a non-zero deep base, expose those offsets and read them here too.
///
/// @dev    FRESHNESS. A quote reflects the detector state as of its last update. At the first
///         swap of a new block the hook re-samples the detector before pricing, so a realized
///         swap can use a slightly different spread than a quote taken in the previous block.
///         This is intrinsic to any stateful-fee/curve AMM; quote within the intended block.
contract PoincareLens {
    /// @notice The hook this Lens quotes for.
    PoincareHook public immutable hook;

    uint256 private constant WAD = 1e18;

    /// @dev Base virtual offsets of the hook's MVP curve (pure constant-product). See E0.
    uint256 private constant _A = 0;
    uint256 private constant _B = 0;

    constructor(PoincareHook _hook) {
        hook = _hook;
    }

    // ------------------------------------------------------------------
    // quoting (matches on-chain execution within the same block)
    // ------------------------------------------------------------------

    /// @notice Quote an exact-input swap: given `amountIn`, the `amountOut` the trader receives.
    /// @param zeroForOne True: token0 in, token1 out. False: token1 in, token0 out.
    function quoteExactInput(bool zeroForOne, uint256 amountIn) external view returns (uint256 amountOut) {
        (uint256 r0, uint256 r1) = hook.reserves();
        uint256 spread = hook.effectiveSpread(zeroForOne);
        amountOut = AsymmetricCurve.swapExactInWithSpread(r0, r1, _A, _B, amountIn, zeroForOne, spread);
    }

    /// @notice Quote an exact-output swap: given `amountOut`, the `amountIn` the trader must pay.
    /// @param zeroForOne True: token0 in, token1 out. False: token1 in, token0 out.
    /// @dev Reverts if `amountOut` exceeds the reserve on the output side (infeasible trade) —
    ///      the same boundary the hook hits (OPEN_ITEMS A7).
    function quoteExactOutput(bool zeroForOne, uint256 amountOut) external view returns (uint256 amountIn) {
        (uint256 r0, uint256 r1) = hook.reserves();
        uint256 spread = hook.effectiveSpread(zeroForOne);
        amountIn = AsymmetricCurve.swapExactOutWithSpread(r0, r1, _A, _B, amountOut, zeroForOne, spread);
    }

    // ------------------------------------------------------------------
    // market state (price, depth, trend, asymmetry)
    // ------------------------------------------------------------------

    /// @notice Marginal (mid) price of token0 in token1, WAD — the base curve slope, spread-free.
    ///         The executable bid/ask straddle this by the directional spread (see `spreads`).
    function midPriceWad() external view returns (uint256) {
        (uint256 r0, uint256 r1) = hook.reserves();
        return AsymmetricCurve.marginalPriceWad(r0, r1, _A, _B);
    }

    /// @notice The directional spreads currently charged on each side (WAD fractions).
    /// @return spreadZeroForOne Spread on a token0->token1 swap (with-trend iff trend is Down).
    /// @return spreadOneForZero Spread on a token1->token0 swap (with-trend iff trend is Up).
    function spreads() external view returns (uint256 spreadZeroForOne, uint256 spreadOneForZero) {
        spreadZeroForOne = hook.effectiveSpread(true);
        spreadOneForZero = hook.effectiveSpread(false);
    }

    /// @notice Effective per-unit execution price of an exact-input swap, WAD: out per unit in,
    ///         in token1-per-token0 orientation. Includes price impact and the directional spread.
    /// @dev `zeroForOne`: price = amountOut(token1) / amountIn(token0). `oneForZero`: the swap
    ///      returns token0 for token1, so the token1-per-token0 price is amountIn / amountOut.
    function effectivePriceWad(bool zeroForOne, uint256 amountIn) external view returns (uint256) {
        (uint256 r0, uint256 r1) = hook.reserves();
        uint256 spread = hook.effectiveSpread(zeroForOne);
        uint256 out = AsymmetricCurve.swapExactInWithSpread(r0, r1, _A, _B, amountIn, zeroForOne, spread);
        if (out == 0 || amountIn == 0) return 0;
        return zeroForOne
            ? WAD * out / amountIn // token1 out / token0 in
            : WAD * amountIn / out; // token1 in / token0 out
    }

    /// @notice The full detector/curve snapshot a router or UI needs in one call.
    /// @return reserve0 token0 reserves.
    /// @return reserve1 token1 reserves.
    /// @return kappa Current asymmetry intensity (WAD spread fraction).
    /// @return trend Current detected trend (None/Up/Down).
    /// @return directionalEfficiency Current D in WAD (trend-vs-chop confirmation).
    function snapshot()
        external
        view
        returns (
            uint256 reserve0,
            uint256 reserve1,
            uint256 kappa,
            Cusum.Trend trend,
            uint256 directionalEfficiency
        )
    {
        (reserve0, reserve1) = hook.reserves();
        kappa = hook.kappa();
        trend = hook.trend();
        directionalEfficiency = hook.directionalEfficiency();
    }
}
