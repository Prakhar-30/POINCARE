// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {DirectionalSignal} from "../../src/libraries/DirectionalSignal.sol";
import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";
import {PoincareTestBase} from "../utils/PoincareTestBase.sol";

/// @title GateDerivation: adversarial tests for `dFloor = gateR * sqrt(1 - lambda)`.
///
/// @notice The gate is no longer a number someone types, it is a number the constructor computes,
///         and that trade is only worth making if the computation is right at the edges as well
///         as in the middle. A hand-set gate is wrong in one obvious way; a derived one can be
///         wrong in ways nobody looks at.
///
///         So this attacks the derivation rather than demonstrating it: the boundaries of
///         lambda, the boundaries of r, fixed-point truncation, monotonicity, and the algebraic
///         identity the whole thing rests on.
contract GateDerivationTest is Test {
    uint256 constant WAD = 1e18;

    // ---------------------------------------------------------------- the identity itself

    /// @dev The property that defines the function: recovering r from the gate it produced must
    ///      return r. If this holds across the range, the derivation is self-consistent whatever
    ///      else is true.
    function testFuzz_rRoundTrips(uint256 rSeed, uint256 lamSeed) public pure {
        // r in [0.05, 5.0] - far wider than anything sane, deliberately.
        uint256 r = 5e16 + (rSeed % 495e16);
        // lambda in [0.50, 0.999]: the whole plausible range, not just where it is used.
        uint256 lambda = 5e17 + (lamSeed % 499e15);

        uint256 gate = DirectionalSignal.gateFloorWad(r, lambda);
        vm.assume(gate > 0);

        uint256 noiseFloor = Math.sqrt((WAD - lambda) * WAD);
        uint256 recovered = (gate * WAD) / noiseFloor;

        // Truncation in mulDiv then again in the division back, so exactness is not available;
        // 1e-6 relative is far tighter than any consequence of being off.
        assertApproxEqRel(recovered, r, 1e12, "r must round-trip through the gate");
    }

    /// @dev The gate is the noise floor scaled by r, so at r = 1 it IS the noise floor. That is
    ///      the anchor the whole parameterisation is named after: "one noise-width".
    function testFuzz_rOfOneIsExactlyTheNoiseFloor(uint256 lamSeed) public pure {
        uint256 lambda = 1e16 + (lamSeed % 989e15); // [0.01, 0.999]
        uint256 gate = DirectionalSignal.gateFloorWad(WAD, lambda);
        assertEq(gate, Math.sqrt((WAD - lambda) * WAD), "r = 1 must give exactly E[D]");
    }

    // ---------------------------------------------------------------- monotonicity

    /// @dev More memory means more samples means a lower noise floor, so the same r implies a
    ///      LOWER gate. A detector that demanded more of a longer window would be backwards.
    function testFuzz_gateFallsAsLambdaRises(uint256 rSeed, uint256 lamSeed) public pure {
        uint256 r = 1e17 + (rSeed % 2e18);
        uint256 lo = 5e17 + (lamSeed % 4e17); // [0.50, 0.90)
        uint256 hi = lo + 5e16; // strictly more memory

        uint256 gateLo = DirectionalSignal.gateFloorWad(r, lo);
        uint256 gateHi = DirectionalSignal.gateFloorWad(r, hi);
        assertLt(gateHi, gateLo, "more memory must imply a lower gate for the same r");
    }

    /// @dev And demanding more noise-widths must raise the gate, at fixed memory.
    function testFuzz_gateRisesWithR(uint256 rSeed, uint256 lamSeed) public pure {
        uint256 lambda = 5e17 + (lamSeed % 499e15);
        uint256 rLo = 1e17 + (rSeed % 2e18);
        uint256 rHi = rLo + 1e17;

        assertLt(
            DirectionalSignal.gateFloorWad(rLo, lambda),
            DirectionalSignal.gateFloorWad(rHi, lambda),
            "a larger r must imply a larger gate"
        );
    }

    // ---------------------------------------------------------------- boundaries

    /// @dev lambda approaching 1 is an infinitely long window: the noise floor goes to zero and
    ///      so must the gate. It must not underflow to something nonsensical or revert.
    function test_lambdaNearOne_gateApproachesZero() public pure {
        uint256 r = 79e16;
        uint256 prev = type(uint256).max;
        uint256[5] memory lambdas =
            [uint256(999e15), 9999e14, 99999e13, 999999e12, 9999999e11]; // 0.999 -> 0.9999999
        for (uint256 i = 0; i < lambdas.length; i++) {
            uint256 gate = DirectionalSignal.gateFloorWad(r, lambdas[i]);
            assertLt(gate, prev, "gate must keep shrinking as the window grows");
            assertLt(gate, WAD, "gate must stay below 1");
            prev = gate;
        }
    }

    /// @dev lambda near 0 is a one-sample window: E[D] = 1, so the gate is r itself. A gate at or
    ///      above 1 can never be crossed, which is why the constructor rejects that pairing - but
    ///      the library must still compute it rather than revert, so the constructor can check.
    function test_lambdaNearZero_gateApproachesR() public pure {
        uint256 gate = DirectionalSignal.gateFloorWad(79e16, 1); // lambda = 1 wei
        assertApproxEqRel(gate, 79e16, 1e12, "with no memory the gate is r itself");

        // r > 1 at tiny lambda produces an uncrossable gate. The library reports it honestly;
        // rejecting it is the constructor's job, and `test_constructorRejects` covers that.
        assertGe(DirectionalSignal.gateFloorWad(2 * WAD, 1), WAD, "r = 2 with no memory is uncrossable");
    }

    /// @dev Zero r is a disabled gate. The library must say so plainly rather than divide by
    ///      anything or wrap.
    function testFuzz_zeroRGivesZeroGate(uint256 lamSeed) public pure {
        uint256 lambda = 1e15 + (lamSeed % 998e15);
        assertEq(DirectionalSignal.gateFloorWad(0, lambda), 0, "r = 0 disables the gate");
    }

    // ---------------------------------------------------------------- precision

    /// @dev The gate must never exceed what the exact real-valued computation would give, since
    ///      it is a threshold the detector must CROSS: rounding up would make the pool very
    ///      slightly harder to engage than configured, rounding down very slightly easier.
    ///      Either is immaterial in size; what matters is that the direction is known and stable
    ///      rather than discovered later.
    ///
    ///      `Math.sqrt` truncates and `mulDiv` truncates, so the result is bounded above by the
    ///      exact value. This pins that.
    function testFuzz_neverRoundsUp(uint256 rSeed, uint256 lamSeed) public pure {
        uint256 r = 1e16 + (rSeed % 3e18);
        uint256 lambda = 1e17 + (lamSeed % 899e15);

        uint256 gate = DirectionalSignal.gateFloorWad(r, lambda);

        // Recompute at higher precision: sqrt of a 1e36-scaled quantity gives 1e18 of headroom
        // to compare against, so truncation in the 1e18 path is visible.
        uint256 exactish = Math.sqrt((WAD - lambda) * WAD * 1e18); // sqrt scaled by 1e9 extra
        uint256 hiPrec = (r * exactish) / (WAD * 1e9);

        // The error bound has to be DERIVED, not guessed. `Math.sqrt` truncates by up to 1 unit
        // of its own result; that unit is then scaled by r/WAD in the multiply, and `mulDiv`
        // truncates by up to 1 more. So the gate can sit up to (r/WAD + 2) below the exact
        // value, and a constant tolerance is wrong for large r - which is exactly what the
        // fuzzer found when it picked r ~ 2.8 and the gap came to 3 wei against an allowance
        // of 2.
        uint256 tolerance = r / WAD + 2;
        assertLe(gate, hiPrec + 1, "the derived gate must not exceed the exact value");
        assertGe(gate + tolerance, hiPrec, "and must not fall further below than truncation allows");
    }

    /// @dev The deployed pairing, checked against a value computed outside Solidity.
    ///      0.79 * sqrt(0.10) = 0.79 * 0.31622776601683794 = 0.2498199351533020
    function test_deployedPairingMatchesIndependentArithmetic() public pure {
        uint256 gate = DirectionalSignal.gateFloorWad(79e16, 9e17);
        assertApproxEqAbs(gate, 249819935153302000, 1e6, "deployed gate must match hand arithmetic");
    }

    // ---------------------------------------------------------------- what it replaced

    /// @dev Every configuration in the repository, converted by its own lambda, must land on the
    ///      target it was recalibrated to. This is the check that the abstraction is real rather
    ///      than a coincidence at one point: three different gates at three different memories
    ///      collapsing onto one number is the whole claim.
    function test_everyRecalibratedConfigLandsOnTheSameTarget() public pure {
        // (dFloor as it used to be typed, lambda it was typed against)
        uint256[3] memory oldFloors = [uint256(25e16), 306e15, 353e15];
        uint256[3] memory lambdas = [uint256(9e17), 85e16, 8e17];

        for (uint256 i = 0; i < 3; i++) {
            uint256 noiseFloor = Math.sqrt((WAD - lambdas[i]) * WAD);
            uint256 impliedR = (oldFloors[i] * WAD) / noiseFloor;
            assertApproxEqRel(impliedR, 79e16, 0.002e18, "all three must imply r ~ 0.79");
        }
    }
}

