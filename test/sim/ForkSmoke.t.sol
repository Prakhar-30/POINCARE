// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";

import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";
import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook} from "../../src/PoincareHook.sol";
import {MintableERC20} from "./MintableERC20.sol";

/// @title ForkSmokeTest — validate the Sepolia fork wiring before the full simulation.
contract ForkSmokeTest is Test {
    uint256 constant SEPOLIA = 11155111;

    IPoolManager pm;
    IUniswapV4Router04 router;
    PoincareHook hook;
    PoolKey key;
    Currency c0;
    Currency c1;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("sepolia"));
        assertEq(block.chainid, SEPOLIA, "forked Sepolia");

        pm = IPoolManager(AddressConstants.getPoolManagerAddress(SEPOLIA));
        router = IUniswapV4Router04(payable(AddressConstants.getV4SwapRouterAddress(SEPOLIA)));
        assertGt(address(pm).code.length, 0, "PoolManager deployed on fork");
        assertGt(address(router).code.length, 0, "router deployed on fork");

        MintableERC20 a = new MintableERC20("WETH", "WETH");
        MintableERC20 b = new MintableERC20("USDC", "USDC");
        (c0, c1) = address(a) < address(b)
            ? (Currency.wrap(address(a)), Currency.wrap(address(b)))
            : (Currency.wrap(address(b)), Currency.wrap(address(a)));
        MintableERC20(Currency.unwrap(c0)).mint(address(this), 1e30);
        MintableERC20(Currency.unwrap(c1)).mint(address(this), 1e30);

        address flags = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                    | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
            ) ^ (0x4444 << 144)
        );
        bytes memory args = abi.encode(pm, int256(1e15), int256(5e15), int256(2e16), uint256(0), uint256(1e17), uint256(5e16), uint256(9e17), uint256(5e17));
        deployCodeTo("PoincareHook.sol:PoincareHook", args, flags);
        hook = PoincareHook(payable(flags));

        key = PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        pm.initialize(key, Constants.SQRT_PRICE_1_1);

        IERC20Minimal(Currency.unwrap(c0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c0)).approve(address(router), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(router), type(uint256).max);

        // Seed at price 3000 (token1 per token0): 1000 token0 : 3,000,000 token1.
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(1000e18, 3_000_000e18, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
    }

    function test_smoke_swapAndWriteCsv() public {
        (uint256 r0, uint256 r1) = hook.reserves();
        assertEq(r0, 1000e18, "seeded reserve0");
        assertEq(r1, 3_000_000e18, "seeded reserve1");

        uint256 outBefore = c1.balanceOf(address(this));
        router.swapExactTokensForTokens(1e18, 0, true, key, Constants.ZERO_BYTES, address(this), block.timestamp + 1);
        uint256 received = c1.balanceOf(address(this)) - outBefore;
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
