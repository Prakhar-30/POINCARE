// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook} from "../src/PoincareHook.sol";
import {PoincareLens} from "../src/PoincareLens.sol";
import {PoincareTestBase} from "./utils/PoincareTestBase.sol";

/// @title PoincareNativeEthTest — the hook on a native-ETH pair (OPEN_ITEMS F "not yet covered")
/// @notice currency0 = native ETH (address(0)), currency1 = an ERC20. Exercises the full
///         lifecycle: seeding hook-owned liquidity with msg.value (the BaseCustomAccounting
///         native path, including the excess refund), swaps in both directions through the
///         router (native input via value, native output via PoolManager take), detector
///         sampling on the native pair, Lens quote parity, and liquidity removal paying
///         native ETH back out.
contract PoincareNativeEthTest is PoincareTestBase {
    using CurrencyLibrary for Currency;

    Currency constant NATIVE = CurrencyLibrary.ADDRESS_ZERO;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;
    PoincareLens lens;

    uint256 constant DEADLINE = type(uint256).max;
    int24 constant MIN_TICK = -887220;
    int24 constant MAX_TICK = 887220;

    /// @dev removeLiquidity / swap output pay native ETH back to this contract.
    receive() external payable {}

    function setUp() public {
        deployArtifactsAndLabel();
        MockERC20 token = deployToken();
        currency1 = Currency.wrap(address(token));

        hook = deployPoincare(defaultConfig(), 0x4444);
        lens = new PoincareLens(hook);
        poolKey = initPoincarePool(hook, NATIVE, currency1);

        token.approve(address(hook), type(uint256).max);
        vm.deal(address(this), 1_000 ether);

        // Seed 10 ETH : 10 TOKEN. Send excess value to also exercise the refund branch.
        uint256 balBefore = address(this).balance;
        hook.addLiquidity{value: 12 ether}(
            BaseCustomAccounting.AddLiquidityParams(10 ether, 10 ether, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );
        assertEq(balBefore - address(this).balance, 10 ether, "excess msg.value refunded");
    }

    function test_liquidity_seedsNativeReserves() public view {
        (uint256 r0, uint256 r1) = hook.reserves();
        assertEq(r0, 10 ether, "native reserve seeded (ERC-6909 claim on address(0))");
        assertEq(r1, 10 ether, "token reserve seeded");
    }

    function test_swap_nativeIn_andNativeOut() public {
        // ETH in -> token out (zeroForOne; native input travels as msg.value).
        uint256 tokenBefore = currency1.balanceOf(address(this));
        swapRouter.swapExactTokensForTokens{value: 1 ether}(
            1 ether, 0, true, poolKey, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        uint256 tokenGot = currency1.balanceOf(address(this)) - tokenBefore;
        assertGt(tokenGot, 0, "received tokens for native ETH");

        // token in -> ETH out (oneForZero; native output arrives as a transfer).
        uint256 ethBefore = address(this).balance;
        swapRouter.swapExactTokensForTokens(
            tokenGot, 0, false, poolKey, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        assertGt(address(this).balance, ethBefore, "received native ETH for tokens");
    }

    function test_detector_samplesNativePair_andLensMatches() public {
        // Sustained one-way selling of ETH -> down-trend on the native pair.
        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            swapRouter.swapExactTokensForTokens{value: 1 ether}(
                1 ether, 0, true, poolKey, Constants.ZERO_BYTES, address(this), block.timestamp + 1
            );
        }
        assertGt(hook.kappa(), 0, "detector engages on the native pair");

        // Lens quote parity holds on the native pair too (fresh block, projected spread).
        vm.roll(block.number + 1);
        uint256 quote = lens.quoteExactInput(true, 1 ether);
        uint256 tokenBefore = currency1.balanceOf(address(this));
        swapRouter.swapExactTokensForTokens{value: 1 ether}(
            1 ether, 0, true, poolKey, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        assertEq(currency1.balanceOf(address(this)) - tokenBefore, quote, "Lens quote matches native execution");
    }

    function test_removeLiquidity_paysNativeBack() public {
        uint256 shares = hook.balanceOf(address(this));
        uint256 ethBefore = address(this).balance;
        hook.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(shares / 2, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );
        assertApproxEqAbs(address(this).balance - ethBefore, 5 ether, 1e6, "half the native reserve returned");
    }
}
