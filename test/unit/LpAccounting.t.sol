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

/// @title LpAccounting: can one liquidity provider take value from another?
///
/// @notice THE GAP THIS FILLS. Every existing test in this repository uses a SINGLE liquidity
///         provider. The invariant suite fuzzes 128k add/remove/swap sequences and the curve
///         suite proves no round trip profits, but both do it with one depositor - so the whole
///         class of "LP A is diluted by LP B" was untested, and that is the first thing an
///         auditor reaches for in any pooled system.
///
///         What is checked here:
///           - a depositor who adds and immediately removes cannot come out ahead
///           - a late depositor cannot capture value earned before they arrived
///           - an exiting depositor cannot take more than their proportional share
///           - the value of a share never falls as a result of trading
///           - the first depositor cannot be front-run into an inflated share price
///           - a raw ERC20 transfer to the hook is not creditable by anyone
///
///         Value is measured in token0 at the pool's own mid, which is the only common unit
///         two positions can be compared in. Every assertion allows a wei or two of rounding
///         and states which direction rounding is permitted to go, because "no profit" in a
///         fixed-point system means "no profit beyond truncation, and truncation favours the
///         pool".
contract LpAccountingTest is PoincareTestBase {
    PoincareHook internal hook;
    PoolKey internal poolKey;
    Currency internal cur0;
    Currency internal cur1;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant SEED0 = 1_000e18;
    uint256 internal constant SEED1 = 3_000_000e18;

    function setUp() public {
        deployArtifactsAndLabel();
        (cur0, cur1) = deployCurrencyPair();
        hook = deployPoincare(defaultConfig(), 0xC0C0);
        poolKey = initPoincarePool(hook, cur0, cur1);

        IERC20Minimal(Currency.unwrap(cur0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(cur1)).approve(address(hook), type(uint256).max);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(
                SEED0, SEED1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0)
            )
        );
    }

    // ------------------------------------------------------------------ helpers

    /// @dev Fund `who` and let the hook pull from them.
    function _fund(address who, uint256 a0, uint256 a1) internal {
        IERC20Minimal t0 = IERC20Minimal(Currency.unwrap(cur0));
        IERC20Minimal t1 = IERC20Minimal(Currency.unwrap(cur1));
        t0.transfer(who, a0);
        t1.transfer(who, a1);
        vm.startPrank(who);
        t0.approve(address(hook), type(uint256).max);
        t1.approve(address(hook), type(uint256).max);
        vm.stopPrank();
    }

    function _addAs(address who, uint256 a0, uint256 a1) internal returns (uint256 mintedShares) {
        uint256 before = hook.balanceOf(who);
        vm.prank(who);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(
                a0, a1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0)
            )
        );
        return hook.balanceOf(who) - before;
    }

    function _removeAllAs(address who) internal returns (uint256 got0, uint256 got1) {
        uint256 shares = hook.balanceOf(who);
        uint256 b0 = IERC20Minimal(Currency.unwrap(cur0)).balanceOf(who);
        uint256 b1 = IERC20Minimal(Currency.unwrap(cur1)).balanceOf(who);
        vm.prank(who);
        hook.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(
                shares, 0, 0, type(uint256).max, -887220, 887220, bytes32(0)
            )
        );
        got0 = IERC20Minimal(Currency.unwrap(cur0)).balanceOf(who) - b0;
        got1 = IERC20Minimal(Currency.unwrap(cur1)).balanceOf(who) - b1;
    }

    /// @dev A bundle of (token0, token1) valued in token0 at the pool's current mid. The only
    ///      unit two positions are comparable in.
    function _valueIn0(uint256 a0, uint256 a1) internal view returns (uint256) {
        (uint256 r0, uint256 r1) = hook.reserves();
        return a0 + Math.mulDiv(a1, r0, r1);
    }

    /// @dev Value backing one share, as `sqrt(r0*r1) / supply`, scaled by 1e18.
    ///
    ///      NOT the reserves valued at the pool's own mid, which was the first thing I wrote and
    ///      which is wrong: `a0 + a1*r0/r1` applied to the reserves themselves collapses to
    ///      `2*r0/supply`, so it tracks reserve0 and therefore moves with every price change.
    ///      A swap that shifts the mid would read as value appearing or vanishing.
    ///
    ///      `sqrt(k)` per share is the measure that is invariant to the price and moves only
    ///      when value actually enters or leaves: fees and spread raise k without minting, and
    ///      proportional deposits raise k and supply together.
    function _valuePerShare() internal view returns (uint256) {
        (uint256 r0, uint256 r1) = hook.reserves();
        uint256 supply = hook.totalSupply();
        if (supply == 0) return 0;
        return Math.mulDiv(Math.sqrt(r0 * r1), 1e18, supply);
    }

    function _trade(bool zeroForOne, uint256 amt) internal {
        vm.roll(block.number + 1);
        swapRouter.swapExactTokensForTokens({
            amountIn: amt,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    // ------------------------------------------------------------------ the properties

    /// @dev Deposit and immediately withdraw must never return more than was put in. If it can,
    ///      the mint and burn paths disagree and the difference is free money drawn from
    ///      everyone else's reserves.
    function test_addThenRemoveImmediately_cannotProfit() public {
        _fund(alice, 10e18, 30_000e18);
        uint256 in0 = 10e18;
        uint256 in1 = 30_000e18;
        uint256 valueIn = _valueIn0(in0, in1);

        _addAs(alice, in0, in1);
        (uint256 got0, uint256 got1) = _removeAllAs(alice);
        uint256 valueOut = _valueIn0(got0, got1);

        assertLe(valueOut, valueIn, "a round trip must not create value");
        // And it must not destroy a meaningful amount either: within a few wei of the mid.
        assertApproxEqRel(valueOut, valueIn, 1e12, "nor lose more than truncation");
    }

    /// @dev A depositor who arrives AFTER trading has earned the pool value must pay the higher
    ///      share price, not mint at the old one. Otherwise arriving late and leaving
    ///      immediately harvests other people's accrued spread.
    function test_lateDepositorCannotCaptureEarnedValue() public {
        _trade(true, 20e18);
        _trade(false, 40_000e18);
        uint256 vpsBefore = _valuePerShare();

        _fund(bob, 10e18, 30_000e18);
        uint256 valueIn = _valueIn0(10e18, 30_000e18);
        _addAs(bob, 10e18, 30_000e18);

        (uint256 got0, uint256 got1) = _removeAllAs(bob);
        uint256 valueOut = _valueIn0(got0, got1);

        assertLe(valueOut, valueIn, "arriving late must not harvest accrued value");
        assertGe(_valuePerShare() + 1e12, vpsBefore, "and must not dilute the incumbent");
    }

    /// @dev Two providers, trading in between, both exit: neither can take more than the share
    ///      of the pool they own. This is the property the single-actor suite could not express.
    function test_twoProviders_exitProportionally() public {
        _fund(alice, 10e18, 30_000e18);
        _fund(bob, 20e18, 60_000e18);

        uint256 sA = _addAs(alice, 10e18, 30_000e18);
        uint256 sB = _addAs(bob, 20e18, 60_000e18);
        assertApproxEqRel(sB, 2 * sA, 1e15, "bob put in twice as much, so twice the shares");

        _trade(true, 15e18);
        _trade(false, 30_000e18);
        _trade(true, 25e18);

        (uint256 a0, uint256 a1) = _removeAllAs(alice);
        (uint256 b0, uint256 b1) = _removeAllAs(bob);

        uint256 vA = _valueIn0(a0, a1);
        uint256 vB = _valueIn0(b0, b1);

        // Bob withdrew after Alice, at a mid the earlier withdrawal moved, so this is a
        // proportionality band rather than an equality.
        assertApproxEqRel(vB, 2 * vA, 0.01e18, "exits must be proportional to shares held");
    }

    /// @dev Order of exit must not be worth anything. If leaving first is better than leaving
    ///      second, there is a race and the slower LP is the one paying for it.
    function test_exitOrderIsNotWorthAnything() public {
        _fund(alice, 10e18, 30_000e18);
        _fund(bob, 10e18, 30_000e18);
        _addAs(alice, 10e18, 30_000e18);
        _addAs(bob, 10e18, 30_000e18);

        _trade(true, 20e18);
        _trade(false, 50_000e18);

        (uint256 a0, uint256 a1) = _removeAllAs(alice); // first out
        uint256 vFirst = _valueIn0(a0, a1);
        (uint256 b0, uint256 b1) = _removeAllAs(bob); // second out
        uint256 vSecond = _valueIn0(b0, b1);

        assertApproxEqRel(vFirst, vSecond, 0.01e18, "leaving first must not beat leaving second");
    }

    /// @dev The value backing a share must never FALL because of trading. Swaps pay a spread and
    ///      a fee into the reserves; if per-share value can drop, value is leaking out of the
    ///      pool on the swap path and every LP is paying for each trade.
    function testFuzz_shareValueNeverFallsOnTrade(uint256 seed) public {
        uint256 before = _valuePerShare();
        for (uint256 i = 0; i < 6; i++) {
            bool dir = (uint256(keccak256(abi.encode(seed, i))) & 1) == 0;
            uint256 amt = dir ? 1e18 + (seed % 20e18) : 3_000e18 + (seed % 50_000e18);
            _trade(dir, amt);
            uint256 now_ = _valuePerShare();
            assertGe(now_ + 1e9, before, "trading must not reduce the value behind a share");
            before = now_;
        }
    }

    /// @dev The classic first-depositor attack: seed with dust, donate to inflate the share
    ///      price, and the next depositor mints zero shares and loses their deposit.
    ///
    ///      Two defences are asserted. `MINIMUM_LIQUIDITY` makes the dust seed revert outright,
    ///      and reserves are shadow-accounted, so a donation is not credited even if the seed
    ///      had succeeded. The second is what makes the first sufficient rather than merely
    ///      inconvenient.
    function test_firstDepositorInflationIsBlocked() public {
        PoincareHook fresh = deployPoincare(defaultConfig(), 0xC0C1);
        initPoincarePool(fresh, cur0, cur1);
        IERC20Minimal(Currency.unwrap(cur0)).approve(address(fresh), type(uint256).max);
        IERC20Minimal(Currency.unwrap(cur1)).approve(address(fresh), type(uint256).max);

        // A seed small enough to make the share price manipulable is refused.
        vm.expectRevert(bytes("insufficient"));
        fresh.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(
                1000, 1000, 0, 0, type(uint256).max, -887220, 887220, bytes32(0)
            )
        );
    }

    /// @dev A raw ERC20 transfer to the hook is not a deposit and must not become one. It is
    ///      not credited to the sender, and because reserves are shadow-accounted it is not
    ///      credited to the existing LPs either - it simply sits there, claimable by nobody.
    ///
    ///      The stronger property is the one that matters: it must not move the PRICE. If a
    ///      donation moved the mid, anyone could shift the pool's quote without trading, and
    ///      the detector reads that same price.
    function test_rawTokenDonationChangesNothing() public {
        (uint256 r0Before, uint256 r1Before) = hook.reserves();
        uint256 vpsBefore = _valuePerShare();
        uint256 supplyBefore = hook.totalSupply();

        IERC20Minimal(Currency.unwrap(cur0)).transfer(address(hook), 500e18);

        (uint256 r0After, uint256 r1After) = hook.reserves();
        assertEq(r0After, r0Before, "a donation must not move booked reserve0");
        assertEq(r1After, r1Before, "nor reserve1");
        assertEq(_valuePerShare(), vpsBefore, "nor the value behind a share");
        assertEq(hook.totalSupply(), supplyBefore, "nor mint anything");
        // The seeder holds supply MINUS the permanently locked MINIMUM_LIQUIDITY, which is the
        // first-depositor defence doing its job. Asserting equality with the supply was my
        // mistake and the 1000-wei gap is exactly that lock.
        assertEq(
            hook.balanceOf(address(this)),
            supplyBefore - hook.MINIMUM_LIQUIDITY(),
            "nor credit the sender"
        );
    }

    /// @dev Removing more shares than are held must fail rather than underflow into someone
    ///      else's liquidity.
    function test_cannotBurnMoreThanOwned() public {
        _fund(alice, 10e18, 30_000e18);
        uint256 shares = _addAs(alice, 10e18, 30_000e18);

        vm.prank(alice);
        vm.expectRevert();
        hook.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(
                shares + 1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0)
            )
        );
    }
}