/// @title GateConstructorGuards: the pairings the hook must refuse to deploy with.
///
/// @notice Deriving the gate removes the "retuned lambda, forgot the gate" bug, but it opens a
///         new way to be wrong: an r and a lambda that together produce a gate the detector can
///         never cross, or no gate at all. Those are configuration errors rather than choices,
///         so the constructor rejects them - and a guard nobody tests is a guard nobody has.
contract GateConstructorGuardsTest is PoincareTestBase {
    /// @dev D lives in [0,1]. A gate at or above 1 can never be crossed, so the detector would
    ///      be permanently disengaged and the pool would silently be a plain constant-product
    ///      AMM. Silently is the problem: it would look like it was working.
    function test_rejectsUncrossableGate() public {
        PoincareConfig memory c = defaultConfig();
        c.lambda = 1e15; // almost no memory, so E[D] ~ 1
        c.gateR = 2e18; // demand two noise-widths of a signal that cannot exceed one
        vm.expectRevert(bytes("gate >= 1"));
        deployPoincare(c, 0x9911);
    }

    /// @dev r = 0 disables the gate entirely, so every move engages the detector regardless of
    ///      how directionless it is. That is not a conservative setting, it is a broken one.
    function test_rejectsZeroGate() public {
        PoincareConfig memory c = defaultConfig();
        c.gateR = 0;
        vm.expectRevert(bytes("gateR cfg"));
        deployPoincare(c, 0x9912);
    }

    /// @dev The deployed pairing must of course still deploy, and land where §9.4 says.
    function test_acceptsTheDeployedPairing() public {
        PoincareConfig memory c = defaultConfig();
        c.lambda = 9e17;
        c.gateR = 79e16;
        PoincareHook h = deployPoincare(c, 0x9913);
        assertEq(h.gateR(), 79e16, "gateR stored as configured");
        assertApproxEqAbs(h.dFloor(), 249819935153302000, 1e6, "and dFloor derived from it");
    }

    /// @dev Across the range the derivation is valid for, ANY r in a sane band must deploy and
    ///      produce a crossable gate. This is the property that makes the parameter safe to
    ///      hand to someone: there is no pairing in normal use that bricks the detector.
    function testFuzz_anySaneParingDeploys(uint256 rSeed, uint256 lamSeed) public {
        PoincareConfig memory c = defaultConfig();
        c.lambda = 9e17 + (lamSeed % 99e15); // [0.900, 0.999): n >= 10
        c.gateR = 1e17 + (rSeed % 29e17); // [0.1, 3.0]
        PoincareHook h = deployPoincare(c, uint16(0xA000 + (rSeed % 4000)));
        uint256 gate = h.dFloor();
        assertGt(gate, 0, "a sane pairing must produce a live gate");
        assertLt(gate, 1e18, "and a crossable one");
    }
}
