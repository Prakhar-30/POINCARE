// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

import {PoincareSim} from "./PoincareSim.sol";

/// @title ArrivalRate: how kappa_max should scale with how often the pool is sampled.
///
/// @notice THE ASTERISK ON EVERY NUMBER THIS BRANCH HAS PUBLISHED. The four-year study runs on
///         four-hour bars, so its lambda is 2,190 a year. The deployed hook samples once per
///         chain block, roughly one a second, so its lambda is about 31,500,000. That is a
///         factor of 14,400, and `kappa_max = 0.05` was chosen against the first of those.
///
///         THE THEORY MAKES A FALSIFIABLE PREDICTION, and it is already in this repo.
///         `OptimalFee.t.sol` carries Ghasemlu, "Optimal Dynamic Fees for Automated Market
///         Makers: A Stochastic Control Approach to Loss-Versus-Rebalancing"
///         (arXiv:2606.21769), in which the share of LVR a friction eliminates depends on
///
///             eta = sqrt(2 * lambda / v) * f
///
///         with v the instantaneous variance per unit TIME, not per bar. Holding eta fixed as
///         the sampling rate changes therefore requires
///
///             f  proportional to  1 / sqrt(lambda)
///
///         A pool sampled twice as often needs 1/sqrt(2) of the friction per sample to buy the
///         same protection. If that law holds for the directional spread as well as for a
///         symmetric fee, the per-block kappa_max follows from the per-bar one by arithmetic
///         rather than by another four-year search.
///
///         HOW IT IS TESTED HERE. The series can be coarsened but not refined: 4h data cannot
///         be turned into 1h data. So the law is measured over the range that IS observable -
///         strides of 1 through 24, a 24-fold sweep in lambda - by finding the LP-optimal
///         kappa_max at each cadence and fitting the exponent. If the measured exponent lands
///         near +0.5 in stride (equivalently -0.5 in lambda) the law holds on this market and
///         the extrapolation to block cadence is arithmetic on a verified relationship. If it
///         does not, the honest conclusion is that kappa_max cannot be derived this way and
///         needs live per-block data, and this file says so.
///
///         TWO MODELLING POINTS THAT WOULD OTHERWISE CONFOUND IT:
///
///         Uninformed flow is per unit time, not per bar. A one-day bar sees six times the
///         flow a four-hour bar does. `nu` is scaled by the stride, or coarse sampling would
///         look like a quieter market rather than the same market observed less often.
///
///         The optimum has to be interior, and it is only interior because flow elasticity is
///         in the model. Without `nu(f) = nu0 * exp(-alpha f)` LP value rises without bound in
///         the fee and "optimal kappa_max" is just "the cap", which measures nothing.
contract ArrivalRateTest is PoincareSim {
    /// @dev Every test here runs dozens of full four-year replays, which needs the lifted gas
    ///      and memory caps of the `sweep` profile. No-ops under a plain `forge test` so the
    ///      suite stays honest about gas everywhere else. Run with:
    ///        POINCARE_SWEEP=1 FOUNDRY_PROFILE=sweep forge test --match-path test/optimal/ArrivalRate.t.sol
    modifier sweepOnly() {
        if (!vm.envOr("POINCARE_SWEEP", false)) return;
        _;
    }

    /// @dev Sampling strides to measure the law over. 1 is the native 4h bar; 24 is four days.
    ///      A 24-fold sweep is what the data permits without inventing resolution it does not
    ///      have.
    function _strides() internal pure returns (uint256[6] memory s) {
        s[0] = 1;
        s[1] = 2;
        s[2] = 3;
        s[3] = 6;
        s[4] = 12;
        s[5] = 24;
    }

    /// @dev kappa_max candidates, spanning two orders of magnitude around the deployed 0.05 so
    ///      the optimum is bracketed at every cadence rather than pinned to an endpoint. An
    ///      optimum landing on the first or last entry is reported as unbracketed rather than
    ///      quietly taken as the answer.
    function _candidates() internal pure returns (uint256[11] memory k) {
        k[0] = 5e15; // 0.5%
        k[1] = 1e16; // 1%
        k[2] = 2e16; // 2%
        k[3] = 35e15; // 3.5%
        k[4] = 5e16; // 5%   (deployed)
        k[5] = 75e15; // 7.5%
        k[6] = 1e17; // 10%
        k[7] = 15e16; // 15%
        k[8] = 2e17; // 20%
        k[9] = 3e17; // 30%
        k[10] = 45e16; // 45%
    }

    uint256[] internal full;

    function setUp() public override {
        super.setUp();
        full = prices; // keep the native series; each cadence re-derives from it
    }

    /// @dev Replace the working series with every `stride`-th close of the native one.
    function _coarsen(uint256 stride) internal {
        delete prices;
        for (uint256 i = 0; i < full.length; i += stride) prices.push(full[i]);
    }

    /// @dev One replay at a given cadence and spread cap, returning LP value marked at fair.
    ///
    ///      Everything except kappa_max and the flow scaling is the deployed configuration, so
    ///      what is being measured is the cap and not some other difference.
    function _lpAt(uint256 stride, uint256 kappaMax)
        internal
        view
        returns (uint256 lp, uint256 arb, uint256 flowBps)
    {
        Pool memory p = _seed(5e17); // feeGamma 0.5, as deployed
        p.feeCapP = 3e15; // 30bps vol-fee cap, as deployed
        p.directional = true;
        p.pKappaMax = kappaMax;
        // flow is per unit time: a stride-fold longer bar carries stride-fold the notional
        p.nu = NU * stride;

        // THE CONFOUND THIS CONTROLS FOR, and the first run of this study did not.
        //
        // k and h are ABSOLUTE log-return units. Coarsening multiplies the per-bar return by
        // roughly sqrt(stride), so a fixed k = 0.001 filters five times less at stride 24 than
        // at stride 1 and the detector fires on noise it would otherwise ignore. Measured that
        // way, "optimal kappa_max versus cadence" is really "optimal kappa_max versus how badly
        // mis-scaled the thresholds are", which is a different and much less interesting
        // question.
        //
        // Self-normalised mode reads k, h and sMax as multiples of sigma-hat, so the detector
        // is the same detector at every cadence and the only thing varying is the arrival rate.
        // The multiples are the deployed absolutes expressed at this tape's mean sigma-hat of
        // 53bps: 0.001/0.0053, 0.005/0.0053, 0.02/0.0053.
        p.pDFloor = 25e16; // the deployed gate, r = 0.79 - not the pre-recalibration default
        p.selfNorm = true;
        p.pK = 188e15; // 0.188 sigma
        p.pH = 938e15; // 0.938 sigma
        p.pSMax = 375e16; // 3.75  sigma
        _drive(p);
        return (
            _lpValue(p, _fairPool(prices.length - 1)),
            p.lvr,
            p.steps == 0 ? 0 : (p.vol * 10_000) / (_nu(p) * p.steps)
        );
    }

    /// @dev The LP-optimal cap at one cadence, plus whether the optimum was bracketed.
    function _bestAt(uint256 stride) internal returns (uint256 bestK, uint256 bestLp, bool bracketed) {
        _coarsen(stride);
        uint256[11] memory cand = _candidates();
        uint256 bestI;
        for (uint256 i = 0; i < cand.length; i++) {
            (uint256 lp,,) = _lpAt(stride, cand[i]);
            if (lp > bestLp) {
                bestLp = lp;
                bestK = cand[i];
                bestI = i;
            }
        }
        bracketed = bestI > 0 && bestI < cand.length - 1;
    }

    /// @notice IS THE OBJECTIVE EVEN SENSITIVE TO kappa_max? Asked before any exponent is fitted.
    ///
    ///         An "optimal" parameter only means something if the objective has curvature in
    ///         it. If LP value barely moves across a ten-fold sweep of kappa_max, then the
    ///         argmax is picking out noise, the optimum pinning to an endpoint is not evidence
    ///         of anything, and a scaling law fitted through those points is a line through
    ///         numbers that were never determined in the first place.
    ///
    ///         This prints the whole curve at two cadences so that question is answered with
    ///         the spread rather than assumed away.
    function test_isKappaMaxEvenIdentified() public sweepOnly {
        uint256[2] memory strides = [uint256(1), uint256(12)];
        for (uint256 j = 0; j < strides.length; j++) {
            _coarsen(strides[j]);
            uint256[11] memory cand = _candidates();
            uint256 lo = type(uint256).max;
            uint256 hi;
            console2.log("== stride", strides[j], " bars:", prices.length);
            for (uint256 i = 0; i < cand.length; i++) {
                (uint256 lp,, uint256 fl) = _lpAt(strides[j], cand[i]);
                if (lp < lo) lo = lp;
                if (lp > hi) hi = lp;
                console2.log("   kappa_max bps / LP / flow bps:", cand[i] / 1e14, lp, fl);
            }
            console2.log("   spread across the sweep (wad):", hi - lo);
            console2.log("   spread as bps of the minimum:", ((hi - lo) * 10_000) / lo);
        }
    }

    /// @notice THE REGRESSION CHECK: is a higher cap actually better than the deployed 0.05?
    ///
    ///         Asked directly, at the native 4h cadence, on the deployed configuration, with
    ///         flow retention reported alongside so the answer cannot be bought by shedding
    ///         traders.
    ///
    ///         This is the one question on this page an LP would act on, and it is separable
    ///         from the cadence question: whatever the arrival-rate law turns out to be, the
    ///         4h-cadence comparison stands on its own.
    function test_deployedCapAgainstHigher() public sweepOnly {
        _coarsen(1);
        uint256[5] memory k = [uint256(5e16), 1e17, 15e16, 2e17, 3e17];
        (uint256 base,, uint256 baseFlow) = _lpAt(1, 5e16);
        console2.log("deployed kappa_max 500bps: LP", base, " flow bps", baseFlow);
        for (uint256 i = 1; i < k.length; i++) {
            (uint256 lp,, uint256 fl) = _lpAt(1, k[i]);
            console2.log("  kappa_max bps:", k[i] / 1e14);
            console2.log("    LP:", lp, " flow bps:", fl);
            console2.log("    vs deployed (bps of LP):", lp > base ? ((lp - base) * 10_000) / base : 0);
            console2.log("    flow given up (bps):", baseFlow > fl ? baseFlow - fl : 0);
        }
    }

    /// @notice THE MEASUREMENT. Optimal kappa_max against sampling cadence.
    ///
    ///         Reported as the raw pairs plus the implied exponent between the endpoints, so
    ///         the fit can be checked by eye against the predicted +0.5 in stride rather than
    ///         taken on trust.
    function test_optimalKappaMaxByCadence() public sweepOnly {
        uint256[6] memory st = _strides();
        uint256[6] memory bestK;
        uint256[6] memory bestLp;

        console2.log("stride | bars | lambda/yr | best kappa_max (bps) | LP at fair | bracketed");
        for (uint256 i = 0; i < st.length; i++) {
            (uint256 k, uint256 lp, bool ok) = _bestAt(st[i]);
            bestK[i] = k;
            bestLp[i] = lp;
            console2.log("  stride:", st[i], " bars:", prices.length);
            console2.log("    lambda/yr (approx):", uint256(2190) / st[i]);
            console2.log("    best kappa_max (bps):", k / 1e14);
            console2.log("    LP at fair:", lp);
            console2.log("    bracketed:", ok);
        }

        // Exponent between the endpoints: kappa ~ stride^b  =>  b = ln(kN/k1) / ln(sN/s1)
        uint256 kRatio = FullMath.mulDiv(bestK[5], WAD, bestK[0]);
        uint256 sRatio = FullMath.mulDiv(st[5], WAD, st[0]);
        int256 b = (FixedPointMathLib.lnWad(int256(kRatio)) * int256(WAD))
            / FixedPointMathLib.lnWad(int256(sRatio));
        console2.log("");
        console2.log("kappa ratio (wad, stride 24 / stride 1):", kRatio);
        console2.log("stride ratio (wad):", sRatio);
        console2.log("measured exponent b, kappa ~ stride^b (wad):", b);
        console2.log("theory predicts b = +0.5 (i.e. 5e17), from eta = sqrt(2*lambda/v)*f");
    }

    /// @notice What the measured law implies for the DEPLOYED sampling rate, and the honest
    ///         width of that claim.
    ///
    ///         Running this is the whole point: 4h bars are lambda 2,190 a year and a 1s chain
    ///         block is about 31,500,000, so the extrapolation spans 14,400x against a law
    ///         measured over 24x. That is stated as a range rather than a number, because a
    ///         long extrapolation on a fitted exponent deserves an error bar and not a decimal
    ///         point.
    function test_impliedPerBlockKappaMax() public sweepOnly {
        (uint256 k1,, bool ok1) = _bestAt(1);
        (uint256 k24,, bool ok24) = _bestAt(24);

        console2.log("optimal kappa_max at 4h bars (bps):", k1 / 1e14, "bracketed:", ok1);
        console2.log("optimal kappa_max at 4d bars (bps):", k24 / 1e14, "bracketed:", ok24);

        // Under the theoretical b = 1/2, moving from lambda_bar to lambda_block scales kappa by
        // sqrt(lambda_bar / lambda_block) = 1 / sqrt(14400) = 1/120.
        uint256 implied = k1 / 120;
        console2.log("");
        console2.log("IF the theoretical exponent holds, per-block kappa_max (wad):", implied);
        console2.log("  which in bps is:", implied / 1e14);
        console2.log("  against the deployed 0.05 = 500 bps");
        console2.log("");
        console2.log("Read the exponent from test_optimalKappaMaxByCadence before trusting this:");
        console2.log("  it is an extrapolation of 14,400x from a law measured over 24x.");
    }
}
