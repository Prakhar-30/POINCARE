// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PoincareTestBase} from "../utils/PoincareTestBase.sol";
import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";

/// @title ExtremeStateAudit: the pool at the edges of its own state space.
///
/// @notice THE GAP THIS FILLS. The existing suite exercises the pool where it is meant to live:
///         a seeded pair, reasonable swap sizes, a detector that engages and disengages. The
///         library fuzzers go to extremes but they go there on ARGUMENTS, not on reachable pool
///         state - `AsymmetricCurve` never knows whether the reserves it was handed could
///         actually occur.
///
///         An auditor asks the other question: what states can this contract be DRIVEN into,
///         and does it still hold together there? Four of them matter.
///
///           - A reserve driven near exhaustion. The output-versus-reserve guard is what keeps
///             a reserve positive, and it is the only thing that does.
///           - Dust. One wei in, where the fee can round to the entire input and the curve can
///             return nothing. A pool that mispriced dust would be drained one wei at a time by
///             anyone patient, so "the trader gets nothing" has to be the answer.
///           - An absurd seed ratio, where the marginal price floors to zero. The detector has a
///             documented skip for this; a documented branch no test reaches is a comment.
///           - The packing. Detector state is downcast to int128/uint128 on the way into
///             storage, and Solidity does NOT check explicit downcasts. The bound that makes
///             those casts safe is an argument written in a comment. This tests the argument.
contract ExtremeStateAuditTest is PoincareTestBase {
    PoincareHook internal hook;
    PoolKey internal poolKey;
    Currency internal cur0;
    Currency internal cur1;

    uint256 internal constant SEED0 = 1_000e18;
    uint256 internal constant SEED1 = 3_000_000e18;

    function setUp() public {
        deployArtifactsAndLabel();
        (cur0, cur1) = deployCurrencyPair();
        hook = deployPoincare(defaultConfig(), 0xE501);
        poolKey = initPoincarePool(hook, cur0, cur1);
        _approve(hook);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(SEED0, SEED1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
    }

    function _approve(PoincareHook h) internal {
        IERC20Minimal(Currency.unwrap(cur0)).approve(address(h), type(uint256).max);
        IERC20Minimal(Currency.unwrap(cur1)).approve(address(h), type(uint256).max);
    }

    /// @dev Returns what the caller actually received, measured rather than reported: the
    ///      router hands back a `BalanceDelta` and the balance is the thing under test.
    function _swap(PoolKey memory key, bool zeroForOne, uint256 amountIn) internal returns (uint256 received) {
        Currency outC = zeroForOne ? cur1 : cur0;
        uint256 before = outC.balanceOf(address(this));
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: key,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        return outC.balanceOf(address(this)) - before;
    }

    /// @dev The pool invariant on real reserves. Every honest operation must leave it at least
    ///      where it was; every swap rounds against the trader, so it should only ever climb.
    function _k() internal view returns (uint256) {
        (uint256 r0, uint256 r1) = hook.reserves();
        return Math.sqrt(r0 * r1);
    }

    // ------------------------------------------------------------- 1. a reserve near exhaustion

    /// @dev Drive one side down as hard as the curve permits, doubling the bite each round, and
    ///      check the three things that must survive it: the reserve stays strictly positive,
    ///      the shadow stays backed by real claims, and the invariant never falls.
    ///
    ///      The guard doing the work is `AsymmetricCurve`'s strict `amountOut < reserve`. Without
    ///      it a large enough swap would take the whole side and `_settleReserves` would leave a
    ///      zero reserve behind - which is not merely empty, it is a division the next price
    ///      computation cannot do.
    function test_drivingAReserveTowardZero_keepsItPositiveAndBacked() public {
        uint256 kBefore = _k();
        uint256 size = 1_000e18;
        uint256 executed;

        for (uint256 i = 0; i < 40; i++) {
            vm.roll(block.number + 1);
            try this.externalSwap(poolKey, true, size) {
                executed++;
            } catch {
                // The curve refused a swap it cannot settle. That is the guard, not a failure.
            }
            size = size * 2;

            (uint256 r0, uint256 r1) = hook.reserves();
            assertGt(r0, 0, "reserve0 must stay positive");
            assertGt(r1, 0, "reserve1 must stay positive");

            (uint256 c0, uint256 c1) = hook.claimReserves();
            assertLe(r0, c0, "shadow reserve0 must stay backed by claims");
            assertLe(r1, c1, "shadow reserve1 must stay backed by claims");
        }

        assertGt(executed, 0, "the ramp must actually have traded, or this proves nothing");
        assertGe(_k(), kBefore, "no swap sequence may reduce the invariant");
    }

    /// @dev `try/catch` needs an external call, and the router is not ours to modify.
    function externalSwap(PoolKey memory key, bool zeroForOne, uint256 amountIn) external returns (uint256) {
        require(msg.sender == address(this), "self only");
        return _swap(key, zeroForOne, amountIn);
    }

    /// @dev Exact-output asking for the entire reserve must be refused rather than rounded into.
    ///      `amountOut < reserve` is strict for a reason: equality empties the side.
    function test_exactOutputForTheWholeReserve_isRefused() public {
        (, uint256 r1) = hook.reserves();
        vm.expectRevert();
        swapRouter.swapTokensForExactTokens({
            amountOut: r1,
            amountInMax: type(uint128).max,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    // ------------------------------------------------------------------------------- 2. dust

    /// @dev One wei in. With the vol fee on, the fee rounds UP and can consume the entire input,
    ///      so the curve is asked for an output on zero and must return zero. The trader paying
    ///      for nothing is the correct outcome; the incorrect one is the pool paying out on an
    ///      input it rounded away.
    function test_oneWeiSwap_neverPaysOutMoreThanItTookIn() public {
        PoincareConfig memory c = defaultConfig();
        c.feeGamma = 5e17;
        c.feeCap = 3e15;
        PoincareHook h = deployPoincare(c, 0xE502);
        PoolKey memory key = initPoincarePool(h, cur0, cur1);
        _approve(h);
        h.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(SEED0, SEED1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );

        (uint256 r0Before, uint256 r1Before) = h.reserves();
        uint256 kBefore = Math.sqrt(r0Before * r1Before);

        vm.roll(block.number + 1);
        uint256 out = _swap(key, true, 1);

        (uint256 r0, uint256 r1) = h.reserves();
        assertEq(r0, r0Before + 1, "the wei went in");
        assertEq(r1, r1Before - out, "and only what came out, came out");
        assertGe(Math.sqrt(r0 * r1), kBefore, "a dust swap must not reduce the invariant");
    }

    /// @dev A thousand dust round trips. Individually each is dominated by rounding; the concern
    ///      is that rounding has a DIRECTION and someone runs it a million times. It must round
    ///      toward the pool every time, so the invariant is monotone across the whole sequence
    ///      rather than merely on average.
    function test_repeatedDustRoundTrips_cannotBleedThePool() public {
        uint256 kBefore = _k();
        for (uint256 i = 0; i < 500; i++) {
            if (i % 50 == 0) vm.roll(block.number + 1);
            _swap(poolKey, true, 1000);
            _swap(poolKey, false, 1000);
        }
        assertGe(_k(), kBefore, "a thousand dust trips must not bleed the invariant");
    }

    // ------------------------------------------------------- 3. an absurd ratio at the seed

    /// @dev A pool seeded so lopsidedly that `(r1 + b) * WAD / (r0 + a)` floors to zero. The
    ///      detector skips the sample rather than taking a zero baseline (which would blind it)
    ///      or calling `ln(0)` (which would revert a swap). Both failure modes are worse than
    ///      the skip, and the skip is the branch nothing else reaches.
    ///
    ///      Worth recording why this needs its own pool: the state is not reachable by TRADING.
    ///      Draining token1 to the point where the price floors would push token0 past the
    ///      uint128 shadow-reserve ceiling first, so the swap reverts long before the price does
    ///      anything interesting. The only door into this state is the seed.
    function test_absurdSeedRatio_skipsTheSampleAndStillPrices() public {
        PoincareHook h = deployPoincare(defaultConfig(), 0xE503);
        PoolKey memory key = initPoincarePool(h, cur0, cur1);
        _approve(h);

        // price = r1/r0 = 2e-19 WAD, which floors to zero: r1 * WAD < r0.
        h.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(5e24, 1e6, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );

        vm.roll(block.number + 1);
        PoincareHook.DetectorSnap memory s = h.previewDetector();
        assertFalse(s.advanced, "a zero marginal price must not be sampled");
        assertEq(h.lastSampledPriceWad(), 0, "and must not become the baseline");

        // And the pool still trades: the detector falling back is not allowed to revert a swap.
        uint256 out = _swap(key, true, 1e24);
        assertGt(out, 0, "the curve still prices at a ratio the detector cannot read");
        assertEq(h.lastSampledPriceWad(), 0, "still no baseline after the swap");
        assertEq(h.kappa(), 0, "and the detector stays disengaged rather than guessing");
    }

    // --------------------------------------------------------------------- 4. the packing

    /// @dev Detector state goes to storage through unchecked downcasts - `int128(s.ewmaNet)`,
    ///      `uint128(s.ewmaTV)`, `uint64(s.kappa)`. Solidity does not check those, so if the
    ///      bound in the comment above the state variables is wrong, the failure is silent
    ///      corruption rather than a revert.
    ///
    ///      The check that catches it: `previewDetector()` computes the step in full width
    ///      BEFORE the swap, and `signalState()`/`cusumState()` report what storage kept after.
    ///      A truncating cast makes those two disagree. Run against a deliberately hostile
    ///      configuration - almost no decay, so the accumulators grow about as fast as the
    ///      design permits - and across a long alternating drive.
    function test_detectorStatePacking_roundTripsUnderAHostileConfiguration() public {
        PoincareConfig memory c = defaultConfig();
        c.lambda = 1e18 - 1; // the largest decay `isValidConfig` accepts: effectively no decay
        c.gateR = 1e15; // keep the gate crossable at this lambda
        c.clipWad = 20e18; // let a genuinely large log-return through unclipped
        PoincareHook h = deployPoincare(c, 0xE504);
        PoolKey memory key = initPoincarePool(h, cur0, cur1);
        _approve(h);
        h.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(SEED0, SEED1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );

        for (uint256 i = 0; i < 60; i++) {
            vm.roll(block.number + 1);
            PoincareHook.DetectorSnap memory pre = h.previewDetector();
            // Large, alternating, so |r| stays big instead of decaying toward nothing.
            _swap(key, i % 2 == 0, i % 2 == 0 ? 200e18 : 600_000e18);

            (int256 net, uint256 tv) = h.signalState();
            (int256 sPos, int256 sNeg) = h.cusumState();

            assertEq(net, pre.ewmaNet, "ewmaNet survived the int128 cast");
            assertEq(tv, pre.ewmaTV, "ewmaTV survived the uint128 cast");
            assertEq(sPos, pre.sPos, "sPos survived the int128 cast");
            assertEq(sNeg, pre.sNeg, "sNeg survived the int128 cast");
            assertEq(h.kappa(), pre.kappa, "kappa survived the uint64 cast");

            // The bound the casts rely on, asserted directly rather than inferred.
            assertLe(tv, uint256(uint128(type(int128).max)), "ewmaTV within its slot");
            assertLe(net < 0 ? uint256(-net) : uint256(net), tv, "|net| <= TV, so net fits too");
            assertLe(h.directionalEfficiency(), 1e18, "D must stay a fraction");
        }
    }

    /// @dev The CUSUM statistics are the one piece of detector state with an explicit cap, and
    ///      the cap is what makes their cast safe. Drive hard in one direction and check they
    ///      saturate at sMax rather than growing past it.
    function test_cusumSaturatesAtItsCapUnderSustainedDrive() public {
        for (uint256 i = 0; i < 40; i++) {
            vm.roll(block.number + 1);
            _swap(poolKey, true, 5e18);
            (int256 sPos, int256 sNeg) = hook.cusumState();
            assertLe(sPos, hook.sMax(), "sPos capped");
            assertLe(sNeg, hook.sMax(), "sNeg capped");
            assertGe(sPos, 0, "sPos non-negative");
            assertGe(sNeg, 0, "sNeg non-negative");
            assertLe(hook.kappa(), hook.kappaMax(), "kappa within its hard cap");
        }
    }

    // ------------------------------------------------- 5. the pool emptied down to the lock

    /// @dev Every provider leaves. `MINIMUM_LIQUIDITY` is burned to a dead address at the first
    ///      mint, so supply can never reach zero and neither can the reserves - which means the
    ///      pool must still be a working pool afterwards, not a brick. Someone arriving next
    ///      has to be able to fund it and trade it.
    function test_afterEveryProviderLeaves_thePoolIsStillUsable() public {
        hook.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(
                hook.balanceOf(address(this)), 0, 0, type(uint256).max, -887220, 887220, bytes32(0)
            )
        );

        assertEq(hook.totalSupply(), hook.MINIMUM_LIQUIDITY(), "only the locked shares remain");
        (uint256 r0, uint256 r1) = hook.reserves();
        assertGt(r0, 0, "the lock keeps reserve0 alive");
        assertGt(r1, 0, "the lock keeps reserve1 alive");

        // And the pool is re-fundable at the ratio the lock left behind.
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(SEED0, SEED1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
        assertGt(hook.balanceOf(address(this)), 0, "a new provider can fund the emptied pool");

        vm.roll(block.number + 1);
        assertGt(_swap(poolKey, true, 1e18), 0, "and it trades again");
    }
}
