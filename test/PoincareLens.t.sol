// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook, PoincareConfig} from "../src/PoincareHook.sol";
import {PoincareLens} from "../src/PoincareLens.sol";
import {Cusum} from "../src/libraries/Cusum.sol";
import {PoincareTestBase} from "./utils/PoincareTestBase.sol";

/// @title PoincareLensTest — the Lens quotes must match on-chain execution (CLAUDE.md §5, M7)
/// @notice Proves the read-only quoter prices identically to the hook's swap path — to the wei,
///         rounding included — in the calm and trend regimes, for exact-input and exact-output,
///         and (via the hook's projection) even for quotes taken in a FRESH block before the
///         once-per-block detector sample has run. Also covered: the full-feature config
///         (vol fee + deep base), which quotes through the same shared pipeline.
contract PoincareLensTest is PoincareTestBase {
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;
    PoincareLens lens;

    uint256 constant DEADLINE = type(uint256).max;
    int24 constant MIN_TICK = -887220;
    int24 constant MAX_TICK = 887220;

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        hook = deployPoincare(defaultConfig(), 0x4444);
        lens = new PoincareLens(hook);
        poolKey = initPoincarePool(hook, currency0, currency1);

        IERC20Minimal(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(10 ether, 10 ether, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );
    }

    function _swapIn(PoolKey memory key, uint256 amountIn, bool zeroForOne) internal returns (uint256 received) {
        Currency outC = zeroForOne ? currency1 : currency0;
        uint256 before = outC.balanceOf(address(this));
        swapRouter.swapExactTokensForTokens(
            amountIn, 0, zeroForOne, key, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        received = outC.balanceOf(address(this)) - before;
    }

    function _swapOut(PoolKey memory key, uint256 amountOut, bool zeroForOne) internal returns (uint256 spent) {
        Currency inC = zeroForOne ? currency0 : currency1;
        uint256 before = inC.balanceOf(address(this));
        swapRouter.swapTokensForExactTokens(
            amountOut, type(uint256).max, zeroForOne, key, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        spent = before - inC.balanceOf(address(this));
    }

    function _engageDownTrend() internal {
        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            _swapIn(poolKey, 1 ether, true); // sell token0 -> price falls -> down-trend
        }
    }

    // ------------------------------------------------------------------

    function test_midPrice_isReserveRatio() public view {
        // 10:10 reserves -> price token1/token0 == 1.0 (WAD).
        assertEq(lens.midPriceWad(), 1e18, "mid price = r1/r0");
    }

    function test_snapshot_reportsSeededState() public view {
        (
            uint256 r0,
            uint256 r1,
            uint256 kappa,
            Cusum.Trend trend,
            uint256 d,
            int256 sPos,
            int256 sNeg,
            int256 h,
            uint256 sigma,
            uint256 fee
        ) = lens.snapshot();
        assertEq(r0, 10 ether, "reserve0");
        assertEq(r1, 10 ether, "reserve1");
        assertEq(kappa, 0, "calm: kappa 0");
        assertEq(uint256(trend), uint256(Cusum.Trend.None), "calm: no trend");
        assertEq(d, 0, "calm: D 0 before any move");
        assertEq(sPos, 0, "no up-evidence yet");
        assertEq(sNeg, 0, "no down-evidence yet");
        assertEq(h, hook.thresholdH(), "threshold exposed for charting");
        assertEq(sigma, 0, "no realized vol yet");
        assertEq(fee, 0, "no vol -> no fee");
    }

    function test_snapshot_exposesLiveEvidence() public {
        _engageDownTrend();
        (,,,,, int256 sPos, int256 sNeg, int256 h, uint256 sigma,) = lens.snapshot();
        assertGt(sNeg, 0, "down-evidence is live");
        assertGe(sNeg, h, "evidence crossed the threshold (kappa engaged)");
        assertGe(sNeg, sPos, "down side dominates");
        assertGt(sigma, 0, "sigma tracks the move");
    }

    function test_quoteExactInput_matchesExecution_calm() public {
        uint256 quote = lens.quoteExactInput(true, 1 ether);
        uint256 received = _swapIn(poolKey, 1 ether, true);
        assertEq(received, quote, "calm exact-in quote must equal execution");
        assertGt(received, 0, "non-trivial output");
    }

    function test_quoteExactOutput_matchesExecution_calm() public {
        uint256 quote = lens.quoteExactOutput(true, 1 ether);
        uint256 spent = _swapOut(poolKey, 1 ether, true);
        assertEq(spent, quote, "calm exact-out quote must equal execution");
    }

    function test_quoteExactInput_matchesExecution_withTrend() public {
        _engageDownTrend();
        // Still in the last engaged block: the detector already sampled this block, so a further
        // swap will NOT re-sample -> spread is stable -> the quote must match execution exactly.
        assertGt(hook.kappa(), 0, "trend engaged");
        (uint256 sZ41,) = lens.spreads();
        assertGt(sZ41, 0, "with-trend (zeroForOne) side is hardened");

        uint256 quote = lens.quoteExactInput(true, 1 ether); // with-trend (down) side
        uint256 received = _swapIn(poolKey, 1 ether, true);
        assertEq(received, quote, "with-trend exact-in quote must equal execution");
    }

    function test_quoteExactInput_matchesExecution_againstTrend() public {
        _engageDownTrend();
        // Against-trend (oneForZero) side trades at the base price (spread 0).
        (, uint256 sOneForZero) = lens.spreads();
        assertEq(sOneForZero, 0, "against-trend side carries no spread");

        uint256 quote = lens.quoteExactInput(false, 1 ether);
        uint256 received = _swapIn(poolKey, 1 ether, false);
        assertEq(received, quote, "against-trend exact-in quote must equal execution");
    }

    function test_quoteExactOutput_matchesExecution_withTrend() public {
        _engageDownTrend();
        uint256 quote = lens.quoteExactOutput(true, 1 ether);
        uint256 spent = _swapOut(poolKey, 1 ether, true);
        assertEq(spent, quote, "with-trend exact-out quote must equal execution");
    }

    function test_spreads_areAsymmetricInTrend() public {
        _engageDownTrend();
        (uint256 sZeroForOne, uint256 sOneForZero) = lens.spreads();
        // Down-trend: selling token0 (zeroForOne) is with-trend (hardened); buying is soft.
        assertEq(sZeroForOne, hook.kappa(), "with-trend spread == kappa");
        assertEq(sOneForZero, 0, "against-trend spread == 0");
        assertGt(sZeroForOne, sOneForZero, "executable curve has a directional bid-ask spread");
    }

    /// @notice The projection guarantee: a quote taken in a FRESH block — before anyone has
    ///         swapped, so before the once-per-block detector sample — must still match the
    ///         execution of the first swap of that block, which runs the sample first. The
    ///         Lens gets this from `hook.previewSpread` (the same `_projectDetector` the swap
    ///         path persists), so there is no stale-across-blocks quote window at all.
    function test_quote_freshBlock_matchesExecution() public {
        _engageDownTrend();
        vm.roll(block.number + 1); // fresh block: detector NOT yet sampled

        uint256 quoteIn = lens.quoteExactInput(true, 1 ether);
        uint256 received = _swapIn(poolKey, 1 ether, true);
        assertEq(received, quoteIn, "fresh-block exact-in quote must match execution");

        vm.roll(block.number + 1);
        uint256 quoteOut = lens.quoteExactOutput(false, 1 ether);
        uint256 spent = _swapOut(poolKey, 1 ether, false);
        assertEq(spent, quoteOut, "fresh-block exact-out quote must match execution");
    }

    /// @notice Full-feature config (vol fee + deep base): the Lens quotes through the exact
    ///         same composed pipeline, so quotes still match execution to the wei.
    function test_quote_matchesExecution_fullFeature() public {
        PoincareConfig memory cfg = defaultConfig();
        cfg.feeGamma = 5e17;
        cfg.feeCap = 1e16;
        cfg.alphaWad = 5e17;

        PoincareHook fullHook = deployPoincare(cfg, 0x5555);
        PoincareLens fullLens = new PoincareLens(fullHook);
        PoolKey memory fullKey = initPoincarePool(fullHook, currency0, currency1);
        IERC20Minimal(Currency.unwrap(currency0)).approve(address(fullHook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(fullHook), type(uint256).max);
        fullHook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(10 ether, 10 ether, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );

        // Realize some volatility so the fee is non-zero, then quote in a fresh block.
        for (uint256 i = 0; i < 4; i++) {
            vm.roll(block.number + 1);
            _swapIn(fullKey, 1 ether, i % 2 == 0);
        }
        vm.roll(block.number + 1);
        (, uint256 fee) = fullHook.previewSpread(true);
        assertGt(fee, 0, "vol fee is live");

        uint256 quote = fullLens.quoteExactInput(true, 1 ether);
        uint256 received = _swapIn(fullKey, 1 ether, true);
        assertEq(received, quote, "full-feature exact-in quote must equal execution");

        uint256 quoteOut = fullLens.quoteExactOutput(false, 0.5 ether);
        uint256 spent = _swapOut(fullKey, 0.5 ether, false);
        assertEq(spent, quoteOut, "full-feature exact-out quote must equal execution");
    }
}
