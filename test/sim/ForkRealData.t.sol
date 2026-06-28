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

import {PoincareHook} from "../../src/PoincareHook.sol";
import {MintableERC20} from "./MintableERC20.sol";

/// @title ForkRealDataTest — feed REAL 6-month ETH/USDC history to the hook on a Sepolia v4 fork
/// @notice Identical comparative engine to ForkSimulation, but `fair` is driven by the REAL
///         Binance ETHUSDC 4h closes (Dec 2025 -> Jun 2026, 1080 points) fetched by
///         analysis/simulation/fetch_realdata.py into realdata/prices_wad.txt. Two pools on the
///         real Sepolia PoolManager — POINCARE (kappa_max 5%) vs CONTROL (kappa_max 0 = plain
///         constant product) — see how the detector + curve behave against true market action.
contract ForkRealDataTest is Test {
    using CurrencyLibrary for Currency;

    uint256 constant SEPOLIA = 11155111;
    uint256 constant WAD = 1e18;
    uint256 constant SEED = 0xA11CE;
    uint256 constant PHASES = 6; // monthly buckets for the summary

    // detector config tuned for 4h ETH returns (illustrative, not optimised)
    int256 constant K = 5e15; //      0.5% slack
    int256 constant H = 3e16; //      3% threshold
    int256 constant S_MAX = 1e17; //  10% cap
    uint256 constant KAPPA_MIN = 0;
    uint256 constant KAPPA_MAX = 5e16; // 5%
    uint256 constant D_MAX = 15e15; // 1.5%/block
    uint256 constant LAMBDA = 85e16; // ~1-day memory
    uint256 constant D_FLOOR = 55e16; // 0.55

    IPoolManager pm;
    IUniswapV4Router04 router;
    Currency c0; // WETH
    Currency c1; // USDC
    PoincareHook hookOn;
    PoincareHook hookOff;
    PoolKey keyOn;
    PoolKey keyOff;

    uint256[] prices; //   real ETH/USDC closes, WAD
    uint256 fair;
    uint256 cumLvrOn;
    uint256 cumLvrOff;
    uint256 cumNoiseOn;
    uint256 orderId;
    uint256 nPts;

    uint256[PHASES] lvrOnByPhase;
    uint256[PHASES] lvrOffByPhase;

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

        hookOn = _deployHook(KAPPA_MAX, 0x6666);
        hookOff = _deployHook(0, 0x7777);
        keyOn = _initPool(hookOn);
        keyOff = _initPool(hookOff);

        IERC20Minimal(Currency.unwrap(c0)).approve(address(router), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(router), type(uint256).max);

        fair = prices[0];
        _seed(hookOn);
        _seed(hookOff);
    }

    function _deployHook(uint256 kappaMax, uint160 ns) internal returns (PoincareHook h) {
        address flags = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                    | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
            ) ^ (uint160(ns) << 144)
        );
        deployCodeTo(
            "PoincareHook.sol:PoincareHook",
            abi.encode(pm, K, H, S_MAX, KAPPA_MIN, kappaMax, D_MAX, LAMBDA, D_FLOOR),
            flags
        );
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
        vm.writeFile(TS, "block,phase,fair,price_on,price_off,kappa,trend,d,lp_on,lp_off,cum_lvr_on,cum_lvr_off,cum_noise_on\n");
        vm.writeFile(OB, "id,block,pool,kind,zeroForOne,amount_in,amount_out\n");

        uint256 per = nPts / PHASES + 1;
        for (uint256 t = 1; t < nPts; t++) {
            vm.roll(block.number + 1);
            fair = prices[t];
            uint8 phase = uint8(t / per);
            if (phase >= PHASES) phase = uint8(PHASES - 1);

            uint256 lOn = _arb(hookOn, keyOn, true);
            uint256 lOff = _arb(hookOff, keyOff, false);
            cumLvrOn += lOn;
            cumLvrOff += lOff;
            lvrOnByPhase[phase] += lOn;
            lvrOffByPhase[phase] += lOff;

            _noise(t);
            _record(t, phase);
        }

        _writeSummary(per);
        console2.log("real-data run done; points:", nPts);
        console2.log("cum LVR POINCARE (USDC wei):", cumLvrOn);
        console2.log("cum LVR CONTROL  (USDC wei):", cumLvrOff);
        if (cumLvrOff > 0) console2.log("LVR reduction (bps):", (cumLvrOff - cumLvrOn) * 10000 / cumLvrOff);
        assertLe(cumLvrOn, cumLvrOff, "Poincare must not increase LVR vs the constant-product control");
    }

    // ------------------------------------------------------------------

    function _arb(PoincareHook h, PoolKey memory k, bool isOn) internal returns (uint256 lvrUsdc) {
        (uint256 r0, uint256 r1) = h.reserves();
        uint256 p = FullMath.mulDiv(r1, WAD, r0);
        uint256 kk = r0 * r1;
        if (fair > p) {
            uint256 s = h.effectiveSpread(false);
            if (FullMath.mulDiv(fair - p, WAD, p) <= s) return 0;
            uint256 r1t = Math.sqrt(FullMath.mulDiv(kk, fair, WAD));
            if (r1t <= r1) return 0;
            (uint256 spent, uint256 got) = _swap(k, false, r1t - r1, isOn, "arb");
            uint256 vOut = FullMath.mulDiv(got, fair, WAD);
            if (vOut > spent) lvrUsdc = vOut - spent;
        } else if (fair < p) {
            uint256 s = h.effectiveSpread(true);
            if (FullMath.mulDiv(p - fair, WAD, p) <= s) return 0;
            uint256 r0t = Math.sqrt(FullMath.mulDiv(kk, WAD, fair));
            if (r0t <= r0) return 0;
            (uint256 spent, uint256 got) = _swap(k, true, r0t - r0, isOn, "arb");
            uint256 vIn = FullMath.mulDiv(spent, fair, WAD);
            if (got > vIn) lvrUsdc = got - vIn;
        }
    }

    function _noise(uint256 t) internal {
        uint256 hh = uint256(keccak256(abi.encode(SEED, t, "noise")));
        bool zeroForOne = (hh & 1) == 0;
        uint256 wethSize = 5e16 + (hh % 3e18);
        uint256 amt = zeroForOne ? wethSize : FullMath.mulDiv(wethSize, fair, WAD);
        (, uint256 gotOn) = _swap(keyOn, zeroForOne, amt, true, "noise");
        (, uint256 gotOff) = _swap(keyOff, zeroForOne, amt, false, "noise");
        if (gotOff > gotOn) {
            cumNoiseOn += zeroForOne ? (gotOff - gotOn) : FullMath.mulDiv(gotOff - gotOn, fair, WAD);
        }
    }

    function _swap(PoolKey memory k, bool zeroForOne, uint256 amtIn, bool isOn, string memory kind)
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
            _logOrder(isOn, kind, zeroForOne, spent, got);
        } catch {}
    }

    function _bals(PoolKey memory k, bool zeroForOne) internal view returns (uint256 inB, uint256 outB) {
        Currency inC = zeroForOne ? k.currency0 : k.currency1;
        Currency outC = zeroForOne ? k.currency1 : k.currency0;
        inB = inC.balanceOf(address(this));
        outB = outC.balanceOf(address(this));
    }

    function _logOrder(bool isOn, string memory kind, bool z, uint256 amtIn, uint256 amtOut) internal {
        string memory r = string.concat(vm.toString(orderId), ",", vm.toString(block.number));
        r = string.concat(r, ",", isOn ? "poincare" : "control", ",", kind, ",", z ? "1" : "0");
        r = string.concat(r, ",", vm.toString(amtIn), ",", vm.toString(amtOut));
        vm.writeLine(OB, r);
    }

    function _record(uint256 t, uint8 phase) internal {
        string memory pOnS;
        string memory pOffS;
        string memory lpOnS;
        string memory lpOffS;
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
        string memory row = string.concat(vm.toString(t), ",", vm.toString(uint256(phase)), ",", vm.toString(fair), ",", pOnS);
        row = string.concat(row, ",", pOffS, ",", vm.toString(hookOn.kappa()), ",", vm.toString(uint256(hookOn.trend())));
        row = string.concat(row, ",", vm.toString(hookOn.directionalEfficiency()), ",", lpOnS, ",", lpOffS);
        row = string.concat(row, ",", vm.toString(cumLvrOn), ",", vm.toString(cumLvrOff), ",", vm.toString(cumNoiseOn));
        vm.writeLine(TS, row);
    }

    function _writeSummary(uint256 per) internal {
        vm.writeFile(SUM, "phase,blocks,lvr_poincare,lvr_control,lvr_reduction_bps\n");
        for (uint256 i = 0; i < PHASES; i++) {
            uint256 bps = lvrOffByPhase[i] > 0 && lvrOffByPhase[i] >= lvrOnByPhase[i]
                ? (lvrOffByPhase[i] - lvrOnByPhase[i]) * 10000 / lvrOffByPhase[i]
                : 0;
            string memory r = string.concat("month_", vm.toString(i + 1), ",", vm.toString(per));
            r = string.concat(r, ",", vm.toString(lvrOnByPhase[i]), ",", vm.toString(lvrOffByPhase[i]), ",", vm.toString(bps));
            vm.writeLine(SUM, r);
        }
    }
}
