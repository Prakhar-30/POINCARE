// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";
import {BaseTest} from "./BaseTest.sol";

/// @title PoincareTestBase - shared config + deployment plumbing for every hook-level test.
/// @notice One place for the illustrative test configuration and the mine-flags/deployCodeTo
///         boilerplate, so a config-shape change touches exactly one file.
abstract contract PoincareTestBase is BaseTest {
    /// @dev The illustrative (uncalibrated) config the suite has always used: engages quickly
    ///      so a real move is visible in a short test. Fee, adaptivity and depth are OFF so the
    ///      baseline behavior stays byte-identical to the proven MVP; tests opt in per feature.
    ///      `clipWad = 1e18` (a 100% log-return per block) is far above anything the test flows
    ///      produce, so the always-on Huber clip is inert at the baseline.
    function defaultConfig() internal pure returns (PoincareConfig memory c) {
        c.k = 1e15; //        slack 0.001
        c.h = 5e15; //        threshold 0.005
        c.sMax = 2e16; //     evidence cap 0.02
        c.lambda = 9e17; //   EWMA decay 0.9
        c.dFloor = 5e17; //   D gate 0.5
        c.adaptive = false;
        c.sigmaFloor = 0;
        c.clipWad = 1e18;
        c.kappaMin = 0;
        c.kappaMax = 1e17; // 0.1 max directional spread
        c.dMax = 5e16; //     fast ramp for tests
        c.feeGamma = 0; //    vol fee off at the baseline
        c.feeCap = 0;
        c.alphaWad = 0; //    pure x*y=k base at the baseline
    }

    /// @dev Adaptive (v2) variant: same gate/κ params, thresholds in σ-units (WAD == 1σ).
    function adaptiveConfig() internal pure returns (PoincareConfig memory c) {
        c = defaultConfig();
        c.adaptive = true;
        c.k = 5e17; //        0.5σ slack
        c.h = 3e18; //        3σ of accumulated evidence
        c.sMax = 12e18; //    saturation at 12σ
        c.sigmaFloor = 1e15; // 0.001 min σ̂ for standardization
        c.clipWad = 4e18; //  Huber clip at 4σ per block
    }

    /// @dev Deploy the hook at a mined-flags address. `ns` namespaces the address so several
    ///      hooks can coexist in one test run.
    function deployPoincare(PoincareConfig memory cfg, uint16 ns) internal returns (PoincareHook hook) {
        address flags = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                    | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
            ) ^ (uint160(ns) << 144)
        );
        deployCodeTo("PoincareHook.sol:PoincareHook", abi.encode(poolManager, cfg), flags);
        hook = PoincareHook(payable(flags));
    }

    /// @dev Initialise a v4 pool on `hook` for the given currency pair (dynamic-fee key).
    function initPoincarePool(PoincareHook hook, Currency currency0, Currency currency1)
        internal
        returns (PoolKey memory key)
    {
        key = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(address(hook)));
        poolManager.initialize(key, Constants.SQRT_PRICE_1_1);
    }
}
