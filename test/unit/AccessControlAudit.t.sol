// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";
import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {PoincareTestBase} from "../utils/PoincareTestBase.sol";
import {PoincareHook} from "../../src/PoincareHook.sol";

/// @dev The PoolManager refuses `modifyLiquidity` outside an unlock, and it refuses it FIRST -
///      before the hook is ever consulted. So a test that simply calls it from the test contract
///      passes on `ManagerLocked` and proves nothing about the hook's guard, which is what the
///      first version of this file did. This holds the lock open so the call actually reaches
///      `beforeAddLiquidity` and the guard under test is the one that fires.
contract LiquidityUnlocker is IUnlockCallback {
    IPoolManager public immutable pm;

    constructor(IPoolManager _pm) {
        pm = _pm;
    }

    function tryModify(PoolKey memory key, ModifyLiquidityParams memory params) external {
        pm.unlock(abi.encode(key, params));
    }

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        require(msg.sender == address(pm), "only pm");
        (PoolKey memory key, ModifyLiquidityParams memory params) = abi.decode(data, (PoolKey, ModifyLiquidityParams));
        pm.modifyLiquidity(key, params, "");
        return "";
    }
}

/// @title AccessControlAudit: the doors, rather than the machinery behind them.
///
/// @notice THE GAP THIS FILLS. Every hook-level test in this repository reaches the hook the
///         way an honest integrator does - through the PoolManager, through the router, through
///         `addLiquidity`. None of them knocks on a door that is supposed to be shut. That is
///         the half of the surface an auditor checks first, because a custom-curve hook holds
///         the pool's entire reserve behind functions the PoolManager is expected to be the
///         only caller of.
///
///         Four doors matter here, and each is load-bearing for a different reason:
///
///           1. The hook callbacks. `beforeSwap` returns a `BeforeSwapDelta` the caller is
///              trusted to settle. Called directly it would advance the detector and hand back
///              a delta nobody settles: detector state moved by someone who paid nothing.
///           2. `unlockCallback`. It settles and takes on the hook's behalf, so it is the only
///              function here that moves tokens without the caller having paid first.
///           3. The native v4 liquidity path. These reserves are hook-owned; tick liquidity
///              added underneath would be real, withdrawable, and invisible to every price the
///              hook quotes.
///           4. Pool binding. `BaseCustomAccounting` holds ONE `_poolKey`, so a second pool
///              pointed at this hook would share one reserve set and one detector.
///
///         Most of these guards live in the inherited base rather than in code written here,
///         and that is the argument for testing them rather than against it: an inherited guard
///         no test exercises is one that survives a dependency bump by luck.
contract AccessControlAuditTest is PoincareTestBase {
    PoincareHook internal hook;
    PoolKey internal poolKey;
    Currency internal cur0;
    Currency internal cur1;

    address internal mallory = address(0xBAD);

    uint256 internal constant SEED0 = 1_000e18;
    uint256 internal constant SEED1 = 3_000_000e18;

    function setUp() public {
        deployArtifactsAndLabel();
        (cur0, cur1) = deployCurrencyPair();
        hook = deployPoincare(defaultConfig(), 0xAC01);
        poolKey = initPoincarePool(hook, cur0, cur1);

        IERC20Minimal(Currency.unwrap(cur0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(cur1)).approve(address(hook), type(uint256).max);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(SEED0, SEED1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
    }

    // ------------------------------------------------------------------ 1. the callbacks

    /// @dev This is the one that would actually do damage: it samples the price, folds a return
    ///      into the EWMA, steps the CUSUM and returns a delta. Reached directly it moves the
    ///      detector for free, which is exactly the thing the manipulation argument prices as
    ///      expensive.
    function test_beforeSwap_rejectsEveryCallerButThePoolManager() public {
        SwapParams memory p = SwapParams(true, -1e18, Constants.SQRT_PRICE_1_2);
        vm.prank(mallory);
        vm.expectRevert(BaseHook.NotPoolManager.selector);
        IHooks(address(hook)).beforeSwap(mallory, poolKey, p, Constants.ZERO_BYTES);
    }

    /// @dev Reached directly, the liquidity callbacks revert for the CALLER reason rather than
    ///      the "liquidity only via hook" reason. That order is the correct one - authenticate
    ///      before you interpret - and it is why the native-path guard needs its own test
    ///      through the PoolManager below rather than being folded into this one.
    function test_liquidityCallbacks_rejectEveryCallerButThePoolManager() public {
        ModifyLiquidityParams memory p = ModifyLiquidityParams(-60, 60, 1e18, bytes32(0));

        vm.startPrank(mallory);
        vm.expectRevert(BaseHook.NotPoolManager.selector);
        IHooks(address(hook)).beforeAddLiquidity(mallory, poolKey, p, Constants.ZERO_BYTES);

        vm.expectRevert(BaseHook.NotPoolManager.selector);
        IHooks(address(hook)).beforeRemoveLiquidity(mallory, poolKey, p, Constants.ZERO_BYTES);
        vm.stopPrank();
    }

    /// @dev `beforeInitialize` is what binds the pool key, so an outsider reaching it would bind
    ///      the hook to a key of their choosing.
    function test_beforeInitialize_rejectsEveryCallerButThePoolManager() public {
        vm.prank(mallory);
        vm.expectRevert(BaseHook.NotPoolManager.selector);
        IHooks(address(hook)).beforeInitialize(mallory, poolKey, Constants.SQRT_PRICE_1_1);
    }

    // ------------------------------------------------------------------ 2. the settlement door

    /// @dev The highest-value door in the system: `unlockCallback` settles and takes on the
    ///      hook's behalf, against a payload the caller supplies.
    function test_unlockCallback_rejectsEveryCallerButThePoolManager() public {
        vm.prank(mallory);
        vm.expectRevert(BaseHook.NotPoolManager.selector);
        hook.unlockCallback(abi.encode(mallory, ModifyLiquidityParams(-60, 60, 1e18, bytes32(0))));
    }

    // ------------------------------------------------------------------ 3. the native LP path

    /// @dev CLAUDE.md section 5 requires the native tick-liquidity path to be closed, and the
    ///      reason is arithmetic rather than stylistic: the curve prices against `_reserves()`,
    ///      the hook's own shadow. Tick liquidity sitting in the PoolManager underneath would be
    ///      real, withdrawable, and invisible to every price the hook quotes.
    ///
    ///      Asserted from inside an unlock, so the call reaches the hook. See `LiquidityUnlocker`
    ///      for why that distinction is the whole test.
    function test_nativeTickLiquidity_isClosedThroughThePoolManager() public {
        LiquidityUnlocker u = new LiquidityUnlocker(poolManager);
        try u.tryModify(poolKey, ModifyLiquidityParams(-60, 60, 1e18, bytes32(0))) {
            revert("native liquidity path must be closed");
        } catch (bytes memory err) {
            assertTrue(
                _mentions(err, BaseCustomAccounting.LiquidityOnlyViaHook.selector),
                "must fail on the hook guard, not on a lock or a tick range"
            );
        }
    }

    /// @dev And on the way out too, so the path is shut in both directions rather than only
    ///      inbound. A one-sided guard is still a guard; it is just the wrong one if liquidity
    ///      ever did land there.
    function test_nativeTickLiquidityRemoval_isAlsoClosed() public {
        LiquidityUnlocker u = new LiquidityUnlocker(poolManager);
        try u.tryModify(poolKey, ModifyLiquidityParams(-60, 60, -1e18, bytes32(0))) {
            revert("native liquidity removal must be closed");
        } catch (bytes memory err) {
            assertTrue(_mentions(err, BaseCustomAccounting.LiquidityOnlyViaHook.selector), "hook guard must fire");
        }
    }

    // ------------------------------------------------------------------ 4. pool binding

    /// @dev One hook, one pool. The hook keeps a single shadow reserve pair, a single detector
    ///      and a single LP share supply, so a second pool bound to it would trade against the
    ///      first pool's reserves. This guard is the difference between a custom-curve hook and
    ///      a way to drain one.
    function test_aSecondPoolCannotBindToTheSameHook() public {
        (Currency other0, Currency other1) = deployCurrencyPair();
        PoolKey memory second = PoolKey(other0, other1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(address(hook)));
        _expectBindingRefused(second);
    }

    /// @dev Including the same pair at a different tick spacing, which is the version someone
    ///      arrives at by accident rather than malice: a different key, the same tokens, and a
    ///      reasonable belief that it is a separate pool.
    function test_sameTokensDifferentSpacing_alsoCannotBind() public {
        PoolKey memory second = PoolKey(cur0, cur1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 10, IHooks(address(hook)));
        _expectBindingRefused(second);
    }

    /// @dev The PoolManager wraps a reverting hook call, so the reason has to be found inside
    ///      the wrapper rather than matched against it. Matching the wrapper itself would pin
    ///      this test to v4-core's error encoding; looking for the selector pins it to the
    ///      thing it is actually about.
    function _expectBindingRefused(PoolKey memory second) internal {
        try poolManager.initialize(second, Constants.SQRT_PRICE_1_1) returns (int24) {
            revert("a second pool must not bind to this hook");
        } catch (bytes memory err) {
            assertTrue(
                _mentions(err, BaseCustomAccounting.AlreadyInitialized.selector),
                "must be refused because the hook is already bound"
            );
        }
    }

    /// @dev Does this revert payload contain `sel` anywhere? Revert data from a wrapped hook
    ///      call nests the original selector inside; a 4-byte scan finds it without depending
    ///      on how many layers deep the wrapping happens to be.
    function _mentions(bytes memory err, bytes4 sel) internal pure returns (bool) {
        if (err.length < 4) return false;
        for (uint256 i = 0; i + 4 <= err.length; i++) {
            if (err[i] == sel[0] && err[i + 1] == sel[1] && err[i + 2] == sel[2] && err[i + 3] == sel[3]) {
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------ 5. the share token

    /// @dev LP shares are a plain ERC20, so the claim travels with the token. That is intended
    ///      and worth pinning; the failure this excludes is the opposite one, where a depositor
    ///      who transferred their shares away can still withdraw against them.
    function test_theClaimTravelsWithTheShares_andDoesNotStayBehind() public {
        uint256 shares = hook.balanceOf(address(this));
        assertGt(shares, 0, "seeded shares");

        hook.transfer(mallory, shares);
        assertEq(hook.balanceOf(address(this)), 0, "shares left");

        vm.expectRevert();
        hook.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(shares, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );

        uint256 before0 = IERC20Minimal(Currency.unwrap(cur0)).balanceOf(mallory);
        vm.prank(mallory);
        hook.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(shares, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
        assertGt(IERC20Minimal(Currency.unwrap(cur0)).balanceOf(mallory), before0, "holder redeems");
    }

    /// @dev Inherited plumbing, which is the reason for the one line rather than an argument
    ///      against it: a liquidity order that can sit in the mempool indefinitely is a free
    ///      option written against the pool.
    function test_expiredDeadline_isRefused() public {
        vm.warp(1000);
        vm.expectRevert(BaseCustomAccounting.ExpiredPastDeadline.selector);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(1e18, 3000e18, 0, 0, 999, -887220, 887220, bytes32(0))
        );
    }
}
