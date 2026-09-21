// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
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

import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";
import {MintableERC20} from "./MintableERC20.sol";

/// @title ForkBase: a Poincaré pool on a Sepolia fork, wired to the canonical router.
///
/// @notice The scaffolding every fork test needs and none of them should own a copy of: select
///         the fork, resolve the real `PoolManager` and `IUniswapV4Router04`, mine a hook
///         address with the right permission flags, deploy, initialise the pool, approve, and
///         seed liquidity.
///
///         Subclasses supply the configuration and the question. `_config()` and `_salt()` are
///         virtual so two tests on the same fork get distinct hook addresses - mining the same
///         salt twice lands on the same address and the second `deployCodeTo` silently reuses
///         the first pool, which is the kind of thing that reads as a mysterious state bug.
abstract contract ForkBase is Test {
    uint256 internal constant SEPOLIA = 11155111;

    IPoolManager internal pm;
    IUniswapV4Router04 internal router;
    PoincareHook internal hook;
    PoolKey internal key;
    Currency internal c0;
    Currency internal c1;

    /// @dev Seeded at price 3000 (token1 per token0).
    uint256 internal constant SEED0 = 1000e18;
    uint256 internal constant SEED1 = 3_000_000e18;

    /// @dev The detector configuration under test. Overridable; the default is a pool that
    ///      engages readily enough for a short test to exercise the trend path.
    function _config() internal view virtual returns (PoincareConfig memory cfg) {
        cfg.k = 1e15;
        cfg.h = 5e15;
        cfg.sMax = 2e16;
        cfg.lambda = 9e17;
        cfg.dFloor = 5e17;
        cfg.clipWad = 1e18;
        cfg.kappaMax = 1e17;
        cfg.dMax = 5e16;
    }

    /// @dev Distinct per test contract, so two tests do not mine the same hook address.
    function _salt() internal pure virtual returns (uint160) {
        return 0x4444;
    }

    function setUp() public virtual {
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
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
                    | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG
                    | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
            ) ^ (_salt() << 144)
        );
        deployCodeTo("PoincareHook.sol:PoincareHook", abi.encode(pm, _config()), flags);
        hook = PoincareHook(payable(flags));

        key = PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        pm.initialize(key, Constants.SQRT_PRICE_1_1);

        IERC20Minimal(Currency.unwrap(c0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c0)).approve(address(router), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(router), type(uint256).max);

        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(
                SEED0, SEED1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0)
            )
        );
    }

    /// @dev One swap through the CANONICAL router, returning what the caller actually received.
    ///      This is the execution path a real integrator takes, as opposed to `PoolSwapTest`.
    function _routerSwap(bool zeroForOne, uint256 amountIn) internal returns (uint256 received) {
        Currency outC = zeroForOne ? c1 : c0;
        uint256 before = outC.balanceOf(address(this));
        router.swapExactTokensForTokens(
            amountIn, 0, zeroForOne, key, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        return outC.balanceOf(address(this)) - before;
    }

    /// @dev Push the price one way for `n` blocks so the detector accumulates real evidence.
    ///      One swap per block, because the detector samples at most once per block by design.
    function _driveTrend(bool zeroForOne, uint256 n, uint256 size) internal {
        for (uint256 i = 0; i < n; i++) {
            vm.roll(block.number + 1);
            _routerSwap(zeroForOne, size);
        }
    }
}
