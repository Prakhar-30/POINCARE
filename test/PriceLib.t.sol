// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {PriceLib} from "../src/libraries/PriceLib.sol";

/// @notice External wrapper so `vm.expectRevert` can observe reverts from the (otherwise
///         inlined) internal library functions at a lower call depth.
contract PriceLibHarness {
    function priceWad(uint256 r0, uint256 r1) external pure returns (uint256) {
        return PriceLib.priceWad(r0, r1);
    }

    function logReturnWad(uint256 p0, uint256 p1) external pure returns (int256) {
        return PriceLib.logReturnWad(p0, p1);
    }
}

/// @title PriceLibTest — coverage for reserve price + log-return derivation (CLAUDE.md §1.1)
/// @notice Proves the detector's input pipeline is real and correct: prices from reserves,
///         and log-returns that are signed correctly, vanish on no move, and COMPOSE
///         (consecutive log-returns sum to the log-return over the whole move). The
///         composition property is what makes EWMA-of-increments equal a windowed
///         net-log-displacement — the basis of the directional signal.
contract PriceLibTest is Test {
    uint256 internal constant WAD = 1e18;
    int256 internal constant LN2 = 693147180559945309; // ln(2) in WAD (reference)

    PriceLibHarness internal harness;

    function setUp() public {
        harness = new PriceLibHarness();
    }

    function test_priceWad_basic() public pure {
        // reserve1/reserve0 = 200/100 = 2.0
        assertEq(PriceLib.priceWad(100e18, 200e18), 2 * WAD, "price should be 2.0 WAD");
        assertEq(PriceLib.priceWad(100e18, 100e18), WAD, "equal reserves -> price 1.0");
    }

    function test_logReturn_noMove_isZero() public pure {
        assertEq(PriceLib.logReturnWad(WAD, WAD), 0, "unchanged price -> r = 0");
        assertEq(PriceLib.logReturnWad(5e18, 5e18), 0, "unchanged price -> r = 0 (any level)");
    }

    function test_logReturn_doubling_isLn2() public pure {
        int256 r = PriceLib.logReturnWad(WAD, 2 * WAD);
        assertApproxEqAbs(r, LN2, 1e6, "price doubling -> r = ln(2)");
        assertGt(r, 0, "an up-move must be positive");
    }

    function test_logReturn_halving_isNegLn2() public pure {
        int256 r = PriceLib.logReturnWad(2 * WAD, WAD);
        assertApproxEqAbs(r, -LN2, 1e6, "price halving -> r = -ln(2)");
        assertLt(r, 0, "a down-move must be negative");
    }

    function test_logReturn_upDownSymmetry() public pure {
        // Log-returns are symmetric: a 2x up then 0.5x down nets to ~zero (±1 wei rounding).
        int256 up = PriceLib.logReturnWad(WAD, 2 * WAD);
        int256 down = PriceLib.logReturnWad(2 * WAD, WAD);
        assertApproxEqAbs(up + down, 0, 2, "up then exact reversal must net to ~0 (log symmetry)");
    }

    /// @notice The composition property: r(p0->p1) + r(p1->p2) == r(p0->p2), the identity
    ///         that lets a sum of per-step log-returns equal the net log-displacement.
    ///         Prices are bounded to a realistic band (within ~4 orders of WAD); the
    ///         tolerance accounts for compounded lnWad + WAD-ratio-truncation precision.
    function testFuzz_logReturn_composes(uint256 p0, uint256 p1, uint256 p2) public pure {
        p0 = bound(p0, 1e16, 1e20);
        p1 = bound(p1, 1e16, 1e20);
        p2 = bound(p2, 1e16, 1e20);

        int256 a = PriceLib.logReturnWad(p0, p1);
        int256 b = PriceLib.logReturnWad(p1, p2);
        int256 whole = PriceLib.logReturnWad(p0, p2);

        // ~1e-9 relative on returns up to ~9.2e18 in this band; the identity is exact in
        // real arithmetic, this slack is pure fixed-point rounding.
        assertApproxEqAbs(a + b, whole, 1e10, "log-returns must compose additively");
    }

    function test_logReturnFromReserves_matchesPricePath() public pure {
        // x: 100 -> 100 (unchanged), y: 100 -> 200 : price 1.0 -> 2.0, so r = ln(2).
        int256 r = PriceLib.logReturnFromReserves(100e18, 100e18, 100e18, 200e18);
        assertApproxEqAbs(r, LN2, 1e6, "reserve path 1.0->2.0 -> r = ln(2)");
    }

    function test_priceWad_revertsOnZeroReserve0() public {
        vm.expectRevert();
        harness.priceWad(0, 100e18);
    }

    function test_logReturn_revertsOnZeroPrice() public {
        // lnWad(0) is undefined; a zero price must not silently produce a bogus return.
        vm.expectRevert();
        harness.logReturnWad(WAD, 0);
    }
}
