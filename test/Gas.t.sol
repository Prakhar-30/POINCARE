// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/Test.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook} from "../src/PoincareHook.sol";
import {PoincareTestBase} from "./utils/PoincareTestBase.sol";

/// @title GasTest: profile the swap path / detector cost
/// @notice Measures end-to-end swap gas (router + PoolManager + hook) and isolates the per-block
///         detector-update cost by differencing the first swap of a block (which samples + runs
///         the two CUSUM updates, the EWMA, the control law, and now emits the DetectorSample
///         trace) against a later same-block swap (which skips sampling). The detector state is
///         packed to 4 slots, which pays for the event several times over.
contract GasTest is PoincareTestBase {
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        hook = deployPoincare(defaultConfig(), 0x4444);
        poolKey = initPoincarePool(hook, currency0, currency1);

        IERC20Minimal(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(
                100 ether, 100 ether, 0, 0, type(uint256).max, -887220, 887220, bytes32(0)
            )
        );

        // Warm up the detector to STEADY STATE: a few sampled blocks so every detector storage
        // slot is already non-zero. Otherwise the first writes are cold (zero->non-zero, 20k
        // each) and overstate the recurring per-block cost.
        for (uint256 i = 0; i < 6; i++) {
            vm.roll(block.number + 1);
            _swap(0.1 ether);
        }
    }

    function _swap(uint256 amountIn) internal returns (uint256 gasUsed) {
        uint256 g = gasleft();
        swapRouter.swapExactTokensForTokens(
            amountIn, 0, true, poolKey, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        gasUsed = g - gasleft();
    }

    function test_gas_swapPath() public {
        // First swap of a NEW block: full detector update (sample + 2x CUSUM + EWMA + control law).
        vm.roll(block.number + 1);
        uint256 gasFirst = _swap(1 ether);

        // Second swap, SAME block: detector sampling is skipped (once-per-block).
        uint256 gasSecond = _swap(1 ether);

        console2.log("swap gas, first-of-block (with detector update)", gasFirst);
        console2.log("swap gas, same-block (detector skipped)", gasSecond);
        if (gasFirst > gasSecond) {
            console2.log("=> per-block detector update overhead (gas)", gasFirst - gasSecond);
        }

        // Generous budgets: the whole router+manager+hook swap, not just beforeSwap. The point is
        // to track the figures; the detector itself is O(1) and cheap.
        assertLt(gasFirst, 400_000, "first-of-block swap within budget");
        assertLt(gasSecond, 400_000, "same-block swap within budget");
    }
}
