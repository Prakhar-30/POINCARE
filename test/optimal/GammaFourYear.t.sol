// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

import {DirectionalSignal} from "../../src/libraries/DirectionalSignal.sol";
import {Cusum} from "../../src/libraries/Cusum.sol";
import {ControlLaw} from "../../src/libraries/ControlLaw.sol";
import {AsymmetricCurve} from "../../src/libraries/AsymmetricCurve.sol";

/// @title GammaFourYear: does the derived gamma hold on four years of real returns?
///
/// @notice `OptimalFee.t.sol` derives gamma = 0.886 * eta_target from a stochastic-control
///         model and shows it is free of volatility and block rate. That is a statement about
///         a model. This is the statement about the market: the same rule, driven by 7,776
///         real ETH/USDC 4h closes, against a zero-fee pool that differs in nothing else.
///
///         ONE THING HAS TO BE SAID UP FRONT OR EVERY NUMBER BELOW IS MISREAD. The model's
///         eta carries sqrt(lambda), the rate at which the pool can be arbitraged. In this
///         replay a "block" is a four-hour bar, so lambda is 2,190 a year. The live hook
///         samples once per chain block, and Unichain produces roughly one a second, so its
///         lambda is about 31,500,000. That is four orders of magnitude, and eta scales with
///         its square root, so the SAME gamma asks for a fee here that is over a hundred
///         times what it asks for on chain.
///
///         That is not an inconsistency in the rule, it is the rule working: gamma multiplies
///         sigma-hat, and sigma-hat measured per four-hour bar is correspondingly larger than
///         sigma-hat measured per second. The derived fee lands in the same place relative to
///         the arbitrage opportunity either way. What it means in practice is that this replay
///         is a far harsher regime than the deployment, and a gamma validated here is
///         validated against a pool that can only be picked off six times a day.
contract GammaFourYearTest is Test {
    uint256 internal constant WAD = 1e18;
    string internal constant PRICES = "analysis/simulation/realdata/prices_wad_4y.txt";

    uint256 internal constant R0 = 1_000_000e18;
    uint256 internal constant NU = 2_000e18; // uninformed notional per bar, token0
    uint256 internal constant LAMBDA = 900e15; // EWMA decay for sigma-hat, as deployed
    uint256 internal constant FEE_CAP = 5e17; // 50%, deliberately non-binding here

    /// @dev The expert set: candidate volatility-fee gammas. These are a WHITELIST, and that
    ///      is the whole security argument for letting a pool learn. The learner never
    ///      invents a parameter; it only ever shifts weight between configurations that were
    ///      each independently reviewed and capped. The worst an adversary can achieve by
    ///      steering the payoff signal is to push the pool toward the least favourable member
    ///      of a set of safe configurations, which is bounded by construction rather than by
    ///      argument.
    uint256 internal constant N_EXPERTS = 7;

    uint256[] internal prices;

    struct Pool {
        uint256 r0;
        uint256 r1;
        DirectionalSignal.State sig;
        uint256 lastP;
        uint256 gamma;
        uint256 lvr;
        uint256 benign;
        uint256 feeSum;
        uint256 vol; // uninformed notional that actually traded, token0
        uint256 feeCapP; // per-pool vol-fee cap; 0 means use FEE_CAP
        uint256 sigSum; // running sum of sigma-hat, for reporting
        uint256 trendBars; // bars on which kappa was engaged
        // SELF-NORMALISED CUSUM: when set, k and h are read as MULTIPLES of sigma-hat rather
        // than as absolute log-return units, which makes the detector scale-free.
        bool selfNorm;
        // every detector parameter, per pool, so each can be swept on its own
        int256 pK; // CUSUM slack
        int256 pH; // CUSUM threshold / kappa ramp start
        int256 pSMax; // CUSUM cap / kappa ramp saturation
        uint256 pLambda; // EWMA decay
        uint256 pDFloor; // directional-efficiency gate
        uint256 pClip; // Huber clip on the log return
        uint256 pKappaMax; // max directional spread
        uint256 pDMax; // max kappa change per bar
        uint256 steps;
        // detector: only populated when the directional spread is enabled
        bool directional;
        int256 sPos;
        int256 sNeg;
        uint256 kappa;
        Cusum.Trend trend;
        uint256 spreadSum;
        // Avellaneda-Stoikov mode
        bool avellaneda;
        uint256 gammaRisk; // risk aversion
        uint256 staticFee; // a plain Uniswap-style constant fee, when non-zero
        // multiplicative-weights mode
        bool learning;
        uint256[N_EXPERTS] w; // expert weights, WAD
        // quantile-tracking / adaptive-conformal mode
        bool aci;
        uint256 fAci; // the tracked fee itself, WAD
        uint256 aciStep; // step size, in fee units per bar
        uint256 aciTarget; // tolerated pickoff frequency, WAD
        uint256 covered; // bars on which the fee covered the move
        uint256 tried;
    }


    function _experts() internal pure returns (uint256[N_EXPERTS] memory e) {
        e[0] = 1e17; // 0.10
        e[1] = 25e16; // 0.25
        e[2] = 5e17; // 0.50  (deployed)
        e[3] = 1e18; // 1.00
        e[4] = 2e18; // 2.00
        e[5] = 4e18; // 4.00
        e[6] = 8e18; // 8.00
    }

    /// @dev Learning rate. Low deliberately: a fast learner is a manipulable learner, because
    ///      an adversary willing to lose money for a few blocks could otherwise move the
    ///      pool's configuration a long way. At this rate it takes hundreds of samples to
    ///      shift the mixture materially, which is far longer than any manipulation can be
    ///      sustained against arbitrage.
    uint256 internal constant ETA = 2e16;

    /// @dev A-S horizon, in bars. For a perpetual pool there is no terminal time, so the
    ///      horizon is the memory of the signal itself: with EWMA decay lambda the effective
    ///      window is 1/(1-lambda), which at lambda = 0.9 is ten bars.
    uint256 internal constant TAU = 10 * WAD;
    /// @dev Order-arrival decay in the A-S liquidity term. Calibrated so the symmetric part
    ///      lands in the basis-point range the fee sweep showed to be efficient.
    uint256 internal constant K_ARRIVAL = 15e17;

    // detector configuration, as deployed
    int256 internal constant K_SLACK = 1e15;
    int256 internal constant H = 5e15;
    int256 internal constant S_MAX = 2e16;
    uint256 internal constant D_FLOOR = 5e17;
    uint256 internal constant KAPPA_MAX = 1e17;
    uint256 internal constant D_MAX = 5e16;
    uint256 internal constant CLIP = 2e17; // Huber clip on the per-bar log return

    function setUp() public {
        while (true) {
            string memory line = vm.readLine(PRICES);
            if (bytes(line).length == 0) break;
            prices.push(vm.parseUint(line));
        }
        require(prices.length > 1000, "run: DAYS=1460 python analysis/simulation/fetch_realdata.py");
    }

    /// @dev The price series is USDC per ETH. The pool's own marginal price is r1/r0, which
    ///      with token0 = USDC and token1 = ETH is ETH per USDC, the reciprocal. Feeding the
    ///      series in raw put the external price about 1.7 million times above the pool's,
    ///      so the arbitrageur pushed one direction on every single bar and drained the pool
    ///      to nothing: four years of "LVR" worth thirteen times the pool. Every real-data
    ///      number produced before this conversion existed was measuring that drain.
    function _fairPool(uint256 t) internal view returns (uint256) {
        return FullMath.mulDiv(WAD, WAD, prices[t]);
    }

    /// @dev Defaults are the LIVE configuration, so a sweep that changes nothing reproduces
    ///      the deployed pool exactly and every delta below is attributable to one parameter.
    function _defaults(Pool memory p) internal pure {
        p.pK = K_SLACK;
        p.pH = H;
        p.pSMax = S_MAX;
        p.pLambda = LAMBDA;
        p.pDFloor = D_FLOOR;
        p.pClip = CLIP;
        p.pKappaMax = KAPPA_MAX;
        p.pDMax = D_MAX;
    }

    function _seed(uint256 gamma) internal view returns (Pool memory p) {
        _defaults(p);
        p.r0 = R0;
        p.r1 = FullMath.mulDiv(R0, WAD, prices[0]);
        p.lastP = FullMath.mulDiv(p.r1, WAD, p.r0);
        p.gamma = gamma;
    }

    /// @dev The fee this pool charges right now: min(gamma * sigma-hat, cap), symmetric, both
    ///      directions, exactly as the deployed hook computes it.
    // ------------------------------------------------------------------------------------
    // QUANTILE TRACKING (ADAPTIVE CONFORMAL INFERENCE)
    //
    // gamma * sigma-hat is a fee with a distributional assumption buried in it. Multiplying
    // an estimated standard deviation by a constant only names a quantile of the move if the
    // moves are Gaussian, and crypto returns are not; this file's own CLAUDE.md flags the
    // heavy tails as the reason classical CUSUM needs a robust increment. The same objection
    // applies to the fee, and nothing in the branch so far had answered it.
    //
    // Gibbs and Candes, "Adaptive Conformal Inference Under Distribution Shift" (NeurIPS
    // 2021), answers it in one line. Track the quantity you actually want to cover, and
    // adjust by whether you covered it:
    //
    //     alpha_{t+1} = alpha_t + step * (alpha - err_t),   err_t = 1{ not covered }
    //
    // Applied here: the thing to cover is the adverse move an arbitrageur can take, the
    // prediction set is "the fee is at least the mispricing", and err_t is simply whether the
    // arbitrageur turned a profit this bar. Raise the fee when it failed to deter, ease it
    // when it did. No volatility estimate, no distributional assumption, no transcendental on
    // the pricing path.
    //
    // THE GUARANTEE IS AN ALGEBRAIC IDENTITY, NOT A THEOREM WITH HYPOTHESES. Summing the
    // update telescopes:
    //
    //     f_{T+1} - f_1 = step * sum_t (alpha - err_t)
    //  => | (1/T) sum_t err_t - alpha | = | f_1 - f_{T+1} | / (T * step)
    //
    // and since the fee is confined to [F_MIN, F_MAX] the numerator is bounded by the width
    // of that interval. The realised miscoverage frequency therefore converges to the target
    // at O(1/T) FOR EVERY SEQUENCE. Not almost surely, not in expectation, not under a model:
    // for every sequence, including one an adversary chose. `test_aciCoverageIsAnIdentity`
    // asserts exactly this on the real tape.
    //
    // WHY THE CLAMP DOES NOT COST THE SECURITY ARGUMENT. Clamping is what breaks the
    // identity, and it breaks it in the safe direction only. The bound holds verbatim while
    // the fee is interior. If the cap binds, the fee is sitting at a bound that was reviewed
    // and set in advance, which is the same place a fixed configuration would have been, so
    // the worst case degrades to the status quo rather than past it.
    //
    // WHY IT IS HARD TO STEER. Pushing the fee DOWN requires err_t = 0 repeatedly, meaning
    // the attacker must leave no arbitrage on the table, and the fee then eases by only
    // step*alpha a bar. Pushing it UP requires genuinely moving the price, which is the
    // action arbitrage already punishes. Either way the step size is a hard rate limit on
    // how far a bounded run of blocks can move the configuration, the same role Delta-kappa
    // plays for the curve.
    uint256 internal constant ACI_TARGET = 2e17; // tolerate being picked off 20% of bars
    uint256 internal constant ACI_MIN = 1e14; // 1bp floor
    uint256 internal constant ACI_MAX = 5e16; // 5% ceiling

    /// @dev One quantile-tracking update. Two comparisons and an add.
    function _trackQuantile(Pool memory p, bool missed) internal pure {
        p.tried++;
        if (!missed) p.covered++;

        // up by step*(1 - alpha) on a miss, down by step*alpha otherwise: the asymmetry IS
        // the quantile level, and it is the whole of the calibration.
        uint256 f = p.fAci;
        uint256 target = p.aciTarget;
        if (missed) {
            f += FullMath.mulDiv(p.aciStep, WAD - target, WAD);
        } else {
            uint256 d = FullMath.mulDiv(p.aciStep, target, WAD);
            f = f > d ? f - d : 0;
        }
        if (f < ACI_MIN) f = ACI_MIN;
        if (f > ACI_MAX) f = ACI_MAX;
        p.fAci = f;
    }

    function _fee(Pool memory p) internal pure returns (uint256 f) {
        f = FullMath.mulDiv(p.gamma, DirectionalSignal.sigmaWad(p.sig, p.pLambda), WAD);
        uint256 cap = p.feeCapP == 0 ? FEE_CAP : p.feeCapP;
        if (f > cap) f = cap;
    }

    /// @dev THE AVELLANEDA-STOIKOV QUOTE, adapted to a pool.
    ///
    ///      The canonical market-making solution gives a reservation price shifted from mid by
    ///      the inventory the maker is carrying, and a half-spread that splits into an
    ///      inventory-risk premium and a liquidity term:
    ///
    ///          r  = mid - I * gamma * sigma^2 * tau
    ///          d  = (gamma * sigma^2 * tau) / 2 + (1/gamma) * ln(1 + gamma/k)
    ///
    ///      Every input is already on this hook. `sigma` is the detector's own estimate.
    ///      `tau` is the signal's effective memory, since a perpetual pool has no terminal
    ///      time. And `I`, the inventory the pool is carrying away from its centre, is
    ///      exactly `ewmaNet`: the decayed sum of log-returns, which in a constant-product
    ///      pool IS the displacement of the reserves from where they have been sitting. No
    ///      oracle appears anywhere, because in a CPMM inventory and price are the same fact.
    ///
    ///      What this replaces is the ad-hoc part. The deployed control law ramps kappa
    ///      linearly between `h` and `sMax` and clamps it; the shape was chosen because it
    ///      was monotone and bounded, not because anything implied it. A-S says the skew
    ///      should be LINEAR IN INVENTORY and scale with variance and horizon, which is a
    ///      different shape with a derivation behind it.
    function _asQuote(Pool memory p, bool zeroForOne) internal pure returns (uint256) {
        uint256 sigmaHat = DirectionalSignal.sigmaWad(p.sig, p.pLambda);
        // sigma from mean-absolute-deviation: sigma = sigmaHat / sqrt(2/pi)
        uint256 sigma = FullMath.mulDiv(sigmaHat, WAD, 7979e14);
        uint256 var_ = FullMath.mulDiv(sigma, sigma, WAD);
        uint256 gsT = FullMath.mulDiv(FullMath.mulDiv(p.gammaRisk, var_, WAD), TAU, WAD);

        // A-S skew: linear in the inventory the pool is carrying away from its centre.
        int256 inv = p.sig.ewmaNet;
        uint256 skew = FullMath.mulDiv(gsT, inv >= 0 ? uint256(inv) : uint256(-inv), WAD);

        // The base half-spread is the pool's existing volatility fee. A-S's liquidity term,
        // (1/gamma)*ln(1 + gamma/k), is an ABSOLUTE price offset calibrated to an order-flow
        // intensity, not a fractional fee; carrying it across units unconverted produced
        // quotes of fifty percent and pinned the cap. What transfers cleanly is the skew,
        // which is dimensionless because it is a log-price shift, and which is the part with
        // no counterpart in the deployed control law anyway.
        uint256 base = _fee(p);
        bool pushesAway = inv >= 0 ? !zeroForOne : zeroForOne;
        uint256 q = pushesAway ? base + skew : base;
        return q > FEE_CAP ? FEE_CAP : q;
    }

    /// @dev The fee the mixture currently implies: the weight-average of the experts' fees.
    ///      Averaging rather than picking the argmax keeps the quote continuous as weights
    ///      move, so there is no step for anyone to trade across.
    function _blendedFee(Pool memory p) internal pure returns (uint256 f) {
        uint256[N_EXPERTS] memory e = _experts();
        uint256 sigmaHat = DirectionalSignal.sigmaWad(p.sig, p.pLambda);
        uint256 tot;
        for (uint256 i = 0; i < N_EXPERTS; i++) {
            f += FullMath.mulDiv(p.w[i], FullMath.mulDiv(e[i], sigmaHat, WAD), WAD);
            tot += p.w[i];
        }
        if (tot == 0) return 0;
        f = FullMath.mulDiv(f, WAD, tot);
        return f > FEE_CAP ? FEE_CAP : f;
    }

    /// @dev Arbitrage profit at a given friction, WITHOUT touching the pool. Needed because
    ///      `Pool memory shadow = p` aliases rather than copies in Solidity, so evaluating a
    ///      counterfactual through `_arb` on a "copy" silently moved the real reserves, five
    ///      phantom trades a bar. Counterfactuals must be computed, never simulated in place.
    function _arbProfitOnly(Pool memory p, uint256 fair, uint256 s_) internal pure returns (uint256) {
        uint256 pp = FullMath.mulDiv(p.r1, WAD, p.r0);
        uint256 prod = FullMath.mulDiv(p.r0 * p.r1, WAD - s_, WAD);
        if (fair > pp) {
            uint256 root = Math.sqrt(FullMath.mulDiv(prod, fair, WAD));
            if (root <= p.r1) return 0;
            uint256 d = root - p.r1;
            uint256 out = AsymmetricCurve.swapExactInWithSpread(p.r0, p.r1, 0, 0, d, false, s_);
            if (out == 0 || out >= p.r0) return 0;
            uint256 cost = FullMath.mulDiv(d, WAD, fair);
            return out > cost ? out - cost : 0;
        } else if (fair < pp) {
            uint256 root = Math.sqrt(FullMath.mulDiv(prod, WAD, fair));
            if (root <= p.r0) return 0;
            uint256 d = root - p.r0;
            uint256 out = AsymmetricCurve.swapExactInWithSpread(p.r0, p.r1, 0, 0, d, true, s_);
            if (out == 0 || out >= p.r1) return 0;
            uint256 rev = FullMath.mulDiv(out, WAD, fair);
            return rev > d ? rev - d : 0;
        }
        return 0;
    }

    /// @dev One multiplicative-weights update, from FULL INFORMATION.
    ///
    ///      This is what makes the approach fit a pool rather than merely fit a paper. A
    ///      market maker in a limit book only learns the payoff of the quote it actually
    ///      posted. A pool can evaluate every candidate counterfactually, because the price
    ///      move and the order flow are observable after the fact and the payoff of any fee
    ///      against them is a closed form: revenue from uninformed flow, less what an
    ///      arbitrageur would have taken at that fee. No experiment is needed, so there is no
    ///      exploration cost and no bandit regret, only the O(sqrt(T log N)) of the expert
    ///      setting.
    function _learn(Pool memory p, uint256 fair, uint256 notional) internal pure {
        uint256[N_EXPERTS] memory e = _experts();
        uint256 sigmaHat = DirectionalSignal.sigmaWad(p.sig, p.pLambda);

        // THE PAYOFF IS SIGNED, AND THAT IS NOT A DETAIL. Clamping it at zero looks
        // harmless and is not: on a bar with a real price move every expert loses more to
        // arbitrage than it earns in fees, so a clamped payoff reports a flat tie and the
        // learner discards the bar. Those are precisely the bars on which a high fee earns
        // its keep. A learner that only sees calm bars learns that fees drive volume away,
        // which is true, and never sees what they bought.
        int256[N_EXPERTS] memory pay;
        int256 best = type(int256).min;
        int256 worst = type(int256).max;
        for (uint256 i = 0; i < N_EXPERTS; i++) {
            uint256 f = FullMath.mulDiv(e[i], sigmaHat, WAD);
            if (f > FEE_CAP) f = FEE_CAP;
            // revenue this bar from uninformed flow at this fee, net of the volume that
            // fee drives away; a learner scored on captive flow learns to charge everything
            uint256 vol = FullMath.mulDiv(
                notional, uint256(FixedPointMathLib.expWad(-int256(400 * f))), WAD
            );
            uint256 rev = FullMath.mulDiv(vol, f, WAD);
            uint256 lost = _arbProfitOnly(p, fair, f);
            pay[i] = int256(rev) - int256(lost);
            if (pay[i] > best) best = pay[i];
            if (pay[i] < worst) worst = pay[i];
        }
        if (best == worst) return; // nothing to learn from a flat bar

        for (uint256 i = 0; i < N_EXPERTS; i++) {
            // normalise the bar's payoffs into [0,1] so the learning rate means the same
            // thing regardless of how large the bar happened to be
            uint256 norm = FullMath.mulDiv(uint256(pay[i] - worst), WAD, uint256(best - worst));
            uint256 mult = uint256(FixedPointMathLib.expWad(int256(FullMath.mulDiv(ETA, norm, WAD))));
            p.w[i] = FullMath.mulDiv(p.w[i], mult, WAD);
        }

        // renormalise so weights cannot drift out of range over 7,776 updates
        uint256 tot;
        for (uint256 i = 0; i < N_EXPERTS; i++) tot += p.w[i];
        if (tot > 0) {
            for (uint256 i = 0; i < N_EXPERTS; i++) p.w[i] = FullMath.mulDiv(p.w[i], N_EXPERTS * WAD, tot);
        }
    }

    /// @dev Total friction a swap in this direction faces: the symmetric fee, plus the
    ///      directional spread if this pool runs one AND the swap is pushing with the
    ///      detected trend. This is the whole asymmetry: toxic flow meets fee + kappa, benign
    ///      flow meets the fee alone.
    function _friction(Pool memory p, bool zeroForOne) internal pure returns (uint256) {
        if (p.staticFee != 0) return p.staticFee;
        if (p.learning) return _blendedFee(p);
        if (p.avellaneda) return _asQuote(p, zeroForOne);
        // the tracked quantile replaces gamma * sigma-hat as the BASE fee; the directional
        // lever sits on top of it unchanged, so the two are independent layers
        uint256 f = p.aci ? p.fAci : _fee(p);
        if (!p.directional || p.kappa == 0) return f;
        bool withTrend =
            (p.trend == Cusum.Trend.Up && !zeroForOne) || (p.trend == Cusum.Trend.Down && zeroForOne);
        if (!withTrend) return f;
        // on chain `feeCap` bounds the vol fee and `kappaMax` bounds the spread, separately;
        // there is no cap on the sum, so the sum is what the trader pays
        uint256 total = f + p.kappa;
        return total > FEE_CAP ? FEE_CAP : total;
    }

    /// @dev Profit-maximising arbitrage to the band edge, through the real curve, with the fee
    ///      retained in reserves. Optimal input against a proportional output haircut `s` is
    ///      d* = sqrt((1-s)*P*X*Y) - Y when pushing up.
    function _arb(Pool memory p, uint256 fair, uint256 s) internal pure returns (uint256 prof) {
        uint256 pp = FullMath.mulDiv(p.r1, WAD, p.r0);
        uint256 prod = FullMath.mulDiv(p.r0 * p.r1, WAD - s, WAD);
        if (fair > pp) {
            uint256 root = Math.sqrt(FullMath.mulDiv(prod, fair, WAD));
            if (root <= p.r1) return 0;
            uint256 d = root - p.r1;
            uint256 out = AsymmetricCurve.swapExactInWithSpread(p.r0, p.r1, 0, 0, d, false, s);
            if (out == 0 || out >= p.r0) return 0;
            uint256 cost = FullMath.mulDiv(d, WAD, fair);
            if (out > cost) prof = out - cost;
            p.r1 += d;
            p.r0 -= out;
        } else if (fair < pp) {
            uint256 root = Math.sqrt(FullMath.mulDiv(prod, WAD, fair));
            if (root <= p.r0) return 0;
            uint256 d = root - p.r0;
            uint256 out = AsymmetricCurve.swapExactInWithSpread(p.r0, p.r1, 0, 0, d, true, s);
            if (out == 0 || out >= p.r1) return 0;
            uint256 rev = FullMath.mulDiv(out, WAD, fair);
            if (rev > d) prof = rev - d;
            p.r0 += d;
            p.r1 -= out;
        }
    }

    function _step(Pool memory p, uint256 fair, bool buyToken1) internal pure {
        p.feeSum += _friction(p, true);
        p.spreadSum += p.kappa;
        p.steps++;

        // uninformed flow pays whatever its own direction faces, AND responds to it.
        // Without this the harness has captive traders, every fee increase is pure profit,
        // and LP value rises without bound in the fee. Volume decays as nu0*exp(-alpha*f),
        // the specification the optimal-fee literature uses, with alpha = 400.
        uint256 s = _friction(p, buyToken1);
        uint256 elastic = uint256(FixedPointMathLib.expWad(-int256(400 * s)));
        uint256 notional = FullMath.mulDiv(NU, elastic, WAD);
        uint256 amountIn = buyToken1 ? notional : FullMath.mulDiv(notional, p.r1, p.r0);
        if (amountIn == 0) return;
        p.vol += notional;
        uint256 baseOut = AsymmetricCurve.swapExactIn(p.r0, p.r1, 0, 0, amountIn, buyToken1);
        uint256 got = AsymmetricCurve.swapExactInWithSpread(p.r0, p.r1, 0, 0, amountIn, buyToken1, s);
        if (baseOut > got) {
            uint256 lost = baseOut - got;
            p.benign += buyToken1 ? FullMath.mulDiv(lost, p.r0, p.r1) : lost;
        }
        if (buyToken1) {
            p.r0 += amountIn;
            p.r1 -= got;
        } else {
            p.r1 += amountIn;
            p.r0 -= got;
        }

        // the arbitrageur faces the friction on the side it needs to trade
        _arbAndTrack(p, fair);

        // advance sigma-hat on the pool's own price, as the hook does
        uint256 pNow = FullMath.mulDiv(p.r1, WAD, p.r0);
        if (p.lastP != 0 && pNow != 0) {
            int256 r = FixedPointMathLib.lnWad(int256(FullMath.mulDiv(pNow, WAD, p.lastP)));
            int256 cap = int256(p.pClip);
            if (r > cap) r = cap;
            else if (r < -cap) r = -cap;
            p.sig = DirectionalSignal.update(p.sig, r, p.pLambda);
            p.sigSum += DirectionalSignal.sigmaWad(p.sig, p.pLambda);

            if (p.directional) _detect(p, r);
            if (p.learning) _learn(p, fair, NU);
        }
        p.lastP = pNow;
    }

    /// @dev The CUSUM slack, threshold and evidence cap actually in force this bar.
    ///
    ///      ABSOLUTE THRESHOLDS ARE A BUG WAITING FOR A VOLATILITY REGIME. k = 0.001 and
    ///      h = 0.005 are log-return units, so what they mean depends entirely on how large
    ///      returns happen to be. Double the volatility and the same k stops filtering
    ///      anything, the statistic accumulates on noise, and the false-alarm rate the
    ///      threshold was calibrated to is gone. Halve it and the detector never fires at all.
    ///      The calibration is only valid at the volatility it was calibrated on.
    ///
    ///      Normalising by the pool's own sigma-hat removes the dependence: k and h are then
    ///      read as multiples of the current noise scale, the standardised increment has the
    ///      same distribution whatever the regime, and the false-alarm rate is invariant.
    ///      This is the self-normalisation idea from the sequential-analysis literature
    ///      (arXiv:2509.07112 for locally stationary series; arXiv:2210.17353 for the
    ///      data-adaptive CUSUM variant), and it costs one multiply.
    function _thresholds(Pool memory p) internal pure returns (int256 k_, int256 h_, int256 s_) {
        if (!p.selfNorm) return (p.pK, p.pH, p.pSMax);
        int256 sg = int256(DirectionalSignal.sigmaWad(p.sig, p.pLambda));
        if (sg == 0) return (p.pK, p.pH, p.pSMax);
        k_ = (p.pK * sg) / int256(WAD);
        h_ = (p.pH * sg) / int256(WAD);
        s_ = (p.pSMax * sg) / int256(WAD);
        if (h_ <= 0) h_ = 1;
        if (s_ <= h_) s_ = h_ + 1;
    }

    /// @dev The arbitrage leg and the tracker update, lifted out of `_step` so the stack fits.
    ///
    ///      err_t is OBSERVED, not modelled: the arbitrageur either found profit at this fee
    ///      or did not. That is the whole of the feedback the tracker needs, and it is the
    ///      reason this mechanism is cheap enough to run on chain. A pool already knows
    ///      whether it was picked off.
    function _arbAndTrack(Pool memory p, uint256 fair) internal pure {
        uint256 pMid = FullMath.mulDiv(p.r1, WAD, p.r0);
        uint256 took = _arb(p, fair, _friction(p, fair < pMid));
        p.lvr += took;
        if (p.aci) _trackQuantile(p, took > 0);
    }

    /// @dev One detector step, lifted out of `_step` purely so the stack fits.
    function _detect(Pool memory p, int256 r) internal pure {
        uint256 d = DirectionalSignal.signal(p.sig);
        (int256 k_, int256 h_, int256 sm_) = _thresholds(p);
        Cusum.State memory cs = Cusum.updateCapped(Cusum.State(p.sPos, p.sNeg), r, k_, sm_);
        p.sPos = cs.sPos;
        p.sNeg = cs.sNeg;
        (Cusum.Trend dir, int256 ev) =
            cs.sPos >= cs.sNeg ? (Cusum.Trend.Up, cs.sPos) : (Cusum.Trend.Down, cs.sNeg);
        int256 gated = d >= p.pDFloor ? ev : int256(0);
        p.kappa =
            ControlLaw.step(p.kappa, gated, ControlLaw.Config(h_, sm_, 0, p.pKappaMax, p.pDMax));
        if (gated > 0) p.trend = dir;
        if (p.kappa > 0) p.trendBars++;
    }

    function _run(uint256 gamma) internal view returns (Pool memory p) {
        return _runWith(gamma, false);
    }

    /// @dev A plain constant-fee pool: what an ordinary Uniswap position looks like.
    function _runLearning() internal view returns (Pool memory p) {
        p = _seed(0);
        p.learning = true;
        for (uint256 i = 0; i < N_EXPERTS; i++) p.w[i] = WAD;
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
    }

    function _runStatic(uint256 feeWad) internal view returns (Pool memory p) {
        p = _seed(0);
        p.staticFee = feeWad;
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
    }

    /// @dev LP value in token0 terms, marked at the external fair price. This nets everything:
    ///      fees earned, spread retained, arbitrage lost, inventory carried. It is the only
    ///      number an LP experiences.
    function _lpValue(Pool memory p, uint256 fair) internal pure returns (uint256) {
        return p.r0 + FullMath.mulDiv(p.r1, WAD, fair);
    }

    function _runAS(uint256 gammaRisk) internal view returns (Pool memory p) {
        return _runASFee(gammaRisk, 25e16);
    }

    /// @dev A-S skew layered on a volatility fee, so the comparison against the deployed
    ///      "fee + directional spread" is like for like: same base, different skew shape.
    function _runASFee(uint256 gammaRisk, uint256 feeGamma) internal view returns (Pool memory p) {
        p = _seed(feeGamma);
        p.avellaneda = true;
        p.gammaRisk = gammaRisk;
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
    }

    function _runACI(uint256 step) internal view returns (Pool memory p) {
        return _runACIWith(step, false);
    }

    function _runACIWith(uint256 step, bool directional) internal view returns (Pool memory p) {
        return _runACITuned(step, directional, ACI_TARGET);
    }

    function _runACITuned(uint256 step, bool directional, uint256 target)
        internal
        view
        returns (Pool memory p)
    {
        p = _seed(0);
        p.aci = true;
        p.directional = directional;
        p.aciTarget = target;
        p.aciStep = step;
        p.fAci = 30e14; // start where an ordinary pool starts, at 30bps
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
    }

    function _runWith(uint256 gamma, bool directional) internal view returns (Pool memory p) {
        return _runCapped(gamma, directional, 0);
    }

    /// @dev `feeCapW` = 0 leaves the cap non-binding, as every earlier run on this branch
    ///      did. The DEPLOYED hook caps the vol fee at 30bps, which binds constantly.
    function _runCapped(uint256 gamma, bool directional, uint256 feeCapW)
        internal
        view
        returns (Pool memory p)
    {
        p = _seed(gamma);
        p.feeCapP = feeCapW;
        p.directional = directional;
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
    }

    /// @notice The derived gamma against the deployed one, and against the zero-fee floor,
    ///         on the real series. Elimination is measured against the gamma = 0 pool, which
    ///         is the frictionless LVR this market actually delivered rather than a modelled
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
    function _slice(uint256 dFloor_, uint256 kappaMax_, uint256 t0, uint256 t1)
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
        p.directional = true;
        p.pDFloor = dFloor_;
        p.pKappaMax = kappaMax_;
        for (uint256 t = t0; t < t1; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
        lp = _lpValue(p, _fairPool(t1 - 1));
        arb = p.lvr;
        flow = (p.vol * 10_000) / (NU * p.steps);
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
