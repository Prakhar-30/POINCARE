// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

import {PoincareSim} from "./PoincareSim.sol";

/// @title GammaFourYear: does the derived gamma hold on four years of real returns?
///
/// @notice `OptimalFee.t.sol` derives gamma = 0.886 * eta_target from a stochastic-control
///         model and shows it is free of volatility and block rate. That is a statement about
///         a model. This is the statement about the market: the same rule, driven by 7,776
///         real ETH/USDC 4h closes, against a zero-fee pool that differs in nothing else.
///
///         The simulator itself lives in `PoincareSim.sol`; this file is the questions asked
///         of it.
contract GammaFourYearTest is PoincareSim {
    ///         v/8.
    function test_gammaSweep_fourYear() public view {
        Pool memory base = _run(0);
        console2.log("bars:", prices.length);
        console2.log("zero-fee arb extraction (token0 wei):", base.lvr);
        console2.log("");

        uint256[4] memory gammas = [uint256(1e18), 2e18, 4e18, 16834e15];
        for (uint256 i = 0; i < gammas.length; i++) {
            Pool memory p = _run(gammas[i]);
            uint256 elim = base.lvr > p.lvr ? ((base.lvr - p.lvr) * 10_000) / base.lvr : 0;
            console2.log("-- gamma (wad):", gammas[i]);
            console2.log("   mean fee charged (bps):", (p.feeSum / p.steps) / 1e14);
            console2.log("   arb extraction        :", p.lvr);
            console2.log("   LVR eliminated (bps)  :", elim);
            console2.log("   cost to uninformed    :", p.benign);
            // The number that decides anything: LVR saved per unit of trader cost.
            uint256 saved = base.lvr > p.lvr ? base.lvr - p.lvr : 0;
            console2.log("   saved per unit cost   :", p.benign > 0 ? saved / p.benign : 0);
        }
    }

    /// @notice CAN THE DIRECTIONAL SPREAD BREAK THE SYMMETRIC CEILING?
    ///
    ///         The symmetric fee saturates near 92% elimination and its efficiency falls
    ///         monotonically, because every basis point that widens the no-arbitrage band is
    ///         also charged to the traders who pay for the pool. That ceiling is a statement
    ///         about uninformed-flow elasticity, not about arbitrage, so a mechanism that
    ///         charges asymmetrically should not be bound by it.
    ///
    ///         The comparison has to be AT MATCHED ELIMINATION, not at matched gamma. Adding
    ///         a spread on top of a fee raises both elimination and cost, so of course it
    ///         "beats" the same fee alone. The question is whether it beats the symmetric fee
    ///         that reaches the SAME elimination, which is the only comparison that says
    ///         anything about the mechanism rather than about the dose.
    ///
    ///         Fee-only reference points, from test_gammaSweep_fourYear on this same series:
    ///           gamma 0.10 -> 57.90% eliminated, benign     9,743, saved/cost 781
    ///           gamma 0.25 -> 73.87% eliminated, benign    30,628, saved/cost 317
    ///           gamma 0.50 -> 83.93% eliminated, benign    84,069, saved/cost 131
    ///           gamma 1.00 -> 90.87% eliminated, benign   320,037, saved/cost  37
    function _directionalAt(uint256 gamma) internal view {
        Pool memory base = _run(0);
        Pool memory p = _runWith(gamma, true);
        uint256 saved = base.lvr > p.lvr ? base.lvr - p.lvr : 0;
        console2.log("gamma (wad)            :", gamma);
        console2.log("  fee + spread elim(bps):", (saved * 10_000) / base.lvr);
        console2.log("  cost to uninformed    :", p.benign);
        console2.log("  saved per unit cost   :", p.benign > 0 ? saved / p.benign : 0);
        console2.log("  mean kappa (bps)      :", (p.spreadSum / p.steps) / 1e14);
    }

    function test_directional_gamma010() public view {
        _directionalAt(1e17);
    }

    function test_directional_gamma025() public view {
        _directionalAt(25e16);
    }

    function test_directional_gamma050() public view {
        _directionalAt(5e17);
    }

    /// @dev One fixed configuration, reported in LP terms.
    function _fixedAt(uint256 gamma) internal view {
        uint256 fair = _fairPool(prices.length - 1);
        Pool memory f = _run(gamma);
        console2.log("gamma (wad):", gamma);
        console2.log("   LP value at fair:", _lpValue(f, fair));
        console2.log("   arb extracted   :", f.lvr);
        console2.log("   cost to benign  :", f.benign);
    }

    function test_fixed_g4() public view {
        _fixedAt(4e18);
    }

    function test_fixed_g8() public view {
        _fixedAt(8e18);
    }

    function test_fixed_g16() public view {
        _fixedAt(16e18);
    }

    function test_fixed_g05() public view {
        _fixedAt(5e17);
    }

    function test_fixed_g1() public view {
        _fixedAt(1e18);
    }

    function test_fixed_g2() public view {
        _fixedAt(2e18);
    }

    /// @notice THE LEARNER AGAINST THE FIXED CHOICES IT COULD HAVE MADE.
    ///
    ///         The point of a no-regret algorithm is not that it beats the best expert. It
    ///         cannot: the best expert is only knowable in hindsight, and the guarantee is
    ///         convergence TOWARD it at O(sqrt(T log N)). The point is that it gets close
    ///         without anyone having to choose, on a market nobody has seen yet.
    ///
    ///         Fixed references on this identical series, from the tests above:
    ///           gamma 0.10 -> LP 2,806,661
    ///           gamma 0.25 -> LP 2,866,640
    ///           gamma 0.50 -> LP 2,941,087   (deployed)
    ///           gamma 1.00 -> LP 3,047,147
    ///           gamma 2.00 -> LP 3,193,714
    function test_learner() public view {
        uint256 fair = _fairPool(prices.length - 1);
        Pool memory L = _runLearning();
        console2.log("multiplicative weights");
        console2.log("   LP value at fair:", _lpValue(L, fair));
        console2.log("   arb extracted   :", L.lvr);
        console2.log("   cost to benign  :", L.benign);
        console2.log("   final weights   :");
        uint256[N_EXPERTS] memory e = _experts();
        for (uint256 i = 0; i < N_EXPERTS; i++) console2.log("     gamma/weight", e[i], L.w[i]);
    }

    /// @notice WHAT AN LP WOULD ACTUALLY HAVE SAVED, over four years of real ETH/USDC.
    ///
    ///         Everything before this measured arbitrage extraction, which is the mechanism's
    ///         own scoreboard rather than the LP's. This reports LP value marked at the
    ///         external fair price, which nets fees earned, spread retained, arbitrage lost
    ///         and inventory carried into the one number a liquidity provider experiences.
    ///
    ///         The baseline is deliberately not a zero-fee pool. Nobody runs one. An ordinary
    ///         Uniswap position charges a static fee, so the comparison that means anything is
    ///         against 5bps and 30bps static pools holding the same assets over the same path.
    ///         Split one config per test. Five four-year replays in one call exhausts
    ///         the EVM memory limit in the harness, and a run that dies halfway reports
    ///         nothing at all.
    function test_lpsSaved_zeroFee() public view {
        _compare("zero-fee CPMM     ", _run(0));
    }

    function test_lpsSaved_uni05() public view {
        _compare("Uniswap 5bps      ", _runStatic(5e14));
    }

    function test_lpsSaved_uni30() public view {
        Pool memory p = _runStatic(30e14);
        assertEq(_lpValue(p, _fairPool(prices.length - 1)), UNI30_LP, "UNI30_LP is stale");
        _compare("Uniswap 30bps     ", p);
    }

    function test_lpsSaved_deployed() public view {
        _compare("Poincare deployed ", _runWith(5e17, true));
    }

    function test_lpsSaved_tunedG2() public view {
        _compare("Poincare gamma 2  ", _runWith(2e18, true));
    }

    function test_lpsSaved_tunedG4() public view {
        _compare("Poincare gamma 4  ", _runWith(4e18, true));
    }

    // ------------------------------------------------------------------------------------
    // THE UPGRADE REPORT: what replacing the deployed hook with the tracked quantile is
    // worth, in dollars, on four years of real ETH/USDC.
    //
    // The pool is seeded with 1,000,000 token0 and the matching amount of token1 at the
    // opening price. token0 is the quote asset, so `_lpValue` is denominated in it and every
    // figure printed by these tests is dollars on a $2,000,000 position.
    //
    // THREE REFERENCE POINTS, and the third is the one that matters to a liquidity provider:
    //   1. the deployed Poincare configuration, gamma 0.5 with the directional lever
    //   2. an ordinary Uniswap pool at 30bps, the thing most LPs are actually in
    //   3. BUY AND HOLD. An LP that ends below the value of simply keeping the two assets
    //      has done worse than doing nothing, whatever its fee revenue looked like. Almost
    //      every real position fails this test over a stretch where the volatile asset ran.
    //      ETH went from 1,308 to 2,481 across this window, so it is a demanding benchmark
    //      and the honest one.

    /// @dev Value of simply keeping the seeded assets, marked at the closing price.
    function _hodl() internal view returns (uint256) {
        Pool memory z = _seed(0);
        return _lpValue(z, _fairPool(prices.length - 1));
    }

    function _report(string memory name, Pool memory p) internal view {
        uint256 fair = _fairPool(prices.length - 1);
        uint256 v = _lpValue(p, fair);
        uint256 h = _hodl();
        console2.log(string.concat("== ", name));
        console2.log("   LP value at fair   :", v);
        console2.log("   arb extracted      :", p.lvr);
        console2.log("   cost to benign     :", p.benign);
        console2.log("   mean fee (bps)     :", (p.feeSum / p.steps) / 1e14);
        console2.log("   benign volume      :", p.vol);
        console2.log("   vs max volume (bps):", (p.vol * 10_000) / (NU * p.steps));
        _delta("   vs Uniswap 30bps   :", v, UNI30_LP);
        _delta("   vs Poincare live   :", v, DEPLOYED_LP);
        _delta("   vs buy and hold    :", v, h);
    }

    function _delta(string memory label, uint256 v, uint256 ref) internal pure {
        if (v >= ref) {
            console2.log(string.concat(label, " +"), v - ref, (((v - ref) * 10_000) / ref));
        } else {
            console2.log(string.concat(label, " -"), ref - v, (((ref - v) * 10_000) / ref));
        }
    }

    function test_report_hodl() public view {
        console2.log("buy and hold value  :", _hodl());
        console2.log("starting value      :", _lpValue(_seed(0), _fairPool(0)));
        console2.log("open price          :", prices[0]);
        console2.log("close price         :", prices[prices.length - 1]);
    }

    function test_report_uni30() public view {
        Pool memory p = _runStatic(30e14);
        assertEq(_lpValue(p, _fairPool(prices.length - 1)), UNI30_LP, "UNI30_LP is stale");
        _report("Uniswap 30bps        ", p);
    }

    /// @notice THE CONFIGURATION THAT IS ACTUALLY ON CHAIN.
    ///
    ///         `frontend/deploy.mjs` sets feeCap = 3e15, so the live vol fee is bounded at
    ///         30bps and that bound binds nearly all the time. Every earlier run on this
    ///         branch left the cap at 50%, which is not a cap at all, and so reported a hook
    ///         charging a 146bps mean fee. That pool has never existed.
    function test_report_deployedTrue() public view {
        _report("Poincare TRUE deployed", _runCapped(5e17, true, 3e15));
    }

    function test_report_deployed() public view {
        Pool memory p = _runWith(5e17, true);
        assertEq(_lpValue(p, _fairPool(prices.length - 1)), DEPLOYED_LP, "DEPLOYED_LP is stale");
        _report("Poincare as deployed ", p);
    }

    function test_report_tracked() public view {
        _report("Tracked quantile     ", _runACIWith(2e14, false));
    }

    function test_report_trackedDirectional() public view {
        _report("Tracked + directional", _runACIWith(2e14, true));
    }

    // ------------------------------------------------------------------------------------
    // ONE PARAMETER AT A TIME, AGAINST THE LIVE CONFIGURATION.
    //
    // Every run below is the deployed pool with exactly one number changed, so each line is
    // that parameter's partial derivative on four years of real ETH/USDC. Reported alongside
    // LP value is the flow retained, because a configuration that gains LP value purely by
    // charging more and keeping fewer traders has not improved anything, as the alpha sweep
    // showed. A parameter change is only interesting if it moves LP value at roughly
    // unchanged flow.

    /// @dev The parameter sweeps below run three to four full four-year replays each, which
    ///      needs the lifted gas and memory caps of the `sweep` profile. They are no-ops under
    ///      a plain `forge test` so the suite stays honest about gas everywhere else. Run them
    ///      with:
    ///        POINCARE_SWEEP=1 FOUNDRY_PROFILE=sweep forge test --match-path test/optimal/GammaFourYear.t.sol
    modifier sweepOnly() {
        if (!vm.envOr("POINCARE_SWEEP", false)) return;
        _;
    }

    /// @dev Which single parameter a sweep varies.
    enum P {
        K, // CUSUM slack
        H_, // CUSUM threshold
        SMAX, // evidence cap
        LAMBDA_, // EWMA decay
        DFLOOR, // directional-efficiency gate
        CLIP_, // Huber clip
        KAPPAMAX, // max directional spread
        DMAX, // kappa ramp rate
        GAMMA, // vol-fee multiplier
        FEECAP // vol-fee cap
    }

    function _apply(Pool memory p, P which, uint256 v) internal pure {
        if (which == P.K) p.pK = int256(v);
        else if (which == P.H_) p.pH = int256(v);
        else if (which == P.SMAX) p.pSMax = int256(v);
        else if (which == P.LAMBDA_) p.pLambda = v;
        else if (which == P.DFLOOR) p.pDFloor = v;
        else if (which == P.CLIP_) p.pClip = v;
        else if (which == P.KAPPAMAX) p.pKappaMax = v;
        else if (which == P.DMAX) p.pDMax = v;
        else if (which == P.GAMMA) p.gamma = v;
        else p.feeCapP = v;
    }

    /// @dev The live pool with one parameter overridden.
    function _runOne(P which, uint256 v) internal view returns (Pool memory p) {
        p = _seed(5e17); // feeGamma 0.5, as deployed
        p.feeCapP = 3e15; // 30bps cap, as deployed
        p.directional = true;
        _apply(p, which, v);
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
    }

    function _oat(string memory name, P which, uint256 v) internal view {
        Pool memory p = _runOne(which, v);
        uint256 lp = _lpValue(p, _fairPool(prices.length - 1));
        console2.log(name, v);
        console2.log("   LP  :", lp);
        console2.log("   arb :", p.lvr);
        console2.log("   flow:", (p.vol * 10_000) / (NU * p.steps));
        console2.log("   fee :", (p.feeSum / p.steps) / 1e14);
        if (lp >= TRUE_LP) console2.log("   d-LP: +", lp - TRUE_LP, ((lp - TRUE_LP) * 10_000) / TRUE_LP);
        else console2.log("   d-LP: -", TRUE_LP - lp, ((TRUE_LP - lp) * 10_000) / TRUE_LP);
    }

    uint256 internal constant TRUE_LP = 2_981_485_301_196_350_242_224_691;

    function test_oat_baseline() public view {
        _oat("baseline (no change), gamma", P.GAMMA, 5e17);
    }

    function test_oat_k() public view sweepOnly {
        _oat("k =", P.K, 5e14);
        _oat("k =", P.K, 1e15);
        _oat("k =", P.K, 2e15);
        _oat("k =", P.K, 4e15);
    }

    function test_oat_h() public view sweepOnly {
        _oat("h =", P.H_, 2e15);
        _oat("h =", P.H_, 5e15);
        _oat("h =", P.H_, 1e16);
        _oat("h =", P.H_, 2e16);
    }

    function test_oat_sMax() public view sweepOnly {
        _oat("sMax =", P.SMAX, 1e16);
        _oat("sMax =", P.SMAX, 2e16);
        _oat("sMax =", P.SMAX, 4e16);
        _oat("sMax =", P.SMAX, 8e16);
    }

    function test_oat_lambda() public view sweepOnly {
        _oat("lambda =", P.LAMBDA_, 7e17);
        _oat("lambda =", P.LAMBDA_, 9e17);
        _oat("lambda =", P.LAMBDA_, 95e16);
        _oat("lambda =", P.LAMBDA_, 98e16);
    }

    function test_oat_dFloor() public view sweepOnly {
        _oat("dFloor =", P.DFLOOR, 25e16);
        _oat("dFloor =", P.DFLOOR, 5e17);
        _oat("dFloor =", P.DFLOOR, 7e17);
        _oat("dFloor =", P.DFLOOR, 9e17);
    }

    function test_oat_clip() public view sweepOnly {
        _oat("clip =", P.CLIP_, 5e16);
        _oat("clip =", P.CLIP_, 1e17);
        _oat("clip =", P.CLIP_, 2e17);
        _oat("clip =", P.CLIP_, 4e17);
    }

    function test_oat_kappaMax() public view sweepOnly {
        _oat("kappaMax =", P.KAPPAMAX, 25e15);
        _oat("kappaMax =", P.KAPPAMAX, 5e16);
        _oat("kappaMax =", P.KAPPAMAX, 1e17);
        _oat("kappaMax =", P.KAPPAMAX, 2e17);
    }

    function test_oat_dMax() public view sweepOnly {
        _oat("dMax =", P.DMAX, 1e16);
        _oat("dMax =", P.DMAX, 5e16);
        _oat("dMax =", P.DMAX, 2e17);
        _oat("dMax =", P.DMAX, 1e18);
    }

    function test_oat_gamma() public view sweepOnly {
        _oat("gamma =", P.GAMMA, 25e16);
        _oat("gamma =", P.GAMMA, 5e17);
        _oat("gamma =", P.GAMMA, 1e18);
        _oat("gamma =", P.GAMMA, 2e18);
    }

    function test_oat_feeCap() public view sweepOnly {
        _oat("feeCap =", P.FEECAP, 1e15);
        _oat("feeCap =", P.FEECAP, 3e15);
        _oat("feeCap =", P.FEECAP, 1e16);
        _oat("feeCap =", P.FEECAP, 5e16);
    }

    // ------------------------------------------------------------------------------------
    // dFloor AND lambda ARE NOT TWO PARAMETERS. THEY ARE ONE.
    //
    // The one-at-a-time sweep says lambda is worth +105bps at 0.70 and -371bps at 0.98, and
    // dFloor is worth +382bps at 0.25 and -388bps at 0.90. Both look like strong independent
    // levers. They are not independent, and the reason is a two-line calculation.
    //
    // D is |sum of returns| / sum of |returns|. For an iid symmetric series of n samples the
    // numerator is the absolute value of a random walk, E|S_n| = sigma*sqrt(2n/pi), and the
    // denominator is n*E|r| = n*sigma*sqrt(2/pi). So under NO TREND
    //
    //     E[D] = sqrt(2n/pi) / (n*sqrt(2/pi)) = 1/sqrt(n)
    //
    // and with EWMA decay lambda the effective sample count is n = 1/(1-lambda). A gate at a
    // fixed dFloor therefore does not mean a fixed thing: it means whatever it happens to
    // mean relative to the noise floor that lambda sets. The quantity with meaning is the
    // ratio of the gate to that floor,
    //
    //     r = dFloor / E[D] = dFloor * sqrt(n) = dFloor / sqrt(1 - lambda)
    //
    // which is how many noise-widths of directionality the detector demands before it will
    // act. The live pool sits at r = 0.50/sqrt(0.10) = 1.58.
    //
    // THE PREDICTION, and it is falsifiable. If r is the only thing that matters then every
    // (lambda, dFloor) pair sharing an r should perform alike, and the whole of the lambda
    // sensitivity above is just r moving while dFloor stood still. The four pairs below all
    // hold r = 0.79 across lambda from 0.70 to 0.98, a sixteen-fold change in effective
    // window. If they land together the two parameters collapse into one.
    function _pair(uint256 lambda_, uint256 dFloor_) internal view {
        Pool memory p = _seed(5e17);
        p.feeCapP = 3e15;
        p.directional = true;
        p.pLambda = lambda_;
        p.pDFloor = dFloor_;
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
        uint256 lp = _lpValue(p, _fairPool(prices.length - 1));
        console2.log("lambda / dFloor:", lambda_, dFloor_);
        console2.log("   LP  :", lp);
        console2.log("   arb :", p.lvr);
        console2.log("   flow:", (p.vol * 10_000) / (NU * p.steps));
        console2.log("   fee :", (p.feeSum / p.steps) / 1e14);
    }

    /// @dev r = 0.79 held fixed while the effective window moves from 3.3 samples to 50.
    function test_collapse_r079() public view sweepOnly {
        _pair(7e17, 433e15); // n = 3.33
        _pair(9e17, 250e15); // n = 10
        _pair(95e16, 177e15); // n = 20
        _pair(98e16, 112e15); // n = 50
    }

    /// @dev The same four windows at the LIVE ratio r = 1.58, which should be uniformly worse
    ///      and, more to the point, uniformly worse by about the same amount.
    function test_collapse_r158() public view sweepOnly {
        _pair(7e17, 866e15);
        _pair(9e17, 5e17);
        _pair(95e16, 354e15);
        _pair(98e16, 224e15);
    }

    /// @dev A ratio sweep at fixed lambda, to locate the optimum in r.
    function test_collapse_rSweep() public view sweepOnly {
        _pair(9e17, 158e15); // r = 0.50
        _pair(9e17, 250e15); // r = 0.79
        _pair(9e17, 316e15); // r = 1.00
        _pair(9e17, 474e15); // r = 1.50
    }

    /// @dev Lowering r raises LP value, but it also raises the fee and sheds flow, and the
    ///      alpha sweep already showed how easily that masquerades as an improvement. To
    ///      separate the two, r is lowered and kappaMax lowered with it until the pool sits
    ///      back on the live flow retention of 34.12%. Whatever LP value survives at matched
    ///      flow is attributable to the detector gating better, not to the pool charging more.
    function _grid(uint256 dFloor_, uint256 kappaMax_) internal view {
        Pool memory p = _seed(5e17);
        p.feeCapP = 3e15;
        p.directional = true;
        p.pDFloor = dFloor_;
        p.pKappaMax = kappaMax_;
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
        uint256 lp = _lpValue(p, _fairPool(prices.length - 1));
        console2.log("dFloor / kappaMax:", dFloor_, kappaMax_);
        console2.log("   LP  :", lp);
        console2.log("   arb :", p.lvr);
        console2.log("   flow:", (p.vol * 10_000) / (NU * p.steps));
        console2.log("   fee :", (p.feeSum / p.steps) / 1e14);
    }

    function test_matched_r050() public view sweepOnly {
        _grid(158e15, 3e16);
        _grid(158e15, 4e16);
        _grid(158e15, 5e16);
        _grid(158e15, 7e16);
    }

    function test_matched_r030() public view sweepOnly {
        _grid(95e15, 2e16);
        _grid(95e15, 3e16);
        _grid(95e15, 4e16);
        _grid(95e15, 5e16);
    }

    function test_matched_r079() public view sweepOnly {
        _grid(250e15, 4e16);
        _grid(250e15, 5e16);
        _grid(250e15, 6e16);
        _grid(250e15, 8e16);
    }

    /// @dev What sigma-hat actually is on this tape, so k and h can be restated in units of
    ///      it rather than in units of nothing in particular.
    function test_sigmaScale() public view {
        Pool memory p = _seed(5e17);
        p.feeCapP = 3e15;
        p.directional = true;
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
        uint256 meanSigma = p.sigSum / p.steps;
        console2.log("mean sigma-hat (wad) :", meanSigma);
        console2.log("mean sigma-hat (bps) :", meanSigma / 1e14);
        console2.log("live k as multiple   :", (uint256(K_SLACK) * WAD) / meanSigma);
        console2.log("live h as multiple   :", (uint256(H) * WAD) / meanSigma);
        console2.log("live sMax as multiple:", (uint256(S_MAX) * WAD) / meanSigma);
    }

    /// @dev The self-normalised detector. k, h and sMax are passed as MULTIPLES of sigma-hat.
    ///      The live pool's absolute values correspond to 0.188, 0.938 and 3.75 at the mean
    ///      sigma-hat of this tape, so those multiples are the like-for-like starting point.
    function _sn(uint256 cK, uint256 cH, uint256 cS, uint256 dFloor_, uint256 kMax_)
        internal
        view
    {
        Pool memory p = _seed(5e17);
        p.feeCapP = 3e15;
        p.directional = true;
        p.selfNorm = true;
        p.pK = int256(cK);
        p.pH = int256(cH);
        p.pSMax = int256(cS);
        p.pDFloor = dFloor_;
        p.pKappaMax = kMax_;
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
        uint256 lp = _lpValue(p, _fairPool(prices.length - 1));
        console2.log("cK/cH/cS:", cK, cH, cS);
        console2.log("   dFloor/kappaMax:", dFloor_, kMax_);
        console2.log("   LP  :", lp);
        console2.log("   arb :", p.lvr);
        console2.log("   flow:", (p.vol * 10_000) / (NU * p.steps));
        console2.log("   fee :", (p.feeSum / p.steps) / 1e14);
    }

    /// @dev Like-for-like: the live configuration restated in sigma units, changing nothing
    ///      else. Any difference is the self-normalisation alone.
    function test_sn_likeForLike() public view {
        _sn(188e15, 938e15, 375e16, 5e17, 1e17);
    }

    function test_sn_hSweep() public view sweepOnly {
        _sn(188e15, 5e17, 375e16, 5e17, 1e17);
        _sn(188e15, 938e15, 375e16, 5e17, 1e17);
        _sn(188e15, 15e17, 375e16, 5e17, 1e17);
        _sn(188e15, 25e17, 375e16, 5e17, 1e17);
    }

    function test_sn_kSweep() public view sweepOnly {
        _sn(5e16, 938e15, 375e16, 5e17, 1e17);
        _sn(188e15, 938e15, 375e16, 5e17, 1e17);
        _sn(4e17, 938e15, 375e16, 5e17, 1e17);
        _sn(8e17, 938e15, 375e16, 5e17, 1e17);
    }

    /// @dev Self-normalisation combined with the two findings that survived the matched-flow
    ///      control: the gate at r = 0.79 and a kappaMax reduced to keep the operating point.
    function test_sn_combined() public view sweepOnly {
        _sn(188e15, 938e15, 375e16, 250e15, 5e16);
        _sn(188e15, 938e15, 375e16, 250e15, 8e16);
        _sn(188e15, 5e17, 375e16, 250e15, 8e16);
        _sn(188e15, 15e17, 375e16, 250e15, 8e16);
    }

    /// @notice THE DATASET HAS ONE HOLE, AND THIS CHECKS WHETHER IT MATTERS.
    ///
    ///         `eth_usdc_4h_4y.csv` spans four calendar years, 2022-09-19 to 2026-09-18, but
    ///         holds 7,776 bars where a gapless 4h series would hold 8,766. All of the
    ///         shortfall is one hole: 2022-09-29 to 2023-03-12, 3,940 hours, which the replay
    ///         necessarily treats as a single 4h step from $1,338 to $1,552. That one bar
    ///         hands the detector a 16% return and the arbitrageur a jump no real pool would
    ///         ever have faced in one block.
    ///
    ///         It is one bar in 7,776, but it is exactly the kind of bar this mechanism is
    ///         built around, so "small" is not good enough. Re-run from bar 60, past the hole,
    ///         and compare the conclusion rather than the level.
    function test_gapExcluded() public view {
        uint256 t1 = prices.length;
        uint256 ref = _row("  normal 30bps", 0, 0, 60, t1, 30e14);
        uint256 live = _row("  LIVE        ", 5e17, 1e17, 60, t1, 0);
        uint256 prop = _row("  PROPOSED    ", 250e15, 5e16, 60, t1, 0);
        console2.log("  LIVE     vs 30bps (bps):", live >= ref ? ((live - ref) * 10_000) / ref : 0);
        console2.log("  PROPOSED vs 30bps (bps):", prop >= ref ? ((prop - ref) * 10_000) / ref : 0);
        console2.log("  PROPOSED vs LIVE  (bps):", prop >= live ? ((prop - live) * 10_000) / live : 0);
    }

    // ------------------------------------------------------------------------------------
    // TIMESERIES DUMP, for the README figures.
    //
    // Four pools stepped over the identical path, sampled every 12 bars (two days) so the CSV
    // stays small enough to commit. Everything the plots need comes from one pass, so the
    // figures cannot drift out of step with the numbers in the table.
    string internal constant CSV = "analysis/simulation/realdata/fouryear_compare.csv";

    struct Quad {
        Pool a; // normal 5bps
        Pool b; // normal 30bps
        Pool c; // live
        Pool d; // proposed
    }

    function _mk(uint256 staticFee_, uint256 dFloor_, uint256 kappaMax_)
        internal
        view
        returns (Pool memory p)
    {
        _defaults(p);
        p.r0 = R0;
        p.r1 = FullMath.mulDiv(R0, WAD, prices[0]);
        p.lastP = FullMath.mulDiv(p.r1, WAD, p.r0);
        p.gamma = 5e17;
        p.feeCapP = 3e15;
        p.staticFee = staticFee_;
        p.directional = staticFee_ == 0;
        p.pDFloor = dFloor_;
        p.pKappaMax = kappaMax_;
    }

    function test_dumpTimeseries() public {
        Quad memory q;
        q.a = _mk(5e14, 0, 0);
        q.b = _mk(30e14, 0, 0);
        q.c = _mk(0, 5e17, 1e17);
        q.d = _mk(0, 250e15, 5e16);

        vm.writeFile(CSV, "");
        vm.writeLine(CSV, "bar,price,hodl,lp5,lp30,lpLive,lpProp,arb5,arb30,arbLive,arbProp,kLive,kProp,trendProp");
        for (uint256 t = 0; t < prices.length; t++) {
            uint256 fair = _fairPool(t);
            bool dir = (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0;
            _step(q.a, fair, dir);
            _step(q.b, fair, dir);
            _step(q.c, fair, dir);
            _step(q.d, fair, dir);
            if (t % 12 == 0 || t == prices.length - 1) _writeRow(q, t, fair);
        }
        console2.log("wrote", CSV);
    }

    function _writeRow(Quad memory q, uint256 t, uint256 fair) internal {
        Pool memory z = _mk(0, 0, 0);
        string memory line = string.concat(
            vm.toString(t),
            ",",
            vm.toString(prices[t]),
            ",",
            vm.toString(_lpValue(z, fair)),
            ",",
            vm.toString(_lpValue(q.a, fair)),
            ",",
            vm.toString(_lpValue(q.b, fair)),
            ",",
            vm.toString(_lpValue(q.c, fair)),
            ",",
            vm.toString(_lpValue(q.d, fair))
        );
        line = string.concat(
            line,
            ",",
            vm.toString(q.a.lvr),
            ",",
            vm.toString(q.b.lvr),
            ",",
            vm.toString(q.c.lvr),
            ",",
            vm.toString(q.d.lvr),
            ",",
            vm.toString(q.c.kappa),
            ",",
            vm.toString(q.d.kappa),
            ",",
            // the detected DIRECTION, not just the magnitude: the figures need to know which
            // side of the quote the spread is being charged on
            vm.toString(uint256(q.d.trend))
        );
        vm.writeLine(CSV, line);
    }

    // ------------------------------------------------------------------------------------
    // HEAD TO HEAD: THE LIVE CONFIGURATION AGAINST THE PROPOSED ONE.
    //
    // Everything identical except two numbers:
    //     dFloor    0.50 -> 0.25   (the gate, r = 1.58 -> 0.79)
    //     kappaMax  0.10 -> 0.05   (halved, to hold the operating point)
    //
    // kappaMax is halved deliberately and is not a second improvement. Dropping the gate
    // alone makes kappa engage far more often, which raises the mean fee and sheds flow, and
    // a pool that gains LP value by charging more has not improved. Halving the cap puts the
    // mean fee back where the live pool has it, so what is left is attributable to the
    // detector gating better rather than to the pool being more expensive.
    function _head(string memory name, uint256 dFloor_, uint256 kappaMax_) internal view {
        Pool memory p = _seed(5e17); // feeGamma 0.5, as deployed
        p.feeCapP = 3e15; // 30bps vol-fee cap, as deployed
        p.directional = true;
        p.pDFloor = dFloor_;
        p.pKappaMax = kappaMax_;
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
        uint256 fair = _fairPool(prices.length - 1);
        uint256 v = _lpValue(p, fair);
        console2.log(string.concat("== ", name));
        console2.log("   dFloor / kappaMax :", dFloor_, kappaMax_);
        console2.log("   LP value at fair  :", v);
        console2.log("   arb extracted     :", p.lvr);
        console2.log("   cost to benign    :", p.benign);
        console2.log("   mean fee (bps)    :", (p.feeSum / p.steps) / 1e14);
        console2.log("   flow retained(bps):", (p.vol * 10_000) / (NU * p.steps));
        console2.log("   bars in trend(bps):", (p.trendBars * 10_000) / p.steps);
        _delta("   vs Uniswap 30bps  :", v, UNI30_LP);
        _delta("   vs buy and hold   :", v, _hodl());
        _delta("   vs live config    :", v, TRUE_LP);
    }

    function test_head_deployed() public view {
        _head("LIVE as deployed  ", 5e17, 1e17);
    }

    function test_head_proposed() public view {
        _head("PROPOSED          ", 250e15, 5e16);
    }

    /// @notice YEAR BY YEAR, because one four-year number can be a single lucky episode.
    ///
    ///         Each year is run as an INDEPENDENT pool seeded at that year's opening price,
    ///         so a good or bad start does not carry forward and each row is its own
    ///         experiment. If the gate change is real it should win in most years rather than
    ///         winning enormously in one.
    /// @dev `staticFee` non-zero runs an ordinary constant-fee pool instead of the hook, on
    ///      the identical path, so the three sit in one table rather than three.
    function _slice(uint256 dFloor_, uint256 kappaMax_, uint256 t0, uint256 t1)
        internal
        view
        returns (uint256 lp, uint256 arb, uint256 flow)
    {
        return _sliceFee(dFloor_, kappaMax_, t0, t1, 0);
    }

    function _sliceFee(uint256 dFloor_, uint256 kappaMax_, uint256 t0, uint256 t1, uint256 staticFee_)
        internal
        view
        returns (uint256 lp, uint256 arb, uint256 flow)
    {
        Pool memory p;
        _defaults(p);
        p.r0 = R0;
        p.r1 = FullMath.mulDiv(R0, WAD, prices[t0]);
        p.lastP = FullMath.mulDiv(p.r1, WAD, p.r0);
        p.gamma = 5e17;
        p.feeCapP = 3e15;
        p.staticFee = staticFee_;
        p.directional = staticFee_ == 0;
        p.pDFloor = dFloor_;
        p.pKappaMax = kappaMax_;
        for (uint256 t = t0; t < t1; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
        lp = _lpValue(p, _fairPool(t1 - 1));
        arb = p.lvr;
        flow = (p.vol * 10_000) / (NU * p.steps);
    }

    /// @notice THE THREE POOLS SIDE BY SIDE, year by year, on one path.
    ///
    ///         "Normal" is an ordinary constant-fee Uniswap position. Both 5bps and 30bps are
    ///         shown because ETH/USDC liquidity really sits in both, and the two bracket what
    ///         an LP would otherwise have been holding.
    function _year3way(uint256 n) internal view {
        uint256 per = prices.length / 4;
        uint256 t0 = n * per;
        uint256 t1 = n == 3 ? prices.length : t0 + per;
        console2.log("YEAR:", n);
        console2.log("  price:", prices[t0], prices[t1 - 1]);
        _row("  normal  5bps", 0, 0, t0, t1, 5e14);
        uint256 ref = _row("  normal 30bps", 0, 0, t0, t1, 30e14);
        uint256 live = _row("  LIVE        ", 5e17, 1e17, t0, t1, 0);
        uint256 prop = _row("  PROPOSED    ", 250e15, 5e16, t0, t1, 0);
        console2.log("  LIVE     vs 30bps (bps):", live >= ref ? ((live - ref) * 10_000) / ref : 0);
        console2.log("  PROPOSED vs 30bps (bps):", prop >= ref ? ((prop - ref) * 10_000) / ref : 0);
    }

    /// @dev Runs one slice and prints it, so the caller never holds four sets of three
    ///      return values on the stack at once.
    function _row(
        string memory name,
        uint256 dFloor_,
        uint256 kappaMax_,
        uint256 t0,
        uint256 t1,
        uint256 staticFee_
    ) internal view returns (uint256) {
        (uint256 lp, uint256 arb, uint256 flow) = _sliceFee(dFloor_, kappaMax_, t0, t1, staticFee_);
        console2.log(string.concat(name, " LP/arb/flow:"), lp, arb, flow);
        return lp;
    }

    function test_year3way_0() public view {
        _year3way(0);
    }

    function test_year3way_1() public view {
        _year3way(1);
    }

    function test_year3way_2() public view {
        _year3way(2);
    }

    function test_year3way_3() public view {
        _year3way(3);
    }

    function _year(uint256 n) internal view {
        uint256 per = prices.length / 4;
        uint256 t0 = n * per;
        uint256 t1 = n == 3 ? prices.length : t0 + per;
        (uint256 lpL, uint256 arbL, uint256 fL) = _slice(5e17, 1e17, t0, t1);
        (uint256 lpP, uint256 arbP, uint256 fP) = _slice(250e15, 5e16, t0, t1);
        console2.log("year (0-indexed):", n);
        console2.log("   start / end price:", prices[t0], prices[t1 - 1]);
        console2.log("   LIVE      LP/arb/flow:", lpL, arbL, fL);
        console2.log("   PROPOSED  LP/arb/flow:", lpP, arbP, fP);
        if (lpP >= lpL) console2.log("   PROPOSED ahead by (bps):", ((lpP - lpL) * 10_000) / lpL);
        else console2.log("   PROPOSED BEHIND by (bps):", ((lpL - lpP) * 10_000) / lpL);
    }

    function test_year0() public view {
        _year(0);
    }

    function test_year1() public view {
        _year(1);
    }

    function test_year2() public view {
        _year(2);
    }

    function test_year3() public view {
        _year(3);
    }

    // ------------------------------------------------------------------------------------
    // DO THE FINDINGS COMPOSE?
    //
    // Three changes survived the matched-flow control on their own: the gate dropped to
    // r = 0.79 (dFloor 0.25 at lambda 0.9), the kappa ramp slowed to dMax 0.01, and the vol
    // fee cap raised from 30bps to 100bps. Each was measured with everything else held at the
    // live value, so nothing yet says they can be applied together. They interact through the
    // same kappa, so they might well cancel.
    struct Cfg {
        uint256 dFloor;
        uint256 dMax;
        uint256 kappaMax;
        uint256 feeCap;
        uint256 gamma;
    }

    function _cfg(string memory name, Cfg memory c) internal view {
        Pool memory p = _seed(c.gamma);
        p.feeCapP = c.feeCap;
        p.directional = true;
        p.pDFloor = c.dFloor;
        p.pDMax = c.dMax;
        p.pKappaMax = c.kappaMax;
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
        uint256 lp = _lpValue(p, _fairPool(prices.length - 1));
        console2.log(name);
        console2.log("   LP  :", lp);
        console2.log("   arb :", p.lvr);
        console2.log("   flow:", (p.vol * 10_000) / (NU * p.steps));
        console2.log("   fee :", (p.feeSum / p.steps) / 1e14);
    }

    function _live() internal pure returns (Cfg memory) {
        return Cfg(5e17, 5e16, 1e17, 3e15, 5e17);
    }

    function test_compose_live() public view {
        _cfg("live", _live());
    }

    function test_compose_dMaxOnly() public view {
        Cfg memory c = _live();
        c.dMax = 1e16;
        _cfg("dMax 0.01", c);
    }

    function test_compose_gateOnly() public view {
        Cfg memory c = _live();
        c.dFloor = 250e15;
        c.kappaMax = 5e16;
        _cfg("gate r=0.79 + kappaMax 0.05", c);
    }

    function test_compose_gatePlusDMax() public view {
        Cfg memory c = _live();
        c.dFloor = 250e15;
        c.kappaMax = 5e16;
        c.dMax = 1e16;
        _cfg("gate + dMax", c);
    }

    function test_compose_all() public view {
        Cfg memory c = _live();
        c.dFloor = 250e15;
        c.kappaMax = 5e16;
        c.dMax = 1e16;
        c.feeCap = 1e16;
        _cfg("gate + dMax + feeCap 1%", c);
    }

    function test_compose_allTunedKappa() public view {
        Cfg memory c = _live();
        c.dFloor = 250e15;
        c.dMax = 1e16;
        c.feeCap = 1e16;
        c.kappaMax = 7e16;
        _cfg("gate + dMax + feeCap, kappaMax 0.07", c);
    }

    function test_compose_allLowFlow() public view {
        Cfg memory c = _live();
        c.dFloor = 250e15;
        c.dMax = 1e16;
        c.feeCap = 1e16;
        c.kappaMax = 3e16;
        _cfg("gate + dMax + feeCap, kappaMax 0.03", c);
    }

    // ------------------------------------------------------------------------------------
    // MATCHING THE OPERATING POINT, WHICH IS THE ONLY FAIR COMPARISON.
    //
    // At alpha = 0.20 the tracker posts a 231bps mean fee and retains 0.27% of uninformed
    // flow against the deployed hook's 32%. It "wins" on LP value by becoming a pool almost
    // nobody trades with, and that is not a win: this harness has a captive LP with no
    // competing venue, so a pool that drives flow away looks profitable here and would
    // simply be abandoned in reality.
    //
    // The cause is regime, not mechanism. alpha is the frequency of being picked off PER
    // SAMPLE, and a sample here is a four-hour bar. Tolerating a pickoff on only one bar in
    // five, when each bar carries four hours of price movement, demands an enormous fee. The
    // live hook samples once per block, where the per-sample move is tiny and the same alpha
    // costs almost nothing. The file header already puts that gap at four orders of
    // magnitude in lambda.
    //
    // So alpha has to be re-targeted for the replay before any dollar figure means anything.
    // Swept here against the operating point the deployed hook actually occupies.
    function _sweepTarget(uint256 target) internal view {
        Pool memory p = _runACITuned(2e14, true, target);
        uint256 v = _lpValue(p, _fairPool(prices.length - 1));
        console2.log("alpha (wad)          :", target);
        console2.log("   mean fee (bps)    :", (p.feeSum / p.steps) / 1e14);
        console2.log("   flow retained(bps):", (p.vol * 10_000) / (NU * p.steps));
        console2.log("   LP value at fair  :", v);
        console2.log("   arb extracted     :", p.lvr);
        console2.log("   cost to benign    :", p.benign);
        _delta("   vs Poincare live  :", v, DEPLOYED_LP);
    }

    function test_target_a20() public view {
        _sweepTarget(2e17);
    }

    function test_target_a50() public view {
        _sweepTarget(5e17);
    }

    /// @dev The deployed hook retains 32.00% of uninformed flow. This is the tracker setting
    ///      that sits on the same operating point, so the dollar difference between the two
    ///      is attributable to the mechanism rather than to one of them having chased its
    ///      traders off.
    function test_target_a60_matchedToDeployed() public view {
        _sweepTarget(6e17);
    }

    function test_target_a70() public view {
        _sweepTarget(7e17);
    }

    function test_target_a85() public view {
        _sweepTarget(85e16);
    }

    function test_target_a95() public view {
        _sweepTarget(95e16);
    }

    /// @notice QUANTILE TRACKING ON FOUR YEARS, AT THREE STEP SIZES.
    ///
    ///         The step size is the only knob, and it trades adaptability against stability
    ///         exactly as the conformal literature says it does. Small steps track a stable
    ///         quantile and react slowly; large steps chase the tape. It is also the one
    ///         parameter Gibbs and Candes returned to remove, in the 2024 follow-up, by
    ///         running several step sizes as experts under multiplicative weights, which is
    ///         the same construction already sitting in `_learn` above.
    function test_aci_step1bp() public view {
        _aciAt(1e14);
    }

    function test_aci_step2bp() public view {
        _aciAt(2e14);
    }

    function test_aci_step5bp() public view {
        _aciAt(5e14);
    }

    function test_aci_step5bp_directional() public view {
        _aciAtWith(5e14, true);
    }

    function test_aci_step2bp_directional() public view {
        _aciAtWith(2e14, true);
    }

    function _aciAt(uint256 step) internal view {
        _aciAtWith(step, false);
    }

    function _aciAtWith(uint256 step, bool directional) internal view {
        Pool memory p = _runACIWith(step, directional);
        uint256 v = _lpValue(p, _fairPool(prices.length - 1));
        console2.log("quantile tracking, step (wad):", step);
        console2.log("   directional      :", directional);
        console2.log("   LP value at fair :", v);
        console2.log("   arb extracted    :", p.lvr);
        console2.log("   cost to benign   :", p.benign);
        console2.log("   final fee (bps)  :", p.fAci / 1e14);
        console2.log("   coverage (bps)   :", (p.covered * 10_000) / p.tried);
        console2.log("   target  (bps)    :", 10_000 - (ACI_TARGET / 1e14));
        if (v >= UNI30_LP) {
            console2.log("   vs Uniswap 30bps : +", ((v - UNI30_LP) * 10_000) / UNI30_LP);
        } else {
            console2.log("   vs Uniswap 30bps : -", ((UNI30_LP - v) * 10_000) / UNI30_LP);
        }
    }

    /// @notice THE COVERAGE GUARANTEE IS AN IDENTITY, AND THIS IS THE ASSERTION OF IT.
    ///
    ///         Summing the update telescopes: f_end - f_start = step * sum_t (alpha - err_t),
    ///         so the gap between realised miscoverage and the target is exactly
    ///         |f_end - f_start| / (T * step), which the clamp bounds by the width of
    ///         [ACI_MIN, ACI_MAX]. No assumption about the price series appears anywhere in
    ///         that derivation, which is the entire point: it holds on this tape, on any
    ///         other tape, and on a tape an adversary picked.
    ///
    ///         Asserted here at the tightest bound the clamp permits, on the real series.
    function test_aciCoverageIsAnIdentity() public view {
        uint256 step = 2e14;
        Pool memory p = _runACI(step);

        uint256 missed = p.tried - p.covered;
        uint256 realised = (missed * WAD) / p.tried; // realised miscoverage frequency
        uint256 bound = ((ACI_MAX - ACI_MIN) * WAD) / (p.tried * step);

        console2.log("bars                 :", p.tried);
        console2.log("realised miss (wad)  :", realised);
        console2.log("target        (wad)  :", ACI_TARGET);
        console2.log("identity bound (wad) :", bound);

        uint256 gap = realised > ACI_TARGET ? realised - ACI_TARGET : ACI_TARGET - realised;
        assertLe(gap, bound, "coverage identity violated");
    }

    /// @dev The learner evaluates seven counterfactuals a bar, so running the 30bps
    ///      baseline alongside it in one call runs out of gas. The baseline is a constant
    ///      fee on a fixed path, so its result is deterministic: it is the figure
    ///      `test_lpsSaved_uni30` prints, asserted there and quoted here.
    uint256 internal constant UNI30_LP = 2_872_414_578_985_274_455_176_819;
    uint256 internal constant DEPLOYED_LP = 2_991_384_658_770_946_124_952_051;

    function test_lpsSaved_learner() public view {
        uint256 fair = _fairPool(prices.length - 1);
        Pool memory p = _runLearning();
        uint256 v = _lpValue(p, fair);
        console2.log("== Poincare learner  ");
        console2.log("   LP value at fair :", v);
        console2.log("   arb extracted    :", p.lvr);
        console2.log("   vs Uniswap 30bps : +", v - UNI30_LP);
        console2.log("   as bps of pool   : +", ((v - UNI30_LP) * 10_000) / UNI30_LP);
    }

    /// @notice One replay against the 30bps baseline, both on the same path.
    function _compare(string memory name, Pool memory p) internal view {
        uint256 fair = _fairPool(prices.length - 1);
        uint256 start = _lpValue(_seed(0), _fairPool(0));
        Pool memory ref = _runStatic(30e14);
        console2.log("bars:", prices.length);
        console2.log("starting LP value (token0):", start);
        _lp(name, p, fair, ref);
    }

    function _lp(string memory name, Pool memory p, uint256 fair, Pool memory ref) internal pure {
        uint256 v = _lpValue(p, fair);
        uint256 r = _lpValue(ref, fair);
        console2.log(string.concat("== ", name));
        console2.log("   LP value at fair :", v);
        console2.log("   arb extracted    :", p.lvr);
        if (v >= r) {
            console2.log("   vs Uniswap 30bps : +", v - r);
            console2.log("   as bps of pool   : +", ((v - r) * 10_000) / r);
        } else {
            console2.log("   vs Uniswap 30bps : -", r - v);
            console2.log("   as bps of pool   : -", ((r - v) * 10_000) / r);
        }
    }

    /// @notice THE AVELLANEDA-STOIKOV QUOTE ON FOUR YEARS OF REAL DATA.
    ///
    ///         Reference points from the fee sweep on this identical series:
    ///           gamma 0.10 -> 57.90% eliminated, benign     9,743, saved/cost 781
    ///           gamma 0.25 -> 73.87% eliminated, benign    30,628, saved/cost 317
    ///           gamma 0.50 -> 83.93% eliminated, benign    84,069, saved/cost 131
    ///           gamma 1.00 -> 90.87% eliminated, benign   320,037, saved/cost  37
    ///
    ///         The question is whether a quote with a derivation behind it lands above that
    ///         frontier, which is the only thing that would justify replacing a shape that
    ///         works with a shape that is correct.
    function _asAt(uint256 gammaRisk) internal view {
        Pool memory base = _run(0);
        Pool memory p = _runAS(gammaRisk);
        uint256 saved = base.lvr > p.lvr ? base.lvr - p.lvr : 0;
        console2.log("A-S risk aversion (wad):", gammaRisk);
        console2.log("  eliminated (bps)     :", (saved * 10_000) / base.lvr);
        console2.log("  cost to uninformed   :", p.benign);
        console2.log("  saved per unit cost  :", p.benign > 0 ? saved / p.benign : 0);
        console2.log("  mean quote (bps)     :", (p.feeSum / p.steps) / 1e14);
    }

    function test_as_g100() public view {
        _asAt(100e18);
    }

    function test_as_g400() public view {
        _asAt(400e18);
    }

    function test_as_g1200() public view {
        _asAt(1200e18);
    }

    /// @notice The model predicts what fee this replay needs for 95%, and it is not the fee
    ///         the live chain needs. Stated numerically so the gap cannot be quoted as a
    ///         contradiction: eta = 19 and lambda = 2,190 a year gives a far larger fee than
    ///         eta = 19 and lambda = 31,500,000.
    function test_samplingRateDominatesTheRequiredFee() public pure {
        uint256 v = 360e15; // 60% annual vol
        uint256 eta = 19 * WAD;

        uint256[3] memory lams = [uint256(2190), 2_630_000, 31_536_000];
        for (uint256 i = 0; i < lams.length; i++) {
            uint256 ratio = FullMath.mulDiv(v, WAD, 2 * lams[i] * WAD);
            uint256 root = FixedPointMathLib.sqrt(ratio * WAD);
            uint256 f = FullMath.mulDiv(eta, root, WAD);
            console2.log("arb opportunities per year:", lams[i]);
            console2.log("  fee for 95% elimination (bps):", f / 1e14);
        }
    }
}
