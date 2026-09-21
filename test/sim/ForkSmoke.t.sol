// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";

import {ForkBase} from "./ForkBase.sol";

/// @title ForkSmokeTest - validate the Sepolia fork wiring before the full simulation.
///
/// @notice Everything this needs - the fork, the real PoolManager and router, a mined hook
///         address, an initialised pool and seeded liquidity - is `ForkBase`. This file is
///         only the assertion that the wiring works, which is all a smoke test should be.
contract ForkSmokeTest is ForkBase {
    function test_smoke_swapAndWriteCsv() public {
        (uint256 r0, uint256 r1) = hook.reserves();
        assertEq(r0, SEED0, "seeded reserve0");
        assertEq(r1, SEED1, "seeded reserve1");

        uint256 received = _routerSwap(true, 1e18);
        assertGt(received, 0, "got token1 out");
        console2.log("1 token0 -> token1 out:", received);

        string memory path = "analysis/simulation/smoke.csv";
        vm.writeFile(path, "metric,value\n");
        vm.writeLine(path, string.concat("reserve0,", vm.toString(r0)));
        vm.writeLine(path, string.concat("reserve1,", vm.toString(r1)));
        vm.writeLine(path, string.concat("out_for_1_token0,", vm.toString(received)));
        console2.log("wrote", path);
    }
}
