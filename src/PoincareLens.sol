// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {PoincareHook} from "./PoincareHook.sol";
import {AsymmetricCurve} from "./libraries/AsymmetricCurve.sol";
import {Cusum} from "./libraries/Cusum.sol";

/// @title PoincareLens - read-only quoter for the Poincaré hook
/// @notice Prices swaps and exposes detector state for routers and front-ends, using the
///         exact inputs and code the hook's swap path uses: reserves from `hook.reserves()`,
///         spread and fee from `hook.previewSpread` (the hook's own projection of what the
///         next swap of this block pays, including the once-per-block detector sample it
///         would take), offsets from `hook.baseOffsets()`, and pricing through the same
///         `AsymmetricCurve.swapExact*Priced` pipeline with the same rounding and
///         feasibility guards. A quote therefore matches on-chain execution to the wei,
///         even when taken in a fresh block before anyone has swapped.
contract PoincareLens {
    /// @notice The hook this Lens quotes for.
    PoincareHook public immutable hook;

    uint256 private constant WAD = 1e18;

    constructor(PoincareHook _hook) {
        hook = _hook;
    }

    // quoting

    /// @notice Quote an exact-input swap: given `amountIn`, the `amountOut` the trader receives.
    /// @param zeroForOne True: token0 in, token1 out. False: token1 in, token0 out.
    function quoteExactInput(bool zeroForOne, uint256 amountIn) external view returns (uint256 amountOut) {
        // A real v4 swap reverts on a zero amount before the hook runs, so a zero quote is a
        // route that can never execute. Mirror the PoolManager guard.
        if (amountIn == 0) revert IPoolManager.SwapAmountCannotBeZero();
        (uint256 r0, uint256 r1) = hook.reserves();
        (uint256 spread, uint256 fee) = hook.previewSpread(zeroForOne);
        (uint256 a, uint256 b) = hook.baseOffsets();
        (amountOut,) = AsymmetricCurve.swapExactInPriced(r0, r1, a, b, amountIn, zeroForOne, spread, fee);
    }

    /// @notice Quote an exact-output swap: given `amountOut`, the `amountIn` the trader must pay.
    /// @param zeroForOne True: token0 in, token1 out. False: token1 in, token0 out.
    /// @dev Reverts unless `amountOut` is strictly below the real reserve on the output
    ///      side, the same feasibility boundary the hook enforces.
    function quoteExactOutput(bool zeroForOne, uint256 amountOut) external view returns (uint256 amountIn) {
        if (amountOut == 0) revert IPoolManager.SwapAmountCannotBeZero();
        (uint256 r0, uint256 r1) = hook.reserves();
        (uint256 spread, uint256 fee) = hook.previewSpread(zeroForOne);
        (uint256 a, uint256 b) = hook.baseOffsets();
        (amountIn,) = AsymmetricCurve.swapExactOutPriced(r0, r1, a, b, amountOut, zeroForOne, spread, fee);
    }

    // market state

    /// @notice Marginal (mid) price of token0 in token1, WAD: the base curve slope at the
    ///         current point, spread- and fee-free. The executable bid/ask straddle this.
    function midPriceWad() external view returns (uint256) {
        (uint256 r0, uint256 r1) = hook.reserves();
        (uint256 a, uint256 b) = hook.baseOffsets();
        return AsymmetricCurve.marginalPriceWad(r0, r1, a, b);
    }

    /// @notice The directional spreads currently charged on each side (WAD fractions),
    ///         projected for this block (see `PoincareHook.previewSpread`).
    /// @return spreadZeroForOne Spread on a token0->token1 swap (with-trend iff trend is Down).
    /// @return spreadOneForZero Spread on a token1->token0 swap (with-trend iff trend is Up).
    function spreads() external view returns (uint256 spreadZeroForOne, uint256 spreadOneForZero) {
        (spreadZeroForOne,) = hook.previewSpread(true);
        (spreadOneForZero,) = hook.previewSpread(false);
    }

    /// @notice Effective per-unit execution price of an exact-input swap, WAD: out per unit in,
    ///         in token1-per-token0 orientation. Includes impact, the vol fee and the spread.
    /// @dev `zeroForOne`: price = amountOut(token1) / amountIn(token0). `oneForZero`: the swap
    ///      returns token0 for token1, so the token1-per-token0 price is amountIn / amountOut.
    function effectivePriceWad(bool zeroForOne, uint256 amountIn) external view returns (uint256) {
        (uint256 r0, uint256 r1) = hook.reserves();
        (uint256 spread, uint256 fee) = hook.previewSpread(zeroForOne);
        (uint256 a, uint256 b) = hook.baseOffsets();
        (uint256 out,) = AsymmetricCurve.swapExactInPriced(r0, r1, a, b, amountIn, zeroForOne, spread, fee);
        if (out == 0 || amountIn == 0) return 0;
        return zeroForOne
            ? WAD * out / amountIn // token1 out / token0 in
            : WAD * amountIn / out; // token1 in / token0 out
    }

    /// @notice The full detector/curve snapshot a router or UI needs in one call: the STORED
    ///         state (as of the last sample; see `hook.previewDetector()` for the projection).
    /// @return reserve0 token0 reserves.
    /// @return reserve1 token1 reserves.
    /// @return kappa Current asymmetry intensity (WAD spread fraction).
    /// @return trend Current detected trend (None/Up/Down).
    /// @return directionalEfficiency Current D in WAD (trend-vs-chop confirmation).
    /// @return sPos CUSUM up-evidence (the statistic climbing toward `thresholdH`).
    /// @return sNeg CUSUM down-evidence.
    /// @return thresholdH The detection threshold the statistics are measured against.
    /// @return sigmaWad Live volatility estimate σ̂ (WAD).
    /// @return baseFeeWad Vol fee implied by σ̂ (WAD fraction).
    function snapshot()
        external
        view
        returns (
            uint256 reserve0,
            uint256 reserve1,
            uint256 kappa,
            Cusum.Trend trend,
            uint256 directionalEfficiency,
            int256 sPos,
            int256 sNeg,
            int256 thresholdH,
            uint256 sigmaWad,
            uint256 baseFeeWad
        )
    {
        (reserve0, reserve1) = hook.reserves();
        kappa = hook.kappa();
        trend = hook.trend();
        directionalEfficiency = hook.directionalEfficiency();
        (sPos, sNeg) = hook.cusumState();
        thresholdH = hook.thresholdH();
        sigmaWad = hook.sigmaWad();
        baseFeeWad = hook.currentFeeWad();
    }
}
