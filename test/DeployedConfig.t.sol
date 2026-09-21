// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PoincareConfig} from "../src/PoincareHook.sol";
import {DeployPoincareUnichain} from "../script/DeployPoincareUnichain.s.sol";
import {DirectionalSignal} from "../src/libraries/DirectionalSignal.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title The configuration that goes on chain, pinned.
///
/// @notice `frontend/deploy.mjs` and `script/DeployPoincareUnichain.s.sol` each carry their own
///         copy of the parameter set, and they have to agree: the script is what deploys, the
///         mjs is what the frontend reports the pool as running. They have drifted before.
///         These tests pin the script's values so a change has to be deliberate, and the
///         README table stops being true the moment one of them moves.
///
///         The values themselves come from the four-year study in
///         `test/optimal/GammaFourYear.t.sol`. Every assertion below names why the number is
///         what it is, so the next person to change one knows what they are overturning.
contract DeployedConfigTest is Test {
    DeployPoincareUnichain internal script;

    function setUp() public {
        script = new DeployPoincareUnichain();
    }

    function _cfg() internal view returns (PoincareConfig memory) {
        return script.exposedConfig();
    }

    /// @dev The gate is configured as a NOISE-WIDTH TARGET and derived, not set directly.
    ///
    ///      D's no-trend expectation is 1/sqrt(n) for n = 1/(1-lambda) effective samples, so a
    ///      raw dFloor means nothing except relative to that floor. 0.79 noise-widths was the
    ///      value the four-year study landed on; the previous configuration was 1.58 and spent
    ///      most real trends waiting.
    function test_gateTargetIsSeventyNineHundredths() public view {
        assertEq(_cfg().gateR, 79e16, "gateR must be 0.79 noise-widths; see README section 9.4");
    }

    /// @dev And the derivation lands where the hand-set value used to, which is the check that
    ///      this refactor did not quietly move the pool's behaviour. 0.79*sqrt(0.10) = 0.24982
    ///      against the 0.25 that was previously typed in: a 0.07% difference, which is the
    ///      rounding the old literal was hiding rather than a change of intent.
    function test_derivedGateMatchesTheOldLiteral() public view {
        uint256 derived = DirectionalSignal.gateFloorWad(_cfg().gateR, _cfg().lambda);
        assertApproxEqRel(derived, 25e16, 0.001e18, "derived gate should be ~0.25 at lambda 0.9");
    }

    /// @dev THE POINT OF THE REFACTOR: the gate tracks lambda automatically, so the class of
    ///      bug where someone retunes the memory and forgets the gate cannot happen. Asserted
    ///      across the range where the 1/sqrt(n) derivation is valid (n >= 10, so lambda >= 0.9).
    function testFuzz_gateTracksLambda(uint256 lambdaSeed) public pure {
        uint256 lambda = 9e17 + (lambdaSeed % 99e15); // [0.900, 0.999)
        uint256 r = 79e16;
        uint256 gate = DirectionalSignal.gateFloorWad(r, lambda);
        assertLt(gate, 1e18, "a gate at or above 1 can never be crossed");
        assertGt(gate, 0, "a zero gate disables the detector");
        // r is the ratio of the gate to the noise floor, so recovering it must round-trip.
        uint256 floor_ = Math.sqrt((1e18 - lambda) * 1e18);
        assertApproxEqRel((gate * 1e18) / floor_, r, 0.0001e18, "r must round-trip");
    }

    /// @dev Halved alongside the gate. This is the CONTROL, not a second improvement: the
    ///      lower gate doubles how often kappa is engaged, and without halving the cap the
    ///      pool would simply charge more. Halved, the mean fee is unchanged at 136bps.
    ///      It also halves the worst-case directional spread, tightening OPEN_ITEMS A3.
    function test_kappaMaxHalved() public view {
        assertEq(_cfg().kappaMax, 5e16, "kappaMax must be 0.05; see README section 8");
    }

    /// @dev Swept across four years and found already optimal in BOTH directions. k = 0.0005
    ///      and 0.002 each cost LP value, as do h = 0.002 and 0.01. Do not touch these
    ///      without re-running the sweep.
    function test_cusumSlackAndThresholdUnchanged() public view {
        assertEq(_cfg().k, 1e15, "k is at a swept local optimum");
        assertEq(_cfg().h, 5e15, "h is at a swept local optimum");
    }

    /// @dev sMax sits at the knee: flat above (0.04 and 0.08 change nothing), sharply worse
    ///      below (0.01 costs 162bps).
    function test_evidenceCapAtKnee() public view {
        assertEq(_cfg().sMax, 2e16, "sMax is at the knee of the sweep");
    }

    /// @dev lambda and the gate are NOT independent, and since this refactor that is enforced
    ///      by construction rather than by this assertion: the hook derives dFloor from lambda,
    ///      so there is no longer a way to move one without the other. What is still worth
    ///      pinning is lambda itself, and that the derived gate sits where the study put it.
    function test_lambdaPairedWithGate() public view {
        PoincareConfig memory c = _cfg();
        assertEq(c.lambda, 9e17, "lambda is what the gate is derived against");
        // n = 1/(1-lambda) effective samples; the derivation needs n >= 10 for 1/sqrt(n) to
        // hold, which is exactly where it was verified on four years of real returns.
        assertLe(1e18 - c.lambda, 1e17, "lambda must keep n >= 10 for the derivation to hold");
    }

    /// @dev The vol fee is a minor component next to the directional spread but the cap does
    ///      bind nearly always, so it is load-bearing for the mean fee the table reports.
    function test_volFeeUnchanged() public view {
        assertEq(_cfg().feeGamma, 5e17, "feeGamma 0.5");
        assertEq(_cfg().feeCap, 3e15, "feeCap 30bps");
    }

    /// @dev Curve shaping stays off. `alphaWad = 0` is a plain constant-product base, and the
    ///      directional lever is a SPREAD on that base, never a change in curvature. The
    ///      curvature lever was built, measured over four years and rejected; see
    ///      `analysis/OPEN_ITEMS.md` E1.
    function test_curveShapingIsOff() public view {
        assertEq(_cfg().alphaWad, 0, "alphaWad must stay 0: the lever is a spread, not curvature");
        assertEq(_cfg().kappaMin, 0, "symmetric when calm");
        assertFalse(_cfg().adaptive, "absolute thresholds, not adaptive-sigma mode");
    }

    /// @dev The clip never binds on this data (a 4h log return does not reach 20%), which is
    ///      the point: it is a tail guard against a single absurd print, not a tuning knob.
    function test_clipIsATailGuard() public view {
        assertEq(_cfg().clipWad, 2e17, "clip 20% per block");
    }

}
