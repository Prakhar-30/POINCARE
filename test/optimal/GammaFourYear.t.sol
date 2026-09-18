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

    function _seed(uint256 gamma) internal view returns (Pool memory p) {
        p.r0 = R0;
        p.r1 = FullMath.mulDiv(R0, WAD, prices[0]);
        p.lastP = FullMath.mulDiv(p.r1, WAD, p.r0);
        p.gamma = gamma;
    }

    /// @dev The fee this pool charges right now: min(gamma * sigma-hat, cap), symmetric, both
    ///      directions, exactly as the deployed hook computes it.
    function _fee(Pool memory p) internal pure returns (uint256 f) {
        f = FullMath.mulDiv(p.gamma, DirectionalSignal.sigmaWad(p.sig, LAMBDA), WAD);
        if (f > FEE_CAP) f = FEE_CAP;
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
        uint256 sigmaHat = DirectionalSignal.sigmaWad(p.sig, LAMBDA);
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
        uint256 sigmaHat = DirectionalSignal.sigmaWad(p.sig, LAMBDA);
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
        uint256 sigmaHat = DirectionalSignal.sigmaWad(p.sig, LAMBDA);

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
        uint256 f = _fee(p);
        if (!p.directional || p.kappa == 0) return f;
        bool withTrend =
            (p.trend == Cusum.Trend.Up && !zeroForOne) || (p.trend == Cusum.Trend.Down && zeroForOne);
        if (!withTrend) return f;
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
        p.feeSum += p.avellaneda ? _asQuote(p, true) : _fee(p);
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
        uint256 pMid = FullMath.mulDiv(p.r1, WAD, p.r0);
        p.lvr += _arb(p, fair, _friction(p, fair < pMid));

        // advance sigma-hat on the pool's own price, as the hook does
        uint256 pNow = FullMath.mulDiv(p.r1, WAD, p.r0);
        if (p.lastP != 0 && pNow != 0) {
            int256 r = FixedPointMathLib.lnWad(int256(FullMath.mulDiv(pNow, WAD, p.lastP)));
            int256 cap = int256(uint256(2e17));
            if (r > cap) r = cap;
            else if (r < -cap) r = -cap;
            p.sig = DirectionalSignal.update(p.sig, r, LAMBDA);

            if (p.directional) _detect(p, r);
            if (p.learning) _learn(p, fair, NU);
        }
        p.lastP = pNow;
    }

    /// @dev One detector step, lifted out of `_step` purely so the stack fits.
    function _detect(Pool memory p, int256 r) internal pure {
        uint256 d = DirectionalSignal.signal(p.sig);
        Cusum.State memory cs = Cusum.updateCapped(Cusum.State(p.sPos, p.sNeg), r, K_SLACK, S_MAX);
        p.sPos = cs.sPos;
        p.sNeg = cs.sNeg;
        (Cusum.Trend dir, int256 ev) =
            cs.sPos >= cs.sNeg ? (Cusum.Trend.Up, cs.sPos) : (Cusum.Trend.Down, cs.sNeg);
        int256 gated = d >= D_FLOOR ? ev : int256(0);
        p.kappa = ControlLaw.step(p.kappa, gated, ControlLaw.Config(H, S_MAX, 0, KAPPA_MAX, D_MAX));
        if (gated > 0) p.trend = dir;
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

    function _runWith(uint256 gamma, bool directional) internal view returns (Pool memory p) {
        p = _seed(gamma);
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

    /// @dev The learner evaluates seven counterfactuals a bar, so running the 30bps
    ///      baseline alongside it in one call runs out of gas. The baseline is a constant
    ///      fee on a fixed path, so its result is deterministic: it is the figure
    ///      `test_lpsSaved_uni30` prints, asserted there and quoted here.
    uint256 internal constant UNI30_LP = 2_872_414_578_985_274_455_176_819;

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
