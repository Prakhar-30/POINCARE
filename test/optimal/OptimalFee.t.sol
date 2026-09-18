// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

/// @title OptimalFee: the stochastic-control model, implemented and checked against its paper
///
/// @notice Poincaré already carries a volatility-scaled fee, `min(gamma*sigma, cap)`, whose
///         gamma and cap were picked by feel. "Optimal Dynamic Fees for Automated Market
///         Makers: A Stochastic Control Approach to Loss-Versus-Rebalancing"
///         (arXiv 2606.21769) derives what those should be, and the derivation is short
///         enough to reproduce rather than cite.
///
///         THE MODEL. Arbitrage is profitable only once mispricing exceeds the fee in log
///         terms, so a fee of `f` opens a no-arbitrage band of roughly [-f, f]. With blocks
///         arriving as a Poisson process of intensity lambda and instantaneous variance v,
///         the probability an arriving block carries a profitable trade is
///
///             P_trade(f, v) = 1 / (1 + eta),      eta = sqrt(2*lambda/v) * f
///
///         and the frictionless LVR rate of v/8 is attenuated by exactly that factor:
///
///             A(f, v) = (v/8) / (1 + eta)
///
///         so the share of LVR a fee eliminates is eta/(1 + eta). Uninformed turnover decays
///         with the fee as nu(f) = nu0 * exp(-alpha*f), and the LP's excess growth rate is
///
///             m(f, v) = f*nu(f) - A(f, v)
///
///         maximised pointwise in v. That last line is the whole reason a fee cannot simply
///         be raised until LVR vanishes: the band that stops the arbitrageur also drives off
///         the flow that pays for the pool.
///
///         WHY THIS MATTERS HERE. The ceiling in that paper, 93.1% of LVR eliminated by the
///         best static fee, is a ceiling for a SYMMETRIC fee, and it is set by the elasticity
///         of uninformed flow rather than by anything about arbitrage. A pool that can charge
///         asymmetrically is not bound by the same constraint, which is precisely what the
///         detector plus directional spread is for. This file establishes the baseline; the
///         comparison against Poincaré's structure builds on it.
contract OptimalFeeTest is Test {
    uint256 internal constant WAD = 1e18;

    /// @dev Poisson block arrival rate per year. The paper calibrates 2.63e6, which is a
    ///      twelve-second slot. Unichain produces roughly one block a second, so the pool
    ///      Poincaré actually runs on sits an order of magnitude above this; that is varied
    ///      explicitly below rather than assumed away, because eta scales with sqrt(lambda)
    ///      and therefore so does everything downstream.
    uint256 internal constant LAMBDA_12S = 2_630_000;
    uint256 internal constant LAMBDA_1S = 31_536_000;

    /// @dev Uninformed turnover semielasticity. The paper's calibration, which puts the
    ///      uninformed revenue peak at f = 1/alpha = 25bps.
    uint256 internal constant ALPHA = 400;

    /// @dev Base uninformed turnover, annualised, as a multiple of pool value.
    uint256 internal constant NU0 = 8 * WAD;

    /// @dev The paper's calibrated instantaneous VARIANCE, 0.36, which is 60% annual
    ///      volatility and the right order for ETH. Worth stating because the paper quotes
    ///      its frictionless LVR rate as "4.5% annually", and that is v/8 rather than v. The
    ///      first version of this file read 4.5% as the variance and reproduced 97.6% LVR
    ///      elimination at 37bps where the paper reports 93.1%; the check below is what
    ///      caught it.
    uint256 internal constant V_PAPER = 360e15;

    // -----------------------------------------------------------------------
    // the model
    // -----------------------------------------------------------------------

    /// @dev eta = sqrt(2*lambda/v) * f. All WAD.
    function _eta(uint256 fWad, uint256 vWad, uint256 lambda) internal pure returns (uint256) {
        uint256 ratio = FullMath.mulDiv(2 * lambda * WAD, WAD, vWad); // 2*lambda/v, WAD
        uint256 root = FixedPointMathLib.sqrt(ratio * WAD); // sqrt in WAD
        return FullMath.mulDiv(root, fWad, WAD);
    }

    /// @dev The share of frictionless LVR a fee eliminates: eta/(1+eta), in WAD.
    function lvrEliminated(uint256 fWad, uint256 vWad, uint256 lambda) public pure returns (uint256) {
        uint256 eta = _eta(fWad, vWad, lambda);
        return FullMath.mulDiv(eta, WAD, WAD + eta);
    }

    /// @dev Adverse-selection rate A(f,v) = (v/8)/(1+eta), in WAD per unit pool value per year.
    function adverseSelection(uint256 fWad, uint256 vWad, uint256 lambda) public pure returns (uint256) {
        uint256 eta = _eta(fWad, vWad, lambda);
        return FullMath.mulDiv(vWad / 8, WAD, WAD + eta);
    }

    /// @dev Uninformed turnover nu(f) = nu0 * exp(-alpha*f).
    function turnover(uint256 fWad) public pure returns (uint256) {
        int256 expo = -int256(ALPHA * fWad);
        return FullMath.mulDiv(NU0, uint256(FixedPointMathLib.expWad(expo)), WAD);
    }

    /// @dev LP excess growth m(f,v) = f*nu(f) - A(f,v). Signed: a fee can be net negative.
    function growth(uint256 fWad, uint256 vWad, uint256 lambda) public pure returns (int256) {
        uint256 revenue = FullMath.mulDiv(fWad, turnover(fWad), WAD);
        return int256(revenue) - int256(adverseSelection(fWad, vWad, lambda));
    }

    /// @dev Scan for the growth-maximising fee, 1bp resolution up to 300bps.
    function optimalFee(uint256 vWad, uint256 lambda) public pure returns (uint256 best, int256 bestM) {
        bestM = type(int256).min;
        for (uint256 bp = 1; bp <= 300; bp++) {
            uint256 f = bp * 1e14; // 1bp = 1e-4 = 1e14 wad
            int256 m = growth(f, vWad, lambda);
            if (m > bestM) {
                bestM = m;
                best = f;
            }
        }
    }

    // -----------------------------------------------------------------------
    // reproduce the paper, so the implementation is trusted before it is used
    // -----------------------------------------------------------------------

    /// @notice The paper's headline calibration: a 37bp static fee eliminates about 93.1% of
    ///         frictionless LVR. Reproducing that number from our own arithmetic is what
    ///         licenses every later use of this model.
    function test_reproducesPaperCalibration() public pure {
        uint256 v = V_PAPER;
        uint256 elim = lvrEliminated(37e14, v, LAMBDA_12S);
        (uint256 fStar,) = optimalFee(v, LAMBDA_12S);

        console2.log("v (annual variance, wad)     :", v);
        console2.log("LVR eliminated at 37bp (bps) :", elim / 1e14);
        console2.log("growth-optimal fee (bps)     :", fStar / 1e14);
        console2.log("LVR eliminated at f* (bps)   :", lvrEliminated(fStar, v, LAMBDA_12S) / 1e14);

        // The paper reports 93.1%; anything in this band confirms the model is implemented
        // as written rather than approximately remembered.
        assertGt(elim, 90e16, "37bp must eliminate ~93% of LVR");
        assertLt(elim, 96e16, "37bp must eliminate ~93% of LVR");
    }

    /// @notice The fee needed for a given LVR reduction, inverted in closed form. This is the
    ///         number the project actually wants: eta/(1+eta) = target implies
    ///         eta = target/(1-target), and f = eta * sqrt(v/(2*lambda)).
    function feeForTarget(uint256 targetWad, uint256 vWad, uint256 lambda) public pure returns (uint256) {
        uint256 eta = FullMath.mulDiv(targetWad, WAD, WAD - targetWad);
        uint256 ratio = FullMath.mulDiv(vWad, WAD, 2 * lambda * WAD);
        uint256 root = FixedPointMathLib.sqrt(ratio * WAD);
        return FullMath.mulDiv(eta, root, WAD);
    }

    /// @notice WHAT 95% ACTUALLY COSTS. The target is reachable, and the model says exactly
    ///         what it costs: pushing past the growth optimum buys LVR reduction by driving
    ///         away the uninformed flow that pays for the pool. Printed rather than asserted,
    ///         because the number is the point.
    function test_costOf95PercentTarget() public pure {
        uint256[3] memory vols = [uint256(160e15), V_PAPER, 1000e15]; // 40%, 60%, 100% annual vol
        uint256[2] memory lambdas = [LAMBDA_12S, LAMBDA_1S];

        for (uint256 li = 0; li < lambdas.length; li++) {
            console2.log("=== block rate per year:", lambdas[li], "===");
            for (uint256 i = 0; i < vols.length; i++) {
                uint256 v = vols[i];
                (uint256 fStar,) = optimalFee(v, lambdas[li]);
                uint256 f95 = feeForTarget(95e16, v, lambdas[li]);

                console2.log("  v (wad):", v);
                console2.log("    growth-optimal fee (bps) :", fStar / 1e14);
                console2.log("    its LVR elimination (bps):", lvrEliminated(fStar, v, lambdas[li]) / 1e14);
                console2.log("    fee for 95% elim   (bps) :", f95 / 1e14);
                console2.log("    turnover kept at f*  (%) :", (turnover(fStar) * 100) / NU0);
                console2.log("    turnover kept at f95 (%) :", (turnover(f95) * 100) / NU0);
            }
        }
    }

    /// @notice THE RESULT THIS PROJECT CAN ACT ON.
    ///
    ///         The hook does not know `v` or `lambda`. It knows sigma-hat: the exponentially
    ///         weighted mean absolute log-return PER SAMPLED BLOCK, which `DirectionalSignal`
    ///         already maintains. The fee it charges is `min(gamma * sigma-hat, cap)`, and
    ///         gamma was chosen by feel.
    ///
    ///         Gamma can be derived instead, and the derivation collapses to a constant.
    ///         Per-block variance is v/lambda, so per-block sigma is sqrt(v/lambda), and for a
    ///         roughly Gaussian increment the mean absolute value is sqrt(2/pi) of that:
    ///
    ///             sigma-hat = 0.7979 * sqrt(v/lambda)
    ///             sqrt(v/(2*lambda)) = sigma-hat / (0.7979 * sqrt(2)) = sigma-hat / 1.1284
    ///
    ///         and since the fee for a target elimination is eta_target * sqrt(v/(2*lambda)),
    ///
    ///             f_target = (eta_target / 1.1284) * sigma-hat = 0.886 * eta_target * sigma-hat
    ///
    ///         so **gamma = 0.886 * eta_target, with no dependence on volatility or block
    ///         rate at all**. Both sides carry the same sqrt(v/lambda) and it cancels. A
    ///         single constant, set once from the LVR reduction the pool is aiming at, tracks
    ///         the optimum across every regime and every chain by construction. That is what
    ///         the vol-scaled fee was always trying to be.
    ///
    ///         For 95%: eta = 0.95/0.05 = 19, so gamma = 16.8.
    ///         The deployed gamma is 0.5, which is an eta of 0.56 and eliminates about 36%.
    function test_gammaForTargetIsAVolatilityFreeConstant() public pure {
        uint256[3] memory targets = [uint256(90e16), 95e16, 97e16];
        for (uint256 i = 0; i < targets.length; i++) {
            uint256 eta = FullMath.mulDiv(targets[i], WAD, WAD - targets[i]);
            uint256 gamma = FullMath.mulDiv(886e15, eta, WAD);
            console2.log("target elimination (bps):", targets[i] / 1e14);
            console2.log("  implied eta (wad)     :", eta);
            console2.log("  required gamma (wad)  :", gamma);
        }

        // The claim that gamma is volatility-free: derive the fee from sigma-hat at three very
        // different volatilities and three block rates, and check the elimination lands on
        // target every time. If gamma secretly depended on either, this would fan out.
        uint256 gamma95 = FullMath.mulDiv(886e15, FullMath.mulDiv(95e16, WAD, 5e16), WAD);
        uint256[3] memory vs = [uint256(90e15), 360e15, 1440e15]; // 30%, 60%, 120% annual vol
        uint256[2] memory lams = [LAMBDA_12S, LAMBDA_1S];

        for (uint256 li = 0; li < lams.length; li++) {
            for (uint256 i = 0; i < vs.length; i++) {
                // sigma-hat the hook would measure at this v and block rate
                uint256 perBlockVar = FullMath.mulDiv(vs[i], WAD, lams[li] * WAD);
                uint256 perBlockSigma = FixedPointMathLib.sqrt(perBlockVar * WAD);
                uint256 sigmaHat = FullMath.mulDiv(perBlockSigma, 7979e14, WAD);

                uint256 f = FullMath.mulDiv(gamma95, sigmaHat, WAD);
                uint256 elim = lvrEliminated(f, vs[i], lams[li]);
                console2.log("  lambda / v / fee(bps) / elimination(bps):");
                console2.log("   ", lams[li], vs[i]);
                console2.log("   ", f / 1e14, elim / 1e14);

                assertGt(elim, 93e16, "target-derived gamma must hold across regimes");
                assertLt(elim, 97e16, "target-derived gamma must hold across regimes");
            }
        }
    }

    /// @notice What the deployed configuration actually achieves, on the model's own terms.
    ///         Recorded because it is the gap the branch exists to close.
    function test_deployedGammaIsFarBelowTarget() public pure {
        uint256 deployedGamma = 5e17; // feeGamma on the live hook
        uint256 etaDeployed = FullMath.mulDiv(deployedGamma, WAD, 886e15);
        uint256 elim = FullMath.mulDiv(etaDeployed, WAD, WAD + etaDeployed);
        console2.log("deployed gamma (wad)      :", deployedGamma);
        console2.log("implied eta (wad)         :", etaDeployed);
        console2.log("LVR eliminated (bps)      :", elim / 1e14);
        console2.log("gamma needed for 95% (wad):", FullMath.mulDiv(886e15, 19 * WAD, WAD));

        assertLt(elim, 50e16, "the deployed fee eliminates well under half of LVR");
    }

    /// @notice The property that makes a directional lever worth having. A symmetric fee is
    ///         bounded by the elasticity of uninformed flow: every basis point that widens the
    ///         no-arbitrage band is also charged to the traders who pay for the pool, so the
    ///         growth optimum sits well below the LVR-minimising fee. The gap between those
    ///         two fees is the room a detector can claim.
    function test_theGapADetectorCanClaim() public pure {
        uint256 v = V_PAPER;
        (uint256 fStar,) = optimalFee(v, LAMBDA_12S);
        uint256 f95 = feeForTarget(95e16, v, LAMBDA_12S);

        console2.log("growth-optimal fee (bps):", fStar / 1e14);
        console2.log("fee for 95% elim   (bps):", f95 / 1e14);
        // Turnover falls as the fee rises, so reaching 95% costs volume.
        console2.log("turnover kept at f*  (%):", (turnover(fStar) * 100) / NU0);
        console2.log("turnover kept at f95 (%):", (turnover(f95) * 100) / NU0);
        console2.log("share of that flow driven off (%):", 100 - (turnover(f95) * 100) / turnover(fStar));

        assertGt(f95, fStar, "95% elimination must sit above the symmetric growth optimum");
    }
}
