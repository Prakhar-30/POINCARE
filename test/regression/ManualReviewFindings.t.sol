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

import {PoincareHook} from "../../src/PoincareHook.sol";
import {PoincareTestBase} from "../utils/PoincareTestBase.sol";

/// @title ManualReviewFindingsTest: regression tests for the 2026-10 manual security review
/// @notice One test group per finding remediated in code (POINCARE-MSR-78d75e24), named after
///         the report's IDs. Each fails on the reviewed commit and passes now.
contract ManualReviewFindingsTest is PoincareTestBase {
    using PoolIdLibrary for PoolKey;

    Currency currency0;
    Currency currency1;
    PoincareHook hook;

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
}
