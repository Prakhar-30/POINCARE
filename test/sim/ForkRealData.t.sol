// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";
import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";
import {MintableERC20} from "./MintableERC20.sol";

/// @title ForkRealDataTest - feed real 12-month ETH/USDC history to the hook on a Sepolia v4 fork
/// @notice Identical comparative engine to ForkSimulation, but `fair` is driven by the REAL
///         Binance ETHUSDC 4h closes fetched by analysis/simulation/fetch_realdata.py into
///         realdata/prices_wad.txt. THREE pools on the real Sepolia PoolManager, seeded
///         identically and fed the same fair path and the same order flow:
///
///           * POINCARE - detector-gated DIRECTIONAL spread, kappa_max 5%, no vol fee;
///           * CONTROL  - kappa_max 0 and no fee, i.e. plain constant product (the LVR floor);
///           * VOLFEE   - no directional spread, a SYMMETRIC vol-scaled fee min(gamma*sigma, cap)
///                        charged to both sides, with gamma set so its cost to uninformed flow
///                        matches POINCARE's. The same-friction-budget baseline.
///
///         The vol-fee pool is the baseline that makes the result mean something: any spread
///         reduces LVR, so "LVR below constant product" alone proves nothing. The question is
///         whether spending a friction budget DIRECTIONALLY (only on the toxic side, only when
///         the detector is confident) beats spending it symmetrically. That comparison exists
///         on the synthetic path in test/backtest/Backtest.t.sol; this brings it to real data.
contract ForkRealDataTest is Test {
    using CurrencyLibrary for Currency;

    uint256 constant SEPOLIA = 11155111;
    uint256 constant WAD = 1e18;
    uint256 constant SEED = 0xA11CE;
    uint256 constant PHASES = 6; // monthly buckets for the summary

    // Detector config CALIBRATED on this pair's own return distribution by
    // test/calibration/RealDataCalibration.t.sol, which measures ARL0 and detection delay on
    // the real (heavy-tailed) returns of the FIRST HALF of this series only - so the second
    // half is out-of-sample for these numbers. See analysis/CALIBRATION.md.
    //   sigma (calibration half)  = 0.014443 per 4h bar
    //   k = mu1/2 = 0.25 sigma     (mu1 = 0.5 sigma, the smallest drift worth leaning against)
    //   h = 6.00 sigma             (the smallest h whose measured ARL0 >= 120 bars ~ 20 days)
    //   measured at that h: ARL0 = 124 bars, detection delay at mu1 = 23 bars
    int256 constant K = 3610706429159388; //      0.25 sigma
    int256 constant H = 86656954299825324; //     6.00 sigma  (ARL0 = 120 bars)
    int256 constant S_MAX = 173313908599650648; // 2h: kappa saturates at twice the threshold
    uint256 constant KAPPA_MIN = 0;
    uint256 constant KAPPA_MAX = 5e16; // 5% - a security cap, NOT calibrated from data
    uint256 constant D_MAX = 15e15; // 1.5%/block
    uint256 constant LAMBDA = 85e16; // ~1-day memory
    uint256 constant D_FLOOR = 55e16; // 0.55

    // Symmetric vol-fee baseline: fee = min(FEE_GAMMA * sigma, FEE_CAP), charged both ways.
    // FEE_GAMMA is chosen so this pool's cost to uninformed flow matches POINCARE's over the
    // window (the equal-friction-budget condition); the run reports both realized costs so the
    // match can be checked rather than trusted.
    uint256 constant FEE_GAMMA = 441e14; // 0.0441 -> sized so the baseline's cost to uninformed flow matches Poincare's
    uint256 constant FEE_CAP = 1e17;

    IPoolManager pm;
    IUniswapV4Router04 router;
    Currency c0; // WETH
    Currency c1; // USDC
    PoincareHook hookOn;
    PoincareHook hookOff;
    PoincareHook hookVf;
    PoolKey keyOn;
    PoolKey keyOff;
    PoolKey keyVf;

    uint256[] prices; //   real ETH/USDC closes, WAD
    uint256 fair;
    uint256 cumLvrOn;
    uint256 cumLvrOff;
    uint256 cumLvrVf;
    uint256 cumNoiseOn; // cost of the spread to uninformed flow, POINCARE
    uint256 cumNoiseVf; // ... and VOLFEE: the friction budgets being matched
    uint256 orderId;
    uint256 nPts;

    uint256[PHASES] lvrOnByPhase;
    uint256[PHASES] lvrOffByPhase;
    uint256[PHASES] lvrVfByPhase;

    // half-window split: the first half calibrated the detector, the second is out-of-sample
    uint256 lvrOnH1;
    uint256 lvrOffH1;
    uint256 lvrVfH1;

    string constant PRICES = "analysis/simulation/realdata/prices_wad.txt";
    string constant TS = "analysis/simulation/realdata/timeseries.csv";
    string constant OB = "analysis/simulation/realdata/orders.csv";
    string constant SUM = "analysis/simulation/realdata/summary.csv";

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("sepolia"));
        pm = IPoolManager(AddressConstants.getPoolManagerAddress(SEPOLIA));
        router = IUniswapV4Router04(payable(AddressConstants.getV4SwapRouterAddress(SEPOLIA)));

        while (true) {
            string memory line = vm.readLine(PRICES);
            if (bytes(line).length == 0) break;
            prices.push(vm.parseUint(line));
        }
        nPts = prices.length;
        require(nPts > 10, "no price data - run fetch_realdata.py first");

        MintableERC20 a = new MintableERC20("WETH", "WETH");
        MintableERC20 b = new MintableERC20("USDC", "USDC");
        (c0, c1) = address(a) < address(b)
            ? (Currency.wrap(address(a)), Currency.wrap(address(b)))
            : (Currency.wrap(address(b)), Currency.wrap(address(a)));
        MintableERC20(Currency.unwrap(c0)).mint(address(this), 1e33);
        MintableERC20(Currency.unwrap(c1)).mint(address(this), 1e33);

        hookOn = _deployHook(KAPPA_MAX, 0, 0x6666);
        hookOff = _deployHook(0, 0, 0x7777);
        hookVf = _deployHook(0, FEE_GAMMA, 0x8888);
        keyOn = _initPool(hookOn);
        keyOff = _initPool(hookOff);
        keyVf = _initPool(hookVf);

        IERC20Minimal(Currency.unwrap(c0)).approve(address(router), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(router), type(uint256).max);

        fair = prices[0];
        _seed(hookOn);
        _seed(hookOff);
        _seed(hookVf);
    }

    function _deployHook(uint256 kappaMax, uint256 feeGamma, uint160 ns) internal returns (PoincareHook h) {
        address flags = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                    | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
            ) ^ (uint160(ns) << 144)
        );
        PoincareConfig memory cfg;
        cfg.k = K;
        cfg.h = H;
        cfg.sMax = S_MAX;
        cfg.lambda = LAMBDA;
        cfg.dFloor = D_FLOOR;
        cfg.clipWad = 1e18; // inert clip: no 4h ETH candle approaches a 100% log-return
        cfg.kappaMin = KAPPA_MIN;
        cfg.kappaMax = kappaMax;
        cfg.dMax = D_MAX;
        cfg.feeGamma = feeGamma;
        cfg.feeCap = feeGamma == 0 ? 0 : FEE_CAP;
        deployCodeTo("PoincareHook.sol:PoincareHook", abi.encode(pm, cfg), flags);
        h = PoincareHook(payable(flags));
    }

    function _initPool(PoincareHook h) internal returns (PoolKey memory k) {
        k = PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(h));
        pm.initialize(k, Constants.SQRT_PRICE_1_1);
        IERC20Minimal(Currency.unwrap(c0)).approve(address(h), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(h), type(uint256).max);
    }

    function _seed(PoincareHook h) internal {
        // 1000 WETH : (1000 * price) USDC -> pool starts exactly at the first real price.
        uint256 usdc = FullMath.mulDiv(1000e18, fair, WAD);
        h.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(1000e18, usdc, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
    }

    // ------------------------------------------------------------------

    function test_runRealData() public {
        vm.writeFile(TS, "block,phase,fair,price_on,price_off,kappa,trend,d,lp_on,lp_off,cum_lvr_on,cum_lvr_off,cum_noise_on,lp_vf,cum_lvr_vf,cum_noise_vf\n");
        vm.writeFile(OB, "id,block,pool,kind,zeroForOne,amount_in,amount_out\n");

        uint256 per = nPts / PHASES + 1;
        for (uint256 t = 1; t < nPts; t++) {
            vm.roll(block.number + 1);
            fair = prices[t];
            uint8 phase = uint8(t / per);
            if (phase >= PHASES) phase = uint8(PHASES - 1);

            uint256 lOn = _arb(hookOn, keyOn, "poincare");
            uint256 lOff = _arb(hookOff, keyOff, "control");
            uint256 lVf = _arb(hookVf, keyVf, "volfee");
            cumLvrOn += lOn;
            cumLvrOff += lOff;
            cumLvrVf += lVf;
            lvrOnByPhase[phase] += lOn;
            lvrOffByPhase[phase] += lOff;
            lvrVfByPhase[phase] += lVf;
            if (t <= nPts / 2) {
                lvrOnH1 += lOn;
                lvrOffH1 += lOff;
                lvrVfH1 += lVf;
            }

            _noise(t);
            _record(t, phase);
        }

        _writeSummary(per);
        _report();

        // The floor claim: leaning against detected trends never costs LPs more than doing
        // nothing. Everything else is reported, not asserted, because it depends on the window.
        assertLe(cumLvrOn, cumLvrOff, "Poincare must not increase LVR vs the constant-product control");
        // Equal-friction check: the baseline is only fair if it really did cost uninformed flow
        // about the same. If this trips, retune FEE_GAMMA rather than trusting the comparison.
        assertApproxEqRel(cumNoiseVf, cumNoiseOn, 0.25e18, "vol-fee baseline must match Poincare's cost to benign flow");
    }

    // ------------------------------------------------------------------

    /// @dev Everything the write-up quotes, printed from one place.
    function _report() internal view {
        uint256 lpOn = _lpValue(hookOn);
        uint256 lpOff = _lpValue(hookOff);
        uint256 lpVf = _lpValue(hookVf);

        console2.log("=== real-data replay; 4h ETH/USDC points:", nPts);
        console2.log("--- cumulative LVR (USDC wei), lower is better ---");
        console2.log("POINCARE :", cumLvrOn);
        console2.log("CONTROL  :", cumLvrOff);
        console2.log("VOLFEE   :", cumLvrVf);
        console2.log("LVR reduction vs control, POINCARE (bps):", _bps(cumLvrOn, cumLvrOff));
        console2.log("LVR reduction vs control, VOLFEE   (bps):", _bps(cumLvrVf, cumLvrOff));

        console2.log("--- cost to uninformed flow (USDC wei); the matched friction budget ---");
        console2.log("POINCARE :", cumNoiseOn);
        console2.log("VOLFEE   :", cumNoiseVf);

        console2.log("--- LP value marked at fair (USDC wei), the ground truth ---");
        console2.log("POINCARE :", lpOn);
        console2.log("CONTROL  :", lpOff);
        console2.log("VOLFEE   :", lpVf);
        if (lpOn > lpOff) console2.log("LP advantage vs control, POINCARE:", lpOn - lpOff);
        if (lpVf > lpOff) console2.log("LP advantage vs control, VOLFEE  :", lpVf - lpOff);

        // The out-of-sample split: the detector's k and h were calibrated on the first half
        // only (test/calibration/RealDataCalibration.t.sol), so H2 is a genuine hold-out.
        console2.log("--- LVR by half: H1 = calibration sample, H2 = out-of-sample ---");
        console2.log("H1 POINCARE / CONTROL / VOLFEE:", lvrOnH1, lvrOffH1, lvrVfH1);
        console2.log("H2 POINCARE:", cumLvrOn - lvrOnH1);
        console2.log("H2 CONTROL :", cumLvrOff - lvrOffH1);
        console2.log("H2 VOLFEE  :", cumLvrVf - lvrVfH1);
        console2.log("H1 LVR reduction, POINCARE (bps):", _bps(lvrOnH1, lvrOffH1));
        console2.log("H2 LVR reduction, POINCARE (bps):", _bps(cumLvrOn - lvrOnH1, cumLvrOff - lvrOffH1));
        console2.log("H2 LVR reduction, VOLFEE   (bps):", _bps(cumLvrVf - lvrVfH1, cumLvrOff - lvrOffH1));
    }

    /// @dev The arbitrageur only trades when the mispricing clears the pool's total friction,
    ///      so the no-arb band is the directional spread PLUS the symmetric vol fee. Charging
    ///      the band on the spread alone would make the vol-fee pool's arb trade at a loss,
    ///      flattering it: the fee would be paid to LPs without the arb ever declining.
    function _arb(PoincareHook h, PoolKey memory k, string memory pool) internal returns (uint256 lvrUsdc) {
        (uint256 r0, uint256 r1) = h.reserves();
        uint256 p = FullMath.mulDiv(r1, WAD, r0);
        uint256 kk = r0 * r1;
        uint256 fee = h.currentFeeWad();
        if (fair > p) {
            uint256 s = h.effectiveSpread(false) + fee;
            if (FullMath.mulDiv(fair - p, WAD, p) <= s) return 0;
            uint256 r1t = Math.sqrt(FullMath.mulDiv(kk, fair, WAD));
            if (r1t <= r1) return 0;
            (uint256 spent, uint256 got) = _swap(k, false, r1t - r1, pool, "arb");
            uint256 vOut = FullMath.mulDiv(got, fair, WAD);
            if (vOut > spent) lvrUsdc = vOut - spent;
        } else if (fair < p) {
            uint256 s = h.effectiveSpread(true) + fee;
            if (FullMath.mulDiv(p - fair, WAD, p) <= s) return 0;
            uint256 r0t = Math.sqrt(FullMath.mulDiv(kk, WAD, fair));
            if (r0t <= r0) return 0;
            (uint256 spent, uint256 got) = _swap(k, true, r0t - r0, pool, "arb");
            uint256 vIn = FullMath.mulDiv(spent, fair, WAD);
            if (got > vIn) lvrUsdc = got - vIn;
        }
    }

    /// @dev One identical uninformed order into all three pools. What it receives LESS than the
    ///      frictionless control is that pool's cost to benign flow: the friction budget the
    ///      equal-cost comparison is built on.
    function _noise(uint256 t) internal {
        uint256 hh = uint256(keccak256(abi.encode(SEED, t, "noise")));
        bool zeroForOne = (hh & 1) == 0;
        uint256 wethSize = 5e16 + (hh % 3e18);
        uint256 amt = zeroForOne ? wethSize : FullMath.mulDiv(wethSize, fair, WAD);
        (, uint256 gotOn) = _swap(keyOn, zeroForOne, amt, "poincare", "noise");
        (, uint256 gotOff) = _swap(keyOff, zeroForOne, amt, "control", "noise");
        (, uint256 gotVf) = _swap(keyVf, zeroForOne, amt, "volfee", "noise");
        if (gotOff > gotOn) {
            cumNoiseOn += zeroForOne ? (gotOff - gotOn) : FullMath.mulDiv(gotOff - gotOn, fair, WAD);
        }
        if (gotOff > gotVf) {
            cumNoiseVf += zeroForOne ? (gotOff - gotVf) : FullMath.mulDiv(gotOff - gotVf, fair, WAD);
        }
    }

    function _swap(PoolKey memory k, bool zeroForOne, uint256 amtIn, string memory pool, string memory kind)
        internal
        returns (uint256 spent, uint256 got)
    {
        if (amtIn == 0) return (0, 0);
        (uint256 inB, uint256 outB) = _bals(k, zeroForOne);
        try router.swapExactTokensForTokens(amtIn, 0, zeroForOne, k, Constants.ZERO_BYTES, address(this), block.timestamp + 1)
        {
            (uint256 inA, uint256 outA) = _bals(k, zeroForOne);
            spent = inB - inA;
            got = outA - outB;
            orderId++;
            _logOrder(pool, kind, zeroForOne, spent, got);
        } catch {}
    }

    function _bals(PoolKey memory k, bool zeroForOne) internal view returns (uint256 inB, uint256 outB) {
        Currency inC = zeroForOne ? k.currency0 : k.currency1;
        Currency outC = zeroForOne ? k.currency1 : k.currency0;
        inB = inC.balanceOf(address(this));
        outB = outC.balanceOf(address(this));
    }

    function _logOrder(string memory pool, string memory kind, bool z, uint256 amtIn, uint256 amtOut) internal {
        string memory r = string.concat(vm.toString(orderId), ",", vm.toString(block.number));
        r = string.concat(r, ",", pool, ",", kind, ",", z ? "1" : "0");
        r = string.concat(r, ",", vm.toString(amtIn), ",", vm.toString(amtOut));
        vm.writeLine(OB, r);
    }

    function _record(uint256 t, uint8 phase) internal {
        string memory pOnS;
        string memory pOffS;
        string memory lpOnS;
        string memory lpOffS;
        string memory lpVfS;
        {
            (uint256 a, uint256 b) = hookOn.reserves();
            pOnS = vm.toString(FullMath.mulDiv(b, WAD, a));
            lpOnS = vm.toString(FullMath.mulDiv(a, fair, WAD) + b);
        }
        {
            (uint256 a, uint256 b) = hookOff.reserves();
            pOffS = vm.toString(FullMath.mulDiv(b, WAD, a));
            lpOffS = vm.toString(FullMath.mulDiv(a, fair, WAD) + b);
        }
        {
            (uint256 a, uint256 b) = hookVf.reserves();
            lpVfS = vm.toString(FullMath.mulDiv(a, fair, WAD) + b);
        }
        string memory row = string.concat(vm.toString(t), ",", vm.toString(uint256(phase)), ",", vm.toString(fair), ",", pOnS);
        row = string.concat(row, ",", pOffS, ",", vm.toString(hookOn.kappa()), ",", vm.toString(uint256(hookOn.trend())));
        row = string.concat(row, ",", vm.toString(hookOn.directionalEfficiency()), ",", lpOnS, ",", lpOffS);
        row = string.concat(row, ",", vm.toString(cumLvrOn), ",", vm.toString(cumLvrOff), ",", vm.toString(cumNoiseOn));
        row = string.concat(row, ",", lpVfS, ",", vm.toString(cumLvrVf), ",", vm.toString(cumNoiseVf));
        vm.writeLine(TS, row);
    }

    function _writeSummary(uint256 per) internal {
        vm.writeFile(SUM, "phase,blocks,lvr_poincare,lvr_control,lvr_reduction_bps,lvr_volfee\n");
        for (uint256 i = 0; i < PHASES; i++) {
            uint256 bps = lvrOffByPhase[i] > 0 && lvrOffByPhase[i] >= lvrOnByPhase[i]
                ? (lvrOffByPhase[i] - lvrOnByPhase[i]) * 10000 / lvrOffByPhase[i]
                : 0;
            string memory r = string.concat("month_", vm.toString(i + 1), ",", vm.toString(per));
            r = string.concat(r, ",", vm.toString(lvrOnByPhase[i]), ",", vm.toString(lvrOffByPhase[i]), ",", vm.toString(bps));
            r = string.concat(r, ",", vm.toString(lvrVfByPhase[i]));
            vm.writeLine(SUM, r);
        }
    }

    /// @dev LP value marked at the fair price: the ground-truth metric. Cumulative arb
    ///      extraction alone understates the harm to a pool that simply sits mispriced,
    ///      which is exactly what a wide symmetric fee causes.
    function _lpValue(PoincareHook h) internal view returns (uint256) {
        (uint256 a, uint256 b) = h.reserves();
        return FullMath.mulDiv(a, fair, WAD) + b;
    }

    function _bps(uint256 lo, uint256 hi) internal pure returns (uint256) {
        return hi > lo && hi > 0 ? (hi - lo) * 10000 / hi : 0;
    }
}
