// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook} from "../src/PoincareHook.sol";
import {Cusum} from "../src/libraries/Cusum.sol";
import {BaseTest} from "./utils/BaseTest.sol";

/// @title PoincareHookTest — end-to-end integration of the assembled hook (CLAUDE.md §7.5)
/// @notice Deploys the hook on a real PoolManager (via the hookmate harness), seeds hook-owned
///         liquidity, and exercises swaps. Validates: liquidity in/out, swaps route through the
///         custom curve, the detector stays calm with no trend, and engages the directional
///         spread on a sustained one-way move (per-block sampled).
contract PoincareHookTest is BaseTest {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;

    uint256 constant DEADLINE = type(uint256).max;
    int24 constant MIN_TICK = -887220;
    int24 constant MAX_TICK = 887220;

    // Illustrative (uncalibrated) detector config — chosen so a real move engages quickly.
    int256 constant K = 1e15; //         slack 0.001
    int256 constant H = 5e15; //         threshold
    int256 constant S_MAX = 2e16; //     evidence cap
    uint256 constant KAPPA_MIN = 0;
    uint256 constant KAPPA_MAX = 1e17; // 0.1 max spread
    uint256 constant D_MAX = 5e16; //    fast ramp for the test
    uint256 constant LAMBDA = 9e17;
    uint256 constant D_FLOOR = 5e17; //  D must exceed 0.5

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        // Mine the hook flags (BaseCustomCurve permissions), namespaced to avoid collisions.
        address flags = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                    | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
            ) ^ (0x4444 << 144)
        );
        bytes memory args =
            abi.encode(poolManager, K, H, S_MAX, KAPPA_MIN, KAPPA_MAX, D_MAX, LAMBDA, D_FLOOR);
        deployCodeTo("PoincareHook.sol:PoincareHook", args, flags);
        hook = PoincareHook(payable(flags));

        poolKey = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        // Approve the hook to pull tokens for hook-owned liquidity.
        IERC20Minimal(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);

        _addLiquidity(10 ether, 10 ether);
    }

    function _addLiquidity(uint256 a0, uint256 a1) internal {
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(a0, a1, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );
    }

    function _swap(uint256 amountIn, bool zeroForOne) internal returns (BalanceDelta) {
        return swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

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
        _swap(1 ether, true); // sell token0 for token1
        assertGt(currency1.balanceOf(address(this)), out1Before, "received token1");

        // Reserves moved: token0 in, token1 out.
        (uint256 r0, uint256 r1) = hook.reserves();
        assertGt(r0, 10 ether, "reserve0 grew");
        assertLt(r1, 10 ether, "reserve1 shrank");
    }

    function test_calm_keepsSymmetric() public {
        // A single block of activity: the detector samples once, has no prior baseline to form
        // a return from, so it cannot engage. κ stays at the symmetric minimum.
        _swap(1 ether, true);
        assertEq(hook.kappa(), 0, "no trend -> no asymmetry");
    }

    function test_sustainedTrend_engagesSpread() public {
        // Repeatedly sell token0 across successive blocks -> price falls -> a down-trend the
        // detector should pick up and lean against.
        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            _swap(1 ether, true);
        }

        assertGt(hook.kappa(), 0, "a sustained one-way move must engage the spread");
        assertEq(uint256(hook.trend()), uint256(Cusum.Trend.Down), "trend detected as Down");
        assertGt(hook.directionalEfficiency(), D_FLOOR, "a one-way move reads as highly directional");
    }
}
