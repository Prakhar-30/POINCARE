// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

import {PoincareHook} from "../PoincareHook.sol";
import {PoincareLens} from "../PoincareLens.sol";
import {Cusum} from "../libraries/Cusum.sol";

/// @title PoincareDCA: spread-aware DCA / TWAP orders on a Poincaré pool
/// @notice A periphery contract. It does not change the hook, the Lens or the pool; it only
///         reads their public views and trades through the public swap router, like any user.
///
///         A user escrows an order's budget here. The order is filled in slices, one per time
///         slot, and every slice re-checks the order's conditions on chain at the moment it
///         executes, against the hook's projection of the block it lands in:
///
///         - `maxSpreadBps`  skip the slot while the directional spread on the order's side is
///                           above the cap (the hook's own `previewSpread`).
///         - `pauseOnTrend`  hold while the detected trend runs WITH the order's side (the side
///                           the hook charges once its spread ramps), resume when it ends.
///         - `catchUp`       a slice after skipped slots grows to spread what is left over the
///                           slots left before the deadline, so the order still completes.
///         - `minPriceWad`   a limit price: out-token per in-token, WAD. `maxSlippageBps`
///                           bounds the fill against the Lens quote taken in the same tx.
///         - `deadline`      hard stop; whatever is unfilled after it goes back to the owner.
///
///         Who can do what. Slices are triggered by an allowlisted keeper or by the order's
///         owner, and only when every condition above holds; the output goes straight from the
///         router to the order's recipient. No one else can move an order's funds: there is no
///         admin withdrawal, the contract owner can only manage the keeper allowlist, and only
///         an order's owner can cancel it (expired orders refund to their owner, never to the
///         caller). Unaudited periphery code; the hook and Lens it reads were reviewed.
contract PoincareDCA is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    /// @notice Shortest allowed gap between slices; the detector samples at most once a block.
    uint32 public constant MIN_INTERVAL = 60;
    /// @notice Upper bound on slices per order.
    uint32 public constant MAX_SLICES = 10_000;

    PoincareHook public immutable hook;
    PoincareLens public immutable lens;
    IUniswapV4Router04 public immutable router;
    IERC20 public immutable token0;
    IERC20 public immutable token1;
    uint24 public immutable poolFee;
    int24 public immutable poolTickSpacing;

    /// @notice Why an order can or cannot fill a slice right now (see `canExecute`).
    enum Status {
        Ready,
        Unknown, //       no such order
        Cancelled,
        Filled, //        nothing left to fill
        Expired, //       past the deadline
        NotStarted, //    before the start time
        WaitingForSlot, // this slot already filled; next slot not open yet
        SpreadTooHigh, // spread on the order's side above maxSpreadBps
        TrendAgainst, //  pauseOnTrend and the trend runs with the order's side
        BelowLimit //     the quote is below the order's limit price
    }

    struct OrderParams {
        bool zeroForOne; //      true: pay token0, receive token1
        uint128 amountIn; //     total budget, in the input token
        uint32 slices; //        number of planned fills
        uint32 interval; //      seconds per slot (>= MIN_INTERVAL)
        uint64 startTime; //     first slot opens here; 0 = now
        uint64 deadline; //      no fills after this; must leave room for every slot
        uint16 maxSpreadBps; //  10_000 = no cap
        bool pauseOnTrend;
        bool catchUp;
        uint16 maxSlippageBps; // vs the in-tx Lens quote; 10_000 = no bound
        uint256 minPriceWad; //  min out per 1 in, WAD; 0 = no limit
        address recipient; //    receives every fill; 0 = the owner
    }

    struct Order {
        address owner;
        address recipient;
        bool zeroForOne;
        bool pauseOnTrend;
        bool catchUp;
        bool cancelled;
        uint16 maxSpreadBps;
        uint16 maxSlippageBps;
        uint32 slices;
        uint32 interval;
        uint32 filled; //        fills so far
        uint64 startTime;
        uint64 deadline;
        uint64 lastSlotPlusOne; // slot index + 1 of the latest fill; 0 = none yet
        uint128 amountIn;
        uint128 remaining;
        uint128 amountOut; //    cumulative output delivered to the recipient
        uint256 minPriceWad;
    }

    /// @notice A slice evaluation: what the next fill would do if triggered now.
    struct Preview {
        Status status;
        uint256 amountIn; //  this slice's input (0 unless the order is live)
        uint256 quoteOut; //  Lens quote for amountIn (0 unless the time and spread checks pass)
        uint256 minOut; //    the floor the router would enforce
        uint256 spreadBps; // spread on the order's side this block, rounded up
        uint64 slot; //       current slot index
        uint64 nextSlotAt; // when the next slot opens (0 if none before the deadline)
    }

    uint256 public nextOrderId = 1;
    mapping(uint256 => Order) internal _orders;
    mapping(address => uint256[]) internal _ordersOf;
    mapping(address => bool) public isKeeper;

    // Open (live) orders, so a keeper can find work without scanning history.
    uint256[] internal _open;
    mapping(uint256 => uint256) internal _openIndexPlusOne;

    event KeeperSet(address indexed keeper, bool allowed);
    event OrderCreated(uint256 indexed id, address indexed owner, bool zeroForOne, uint256 amountIn, uint32 slices, uint32 interval, uint64 startTime, uint64 deadline);
    event SliceExecuted(uint256 indexed id, uint64 slot, uint256 amountIn, uint256 amountOut, uint256 spreadBps, uint32 filled, uint256 remaining);
    event OrderCancelled(uint256 indexed id, uint256 refunded);
    event OrderExpired(uint256 indexed id, uint256 refunded);
    event OrderFilled(uint256 indexed id, uint256 amountOut);

    error InvalidParams(string reason);
    error NotExecutable(Status status);
    error NotAuthorized();
    error UnknownOrder();
    error OrderClosed();
    error NotExpired();

    constructor(PoincareLens _lens, IUniswapV4Router04 _router, address initialOwner) Ownable(initialOwner) {
        lens = _lens;
        hook = _lens.hook();
        router = _router;
        PoolKey memory key = hook.poolKey();
        address t0 = Currency.unwrap(key.currency0);
        address t1 = Currency.unwrap(key.currency1);
        // Native ETH would need payable plumbing this contract does not have.
        if (t0 == address(0) || t1 == address(0)) revert InvalidParams("native currency");
        token0 = IERC20(t0);
        token1 = IERC20(t1);
        poolFee = key.fee;
        poolTickSpacing = key.tickSpacing;
    }

    // ------------------------------------------------------------------ admin (keepers only)

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    // ------------------------------------------------------------------ orders

    /// @notice Escrow `p.amountIn` of the input token and open an order. Needs an allowance.
    function createOrder(OrderParams calldata p) external nonReentrant returns (uint256 id) {
        uint64 start = p.startTime == 0 ? uint64(block.timestamp) : p.startTime;
        _validate(p, start);

        IERC20 tokenIn = p.zeroForOne ? token0 : token1;
        uint256 before = tokenIn.balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), p.amountIn);
        // Exact-amount escrow: a fee-on-transfer token would leave orders underfunded.
        if (tokenIn.balanceOf(address(this)) - before != p.amountIn) revert InvalidParams("transfer amount");

        id = nextOrderId++;
        Order storage o = _orders[id];
        o.owner = msg.sender;
        o.recipient = p.recipient == address(0) ? msg.sender : p.recipient;
        o.zeroForOne = p.zeroForOne;
        o.pauseOnTrend = p.pauseOnTrend;
        o.catchUp = p.catchUp;
        o.maxSpreadBps = p.maxSpreadBps;
        o.maxSlippageBps = p.maxSlippageBps;
        o.slices = p.slices;
        o.interval = p.interval;
        o.startTime = start;
        o.deadline = p.deadline;
        o.amountIn = p.amountIn;
        o.remaining = p.amountIn;
        o.minPriceWad = p.minPriceWad;

        _ordersOf[msg.sender].push(id);
        _open.push(id);
        _openIndexPlusOne[id] = _open.length;

        emit OrderCreated(id, msg.sender, p.zeroForOne, p.amountIn, p.slices, p.interval, start, p.deadline);
    }

    /// @notice Fill the order's slice for the current slot. Keeper or the order's owner only.
    function executeSlice(uint256 id) external nonReentrant returns (uint256 amountOut) {
        Order storage o = _orders[id];
        if (o.owner == address(0)) revert UnknownOrder();
        if (!isKeeper[msg.sender] && msg.sender != o.owner) revert NotAuthorized();

        Preview memory pv = _preview(o);
        if (pv.status != Status.Ready) revert NotExecutable(pv.status);

        // effects before the external swap
        o.remaining -= uint128(pv.amountIn);
        o.filled += 1;
        o.lastSlotPlusOne = pv.slot + 1;
        bool done = o.remaining == 0;
        if (done) _removeOpen(id);

        IERC20 tokenIn = o.zeroForOne ? token0 : token1;
        IERC20 tokenOut = o.zeroForOne ? token1 : token0;
        uint256 outBefore = tokenOut.balanceOf(o.recipient);

        tokenIn.forceApprove(address(router), pv.amountIn);
        router.swapExactTokensForTokens({
            amountIn: pv.amountIn,
            amountOutMin: pv.minOut,
            zeroForOne: o.zeroForOne,
            poolKey: _poolKey(),
            hookData: "",
            receiver: o.recipient,
            deadline: block.timestamp
        });
        // The router pulls exactly amountIn for an exact-input swap; clear any residue anyway.
        if (tokenIn.allowance(address(this), address(router)) != 0) tokenIn.forceApprove(address(router), 0);

        amountOut = tokenOut.balanceOf(o.recipient) - outBefore;
        o.amountOut += uint128(amountOut);

        emit SliceExecuted(id, pv.slot, pv.amountIn, amountOut, pv.spreadBps, o.filled, o.remaining);
        if (done) emit OrderFilled(id, o.amountOut);
    }

    /// @notice Cancel an order and refund what is left. Order owner only, at any time.
    function cancel(uint256 id) external nonReentrant returns (uint256 refunded) {
        Order storage o = _orders[id];
        if (o.owner == address(0)) revert UnknownOrder();
        if (msg.sender != o.owner) revert NotAuthorized();
        if (o.cancelled || o.remaining == 0) revert OrderClosed();
        refunded = _close(id, o);
        o.cancelled = true;
        emit OrderCancelled(id, refunded);
    }

    /// @notice After the deadline, anyone may return an order's unfilled budget to its owner.
    function closeExpired(uint256 id) external nonReentrant returns (uint256 refunded) {
        Order storage o = _orders[id];
        if (o.owner == address(0)) revert UnknownOrder();
        if (o.cancelled || o.remaining == 0) revert OrderClosed();
        if (block.timestamp <= o.deadline) revert NotExpired();
        refunded = _close(id, o);
        emit OrderExpired(id, refunded);
    }

    // ------------------------------------------------------------------ views

    function getOrder(uint256 id) external view returns (Order memory) {
        return _orders[id];
    }

    /// @notice Everything an integrator needs to know about the next slice, without sending it.
    function canExecute(uint256 id) external view returns (Preview memory) {
        Order storage o = _orders[id];
        if (o.owner == address(0)) return Preview(Status.Unknown, 0, 0, 0, 0, 0, 0);
        return _preview(o);
    }

    function ordersOf(address owner_) external view returns (uint256[] memory) {
        return _ordersOf[owner_];
    }

    function openOrderCount() external view returns (uint256) {
        return _open.length;
    }

    /// @notice A page of open order ids, for keepers.
    function openOrders(uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256 n = _open.length;
        if (offset >= n) return new uint256[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        ids = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) ids[i - offset] = _open[i];
    }

    // ------------------------------------------------------------------ internals

    function _validate(OrderParams calldata p, uint64 start) internal view {
        if (p.amountIn == 0) revert InvalidParams("amountIn");
        if (p.slices == 0 || p.slices > MAX_SLICES) revert InvalidParams("slices");
        if (p.amountIn < p.slices) revert InvalidParams("amountIn below slices");
        if (p.interval < MIN_INTERVAL) revert InvalidParams("interval");
        if (start < block.timestamp) revert InvalidParams("startTime");
        if (p.maxSpreadBps > BPS || p.maxSlippageBps > BPS) revert InvalidParams("bps");
        if (p.recipient == address(this)) revert InvalidParams("recipient");
        // every planned slot must open before the deadline
        uint256 lastPlanned = uint256(start) + uint256(p.slices - 1) * p.interval;
        if (p.deadline < lastPlanned) revert InvalidParams("deadline");
    }

    function _preview(Order storage o) internal view returns (Preview memory pv) {
        if (o.cancelled) return _status(pv, Status.Cancelled);
        if (o.remaining == 0) return _status(pv, Status.Filled);
        if (block.timestamp > o.deadline) return _status(pv, Status.Expired);
        if (block.timestamp < o.startTime) {
            pv.nextSlotAt = o.startTime;
            return _status(pv, Status.NotStarted);
        }

        uint64 slot = uint64((block.timestamp - o.startTime) / o.interval);
        uint64 lastSlot = uint64((uint256(o.deadline) - o.startTime) / o.interval);
        pv.slot = slot;
        uint256 next = uint256(o.startTime) + uint256(slot + 1) * o.interval;
        pv.nextSlotAt = next <= o.deadline ? uint64(next) : 0;

        pv.amountIn = _sliceAmount(o, slot, lastSlot);
        if (o.lastSlotPlusOne > slot) return _status(pv, Status.WaitingForSlot);

        (uint256 spreadWad,) = hook.previewSpread(o.zeroForOne);
        pv.spreadBps = (spreadWad * BPS + WAD - 1) / WAD;
        if (pv.spreadBps > o.maxSpreadBps) return _status(pv, Status.SpreadTooHigh);

        if (o.pauseOnTrend && _trendWithSide(o.zeroForOne)) return _status(pv, Status.TrendAgainst);

        pv.quoteOut = lens.quoteExactInput(o.zeroForOne, pv.amountIn);
        uint256 limitOut = o.minPriceWad == 0 ? 0 : _mulDivUp(pv.amountIn, o.minPriceWad, WAD);
        if (pv.quoteOut < limitOut) return _status(pv, Status.BelowLimit);
        uint256 slipOut = pv.quoteOut * (BPS - o.maxSlippageBps) / BPS;
        pv.minOut = limitOut > slipOut ? limitOut : slipOut;
        pv.status = Status.Ready;
    }

    /// @dev This slot's input. One even share per planned slice; with catch-up, never less than
    ///      what is left spread over the slots left (so skipped slots are made up), and the
    ///      final fill always takes the rounding remainder.
    function _sliceAmount(Order storage o, uint64 slot, uint64 lastSlot) internal view returns (uint256 amt) {
        uint256 remaining = o.remaining;
        uint256 base = uint256(o.amountIn) / o.slices;
        amt = base;
        if (o.catchUp) {
            uint256 slotsLeft = uint256(lastSlot) - slot + 1;
            uint256 even = (remaining + slotsLeft - 1) / slotsLeft;
            if (even > amt) amt = even;
        }
        if (o.filled + 1 >= o.slices || amt > remaining) amt = remaining;
    }

    /// @dev True when the detected trend runs with this side: the side the hook charges once its
    ///      spread ramps. Same mapping as the hook's own `_spreadGiven`: an up-trend is pushed by
    ///      oneForZero swaps, a down-trend by zeroForOne swaps.
    function _trendWithSide(bool zeroForOne) internal view returns (bool) {
        Cusum.Trend t = hook.previewDetector().trend;
        return (t == Cusum.Trend.Up && !zeroForOne) || (t == Cusum.Trend.Down && zeroForOne);
    }

    function _close(uint256 id, Order storage o) internal returns (uint256 refunded) {
        refunded = o.remaining;
        o.remaining = 0;
        _removeOpen(id);
        (o.zeroForOne ? token0 : token1).safeTransfer(o.owner, refunded);
    }

    function _removeOpen(uint256 id) internal {
        uint256 ip1 = _openIndexPlusOne[id];
        if (ip1 == 0) return;
        uint256 last = _open[_open.length - 1];
        _open[ip1 - 1] = last;
        _openIndexPlusOne[last] = ip1;
        _open.pop();
        delete _openIndexPlusOne[id];
    }

    function _poolKey() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: poolFee,
            tickSpacing: poolTickSpacing,
            hooks: IHooks(address(hook))
        });
    }

    function _status(Preview memory pv, Status s) private pure returns (Preview memory) {
        pv.status = s;
        return pv;
    }

    function _mulDivUp(uint256 a, uint256 b, uint256 d) private pure returns (uint256) {
        return (a * b + d - 1) / d;
    }
}
