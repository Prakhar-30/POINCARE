// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareTestBase} from "../utils/PoincareTestBase.sol";
import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";

/// @title DeepBaseSeamAudit: the offsets, which are the only pool state that moves without a trade.
///
/// @notice THE GAP THIS FILLS. `alphaWad` is zero in the deployed configuration, so the base
///         curve is plain constant-product and the offsets are (0, 0). That makes this the most
///         tempting code in the repository to leave untested, and the worst candidate for it:
///         the offsets are the one input to the executable price that a LIQUIDITY operation can
///         change, and liquidity operations pay neither the fee nor the spread.
///
///         `_baseOffsets()` scales the seed anchor by the live share supply, `a = a0 * supply /
///         supply0`. Two things follow that the rest of the suite does not check.
///
///         First, the mid must be invariant to proportional deposits and withdrawals: reserves
///         and offsets scale together, so `(r1 + b) / (r0 + a)` should not move. If it moves, an
///         LP can shift the executable price - and therefore the detector's price sample - for
///         the cost of a round trip.
///
///         Second, the constructor refuses a seed whose offsets floor to zero on one side only
///         ("offset seed too small"), because a curve anchored off its own ratio is an arbitrage
///         seam. That is checked once, at the seed. This asks whether it is an INVARIANT: the
///         same scaling that produced both offsets can drive one of them to zero later, without
///         anyone passing through the constructor again.
contract DeepBaseSeamAuditTest is PoincareTestBase {
    Currency internal cur0;
    Currency internal cur1;

    uint256 internal constant SEED0 = 1_000e18;
    uint256 internal constant SEED1 = 3_000_000e18;

    function setUp() public {
        deployArtifactsAndLabel();
        (cur0, cur1) = deployCurrencyPair();
    }

    function _deepPool(uint16 ns, uint256 seed0, uint256 seed1) internal returns (PoincareHook h, PoolKey memory key) {
        PoincareConfig memory c = defaultConfig();
        c.alphaWad = 5e17; // a virtual half-depth on each side: the deep-base mode, switched on
        h = deployPoincare(c, ns);
        key = initPoincarePool(h, cur0, cur1);
        IERC20Minimal(Currency.unwrap(cur0)).approve(address(h), type(uint256).max);
        IERC20Minimal(Currency.unwrap(cur1)).approve(address(h), type(uint256).max);
        h.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(seed0, seed1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
    }

    /// @dev The executable mid, offsets included: the number the detector samples and the number
    ///      a swap is priced against.
    function _mid(PoincareHook h) internal view returns (uint256) {
        (uint256 r0, uint256 r1) = h.reserves();
        (uint256 a, uint256 b) = h.baseOffsets();
        return ((r1 + b) * 1e18) / (r0 + a);
    }

    function _add(PoincareHook h, uint256 a0, uint256 a1) internal {
        h.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(a0, a1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
    }

    function _remove(PoincareHook h, uint256 shares) internal {
        h.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(shares, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
    }

    // ------------------------------------------------- 1. the mid must not move on liquidity

    /// @dev A proportional deposit scales reserves and offsets by the same factor, so the mid is
    ///      algebraically unchanged. In integers it is unchanged only up to truncation, and the
    ///      question worth asking is how much: a deposit that could move the mid by a basis
    ///      point would be a way to feed the detector a fabricated return, for free, from an
    ///      operation that pays no spread.
    function testFuzz_proportionalDeposit_doesNotMoveTheMid(uint256 seed) public {
        (PoincareHook h,) = _deepPool(0xDB01, SEED0, SEED1);
        uint256 before = _mid(h);

        // Deposit between 0.1% and 200% of the pool, at the pool's own ratio. The ceiling is
        // the test contract's token balance, not a property of the hook.
        uint256 bps = 1 + (seed % 2000);
        _add(h, (SEED0 * bps) / 1000, (SEED1 * bps) / 1000);

        assertApproxEqRel(_mid(h), before, 1e9, "a proportional deposit must not move the mid");
    }

    /// @dev And the same for a withdrawal, over the range a real provider can reach.
    function testFuzz_proportionalWithdrawal_doesNotMoveTheMid(uint256 seed) public {
        (PoincareHook h,) = _deepPool(0xDB02, SEED0, SEED1);
        uint256 before = _mid(h);

        uint256 shares = h.balanceOf(address(this));
        uint256 burn = 1 + (seed % (shares - 1)); // anything from a wei of shares to all of them
        _remove(h, burn);

        assertApproxEqRel(_mid(h), before, 1e9, "a proportional withdrawal must not move the mid");
    }

    /// @dev Truncation has a direction, and the concern is not one cycle but ten thousand. If
    ///      each add/remove pair moved the mid a wei the same way, an LP with patience owns the
    ///      detector's input. Run the cycle and require the total drift to stay negligible.
    function test_repeatedAddRemoveCycles_cannotRatchetTheMid() public {
        (PoincareHook h,) = _deepPool(0xDB03, SEED0, SEED1);
        uint256 before = _mid(h);

        for (uint256 i = 0; i < 200; i++) {
            uint256 sharesBefore = h.balanceOf(address(this));
            _add(h, SEED0 / 10, SEED1 / 10);
            _remove(h, h.balanceOf(address(this)) - sharesBefore);
        }

        assertApproxEqRel(_mid(h), before, 1e10, "200 liquidity cycles must not ratchet the mid");
    }

    // ------------------------------------- 2. is the seed-time offset guard an invariant?

    /// @dev The constructor refuses a seed where one offset floors to zero while the other does
    ///      not, because the mid is `(r1 + b) / (r0 + a)` and a curve with only one virtual side
    ///      is anchored off its own reserve ratio. This asks whether that condition can be
    ///      re-entered AFTER the seed, by withdrawal alone.
    ///
    ///      The scaling is `b = b0 * supply / supply0`, so `b` reaches zero once
    ///      `supply < supply0 / b0 = sqrt(A0 * B0) / (alpha * B0) = sqrt(A0 / B0) / alpha`. For a
    ///      balanced pair that threshold is below `MINIMUM_LIQUIDITY`, so the burned shares alone
    ///      keep both offsets alive and the invariant holds by accident of the lock. For a
    ///      lopsided pair it is not: a pool seeded at A0 = 5e24 against B0 = 1e6 has a threshold
    ///      around 2e9 shares, far above the 1000 that are locked.
    ///
    ///      So this is the honest statement of the state: the guard holds for any pair whose
    ///      seed is within a few orders of magnitude of balanced, and stops holding for one that
    ///      is not. Everything downstream of it is dust - a pool withdrawn to a billionth of its
    ///      seed - but "dust" is a size argument, not a correctness one, and the size argument
    ///      is the thing that should be written down rather than assumed.
    function test_lopsidedSeed_canLoseAnOffsetToWithdrawalAlone() public {
        (PoincareHook h,) = _deepPool(0xDB04, 5e24, 1e6);

        (uint256 a, uint256 b) = h.baseOffsets();
        assertGt(a, 0, "the constructor guarantees both offsets at the seed");
        assertGt(b, 0, "including the small side");

        // Withdraw down toward the locked minimum.
        uint256 shares = h.balanceOf(address(this));
        _remove(h, shares - 1);

        (uint256 a2, uint256 b2) = h.baseOffsets();
        assertGt(a2, 0, "the large offset survives");
        assertEq(b2, 0, "the small one does not: the seed-time guard is not an invariant");
    }

    /// @dev And the balanced case, which is the one that matters in practice: the same
    ///      withdrawal leaves both offsets alive, because `MINIMUM_LIQUIDITY` sits above the
    ///      threshold at any sane seed ratio. This is the test that says WHY the finding above
    ///      is bounded rather than general, and it is the one that will fail first if someone
    ///      ever lowers the lock.
    function test_balancedSeed_keepsBothOffsetsDownToTheLock() public {
        (PoincareHook h,) = _deepPool(0xDB05, SEED0, SEED1);

        uint256 shares = h.balanceOf(address(this));
        _remove(h, shares - 1);

        (uint256 a, uint256 b) = h.baseOffsets();
        assertGt(a, 0, "both offsets must survive withdrawal to the lock at a sane seed ratio");
        assertGt(b, 0, "both offsets must survive withdrawal to the lock at a sane seed ratio");
        assertEq(h.totalSupply(), h.MINIMUM_LIQUIDITY() + 1, "and the lock is what is holding them up");
    }

    // ------------------------------------------------- 3. the deep base still prices honestly

    /// @dev A round trip whose two legs straddle a liquidity DEPOSIT gets back MORE token0 than
    ///      it spent. That is worth writing down precisely, because it looks like a finding and
    ///      is not one: it is true of every constant-product pool, hook or no hook. Doubling the
    ///      depth halves the price impact of the return leg, so the reversal is cheaper than the
    ///      outbound was - and the difference is paid by the depositor, who bought into a
    ///      reserve ratio the first leg had already skewed.
    ///
    ///      What the pool must guarantee is the other thing: the deposit does not LEAK. The
    ///      invariant per share must not fall across the sequence, which is the statement that
    ///      the round-tripper's gain came out of price convergence rather than out of the
    ///      reserves. `AsymmetricCurve` is explicit that its no-profit guarantee holds on a
    ///      single curve; this is what holds when the curve itself moves.
    function test_roundTripAcrossADeposit_isCheaperButDoesNotDrainTheReserves() public {
        (PoincareHook h, PoolKey memory key) = _deepPool(0xDB06, SEED0, SEED1);

        uint256 spent0 = 10e18;
        vm.roll(block.number + 1);
        uint256 got1 = _swapOn(key, true, spent0);

        uint256 kPerShareBefore = _kPerShare(h);

        // The offsets move under the trader between the legs: this doubles the share supply and
        // therefore doubles both offsets.
        _add(h, SEED0, SEED1);

        vm.roll(block.number + 1);
        uint256 back0 = _swapOn(key, false, got1);

        assertGt(back0, spent0, "the deeper return leg is cheaper - expected, and not a defect");
        // One wei of slack, and it is the deposit rather than the swap: `_baseOffsets` floors
        // `a0 * supply / supply0` on each side, so a deposit can land with up to a wei less
        // virtual depth than it paid for. The direction is toward the pool on the swap side and
        // the magnitude does not compound - `test_repeatedAddRemoveCycles_cannotRatchetTheMid`
        // is what pins that across 200 cycles.
        assertGe(_kPerShare(h) + 2, kPerShareBefore, "but the reserves behind each share must not fall");
    }

    /// @dev The version that WOULD be a finding: the same actor deposits, round-trips against
    ///      their own deposit, and withdraws. If the cheaper return leg were free money rather
    ///      than a transfer from the depositor, this is where it would show up - because here
    ///      the trader and the depositor are one wallet and the transfer nets to nothing.
    ///
    ///      The test is DOMINANCE, not "more of each token": the sequence legitimately ends
    ///      holding a different mix, because the withdrawal returns reserves at the ratio the
    ///      trades left behind. Ending with more token1 and less token0 is a position change,
    ///      not a profit, and asserting against it (which the first version of this test did)
    ///      asserts something false. Risk-free profit means ending with at least as much of
    ///      BOTH tokens and strictly more of one - that needs no reference price to state, and
    ///      it is exactly what an attacker would need for the sequence to be worth running.
    function test_selfSandwichingADeposit_doesNotPay() public {
        (PoincareHook h, PoolKey memory key) = _deepPool(0xDB07, SEED0, SEED1);

        uint256 w0 = IERC20Minimal(Currency.unwrap(cur0)).balanceOf(address(this));
        uint256 w1 = IERC20Minimal(Currency.unwrap(cur1)).balanceOf(address(this));
        uint256 kpsBefore = _kPerShare(h);

        vm.roll(block.number + 1);
        uint256 got1 = _swapOn(key, true, 10e18);

        uint256 sharesBefore = h.balanceOf(address(this));
        _add(h, SEED0, SEED1);
        uint256 minted = h.balanceOf(address(this)) - sharesBefore;

        vm.roll(block.number + 1);
        _swapOn(key, false, got1);

        _remove(h, minted);

        uint256 e0 = IERC20Minimal(Currency.unwrap(cur0)).balanceOf(address(this));
        uint256 e1 = IERC20Minimal(Currency.unwrap(cur1)).balanceOf(address(this));

        assertFalse(e0 >= w0 && e1 >= w1 && (e0 > w0 || e1 > w1), "self-sandwich must not dominate");
        assertGe(h.balanceOf(address(this)), sharesBefore, "and the original position is intact");
        assertGe(_kPerShare(h), kpsBefore, "with no less behind each share than before");
    }

    /// @dev The invariant standing behind one LP share, on the VIRTUAL reserves.
    ///
    ///      This has to be `sqrt((r0 + a)(r1 + b)) / supply` and not `sqrt(r0 * r1) / supply`,
    ///      which is what the rest of the suite uses and what this file used first. The two agree
    ///      only when the offsets are zero. With offsets the curve conserves `(r0 + a)(r1 + b)`,
    ///      and `r0 * r1 = K + ab - (b(r0 + a) + a(r1 + b))` is MAXIMISED where the reserve ratio
    ///      equals the offset ratio - which is exactly the seed. So on a deep-base pool the real
    ///      product falls with any price move at all, and reading it as LP value reports a loss
    ///      on every swap in either direction.
    ///
    ///      That is worth a paragraph rather than a silent fix: it is a measurement trap that
    ///      would read as a leak in an audit, and the pool is fine. `LpAccounting.t.sol` uses the
    ///      real product legitimately, because it runs at `alphaWad = 0` where the two coincide.
    function _kPerShare(PoincareHook h) internal view returns (uint256) {
        (uint256 r0, uint256 r1) = h.reserves();
        (uint256 a, uint256 b) = h.baseOffsets();
        uint256 supply = h.totalSupply();
        return supply == 0 ? 0 : (_sqrt((r0 + a) * (r1 + b)) * 1e18) / supply;
    }

    function _sqrt(uint256 x) private pure returns (uint256 y) {
        if (x == 0) return 0;
        y = x;
        uint256 z = x / 2 + 1;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    function _swapOn(PoolKey memory key, bool zeroForOne, uint256 amountIn) internal returns (uint256) {
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
}
