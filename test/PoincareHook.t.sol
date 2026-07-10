// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook, PoincareConfig} from "../src/PoincareHook.sol";
import {AsymmetricCurve} from "../src/libraries/AsymmetricCurve.sol";
import {Cusum} from "../src/libraries/Cusum.sol";
import {PoincareTestBase} from "./utils/PoincareTestBase.sol";

/// @title PoincareHookTest: end-to-end integration of the assembled hook
/// @notice Deploys the hook on a real PoolManager (via the hookmate harness), seeds hook-owned
///         liquidity, and exercises swaps. Validates: liquidity in/out, swaps route through the
///         custom curve, the detector stays calm with no trend and engages the directional
///         spread on a sustained one-way move; plus the newer layers: the DetectorSample
///         trace event, the exposed CUSUM/σ̂ state, the vol-scaled base fee, the deep base,
///         and the v2 adaptive (σ-standardized) detector mode.
contract PoincareHookTest is PoincareTestBase {
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;

    uint256 constant WAD = 1e18;
    uint256 constant DEADLINE = type(uint256).max;
    int24 constant MIN_TICK = -887220;
    int24 constant MAX_TICK = 887220;

    // Redeclared for expectEmit (events are not inherited into the test's ABI scope).
    event DetectorSample(
        uint256 blockNumber,
        uint256 priceWad,
        int256 r,
        int256 sPos,
        int256 sNeg,
        uint256 dWad,
        uint256 sigmaWad,
        uint256 kappaWad,
        Cusum.Trend trend,
        uint256 feeWad
    );

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        hook = deployPoincare(defaultConfig(), 0x4444);
        poolKey = initPoincarePool(hook, currency0, currency1);

        // Approve the hook to pull tokens for hook-owned liquidity.
        IERC20Minimal(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);

        _addLiquidity(hook, 10 ether, 10 ether);
    }

    function _addLiquidity(PoincareHook h, uint256 a0, uint256 a1) internal {
        h.addLiquidity(BaseCustomAccounting.AddLiquidityParams(a0, a1, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0)));
    }

    function _swap(PoolKey memory key, uint256 amountIn, bool zeroForOne) internal returns (BalanceDelta) {
        return swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: key,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    /// @dev Deploy + seed a second, independently-configured pool on the same pair.
    function _deploySeededPool(PoincareConfig memory cfg, uint16 ns, uint256 seed0, uint256 seed1)
        internal
        returns (PoincareHook h, PoolKey memory key)
    {
        h = deployPoincare(cfg, ns);
        key = initPoincarePool(h, currency0, currency1);
        IERC20Minimal(Currency.unwrap(currency0)).approve(address(h), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(h), type(uint256).max);
        _addLiquidity(h, seed0, seed1);
    }

    // ------------------------------------------------------------------
    // baseline (byte-identical to the proven MVP config)
    // ------------------------------------------------------------------

    function test_liquidity_seedsReserves() public view {
        (uint256 r0, uint256 r1) = hook.reserves();
        assertEq(r0, 10 ether, "reserve0 seeded");
        assertEq(r1, 10 ether, "reserve1 seeded");
        assertGt(hook.balanceOf(address(this)), 0, "LP shares minted");
    }

    function test_removeLiquidity_returnsAssets() public {
        uint256 shares = hook.balanceOf(address(this));
        uint256 bal0Before = currency0.balanceOf(address(this));

        hook.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(shares / 2, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );

        assertGt(currency0.balanceOf(address(this)), bal0Before, "got token0 back");
        assertApproxEqAbs(hook.balanceOf(address(this)), shares / 2, 1, "half the shares burned");
    }

    function test_swap_routesThroughCurve() public {
        uint256 out1Before = currency1.balanceOf(address(this));
        _swap(poolKey, 1 ether, true); // sell token0 for token1
        assertGt(currency1.balanceOf(address(this)), out1Before, "received token1");

        // Reserves moved: token0 in, token1 out.
        (uint256 r0, uint256 r1) = hook.reserves();
        assertGt(r0, 10 ether, "reserve0 grew");
        assertLt(r1, 10 ether, "reserve1 shrank");
    }

    function test_calm_keepsSymmetric() public {
        // A single block of activity: the detector samples once, has no prior baseline to form
        // a return from, so it cannot engage. κ stays at the symmetric minimum.
        _swap(poolKey, 1 ether, true);
        assertEq(hook.kappa(), 0, "no trend -> no asymmetry");
    }

    function test_sustainedTrend_engagesSpread() public {
        // Repeatedly sell token0 across successive blocks -> price falls -> a down-trend the
        // detector should pick up and lean against.
        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            _swap(poolKey, 1 ether, true);
        }

        assertGt(hook.kappa(), 0, "a sustained one-way move must engage the spread");
        assertEq(uint256(hook.trend()), uint256(Cusum.Trend.Down), "trend detected as Down");
        assertGt(hook.directionalEfficiency(), hook.dFloor(), "a one-way move reads as highly directional");
    }

    // ------------------------------------------------------------------
    // detector exposure (event + views + projection)
    // ------------------------------------------------------------------

    function test_detectorSample_emittedOncePerBlock_withState() public {
        // Block 1: baseline sample (no return yet, no event).
        vm.roll(block.number + 1);
        _swap(poolKey, 1 ether, true);

        // Block 2: the first swap processes a return -> the full trace event fires.
        vm.roll(block.number + 1);
        vm.expectEmit(false, false, false, false, address(hook));
        emit DetectorSample(0, 0, 0, 0, 0, 0, 0, 0, Cusum.Trend.None, 0);
        _swap(poolKey, 1 ether, true);

        // The event's content mirrors the exposed views (state actually advanced).
        (, int256 sNeg) = hook.cusumState();
        assertGt(sNeg, 0, "down-move accumulated down-evidence");
        assertGt(hook.sigmaWad(), 0, "sigma estimate is live");
        assertEq(hook.lastSampledBlock(), block.number, "sampled this block");

        // Second swap of the SAME block: no re-sample, so no second event.
        (int256 sPosBefore, int256 sNegBefore) = hook.cusumState();
        _swap(poolKey, 1 ether, true);
        (int256 sPosAfter, int256 sNegAfter) = hook.cusumState();
        assertEq(sPosAfter, sPosBefore, "same-block swap must not advance the detector");
        assertEq(sNegAfter, sNegBefore, "same-block swap must not advance the detector");
    }

    function test_previewSpread_matchesNextSwapExactly() public {
        // Engage a down-trend, then move to a FRESH block without swapping.
        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            _swap(poolKey, 1 ether, true);
        }
        vm.roll(block.number + 1);

        // The projection must equal what the first swap of this block actually applies.
        (uint256 spreadPreview,) = hook.previewSpread(true);
        _swap(poolKey, 1 ether, true);
        assertEq(hook.effectiveSpread(true), spreadPreview, "projection must match the realized sample");
    }

    // ------------------------------------------------------------------
    // vol-scaled base fee
    // ------------------------------------------------------------------

    function test_volFee_generatedFromSigma_andAccruesToReserves() public {
        // Same pair, fee lever on: fee = min(0.5 * sigma, 1%).
        PoincareConfig memory cfg = defaultConfig();
        cfg.feeGamma = 5e17;
        cfg.feeCap = 1e16;
        (PoincareHook feeHook, PoolKey memory feeKey) = _deploySeededPool(cfg, 0x5555, 10 ether, 10 ether);

        // Dead-calm pool: no sigma yet, so the ALGORITHMIC fee is zero (never a constant).
        assertEq(feeHook.currentFeeWad(), 0, "no realized vol -> no fee");

        // Trade across blocks to realize volatility -> the fee number appears from the data.
        vm.roll(block.number + 1);
        _swap(feeKey, 1 ether, true); // baseline sample (first price, no return yet)
        vm.roll(block.number + 1);
        _swap(feeKey, 1 ether, false); // return #1 realized
        vm.roll(block.number + 1);
        _swap(feeKey, 1 ether, true); // return #2 realized
        vm.roll(block.number + 1);
        uint256 fee = feeHook.currentFeeWad();
        // Two ~19% inter-block log-moves with lambda 0.9 put gamma*sigma far above the 1% cap.
        assertEq(fee, cfg.feeCap, "vol-scaled fee engaged and respects the hard cap");

        // The fee is charged in-pricing and stays in the reserves (accrues to LPs): the
        // realized output equals the shared pipeline's, and is strictly below the no-fee out.
        (uint256 r0, uint256 r1) = feeHook.reserves();
        (uint256 spread, uint256 feeNow) = feeHook.previewSpread(true);
        (uint256 wantOut,) = AsymmetricCurve.swapExactInPriced(r0, r1, 0, 0, 1 ether, true, spread, feeNow);
        uint256 noFeeOut = AsymmetricCurve.swapExactInWithSpread(r0, r1, 0, 0, 1 ether, true, spread);

        uint256 before = currency1.balanceOf(address(this));
        _swap(feeKey, 1 ether, true);
        uint256 got = currency1.balanceOf(address(this)) - before;

        assertEq(got, wantOut, "execution matches the shared pricing pipeline");
        assertLt(got, noFeeOut, "fee was actually charged");
        (uint256 r0After, uint256 r1After) = feeHook.reserves();
        assertGt(r0After * r1After, r0 * r1, "fee accrued to the pool (k grew strictly)");
    }

    // ------------------------------------------------------------------
    // deep base (supply-scaled symmetric offsets)
    // ------------------------------------------------------------------

    function test_deepBase_offsetsAnchored_andMidPreservedByLiquidity() public {
        PoincareConfig memory cfg = defaultConfig();
        cfg.alphaWad = 1e18; // offsets == seed reserves -> 2x virtual depth
        (PoincareHook deepHook,) = _deploySeededPool(cfg, 0x6666, 10 ether, 10 ether);

        (uint256 a, uint256 b) = deepHook.baseOffsets();
        assertEq(a, 10 ether, "a anchored to alpha * seed reserve0");
        assertEq(b, 10 ether, "b anchored to alpha * seed reserve1");

        // Ratio deposit scales reserves AND offsets homothetically -> executable mid unchanged.
        (uint256 r0, uint256 r1) = deepHook.reserves();
        uint256 midBefore = AsymmetricCurve.marginalPriceWad(r0, r1, a, b);
        _addLiquidity(deepHook, 5 ether, 5 ether);
        (r0, r1) = deepHook.reserves();
        (a, b) = deepHook.baseOffsets();
        assertEq(a, 15 ether, "offsets scaled with the share supply");
        assertEq(AsymmetricCurve.marginalPriceWad(r0, r1, a, b), midBefore, "mid preserved exactly");
    }

    function test_deepBase_lowerImpact_butOutputCappedByRealReserves() public {
        PoincareConfig memory cfg = defaultConfig();
        cfg.alphaWad = 1e18;
        (, PoolKey memory deepKey) = _deploySeededPool(cfg, 0x7777, 10 ether, 10 ether);

        // Same trade, deep base vs the plain pool: deeper -> more output (less impact).
        uint256 before = currency1.balanceOf(address(this));
        _swap(deepKey, 1 ether, true);
        uint256 deepOut = currency1.balanceOf(address(this)) - before;

        before = currency1.balanceOf(address(this));
        _swap(poolKey, 1 ether, true);
        uint256 plainOut = currency1.balanceOf(address(this)) - before;
        assertGt(deepOut, plainOut, "deep base quotes lower price impact");

        // FEASIBILITY (A7 extended): the virtual reserve is 20 but the pool only holds ~9.5;
        // asking for more token1 than the REAL reserve must be rejected, not mispriced.
        vm.expectRevert();
        swapRouter.swapTokensForExactTokens(
            9.6 ether, type(uint256).max, true, deepKey, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
    }

    function test_deepBase_roundTrip_neverProfits() public {
        PoincareConfig memory cfg = defaultConfig();
        cfg.alphaWad = 1e18;
        (, PoolKey memory deepKey) = _deploySeededPool(cfg, 0x8888, 10 ether, 10 ether);

        uint256 t0Before = currency0.balanceOf(address(this));
        uint256 t1Before = currency1.balanceOf(address(this));

        // Buy-then-sell-back across blocks (offsets are supply-anchored, so there is no
        // re-anchoring seam to harvest: the drainable construction this replaces).
        _swap(deepKey, 3 ether, true);
        vm.roll(block.number + 1);
        uint256 t1Got = currency1.balanceOf(address(this)) - t1Before;
        _swap(deepKey, t1Got, false);

        assertLe(currency0.balanceOf(address(this)), t0Before, "round trip cannot create token0");
        assertLe(currency1.balanceOf(address(this)), t1Before, "round trip cannot create token1");
    }

    // ------------------------------------------------------------------
    // v2 adaptive (σ-standardized) detector
    // ------------------------------------------------------------------

    function test_adaptive_trendEngages_thresholdsInSigmaUnits() public {
        (PoincareHook aHook, PoolKey memory aKey) = _deploySeededPool(adaptiveConfig(), 0x9999, 10 ether, 10 ether);

        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            _swap(aKey, 1 ether, true);
        }

        assertGt(aHook.kappa(), 0, "adaptive detector engages on a sustained move");
        assertEq(uint256(aHook.trend()), uint256(Cusum.Trend.Down), "trend detected as Down");
        // Evidence is capped in sigma-units, so it must respect the sigma-space cap.
        (, int256 sNeg) = aHook.cusumState();
        assertLe(sNeg, aHook.sMax(), "sigma-space evidence respects the cap");
        assertGt(aHook.sigmaWad(), 0, "sigma tracks the realized moves");
    }

    function test_adaptive_calmChop_staysSymmetric() public {
        (PoincareHook aHook, PoolKey memory aKey) = _deploySeededPool(adaptiveConfig(), 0xaaaa, 100 ether, 100 ether);

        // Alternating small trades: realized vol exists but there is no direction. The
        // standardized evidence nets out and D stays below the gate.
        for (uint256 i = 0; i < 12; i++) {
            vm.roll(block.number + 1);
            _swap(aKey, 0.5 ether, i % 2 == 0);
        }
        assertEq(aHook.kappa(), 0, "chop must not engage the adaptive detector");
    }
}
