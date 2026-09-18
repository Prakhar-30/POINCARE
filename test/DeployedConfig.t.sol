// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PoincareConfig} from "../src/PoincareHook.sol";
import {DeployPoincareUnichain} from "../script/DeployPoincareUnichain.s.sol";

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

    /// @dev D = |sum r| / sum |r| has no-trend expectation 1/sqrt(n) for n = 1/(1-lambda)
    ///      effective samples. At lambda = 0.9, n = 10 and that floor is 0.316. The gate is
    ///      therefore r = dFloor/0.316 noise-widths of directionality. 0.25 is r = 0.79; the
    ///      previous 0.50 was r = 1.58 and spent most real trends waiting.
    function test_gateIsQuarter() public view {
        assertEq(_cfg().dFloor, 25e16, "dFloor must be 0.25; see README section 8");
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

    /// @dev lambda and dFloor are NOT independent. The gate is meaningful only as
    ///      r = dFloor/sqrt(1-lambda); holding r fixed while lambda moved from 0.9 to 0.98
    ///      changed LP value by under 0.5%. Moving lambda without moving dFloor silently
    ///      moves the gate, so this assertion exists to make that coupling visible.
    function test_lambdaPairedWithGate() public view {
        PoincareConfig memory c = _cfg();
        assertEq(c.lambda, 9e17, "lambda is paired with dFloor via r = dFloor/sqrt(1-lambda)");
        // r = dFloor / sqrt(1 - lambda), in WAD, checked to two decimals
        uint256 oneMinus = 1e18 - c.lambda; // 0.10
        uint256 sqrtWad = Math_sqrtWad(oneMinus); // 0.3162...
        uint256 r = (c.dFloor * 1e18) / sqrtWad;
        assertApproxEqAbs(r, 79e16, 1e16, "gate must sit at r ~ 0.79 noise-widths");
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

    /// @dev Integer sqrt in WAD, so the r assertion above does not need a library import.
    function Math_sqrtWad(uint256 xWad) internal pure returns (uint256) {
        uint256 z = (xWad + 1) / 2;
        uint256 y = xWad;
        while (z < y) {
            y = z;
            z = (xWad / z + z) / 2;
        }
        return y * 1e9; // sqrt(x * 1e18) == sqrt(x) * 1e9
    }
}
