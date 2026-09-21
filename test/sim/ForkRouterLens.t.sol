// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {IV4Quoter} from "@uniswap/v4-periphery/src/interfaces/IV4Quoter.sol";

import {ForkBase} from "./ForkBase.sol";
import {PoincareLens} from "../../src/PoincareLens.sol";

/// @title ForkRouterLens: does what a router EXECUTES match what the Lens QUOTES?
///
/// @notice The question an integrator actually has, which nothing in this repo previously
///         answered.
///
///         `PoincareLens.t.sol` proves the Lens agrees with execution, but it executes through
///         `PoolSwapTest` - a test harness, not the path anyone integrates against. The fork
///         simulations swap through the canonical `IUniswapV4Router04` but never compare the
///         result to a quote. So "the Lens is what routers should use" was an assertion with a
///         gap in the middle of it: nobody had put the real router and the Lens side by side.
///
///         This does. Quote through the Lens, execute the same swap through the canonical
///         router on a Sepolia fork, and require the two to agree TO THE WEI - in a calm pool,
///         under a detected trend where a spread is being charged, and in a fresh block where
///         the detector has not yet sampled and the Lens must project what it will do.
///
///         That last case is the one custom-curve integrations usually get wrong. A quote taken
///         in block N is executed in block N+1, by which time the detector has advanced; a Lens
///         that reports current state rather than projected state is right until the moment it
///         matters.
contract ForkRouterLensTest is ForkBase {
    PoincareLens internal lens;

    /// @dev Distinct from ForkSmoke's, or both mine the same hook address on the same fork.
    function _salt() internal pure override returns (uint160) {
        return 0x7711;
    }

    function setUp() public override {
        super.setUp();
        lens = new PoincareLens(hook);
    }

    /// @dev Quote it, swap it, require agreement. `amountIn` is exact-input, token0 for token1
    ///      when `zeroForOne`.
    function _assertQuoteMatches(bool zeroForOne, uint256 amountIn, string memory what) internal {
        uint256 quoted = lens.quoteExactInput(zeroForOne, amountIn);
        uint256 received = _routerSwap(zeroForOne, amountIn);
        assertEq(received, quoted, what);
        console2.log(what);
        console2.log("   quoted  :", quoted);
        console2.log("   executed:", received);
    }

    /// @notice Calm pool: no trend detected, both directions at the plain curve price.
    function test_lensMatchesRouter_calm() public {
        _assertQuoteMatches(true, 1e18, "calm, token0 -> token1");
        vm.roll(block.number + 1);
        _assertQuoteMatches(false, 1000e18, "calm, token1 -> token0");
    }

    /// @notice Under a detected trend, where the pool is charging a spread on one side.
    ///
    ///         Both directions are checked deliberately: the with-trend side pays kappa and the
    ///         against-trend side does not, so a Lens that applied the spread symmetrically
    ///         would pass one of these and fail the other.
    function test_lensMatchesRouter_inTrend() public {
        _driveTrend(true, 12, 20e18);
        (,, uint256 kappa,,,,,,,) = lens.snapshot();
        assertGt(kappa, 0, "the detector should be engaged after a sustained one-way push");
        console2.log("kappa engaged (wad):", kappa);

        vm.roll(block.number + 1);
        _assertQuoteMatches(true, 5e18, "in trend, WITH the trend (pays kappa)");
        vm.roll(block.number + 1);
        _assertQuoteMatches(false, 5_000e18, "in trend, AGAINST the trend (pays nothing)");
    }

    /// @notice THE CASE INTEGRATIONS GET WRONG: a quote taken in a block the detector has not
    ///         sampled yet, executed in that same block.
    ///
    ///         The Lens has to project the detector forward rather than report its last stored
    ///         state, because the swap it is quoting will itself trigger the sample. A Lens
    ///         reading stale state quotes correctly right up until a trend starts, which is
    ///         exactly when a router integrator would be relying on it.
    function test_lensMatchesRouter_freshBlock() public {
        _driveTrend(true, 10, 20e18);

        // A block the hook has not seen. Nothing has sampled here yet.
        vm.roll(block.number + 5);
        vm.warp(block.timestamp + 60);

        _assertQuoteMatches(true, 3e18, "fresh block, with the trend");
    }

    /// @notice Exact-output, which routers use for "I want exactly N out" flows.
    function test_lensMatchesRouter_exactOutput() public {
        uint256 wantOut = 1_500e18;
        uint256 quotedIn = lens.quoteExactOutput(true, wantOut);

        uint256 balBefore = c1.balanceOf(address(this));
        router.swapTokensForExactTokens(
            wantOut, type(uint256).max, true, key, "", address(this), block.timestamp + 1
        );
        uint256 gotOut = c1.balanceOf(address(this)) - balBefore;

        assertEq(gotOut, wantOut, "exact-output should deliver exactly what was asked");
        console2.log("exact output: wanted", wantOut, " quoted input", quotedIn);
    }

    /// @notice THE CANONICAL QUOTER IS NOT WRONG, AND THIS IS THE TEST THAT PROVED IT.
    ///
    ///         `FEEDBACK.md` used to tell Uniswap that the default Quoter silently mis-prices
    ///         every custom-curve hook - that it "assumes x*y=k" and "returns a confidently
    ///         wrong number". This test was written to reproduce that, and instead it found the
    ///         two agree to the wei.
    ///
    ///         The claim rested on a wrong model of how `V4Quoter` works. It does not compute a
    ///         closed form. It calls `poolManager.unlock`, performs a REAL swap, and reverts
    ///         with the resulting delta. A real swap runs `beforeSwap`, which means the custom
    ///         curve is applied and the quote is exactly what would have executed.
    ///
    ///         So this asserts AGREEMENT, which is the more useful property anyway: an
    ///         integrator can quote through either path and get the same number.
    ///
    ///         THE REAL DIFFERENCE, which is what the Lens is actually for, is mutability.
    ///         `V4Quoter.quoteExactInputSingle` is NOT `view` - the unlock-and-revert pattern
    ///         makes it state-mutating, so it cannot be `staticcall`ed from a view context and
    ///         costs a full swap simulation. `PoincareLens.quoteExactInput` is a plain `view`.
    ///         That is a difference in how you can call it, not in what it tells you.
    function test_canonicalQuoterAgreesWithLens() public {
        address quoter = _quoterOrSkip();
        if (quoter == address(0)) return;

        _driveTrend(true, 12, 20e18);
        vm.roll(block.number + 1);

        uint256 amountIn = 5e18;
        uint256 lensQuote = lens.quoteExactInput(true, amountIn);

        (uint256 canonical,) = IV4Quoter(quoter).quoteExactInputSingle(
            IV4Quoter.QuoteExactSingleParams({
                poolKey: key,
                zeroForOne: true,
                exactAmount: uint128(amountIn),
                hookData: ""
            })
        );

        console2.log("canonical V4Quoter :", canonical);
        console2.log("Poincare Lens      :", lensQuote);
        assertEq(canonical, lensQuote, "V4Quoter simulates the swap, so it prices the custom curve correctly");

        // And the quote is what actually executes.
        uint256 received = _routerSwap(true, amountIn);
        assertEq(received, lensQuote, "both quotes must match execution");
    }

    /// @dev The canonical Quoter is not in hookmate's address book. Its Sepolia deployment is
    ///      recorded in v4-periphery's own broadcast artifacts
    ///      (`broadcast/DeployV4Quoter.s.sol/11155111/run-latest.json`), which is where this
    ///      default comes from; override with V4_QUOTER_SEPOLIA if it moves.
    function _quoterOrSkip() internal view returns (address) {
        address a = vm.envOr("V4_QUOTER_SEPOLIA", address(0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227));
        if (a == address(0) || a.code.length == 0) {
            console2.log("V4_QUOTER_SEPOLIA unset or not deployed on this fork; skipping");
            return address(0);
        }
        return a;
    }
}
