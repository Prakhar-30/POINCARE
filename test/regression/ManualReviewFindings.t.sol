// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";
import {ControlLaw} from "../../src/libraries/ControlLaw.sol";
import {AsymmetricCurve} from "../../src/libraries/AsymmetricCurve.sol";
import {PriceLib} from "../../src/libraries/PriceLib.sol";
import {PoincareTestBase} from "../utils/PoincareTestBase.sol";

/// @title ManualReviewFindingsTest: regression tests for the 2026-10 manual security review
/// @notice One test group per finding remediated in code (POINCARE-MSR-78d75e24), named after
///         the report's IDs. Each fails on the reviewed commit and passes now.
contract ManualReviewFindingsTest is PoincareTestBase {
    using PoolIdLibrary for PoolKey;

    Currency currency0;
    Currency currency1;
    PoincareHook hook;

    uint256 constant WAD = 1e18;

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();
        hook = deployPoincare(defaultConfig(), 0x4444, currency0, currency1);
    }

    /// @dev The PoolManager wraps a hook's revert; this is the exact payload it bubbles up.
    function _wrappedInitRevert(string memory reason) internal view returns (bytes memory) {
        return abi.encodeWithSelector(
            CustomRevert.WrappedError.selector,
            address(hook),
            IHooks.beforeInitialize.selector,
            abi.encodeWithSignature("Error(string)", reason),
            abi.encodeWithSelector(Hooks.HookCallFailed.selector)
        );
    }

    // L-1: the first PoolKey to reach the hook no longer binds it; only the pinned one can.

    function test_L1_unexpectedPoolKey_cannotBindHook() public {
        PoolKey memory pinned = poincareKey(currency0, currency1, address(hook));
        assertEq(PoolId.unwrap(hook.expectedPoolId()), PoolId.unwrap(pinned.toId()), "pinned at construction");

        // Every field an outsider could vary: tick spacing, fee, and the currency pair.
        PoolKey memory wrongSpacing = poincareKey(currency0, currency1, address(hook));
        wrongSpacing.tickSpacing = 1;
        PoolKey memory wrongFee = poincareKey(currency0, currency1, address(hook));
        wrongFee.fee = 3000;
        (Currency other0, Currency other1) = deployCurrencyPair();
        PoolKey memory wrongPair = poincareKey(other0, other1, address(hook));

        PoolKey[3] memory attempts = [wrongSpacing, wrongFee, wrongPair];
        for (uint256 i = 0; i < attempts.length; i++) {
            vm.expectRevert(_wrappedInitRevert("unexpected pool key"));
            poolManager.initialize(attempts[i], Constants.SQRT_PRICE_1_1);
        }

        // The rejected attempts left the hook unbound, so the intended pool still initializes.
        initPoincarePool(hook, currency0, currency1);
        assertEq(PoolId.unwrap(hook.poolKey().toId()), PoolId.unwrap(pinned.toId()), "bound to the pinned pool");
    }

    function test_L1_constructorRejectsMalformedKey() public {
        // Unsorted currencies can never be initialized, so the hook would be dead on arrival.
        vm.expectRevert(bytes("pool key cfg"));
        deployPoincare(defaultConfig(), 0x5555, currency1, currency0);

        // A key naming some other hook can never reach this one.
        PoolKey memory foreign = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(address(1)));
        vm.expectRevert(bytes("pool key cfg"));
        deployCodeTo(
            "PoincareHook.sol:PoincareHook",
            abi.encode(poolManager, defaultConfig(), foreign),
            poincareHookAddress(0x6666)
        );
    }

    // L-2: the detector's mid no longer quantizes on small raw-unit price ratios.

    /// @dev A fresh hook on its own pool, seeded at `x0 : y0` raw units.
    function _seededPool(PoincareConfig memory cfg, uint16 ns, uint256 x0, uint256 y0)
        internal
        returns (PoincareHook h, PoolKey memory key)
    {
        h = deployPoincare(cfg, ns, currency0, currency1);
        key = initPoincarePool(h, currency0, currency1);
        MockERC20(Currency.unwrap(currency0)).mint(address(this), x0 * 2);
        MockERC20(Currency.unwrap(currency1)).mint(address(this), y0 * 2);
        MockERC20(Currency.unwrap(currency0)).approve(address(h), type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(address(h), type(uint256).max);
        h.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(x0, y0, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
    }

    function _swap(PoolKey memory key, uint256 amountIn, bool zeroForOne) internal {
        swapRouter.swapExactTokensForTokens(
            amountIn, 0, zeroForOne, key, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
    }

    /// @dev ln of the true price ratio (r1a/r0a)/(r1b/r0b), computed from reserves alone.
    function _trueLogReturn(uint256 r0b, uint256 r1b, uint256 r0a, uint256 r1a) internal pure returns (int256) {
        uint256 ratioWad = FullMath.mulDiv(FullMath.mulDiv(r1a, r0b, r1b), WAD, r0a);
        return FixedPointMathLib.lnWad(int256(ratioWad));
    }

    function test_L2_detectorReturnMatchesTrueMove_atSmallRawRatios() public {
        // An 18-decimals token0 against token1 whose raw-unit ratio puts the WAD mid at 1, 10
        // and 1,000 (e.g. a sub-cent token against a 6-decimals stable), plus a well-resolved
        // mid of 3,000e18 as the control.
        uint256 x0 = 1e30;
        uint256[4] memory wadMids = [uint256(1), 10, 1_000, 3_000e18];
        for (uint256 i = 0; i < wadMids.length; i++) {
            uint256 y0 = x0 * wadMids[i] / WAD;
            (PoincareHook h, PoolKey memory key) = _seededPool(defaultConfig(), uint16(0x7000 + i), x0, y0);
            assertEq(AsymmetricCurve.marginalPriceWad(x0, y0, 0, 0), wadMids[i], "seeded at the intended WAD mid");

            // The first swap samples the seed as the baseline, then moves price about -1%.
            _swap(key, x0 / 200, true);
            assertEq(h.lastSampledPriceWad(), wadMids[i], "reported price stays the WAD mid");
            (uint256 r0a, uint256 r1a) = h.reserves();
            vm.roll(block.number + 1);

            PoincareHook.DetectorSnap memory snap = h.previewDetector();
            assertTrue(snap.hasReturn, "next block samples a return");
            int256 truth = _trueLogReturn(x0, y0, r0a, r1a);
            assertLt(truth, -9e15, "a real ~1% down move");
            assertApproxEqAbs(snap.r, truth, 1e6, "detector reads the true log-return");
        }
    }

    function test_L2_wadMidWouldHaveAliasedTheSameMove() public pure {
        // The same ~1% move as above, read the pre-fix way: through WAD mids.
        uint256 x0 = 1e30;
        uint256 x1 = x0 + x0 / 200;
        // WAD mid 10: one unit is ~10%, so a 1% move reads as -10.5%.
        uint256 y0 = 1e13;
        uint256 y1 = FullMath.mulDivRoundingUp(x0, y0, x1);
        int256 wadRead = PriceLib.logReturnWad(
            AsymmetricCurve.marginalPriceWad(x0, y0, 0, 0), AsymmetricCurve.marginalPriceWad(x1, y1, 0, 0)
        );
        assertLt(wadRead, -1e17, "WAD mid aliases ~1% into more than 10%");
        int256 midRead = PriceLib.logReturnWad(
            AsymmetricCurve.marginalPrice(x0, y0, 0, 0), AsymmetricCurve.marginalPrice(x1, y1, 0, 0)
        );
        assertApproxEqAbs(midRead, -int256(1e16), 1e14, "MID_SCALE reads ~1%");
        // WAD mid 1: the move floors the mid to 0, so the old detector skipped it entirely.
        y0 = 1e12;
        y1 = FullMath.mulDivRoundingUp(x0, y0, x1);
        assertEq(AsymmetricCurve.marginalPriceWad(x1, y1, 0, 0), 0, "WAD mid floors to zero");
        assertGt(AsymmetricCurve.marginalPrice(x1, y1, 0, 0), 0, "MID_SCALE still resolves it");
    }

    /// @dev The hook reports `mid / (MID_SCALE / WAD)` wherever it used to report the WAD mid
    ///      (`lastSampledPriceWad`, `DetectorSample.priceWad`), so those must agree exactly.
    function testFuzz_L2_reportedPriceIsUnchanged(uint128 x, uint128 y, uint128 a, uint128 b) public pure {
        vm.assume(uint256(x) + a > 0);
        assertEq(
            AsymmetricCurve.marginalPrice(x, y, a, b) / (AsymmetricCurve.MID_SCALE / WAD),
            AsymmetricCurve.marginalPriceWad(x, y, a, b)
        );
    }

    function test_L2_zeroMid_skipsThenRecovers() public {
        // A ratio extreme enough that even the MID_SCALE mid floors to 0: (1 * 1e36) / 1e38.
        (PoincareHook h, PoolKey memory key) = _seededPool(defaultConfig(), 0x7100, 1e38, 1);
        assertEq(AsymmetricCurve.marginalPrice(1e38, 1, 0, 0), 0, "mid floors to zero");

        // The swap still prices; the sample is skipped rather than recorded as a 0 baseline.
        // It also brings the pool back to an ordinary ratio (~1e20 : 1e18).
        _swap(key, 1e20, false);
        assertEq(h.lastSampledBlock(), 0, "zero mid was not sampled");

        // Once the mid is representable again, the next block samples it as a baseline (on
        // the pre-swap reserves)...
        vm.roll(block.number + 1);
        (uint256 x0, uint256 y0) = h.reserves();
        assertGt(AsymmetricCurve.marginalPrice(x0, y0, 0, 0), 0, "mid representable again");
        _swap(key, 1e18, false);
        assertEq(h.lastSampledBlock(), block.number, "detector resumed sampling");

        // ...and the block after that reads a real return off it.
        (uint256 r0, uint256 r1) = h.reserves();
        assertTrue(r0 != x0 && r1 != y0, "price moved since the baseline");
        vm.roll(block.number + 1);
        PoincareHook.DetectorSnap memory snap = h.previewDetector();
        assertTrue(snap.hasReturn, "returns flow again");
        assertApproxEqAbs(snap.r, _trueLogReturn(x0, y0, r0, r1), 1e6, "and they are the true move");
    }

    // N-5: no accepted configuration can make the control law revert, and a gate that could
    // never open is rejected at construction.

    function testFuzz_N5_rateLimitNeverOverflows(uint256 prev, uint256 target, uint256 dMax) public pure {
        uint256 k = ControlLaw.rateLimit(prev, target, dMax);
        uint256 gap = target > prev ? target - prev : prev - target;
        // Moves toward the target, never past it, by at most dMax.
        assertEq(k, gap > dMax ? (target > prev ? prev + dMax : prev - dMax) : target);
    }

    function test_N5_unboundedDMax_stillSwaps() public {
        PoincareConfig memory cfg = defaultConfig();
        cfg.dMax = type(uint256).max; // accepted by the constructor; overflowed `prev + dMax` before
        (PoincareHook h, PoolKey memory key) = _seededPool(cfg, 0x7200, 10 ether, 10 ether);

        // A gentle one-way move (~1% a block) builds evidence over several blocks, so kappa's
        // target rises above an already-positive kappa: the case that formed `prev + dMax`.
        bool climbedThroughMiddle;
        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            _swap(key, 0.05 ether, true);
            uint256 k = h.kappa();
            if (k > 0 && k < cfg.kappaMax) climbedThroughMiddle = true;
        }
        assertTrue(climbedThroughMiddle, "kappa passed through an intermediate value");
        assertEq(h.kappa(), cfg.kappaMax, "and, with no rate limit, reached its target: the cap");
    }

    function test_N5_constructorRejectsUnreachableGate() public {
        PoincareConfig memory cfg = defaultConfig();
        cfg.dFloor = WAD + 1;
        vm.expectRevert(bytes("gate cfg"));
        deployPoincare(cfg, 0x7300, currency0, currency1);

        cfg.dFloor = WAD; // a perfectly one-way path reaches D == WAD, so this stays legal
        deployPoincare(cfg, 0x7301, currency0, currency1);
    }
}
