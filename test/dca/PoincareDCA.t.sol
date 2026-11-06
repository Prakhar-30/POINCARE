// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {PoincareHook} from "../../src/PoincareHook.sol";
import {PoincareLens} from "../../src/PoincareLens.sol";
import {PoincareDCA} from "../../src/periphery/PoincareDCA.sol";
import {Cusum} from "../../src/libraries/Cusum.sol";
import {PoincareTestBase} from "../utils/PoincareTestBase.sol";

/// @title PoincareDCATest: spread-aware DCA orders against a real Poincaré pool
/// @notice Runs the periphery contract over the same harness as the hook suite: a real
///         PoolManager, the v4 router, a seeded Poincaré pool. Trends are produced the way they
///         happen live: sustained one-way swaps across blocks.
contract PoincareDCATest is PoincareTestBase {
    Currency c0;
    Currency c1;
    PoolKey key;
    PoincareHook hook;
    PoincareLens lens;
    PoincareDCA dca;

    address user = makeAddr("user");
    address keeper = makeAddr("keeper");
    address stranger = makeAddr("stranger");
    address payee = makeAddr("payee");

    uint32 constant H = 3600; // slot length used throughout
    uint256 constant DEADLINE = type(uint256).max;
    int24 constant MIN_TICK = -887220;
    int24 constant MAX_TICK = 887220;

    function setUp() public {
        vm.warp(1_700_000_000);
        deployArtifactsAndLabel();
        (c0, c1) = deployCurrencyPair();
        hook = deployPoincare(defaultConfig(), 0x4444, c0, c1);
        key = initPoincarePool(hook, c0, c1);
        IERC20Minimal(Currency.unwrap(c0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(hook), type(uint256).max);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(10 ether, 10 ether, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );

        lens = new PoincareLens(hook);
        dca = new PoincareDCA(lens, swapRouter, address(this));
        dca.setKeeper(keeper, true);

        _t0().transfer(user, 100 ether);
        _t1().transfer(user, 100 ether);
        vm.startPrank(user);
        _t0().approve(address(dca), type(uint256).max);
        _t1().approve(address(dca), type(uint256).max);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ helpers

    function _t0() internal view returns (IERC20Minimal) {
        return IERC20Minimal(Currency.unwrap(c0));
    }

    function _t1() internal view returns (IERC20Minimal) {
        return IERC20Minimal(Currency.unwrap(c1));
    }

    function _params(bool zeroForOne, uint128 amountIn, uint32 slices) internal view returns (PoincareDCA.OrderParams memory p) {
        p.zeroForOne = zeroForOne;
        p.amountIn = amountIn;
        p.slices = slices;
        p.interval = H;
        p.startTime = 0;
        p.deadline = uint64(block.timestamp + uint256(slices - 1) * H + H / 2);
        p.maxSpreadBps = 10_000;
        p.pauseOnTrend = false;
        p.catchUp = false;
        p.maxSlippageBps = 100;
        p.minPriceWad = 0;
        p.recipient = address(0);
    }

    function _create(PoincareDCA.OrderParams memory p) internal returns (uint256 id) {
        vm.prank(user);
        id = dca.createOrder(p);
    }

    function _exec(uint256 id) internal returns (uint256 out) {
        vm.prank(keeper);
        out = dca.executeSlice(id);
    }

    function _status(uint256 id) internal view returns (PoincareDCA.Status) {
        return dca.canExecute(id).status;
    }

    /// @dev Third-party flow that drives a down-trend: sustained zeroForOne swaps across blocks
    ///      (the same pattern the hook suite uses). Afterwards zeroForOne is the with-trend side.
    function _driveDownTrend() internal {
        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            _swap(1 ether, true);
        }
        vm.roll(block.number + 1);
        assertTrue(hook.previewDetector().trend == Cusum.Trend.Down, "down-trend detected");
        (uint256 spread,) = hook.previewSpread(true);
        assertGt(spread, 0, "zeroForOne side is charged");
    }

    function _swap(uint256 amountIn, bool zeroForOne) internal {
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: key,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    function _next() internal {
        vm.warp(block.timestamp + H);
        vm.roll(block.number + 1);
    }

    // ------------------------------------------------------------------ create

    function test_create_escrowsBudgetAndRecordsOrder() public {
        uint256 before = _t0().balanceOf(user);
        uint256 id = _create(_params(true, 4 ether, 4));

        assertEq(id, 1);
        assertEq(_t0().balanceOf(user), before - 4 ether, "budget escrowed");
        assertEq(_t0().balanceOf(address(dca)), 4 ether);
        PoincareDCA.Order memory o = dca.getOrder(id);
        assertEq(o.owner, user);
        assertEq(o.recipient, user, "recipient defaults to owner");
        assertEq(o.remaining, 4 ether);
        assertEq(o.startTime, block.timestamp);
        assertEq(dca.openOrderCount(), 1);
        assertEq(dca.ordersOf(user).length, 1);
        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.Ready));
    }

    function test_create_rejectsBadParams() public {
        PoincareDCA.OrderParams memory p = _params(true, 4 ether, 4);

        p.slices = 0;
        vm.expectRevert(abi.encodeWithSelector(PoincareDCA.InvalidParams.selector, "slices"));
        _create(p);

        p = _params(true, 4 ether, 4);
        p.interval = 59;
        vm.expectRevert(abi.encodeWithSelector(PoincareDCA.InvalidParams.selector, "interval"));
        _create(p);

        p = _params(true, 4 ether, 4);
        p.deadline = uint64(block.timestamp + 2 * H); // the 4th slot opens at +3H
        vm.expectRevert(abi.encodeWithSelector(PoincareDCA.InvalidParams.selector, "deadline"));
        _create(p);

        p = _params(true, 3, 4);
        vm.expectRevert(abi.encodeWithSelector(PoincareDCA.InvalidParams.selector, "amountIn below slices"));
        _create(p);

        p = _params(true, 4 ether, 4);
        p.maxSpreadBps = 10_001;
        vm.expectRevert(abi.encodeWithSelector(PoincareDCA.InvalidParams.selector, "bps"));
        _create(p);

        p = _params(true, 4 ether, 4);
        p.recipient = address(dca);
        vm.expectRevert(abi.encodeWithSelector(PoincareDCA.InvalidParams.selector, "recipient"));
        _create(p);

        p = _params(true, 4 ether, 4);
        p.startTime = uint64(block.timestamp - 1);
        vm.expectRevert(abi.encodeWithSelector(PoincareDCA.InvalidParams.selector, "startTime"));
        _create(p);
    }

    // ------------------------------------------------------------------ schedule

    function test_slice_fillsEvenShareToRecipient() public {
        PoincareDCA.OrderParams memory p = _params(true, 4 ether, 4);
        p.recipient = payee;
        uint256 id = _create(p);

        uint256 quote = lens.quoteExactInput(true, 1 ether);
        uint256 out = _exec(id);

        assertEq(out, quote, "fill matches the in-block Lens quote");
        assertEq(_t1().balanceOf(payee), out, "output went to the recipient");
        PoincareDCA.Order memory o = dca.getOrder(id);
        assertEq(o.remaining, 3 ether);
        assertEq(o.filled, 1);
        assertEq(o.amountOut, out);
        assertEq(_t0().balanceOf(address(dca)), 3 ether, "only the filled share left escrow");
    }

    function test_slice_oncePerSlot() public {
        uint256 id = _create(_params(true, 4 ether, 4));
        _exec(id);

        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.WaitingForSlot));
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(PoincareDCA.NotExecutable.selector, PoincareDCA.Status.WaitingForSlot));
        dca.executeSlice(id);

        PoincareDCA.Preview memory pv = dca.canExecute(id);
        assertEq(pv.nextSlotAt, block.timestamp + H, "next slot advertised");

        _next();
        _exec(id);
        assertEq(dca.getOrder(id).filled, 2);
    }

    function test_schedule_completesAndCloses() public {
        uint256 id = _create(_params(false, 4 ether, 4));
        uint256 total;
        for (uint256 i = 0; i < 4; i++) {
            total += _exec(id);
            if (i < 3) _next();
        }
        PoincareDCA.Order memory o = dca.getOrder(id);
        assertEq(o.remaining, 0);
        assertEq(o.amountOut, total);
        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.Filled));
        assertEq(dca.openOrderCount(), 0, "filled order leaves the open set");
        assertEq(_t1().balanceOf(address(dca)), 0);
    }

    function test_futureStart_waits() public {
        PoincareDCA.OrderParams memory p = _params(true, 2 ether, 2);
        p.startTime = uint64(block.timestamp + H);
        p.deadline = uint64(block.timestamp + 3 * H);
        uint256 id = _create(p);

        PoincareDCA.Preview memory pv = dca.canExecute(id);
        assertEq(uint8(pv.status), uint8(PoincareDCA.Status.NotStarted));
        assertEq(pv.nextSlotAt, p.startTime);

        vm.warp(p.startTime);
        _exec(id);
    }

    // ------------------------------------------------------------------ Poincaré conditions

    function test_spreadCap_skipsTheChargedSide_only() public {
        PoincareDCA.OrderParams memory withTrend = _params(true, 2 ether, 2);
        withTrend.maxSpreadBps = 0;
        PoincareDCA.OrderParams memory against = _params(false, 2 ether, 2);
        against.maxSpreadBps = 0;
        uint256 a = _create(withTrend);
        uint256 b = _create(against);

        _driveDownTrend();

        PoincareDCA.Preview memory pa = dca.canExecute(a);
        assertEq(uint8(pa.status), uint8(PoincareDCA.Status.SpreadTooHigh), "with-trend side held");
        assertGt(pa.spreadBps, 0);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(PoincareDCA.NotExecutable.selector, PoincareDCA.Status.SpreadTooHigh));
        dca.executeSlice(a);

        PoincareDCA.Preview memory pb = dca.canExecute(b);
        assertEq(uint8(pb.status), uint8(PoincareDCA.Status.Ready), "counter-trend side trades free");
        assertEq(pb.spreadBps, 0);
        assertGt(_exec(b), 0);
    }

    function test_spreadCap_allowsSpreadBelowCap() public {
        _driveDownTrend();
        (uint256 spread,) = hook.previewSpread(true);
        uint256 bps = (spread * 10_000 + 1e18 - 1) / 1e18;

        PoincareDCA.OrderParams memory p = _params(true, 2 ether, 2);
        p.maxSpreadBps = uint16(bps);
        uint256 id = _create(p);
        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.Ready), "cap equal to the spread admits");
    }

    function test_pauseOnTrend_holdsWithTrendSide_andResumes() public {
        PoincareDCA.OrderParams memory p = _params(true, 3 ether, 3);
        p.pauseOnTrend = true;
        p.deadline = uint64(block.timestamp + 40 * H);
        uint256 id = _create(p);
        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.Ready), "no trend: runs");

        _driveDownTrend();
        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.TrendAgainst), "with-trend: paused");

        // Reverse the flow until the down-trend no longer runs with the order.
        uint256 guard;
        while (hook.previewDetector().trend == Cusum.Trend.Down && guard++ < 60) {
            vm.roll(block.number + 1);
            _swap(1 ether, false);
        }
        assertTrue(hook.previewDetector().trend != Cusum.Trend.Down, "down-trend ended");
        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.Ready), "resumed");
        assertGt(_exec(id), 0);
    }

    function test_pauseOnTrend_off_paysSpread() public {
        _driveDownTrend();
        uint256 id = _create(_params(true, 2 ether, 2)); // no cap, no pause
        PoincareDCA.Preview memory pv = dca.canExecute(id);
        assertEq(uint8(pv.status), uint8(PoincareDCA.Status.Ready));
        assertGt(pv.spreadBps, 0, "fills through the spread when the user allows it");
        _exec(id);
    }

    function test_pauseOnTrend_ignoresCounterTrend() public {
        PoincareDCA.OrderParams memory p = _params(false, 2 ether, 2);
        p.pauseOnTrend = true;
        uint256 id = _create(p);
        _driveDownTrend();
        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.Ready), "counter-trend order keeps running");
    }

    function test_limitPrice_blocksBelowLimit() public {
        uint256 quote = lens.quoteExactInput(true, 1 ether);
        PoincareDCA.OrderParams memory p = _params(true, 2 ether, 2);
        p.minPriceWad = quote * 1e18 / 1 ether + 1e15; // just above what the pool pays
        uint256 id = _create(p);
        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.BelowLimit));

        PoincareDCA.OrderParams memory q = _params(true, 2 ether, 2);
        q.minPriceWad = quote * 1e18 / 1 ether / 2; // a loose limit
        uint256 id2 = _create(q);
        PoincareDCA.Preview memory pv = dca.canExecute(id2);
        assertEq(uint8(pv.status), uint8(PoincareDCA.Status.Ready));
        assertGe(pv.minOut, pv.quoteOut * 99 / 100, "slippage floor applies above a loose limit");
        _exec(id2);
    }

    // ------------------------------------------------------------------ catch-up and deadline

    function test_catchUp_makesUpSkippedSlots() public {
        PoincareDCA.OrderParams memory p = _params(true, 4 ether, 4);
        p.deadline = uint64(block.timestamp + 3 * H); // slots 0..3, no spare
        p.catchUp = true;
        uint256 id = _create(p);

        _exec(id); // slot 0: 1 ether
        vm.warp(block.timestamp + 2 * H); // skip slot 1
        vm.roll(block.number + 1);
        PoincareDCA.Preview memory pv = dca.canExecute(id);
        assertEq(pv.slot, 2);
        assertEq(pv.amountIn, 1.5 ether, "3 ether over the 2 slots left");
        _exec(id);

        vm.warp(block.timestamp + H);
        vm.roll(block.number + 1);
        assertEq(dca.canExecute(id).amountIn, 1.5 ether, "last slot takes the rest");
        _exec(id);
        assertEq(dca.getOrder(id).remaining, 0, "completed by the deadline");
    }

    function test_noCatchUp_leavesRemainderForRefund() public {
        PoincareDCA.OrderParams memory p = _params(true, 4 ether, 4);
        p.deadline = uint64(block.timestamp + 3 * H);
        uint256 id = _create(p);

        _exec(id);
        vm.warp(block.timestamp + 3 * H); // skip slots 1 and 2
        vm.roll(block.number + 1);
        assertEq(dca.canExecute(id).amountIn, 1 ether, "even share only");
        _exec(id);

        vm.warp(block.timestamp + 1);
        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.Expired));
        uint256 before = _t0().balanceOf(user);
        vm.prank(stranger);
        uint256 refunded = dca.closeExpired(id);
        assertEq(refunded, 2 ether);
        assertEq(_t0().balanceOf(user), before + 2 ether, "refund goes to the owner, not the caller");
        assertEq(_t0().balanceOf(stranger), 0);
        assertEq(dca.openOrderCount(), 0);
    }

    function test_closeExpired_onlyAfterDeadline() public {
        uint256 id = _create(_params(true, 2 ether, 2));
        vm.expectRevert(PoincareDCA.NotExpired.selector);
        dca.closeExpired(id);
    }

    // ------------------------------------------------------------------ permissions

    function test_execute_keeperOrOwnerOnly() public {
        uint256 id = _create(_params(true, 2 ether, 2));
        vm.prank(stranger);
        vm.expectRevert(PoincareDCA.NotAuthorized.selector);
        dca.executeSlice(id);

        vm.prank(user);
        assertGt(dca.executeSlice(id), 0, "owner may fill their own order");

        dca.setKeeper(keeper, false);
        _next();
        vm.prank(keeper);
        vm.expectRevert(PoincareDCA.NotAuthorized.selector);
        dca.executeSlice(id);
    }

    function test_cancel_ownerOnly_refundsRemaining() public {
        uint256 id = _create(_params(true, 4 ether, 4));
        _exec(id);

        vm.prank(stranger);
        vm.expectRevert(PoincareDCA.NotAuthorized.selector);
        dca.cancel(id);

        vm.prank(keeper);
        vm.expectRevert(PoincareDCA.NotAuthorized.selector);
        dca.cancel(id);

        uint256 before = _t0().balanceOf(user);
        vm.prank(user);
        assertEq(dca.cancel(id), 3 ether);
        assertEq(_t0().balanceOf(user), before + 3 ether);
        assertEq(uint8(_status(id)), uint8(PoincareDCA.Status.Cancelled));

        vm.prank(user);
        vm.expectRevert(PoincareDCA.OrderClosed.selector);
        dca.cancel(id);
    }

    function test_onlyOwnerManagesKeepers() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        dca.setKeeper(stranger, true);
    }

    function test_unknownOrder() public {
        assertEq(uint8(_status(99)), uint8(PoincareDCA.Status.Unknown));
        vm.prank(keeper);
        vm.expectRevert(PoincareDCA.UnknownOrder.selector);
        dca.executeSlice(99);
    }

    function test_openOrders_paginates() public {
        for (uint256 i = 0; i < 3; i++) _create(_params(true, 1 ether, 1));
        assertEq(dca.openOrders(0, 2).length, 2);
        assertEq(dca.openOrders(2, 5).length, 1);
        assertEq(dca.openOrders(5, 5).length, 0);
        vm.prank(user);
        dca.cancel(2);
        uint256[] memory ids = dca.openOrders(0, 10);
        assertEq(ids.length, 2);
        assertTrue(ids[0] != 2 && ids[1] != 2, "cancelled order left the open set");
    }

    // ------------------------------------------------------------------ conservation

    /// @dev Whatever happens to an order, every unit of the budget is either swapped (and its
    ///      output delivered) or refunded; the contract never keeps a remainder.
    function testFuzz_budgetIsAlwaysFilledOrRefunded(uint96 amount, uint8 slices, bool catchUp, uint16 skipMask) public {
        uint128 amountIn = uint128(bound(amount, 1e12, 5 ether));
        uint32 n = uint32(bound(slices, 1, 8));
        PoincareDCA.OrderParams memory p = _params(true, amountIn, n);
        p.catchUp = catchUp;
        p.deadline = uint64(block.timestamp + uint256(n - 1) * H + H / 2);
        uint256 balBefore = _t0().balanceOf(user);
        uint256 id = _create(p);

        uint256 filledIn;
        for (uint256 s = 0; s < n; s++) {
            if ((skipMask >> s) & 1 == 0 && dca.canExecute(id).status == PoincareDCA.Status.Ready) {
                uint256 rem = dca.getOrder(id).remaining;
                _exec(id);
                filledIn += rem - dca.getOrder(id).remaining;
            }
            _next();
        }
        PoincareDCA.Order memory o = dca.getOrder(id);
        uint256 refunded;
        if (o.remaining > 0) {
            vm.warp(uint256(o.deadline) + 1);
            refunded = dca.closeExpired(id);
        }
        assertEq(filledIn + refunded, amountIn, "budget conserved");
        assertEq(_t0().balanceOf(user), balBefore - filledIn, "owner paid exactly what was filled");
        assertEq(_t0().balanceOf(address(dca)), 0, "nothing stranded");
        if (catchUp && (skipMask >> (n - 1)) & 1 == 0) assertEq(refunded, 0, "catch-up finishes when the last slot runs");
    }
}
