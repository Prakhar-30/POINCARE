// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

import {DirectionalSignal} from "../../src/libraries/DirectionalSignal.sol";
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
    }

    function setUp() public {
        while (true) {
            string memory line = vm.readLine(PRICES);
            if (bytes(line).length == 0) break;
            prices.push(vm.parseUint(line));
        }
        require(prices.length > 1000, "run: DAYS=1460 python analysis/simulation/fetch_realdata.py");
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
        uint256 s = _fee(p);
        p.feeSum += s;
        p.steps++;

        // uninformed flow, charged the same symmetric fee
        uint256 amountIn = buyToken1 ? NU : FullMath.mulDiv(NU, p.r1, p.r0);
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

        p.lvr += _arb(p, fair, s);

        // advance sigma-hat on the pool's own price, as the hook does
        uint256 pNow = FullMath.mulDiv(p.r1, WAD, p.r0);
        if (p.lastP != 0 && pNow != 0) {
            int256 r = FixedPointMathLib.lnWad(int256(FullMath.mulDiv(pNow, WAD, p.lastP)));
            int256 cap = int256(uint256(2e17));
            if (r > cap) r = cap;
            else if (r < -cap) r = -cap;
            p.sig = DirectionalSignal.update(p.sig, r, LAMBDA);
        }
        p.lastP = pNow;
    }

    function _run(uint256 gamma) internal view returns (Pool memory p) {
        p = _seed(gamma);
        for (uint256 t = 0; t < prices.length; t++) {
            _step(p, prices[t], (uint256(keccak256(abi.encode(t, "noise"))) & 1) == 0);
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
