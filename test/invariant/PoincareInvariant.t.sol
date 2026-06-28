// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook} from "../../src/PoincareHook.sol";
import {BaseTest} from "../utils/BaseTest.sol";

/// @title PoincareHandler — randomized actor for the invariant run.
/// @notice Performs bounded random swaps (exact-in/out, both directions), liquidity adds/removes,
///         and block rolls against the live hook. It keeps a ghost copy of the reserves updated
///         purely from its OWN measured token-balance deltas (`expR -= handlerDelta`): since the
///         handler is the only mutator during the run, the hook's reserves must always equal this
///         independent accounting — that is the solvency / no-leak invariant. It also asserts the
///         constant-product invariant never decreases on a swap (no value extraction by traders).
contract PoincareHandler is Test {
    using CurrencyLibrary for Currency;

    IUniswapV4Router04 internal router;
    PoincareHook internal hook;
    PoolKey internal key;
    Currency internal c0;
    Currency internal c1;

    uint256 public expR0;
    uint256 public expR1;

    constructor(
        IUniswapV4Router04 _router,
        PoincareHook _hook,
        PoolKey memory _key,
        Currency _c0,
        Currency _c1,
        uint256 r0,
        uint256 r1
    ) {
        router = _router;
        hook = _hook;
        key = _key;
        c0 = _c0;
        c1 = _c1;
        expR0 = r0;
        expR1 = r1;

        IERC20Minimal(Currency.unwrap(c0)).approve(address(router), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(router), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(hook), type(uint256).max);
    }

    function _bal() internal view returns (uint256 b0, uint256 b1) {
        b0 = c0.balanceOf(address(this));
        b1 = c1.balanceOf(address(this));
    }

    /// @dev After any op, fold the handler's own balance change into the ghost reserves
    ///      (the hook gains exactly what the handler loses, and vice-versa).
    function _settle(uint256 b0Before, uint256 b1Before) internal {
        (uint256 b0After, uint256 b1After) = _bal();
        expR0 = uint256(int256(expR0) - (int256(b0After) - int256(b0Before)));
        expR1 = uint256(int256(expR1) - (int256(b1After) - int256(b1Before)));
    }

    function swapExactIn(uint256 amtSeed, bool zeroForOne) public {
        uint256 amt = bound(amtSeed, 1e15, 1e18);
        uint256 kBefore = expR0 * expR1;
        (uint256 b0, uint256 b1) = _bal();
        try router.swapExactTokensForTokens(amt, 0, zeroForOne, key, "", address(this), block.timestamp + 1) {
            _settle(b0, b1);
            assertGe(expR0 * expR1, kBefore, "swap must not decrease the constant-product invariant");
        } catch {}
    }

    function swapExactOut(uint256 amtSeed, bool zeroForOne) public {
        uint256 amt = bound(amtSeed, 1e15, 5e17);
        uint256 kBefore = expR0 * expR1;
        (uint256 b0, uint256 b1) = _bal();
        try router.swapTokensForExactTokens(amt, type(uint256).max, zeroForOne, key, "", address(this), block.timestamp + 1)
        {
            _settle(b0, b1);
            assertGe(expR0 * expR1, kBefore, "swap must not decrease the constant-product invariant");
        } catch {}
    }

    function addLiquidity(uint256 a0Seed, uint256 a1Seed) public {
        uint256 a0 = bound(a0Seed, 1e16, 5e18);
        uint256 a1 = bound(a1Seed, 1e16, 5e18);
        (uint256 b0, uint256 b1) = _bal();
        try hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(a0, a1, 0, 0, block.timestamp + 1, -887220, 887220, bytes32(0))
        ) {
            _settle(b0, b1);
        } catch {}
    }

    function removeLiquidity(uint256 shareSeed) public {
        uint256 have = hook.balanceOf(address(this));
        if (have == 0) return;
        uint256 sh = bound(shareSeed, 1, have);
        (uint256 b0, uint256 b1) = _bal();
        try hook.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(sh, 0, 0, block.timestamp + 1, -887220, 887220, bytes32(0))
        ) {
            _settle(b0, b1);
        } catch {}
    }

    function roll(uint256 nSeed) public {
        vm.roll(block.number + bound(nSeed, 1, 4));
    }
}

/// @title PoincareInvariantTest — solvency & bounds across random op sequences (CLAUDE.md §9.3)
/// @notice Drives the hook with random swaps / liquidity / block-rolls and asserts the
///         system-level invariants the brief gates "done" on: the hook is always solvent (its
///         reserves are fully and exactly explained by the net of all token flows — no leak, no
///         value creation), reserves never hit zero, and the detector outputs stay in-bounds.
contract PoincareInvariantTest is BaseTest {
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;
    PoincareHandler handler;

    uint256 constant WAD = 1e18;
    int256 constant K = 1e15;
    int256 constant H = 5e15;
    int256 constant S_MAX = 2e16;
    uint256 constant KAPPA_MIN = 0;
    uint256 constant KAPPA_MAX = 1e17;
    uint256 constant D_MAX = 5e16;
    uint256 constant LAMBDA = 9e17;
    uint256 constant D_FLOOR = 5e17;

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        address flags = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                    | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
            ) ^ (0x4444 << 144)
        );
        bytes memory args = abi.encode(poolManager, K, H, S_MAX, KAPPA_MIN, KAPPA_MAX, D_MAX, LAMBDA, D_FLOOR);
        deployCodeTo("PoincareHook.sol:PoincareHook", args, flags);
        hook = PoincareHook(payable(flags));

        poolKey = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        // Seed the pool from the test contract (these shares stay locked here for the whole run,
        // so total supply never returns to zero).
        IERC20Minimal(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(100 ether, 100 ether, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );

        (uint256 r0, uint256 r1) = hook.reserves();
        handler = new PoincareHandler(swapRouter, hook, poolKey, currency0, currency1, r0, r1);

        // Fund the handler generously.
        IERC20Minimal(Currency.unwrap(currency0)).transfer(address(handler), 1_000 ether);
        IERC20Minimal(Currency.unwrap(currency1)).transfer(address(handler), 1_000 ether);

        targetContract(address(handler));
    }

    /// @notice Solvency / no-leak: the hook's reserves exactly equal the independent ghost
    ///         accounting of every token flow. A settlement bug (mis-minted 6909 claims, a
    ///         favourable rounding, a lost token) would break this.
    function invariant_reservesMatchGhostAccounting() public view {
        (uint256 r0, uint256 r1) = hook.reserves();
        assertEq(r0, handler.expR0(), "reserve0 must equal net token0 flow");
        assertEq(r1, handler.expR1(), "reserve1 must equal net token1 flow");
    }

    /// @notice The pool can never be fully drained — both reserves stay strictly positive, so
    ///         pricing and the detector never hit a zero-reserve revert (§4.5).
    function invariant_reservesStayPositive() public view {
        (uint256 r0, uint256 r1) = hook.reserves();
        assertGt(r0, 0, "reserve0 > 0");
        assertGt(r1, 0, "reserve1 > 0");
    }

    /// @notice The asymmetry stays within its hard cap and the directional signal stays in [0,1],
    ///         regardless of the swap/detection sequence (the security & seam bounds, §3, §4.1).
    function invariant_detectorOutputsBounded() public view {
        assertLe(hook.kappa(), KAPPA_MAX, "kappa <= kappa_max");
        assertLe(hook.directionalEfficiency(), WAD, "D <= 1");
    }
}
