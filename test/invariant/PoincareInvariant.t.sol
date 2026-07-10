// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";
import {PoincareTestBase} from "../utils/PoincareTestBase.sol";

/// @title PoincareHandler: randomized actor for the invariant run.
/// @notice Performs bounded random swaps (exact-in/out, both directions), liquidity adds/removes,
///         and block rolls against the live hook. It keeps a ghost copy of the reserves updated
///         purely from its OWN measured token-balance deltas (`expR -= handlerDelta`): since the
///         handler is the only mutator during the run, the hook's reserves must always equal this
///         independent accounting: that is the solvency / no-leak invariant. It also asserts the
///         curve invariant never decreases on a swap (no value extraction by traders): for the deep-base
///         deep base the invariant is the OFFSET product `(x+a)(y+b)` with the offsets in force
///         during the swap (they only move on liquidity events, never inside a swap).
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

    /// @dev The curve invariant with the CURRENT offsets (constant within a swap).
    function _k(uint256 a, uint256 b) internal view returns (uint256) {
        return (expR0 + a) * (expR1 + b);
    }

    function swapExactIn(uint256 amtSeed, bool zeroForOne) public {
        uint256 amt = bound(amtSeed, 1e15, 1e18);
        (uint256 a, uint256 b) = hook.baseOffsets();
        uint256 kBefore = _k(a, b);
        (uint256 b0, uint256 b1) = _bal();
        try router.swapExactTokensForTokens(amt, 0, zeroForOne, key, "", address(this), block.timestamp + 1) {
            _settle(b0, b1);
            assertGe(_k(a, b), kBefore, "swap must not decrease the curve invariant");
        } catch {}
    }

    function swapExactOut(uint256 amtSeed, bool zeroForOne) public {
        uint256 amt = bound(amtSeed, 1e15, 5e17);
        (uint256 a, uint256 b) = hook.baseOffsets();
        uint256 kBefore = _k(a, b);
        (uint256 b0, uint256 b1) = _bal();
        try router.swapTokensForExactTokens(amt, type(uint256).max, zeroForOne, key, "", address(this), block.timestamp + 1)
        {
            _settle(b0, b1);
            assertGe(_k(a, b), kBefore, "swap must not decrease the curve invariant");
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

/// @title PoincareInvariantBase: solvency & bounds across random op sequences
/// @notice Drives the hook with random swaps / liquidity / block-rolls and asserts the
///         system-level invariants the brief gates "done" on: the hook is always solvent (its
///         reserves are fully and exactly explained by the net of all token flows: no leak, no
///         value creation), reserves never hit zero, and the detector outputs stay in-bounds.
///         Run twice: on the plain MVP config and on the full-feature config (deep base + vol
///         fee + adaptive detector), which exercises the deep-base offsets and fee accrual paths.
abstract contract PoincareInvariantBase is PoincareTestBase {
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;
    PoincareHandler handler;

    uint256 constant WAD = 1e18;

    /// @dev The config flavor under test; supplied by the concrete suites below.
    function _config() internal pure virtual returns (PoincareConfig memory);

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        hook = deployPoincare(_config(), 0x4444);
        poolKey = initPoincarePool(hook, currency0, currency1);

        // Seed the pool from the test contract (these shares stay locked here for the whole run,
        // so total supply never returns to zero).
        IERC20Minimal(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(
                100 ether, 100 ether, 0, 0, type(uint256).max, -887220, 887220, bytes32(0)
            )
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

    /// @notice The pool can never be fully drained: both reserves stay strictly positive, so
    ///         pricing and the detector never hit a zero-reserve revert. With the deep-base
    ///         deep base this additionally exercises the new output-feasibility guard.
    function invariant_reservesStayPositive() public view {
        (uint256 r0, uint256 r1) = hook.reserves();
        assertGt(r0, 0, "reserve0 > 0");
        assertGt(r1, 0, "reserve1 > 0");
    }

    /// @notice The asymmetry stays within its hard cap, the directional signal stays in [0,1],
    ///         and the vol fee respects its cap, regardless of the op sequence.
    function invariant_detectorOutputsBounded() public view {
        assertLe(hook.kappa(), hook.kappaMax(), "kappa <= kappa_max");
        assertLe(hook.directionalEfficiency(), WAD, "D <= 1");
        assertLe(hook.currentFeeWad(), hook.feeCap(), "fee <= fee_cap");
    }
}

/// @notice The proven MVP baseline: pure x·y=k base, no fee, absolute-threshold detector.
contract PoincareInvariantPlainTest is PoincareInvariantBase {
    function _config() internal pure override returns (PoincareConfig memory) {
        return defaultConfig();
    }
}

/// @notice Full-feature flavor: deep base + vol-scaled fee + v2 adaptive detector.
contract PoincareInvariantFullTest is PoincareInvariantBase {
    function _config() internal pure override returns (PoincareConfig memory c) {
        c = adaptiveConfig();
        c.alphaWad = 5e17; //  1.5x virtual depth
        c.feeGamma = 5e17; //  fee = 0.5 * sigma
        c.feeCap = 1e16; //    capped at 1%
    }
}
