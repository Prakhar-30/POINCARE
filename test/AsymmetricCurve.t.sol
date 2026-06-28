// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {AsymmetricCurve} from "../src/libraries/AsymmetricCurve.sol";

/// @title AsymmetricCurveTest — offset-hyperbola swap core (CLAUDE.md §7.3)
/// @notice Proves the single-curve safety guarantees the asymmetry layer will build on:
///         - every swap leaves the virtual invariant K = X·Y non-decreasing (no value
///           creation / the pool never loses) — for all 4 cases;
///         - a buy-then-sell round trip ON THE SAME CURVE cannot profit;
///         - exact-in / exact-out are mutually consistent;
///         - deeper (larger) proportional offsets reduce price impact (the depth lever);
///         - proportional offsets preserve the mid price (relevant to the asymmetry design).
/// @dev Reserves+offsets are bounded so the virtual product X·Y fits in uint256, letting the
///      K-invariant be asserted with a plain multiply (no 512-bit gymnastics in the test).
contract AsymmetricCurveTest is Test {
    using AsymmetricCurve for uint256;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant MAX = 1e24; // keeps virtual reserves <= ~3e24, product <= ~1e49

    // ---------------------------------------------------------------------
    // unit sanity: pure constant product (a = b = 0)
    // ---------------------------------------------------------------------

    function test_cpmm_exactIn_matchesClosedForm() public pure {
        // x = y = 100, in 10 token0 -> out = 100 - ceil(100*100/110) token1.
        uint256 out = AsymmetricCurve.swapExactIn(100e18, 100e18, 0, 0, 10e18, true);
        assertEq(out, 9090909090909090909, "constant-product exact-in closed form");
    }

    function test_cpmm_exactOut_matchesClosedForm() public pure {
        // Want 9.0909... token1 out; required token0 in is ~10 (rounded up).
        uint256 inAmt = AsymmetricCurve.swapExactOut(100e18, 100e18, 0, 0, 9090909090909090909, true);
        assertEq(inAmt, 10e18, "constant-product exact-out closed form");
    }

    // ---------------------------------------------------------------------
    // the core safety property: K never decreases
    // ---------------------------------------------------------------------

    function testFuzz_exactIn_neverDecreasesK(uint256 x, uint256 y, uint256 a, uint256 b, uint256 amountIn, bool z)
        public
        pure
    {
        x = bound(x, 1e9, MAX);
        y = bound(y, 1e9, MAX);
        a = bound(a, 0, MAX);
        b = bound(b, 0, MAX);
        amountIn = bound(amountIn, 1, MAX);

        uint256 X = x + a;
        uint256 Y = y + b;
        uint256 k = X * Y;

        uint256 out = AsymmetricCurve.swapExactIn(x, y, a, b, amountIn, z);

        // Recompute the post-swap virtual reserves and assert K did not shrink.
        (uint256 xNew, uint256 yNew) = z ? (X + amountIn, Y - out) : (X - out, Y + amountIn);
        assertGe(xNew * yNew, k, "exact-in must not decrease K");
        assertLt(out, z ? Y : X, "output cannot exceed the virtual reserve it draws from");
    }

    function testFuzz_exactOut_neverDecreasesK(uint256 x, uint256 y, uint256 a, uint256 b, uint256 amountOut, bool z)
        public
        pure
    {
        x = bound(x, 1e9, MAX);
        y = bound(y, 1e9, MAX);
        a = bound(a, 0, MAX);
        b = bound(b, 0, MAX);
        // Output must be feasible: not more than the real reserve on the output side.
        amountOut = z ? bound(amountOut, 1, y - 1) : bound(amountOut, 1, x - 1);

        uint256 X = x + a;
        uint256 Y = y + b;
        uint256 k = X * Y;

        uint256 inAmt = AsymmetricCurve.swapExactOut(x, y, a, b, amountOut, z);
        assertGt(inAmt, 0, "a positive output needs a positive input");

        (uint256 xNew, uint256 yNew) = z ? (X + inAmt, Y - amountOut) : (X - amountOut, Y + inAmt);
        assertGe(xNew * yNew, k, "exact-out must not decrease K");
    }

    // ---------------------------------------------------------------------
    // no round-trip profit on a single curve
    // ---------------------------------------------------------------------

    function testFuzz_roundTripSameCurve_noProfit(uint256 x, uint256 y, uint256 a, uint256 b, uint256 amountIn)
        public
        pure
    {
        x = bound(x, 1e15, MAX);
        y = bound(y, 1e15, MAX);
        a = bound(a, 0, MAX);
        b = bound(b, 0, MAX);
        amountIn = bound(amountIn, 1e6, x / 2); // keep within feasible, non-dust range

        // Buy token1 with token0, then immediately sell that token1 back, SAME (a,b).
        uint256 got1 = AsymmetricCurve.swapExactIn(x, y, a, b, amountIn, true);
        vm.assume(got1 > 0 && got1 < y); // feasible reverse
        uint256 back0 = AsymmetricCurve.swapExactIn(x - 0, y, a, b, got1, false);

        // On one curve, a round trip can never return more token0 than was put in.
        assertLe(back0, amountIn, "round trip on a single curve must not profit");
    }

    // ---------------------------------------------------------------------
    // exact-in / exact-out consistency
    // ---------------------------------------------------------------------

    function testFuzz_exactInOutConsistency(uint256 x, uint256 y, uint256 a, uint256 b, uint256 amountIn)
        public
        pure
    {
        x = bound(x, 1e15, MAX);
        y = bound(y, 1e15, MAX);
        a = bound(a, 0, MAX);
        b = bound(b, 0, MAX);
        amountIn = bound(amountIn, 1e6, x / 2);

        uint256 out = AsymmetricCurve.swapExactIn(x, y, a, b, amountIn, true);
        vm.assume(out > 0 && out < y);

        // The exact-out price for that same output must not ask for MORE than we paid.
        uint256 inNeeded = AsymmetricCurve.swapExactOut(x, y, a, b, out, true);
        assertLe(inNeeded, amountIn, "exact-out input must be consistent with exact-in");
    }

    // ---------------------------------------------------------------------
    // depth lever + mid-price preservation (proportional offsets)
    // ---------------------------------------------------------------------

    function test_deeperOffsets_reduceImpact() public pure {
        uint256 x = 100e18;
        uint256 y = 100e18;
        uint256 amountIn = 10e18;

        uint256 shallow = AsymmetricCurve.swapExactIn(x, y, 0, 0, amountIn, true);
        // Proportional offsets a = 5x, b = 5y keep the mid price but deepen the curve.
        uint256 deep = AsymmetricCurve.swapExactIn(x, y, 5 * x, 5 * y, amountIn, true);

        assertGt(deep, shallow, "deeper (larger) offsets must give a better output (less impact)");
        assertLt(deep, amountIn, "but still below the zero-impact amount");
    }

    function testFuzz_proportionalOffsets_preserveMid(uint256 x, uint256 y, uint256 alpha) public pure {
        x = bound(x, 1e12, MAX);
        y = bound(y, 1e12, MAX);
        alpha = bound(alpha, 0, 1000);

        uint256 midBase = AsymmetricCurve.marginalPriceWad(x, y, 0, 0);
        uint256 midDeep = AsymmetricCurve.marginalPriceWad(x, y, alpha * x, alpha * y);

        // a = αx, b = αy => (y+b)/(x+a) = y/x. Allow 1 wei for the two mulDiv roundings.
        assertApproxEqAbs(midDeep, midBase, 1, "proportional offsets must preserve the mid price");
    }

    // ---------------------------------------------------------------------
    // asymmetry layer: directional spread (arb-safe by construction)
    // ---------------------------------------------------------------------

    function test_spreadZero_equalsBase() public pure {
        uint256 base = AsymmetricCurve.swapExactIn(100e18, 100e18, 0, 0, 10e18, true);
        uint256 spread0 = AsymmetricCurve.swapExactInWithSpread(100e18, 100e18, 0, 0, 10e18, true, 0);
        assertEq(spread0, base, "zero spread must equal the base swap");
    }

    function test_spread_reducesOutput() public pure {
        uint256 base = AsymmetricCurve.swapExactIn(100e18, 100e18, 0, 0, 10e18, true);
        // 10% spread haircut.
        uint256 hit = AsymmetricCurve.swapExactInWithSpread(100e18, 100e18, 0, 0, 10e18, true, 1e17);
        assertLt(hit, base, "a positive spread must reduce the trader's output");
        assertApproxEqRel(hit, base * 9 / 10, 1e12, "10% spread -> ~90% of base output");
    }

    function test_spread_exactOut_increasesInput() public pure {
        uint256 base = AsymmetricCurve.swapExactOut(100e18, 100e18, 0, 0, 5e18, true);
        uint256 marked = AsymmetricCurve.swapExactOutWithSpread(100e18, 100e18, 0, 0, 5e18, true, 1e17);
        assertGt(marked, base, "a positive spread must increase the trader's input");
    }

    /// @notice THE core arb-safety gate: a buy-then-sell round trip across a SYMMETRIC-DEPTH
    ///         base with arbitrary non-negative directional spreads can never return more
    ///         token0 than was put in — for any reserves, offsets, size, and spreads. Reserves
    ///         are moved on the SAME curve between the two legs (real re-anchoring).
    function testFuzz_spreadRoundTrip_neverProfits(
        uint256 x,
        uint256 y,
        uint256 a,
        uint256 b,
        uint256 amountIn,
        uint256 spreadBuy,
        uint256 spreadSell
    ) public pure {
        x = bound(x, 1e15, MAX);
        y = bound(y, 1e15, MAX);
        a = bound(a, 0, MAX);
        b = bound(b, 0, MAX);
        amountIn = bound(amountIn, 1e6, y / 2); // spend token1 to buy token0
        spreadBuy = bound(spreadBuy, 0, 9e17); // up to 0.9 spread
        spreadSell = bound(spreadSell, 0, 9e17);

        // Leg 1 — buy token0 with `amountIn` token1 (oneForZero), hardened by spreadBuy.
        uint256 got0 = AsymmetricCurve.swapExactInWithSpread(x, y, a, b, amountIn, false, spreadBuy);
        vm.assume(got0 > 0 && got0 < x); // feasible

        // Move reserves along the SAME curve: pool received amountIn token1, paid got0 token0.
        uint256 x1 = x - got0;
        uint256 y1 = y + amountIn;

        // Leg 2 — sell that token0 back (zeroForOne), hardened by spreadSell.
        vm.assume(y1 > 1e6);
        uint256 back1 = AsymmetricCurve.swapExactInWithSpread(x1, y1, a, b, got0, true, spreadSell);

        assertLe(back1, amountIn, "spread round trip must never return more than was put in");
    }

    /// @notice Mirror of the above: sell-then-buy. Together they show the spread is arb-safe
    ///         in BOTH directions, for any non-negative spreads.
    function testFuzz_spreadRoundTripMirror_neverProfits(
        uint256 x,
        uint256 y,
        uint256 a,
        uint256 b,
        uint256 amountIn,
        uint256 spreadSell,
        uint256 spreadBuy
    ) public pure {
        x = bound(x, 1e15, MAX);
        y = bound(y, 1e15, MAX);
        a = bound(a, 0, MAX);
        b = bound(b, 0, MAX);
        amountIn = bound(amountIn, 1e6, x / 2); // spend token0 to get token1
        spreadSell = bound(spreadSell, 0, 9e17);
        spreadBuy = bound(spreadBuy, 0, 9e17);

        // Leg 1 — sell `amountIn` token0 for token1 (zeroForOne), hardened by spreadSell.
        uint256 got1 = AsymmetricCurve.swapExactInWithSpread(x, y, a, b, amountIn, true, spreadSell);
        vm.assume(got1 > 0 && got1 < y);

        uint256 x1 = x + amountIn;
        uint256 y1 = y - got1;

        // Leg 2 — buy token0 back with that token1 (oneForZero), hardened by spreadBuy.
        vm.assume(x1 > 1e6);
        uint256 back0 = AsymmetricCurve.swapExactInWithSpread(x1, y1, a, b, got1, false, spreadBuy);

        assertLe(back0, amountIn, "mirror spread round trip must never profit");
    }
}
