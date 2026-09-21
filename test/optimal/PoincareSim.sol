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

/// @title PoincareSim: the shared four-year replay harness.
///
/// @notice The pool model every study on this branch runs against, extracted so that a new
///         question does not mean a new copy of the simulator. It carries the detector, the
///         curve, the arbitrageur, the uninformed flow and its elasticity, and the LP
///         accounting - all of which were debugged the hard way and whose numbers are asserted
///         downstream.
///
///         WHAT LIVES HERE versus what lives in a test: anything that models the pool. A test
///         supplies the question, the parameter sweep and the reporting. If two tests would
///         need the same loop, it belongs here.
///
///         `setUp` is virtual so a subclass can reshape the price series before the run -
///         which is how the arrival-rate study varies the sampling cadence without a second
///         copy of any of this.
///
///         ONE THING HAS TO BE SAID UP FRONT OR EVERY NUMBER BELOW IS MISREAD. A "block" here
///         is a four-hour bar, so lambda is 2,190 a year. The live hook samples once per chain
///         block, roughly one a second, so its lambda is about 31,500,000. That is four orders
///         of magnitude, and the friction a pool needs scales with sqrt(lambda), so the same
///         parameter asks for a very different number here than it does on chain. Quantifying
///         that gap is exactly what `ArrivalRate.t.sol` exists to do.
abstract contract PoincareSim is Test {
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
        /// Uninformed notional per bar. 0 means the default NU.
        ///
        /// Per-bar rather than per-unit-time, so a study that changes the sampling cadence has
        /// to scale it: a one-day bar sees six times the flow a four-hour bar does, and leaving
        /// it fixed would make coarser sampling look like a quieter market rather than the same
        /// market observed less often.
        uint256 nu;
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

    function setUp() public virtual {
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

    /// @dev Uninformed notional in force for a pool. A function rather than a local because
    ///      `_step` is already at the stack limit and one more variable tips it over.
    function _nu(Pool memory p) internal pure returns (uint256) {
        return p.nu == 0 ? NU : p.nu;
    }

    /// @dev Drive a seeded pool across the whole series. Four runners had their own copy of
    ///      this loop; the noise draw is part of the experiment's determinism, so it must not
    ///      drift between them.
    function _drive(Pool memory p) internal view {
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, _fairPool(t), (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
        }
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
        uint256 notional = FullMath.mulDiv(_nu(p), elastic, WAD);
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
            if (p.learning) _learn(p, fair, _nu(p));
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
        _drive(p);
    }

    function _runStatic(uint256 feeWad) internal view returns (Pool memory p) {
        p = _seed(0);
        p.staticFee = feeWad;
        _drive(p);
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
        _drive(p);
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
        _drive(p);
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
        _drive(p);
    }

    /// @notice The derived gamma against the deployed one, and against the zero-fee floor,
    ///         on the real series. Elimination is measured against the gamma = 0 pool, which
    ///         is the frictionless LVR this market actually delivered rather than a modelled
}
