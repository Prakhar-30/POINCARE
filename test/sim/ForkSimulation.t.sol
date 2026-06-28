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
import {Cusum} from "../../src/libraries/Cusum.sol";
import {MintableERC20} from "./MintableERC20.sol";

/// @title ForkSimulationTest — comparative WETH/USDC simulation on a Sepolia v4 fork (real PoolManager)
/// @notice Two IDENTICAL pools on the real Sepolia Uniswap v4 PoolManager, seeded the same and fed
///         the SAME fair-price path + the SAME order flow, differing in ONE thing only:
///           * POINCARE  — the hook with the detector + directional spread live;
///           * CONTROL   — the same hook with kappa_max = 0, i.e. a pure constant-product AMM.
///         The control IS the apples-to-apples baseline (everything else equal), so any difference
///         in LP value / LVR is attributable purely to the Poincaré asymmetry.
///
///         Each block: the fair price advances per a regime schedule (8 stress scenarios), an
///         arbitrageur drags each pool toward fair (the LVR channel), and an identical noise order
///         hits both pools. Every order is logged (the "order book"); per-block pool state and a
///         per-scenario summary are written as CSVs for plotting.
///
///         WETH/USDC are 18-decimal mocks (the detector + curve are decimal-agnostic — log-returns
///         are scale-invariant), priced at 3000 USDC/WETH. token0=WETH, token1=USDC,
///         price = token1/token0 = USDC per WETH.
contract ForkSimulationTest is Test {
    using CurrencyLibrary for Currency;

    uint256 constant SEPOLIA = 11155111;
    uint256 constant WAD = 1e18;
    uint256 constant LEN = 130; //          blocks per scenario
    uint256 constant NSCEN = 8;
    uint256 constant T = LEN * NSCEN; //    total blocks (1040)
    uint256 constant SEED = 0xBEEF;

    // detector / curve config for the live pool
    int256 constant K = 3e15;
    int256 constant H = 2e16;
    int256 constant S_MAX = 8e16;
    uint256 constant KAPPA_MIN = 0;
    uint256 constant KAPPA_MAX = 5e16; //   5% cap
    uint256 constant D_MAX = 2e16;
    uint256 constant LAMBDA = 8e17;
    uint256 constant D_FLOOR = 6e17;

    IPoolManager pm;
    IUniswapV4Router04 router;

    Currency c0; // WETH
    Currency c1; // USDC

    PoincareHook hookOn;
    PoincareHook hookOff;
    PoolKey keyOn;
    PoolKey keyOff;

    uint256 fair; //         current fair price (USDC/WETH, WAD)
    uint256 cumLvrOn;
    uint256 cumLvrOff;
    uint256 cumNoiseOn; //   extra USDC noise flow lost on the live pool vs control (spread tax)
    uint256 orderId;

    // per-scenario buckets
    uint256[NSCEN] lvrOnByScen;
    uint256[NSCEN] lvrOffByScen;
    uint256[NSCEN] noiseCostByScen;

    string constant TS = "analysis/simulation/timeseries.csv";
    string constant OB = "analysis/simulation/orders.csv";
    string constant SUM = "analysis/simulation/summary.csv";

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("sepolia"));
        pm = IPoolManager(AddressConstants.getPoolManagerAddress(SEPOLIA));
        router = IUniswapV4Router04(payable(AddressConstants.getV4SwapRouterAddress(SEPOLIA)));

        MintableERC20 a = new MintableERC20("WETH", "WETH");
        MintableERC20 b = new MintableERC20("USDC", "USDC");
        (c0, c1) = address(a) < address(b)
            ? (Currency.wrap(address(a)), Currency.wrap(address(b)))
            : (Currency.wrap(address(b)), Currency.wrap(address(a)));
        MintableERC20(Currency.unwrap(c0)).mint(address(this), 1e33);
        MintableERC20(Currency.unwrap(c1)).mint(address(this), 1e33);

        hookOn = _deployHook(KAPPA_MAX, 0x4444);
        hookOff = _deployHook(0, 0x5555); // control: kappa_max = 0 -> pure constant product
        keyOn = _initPool(hookOn);
        keyOff = _initPool(hookOff);

        IERC20Minimal(Currency.unwrap(c0)).approve(address(router), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(router), type(uint256).max);

        _seed(hookOn);
        _seed(hookOff);

        fair = 3000 * WAD;
    }

    function _deployHook(uint256 kappaMax, uint160 ns) internal returns (PoincareHook h) {
        address flags = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                    | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
            ) ^ (uint160(ns) << 144)
        );
        bytes memory args =
            abi.encode(pm, K, H, S_MAX, KAPPA_MIN, kappaMax, D_MAX, LAMBDA, D_FLOOR);
        deployCodeTo("PoincareHook.sol:PoincareHook", args, flags);
        h = PoincareHook(payable(flags));
    }

    function _initPool(PoincareHook h) internal returns (PoolKey memory k) {
        k = PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(h));
        pm.initialize(k, Constants.SQRT_PRICE_1_1);
        IERC20Minimal(Currency.unwrap(c0)).approve(address(h), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(h), type(uint256).max);
    }

    function _seed(PoincareHook h) internal {
        // 1000 WETH : 3,000,000 USDC -> price 3000
        h.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(1000e18, 3_000_000e18, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );
    }

    // ------------------------------------------------------------------

    function test_runSimulation() public {
        vm.writeFile(TS, "block,scenario,fair,price_on,price_off,kappa,trend,d,lp_on,lp_off,cum_lvr_on,cum_lvr_off,cum_noise_on\n");
        vm.writeFile(OB, "id,block,scenario,pool,kind,zeroForOne,amount_in,amount_out\n");

        for (uint256 blk = 1; blk <= T; blk++) {
            vm.roll(block.number + 1);
            (int256 drift, uint256 sigma, uint8 scen) = _regime(blk);
            _advanceFair(drift, sigma, blk);

            uint256 lOn = _arb(hookOn, keyOn, true, scen);
            uint256 lOff = _arb(hookOff, keyOff, false, scen);
            cumLvrOn += lOn;
            cumLvrOff += lOff;
            lvrOnByScen[scen] += lOn;
            lvrOffByScen[scen] += lOff;

            _noise(blk, scen);
            _record(blk, scen);
        }

        _writeSummary();
        console2.log("simulation done; blocks:", T);
        console2.log("cum LVR  POINCARE (USDC wei):", cumLvrOn);
        console2.log("cum LVR  CONTROL  (USDC wei):", cumLvrOff);
        if (cumLvrOff > 0) {
            console2.log("LVR reduction (bps):", (cumLvrOff - cumLvrOn) * 10000 / cumLvrOff);
        }
        // Sanity: the live pool must not LOSE more to arb than a plain constant-product pool.
        assertLe(cumLvrOn, cumLvrOff, "Poincare must not increase LVR vs the constant-product control");
    }

    // ------------------------------------------------------------------
    // regime schedule (8 stress scenarios)
    // ------------------------------------------------------------------

    function _regime(uint256 blk) internal pure returns (int256 drift, uint256 sigma, uint8 scen) {
        uint256 seg = (blk - 1) / LEN;
        uint256 w = (blk - 1) % LEN;
        scen = uint8(seg);
        if (seg == 0) {
            (drift, sigma) = (int256(0), 3e15); // calm
        } else if (seg == 1) {
            (drift, sigma) = (int256(4e15), 4e15); // mild up-trend
        } else if (seg == 2) {
            (drift, sigma) = (int256(10e15), 6e15); // strong up-trend
        } else if (seg == 3) {
            (drift, sigma) = (w % 12 < 8 ? int256(9e15) : int256(-9e15), 5e15); // up-trend with pullbacks
        } else if (seg == 4) {
            (drift, sigma) = (int256(-10e15), 6e15); // strong down-trend
        } else if (seg == 5) {
            (drift, sigma) = (w < 30 ? int256(-35e15) : int256(12e15), 8e15); // flash crash + recovery
        } else if (seg == 6) {
            (drift, sigma) = (w % 10 < 5 ? int256(14e15) : int256(-14e15), 9e15); // whipsaw / high-vol chop
        } else {
            (drift, sigma) = (int256(0), 2e15); // recovery calm
        }
    }

    function _advanceFair(int256 drift, uint256 sigma, uint256 blk) internal {
        uint256 h = uint256(keccak256(abi.encode(SEED, blk)));
        int256 noise = int256(h % (2 * sigma + 1)) - int256(sigma);
        int256 step = drift + noise; // log-ish step; apply multiplicatively
        if (step >= 0) {
            fair = fair * (WAD + uint256(step)) / WAD;
        } else {
            fair = fair * (WAD - uint256(-step)) / WAD;
        }
        if (fair < 300 * WAD) fair = 300 * WAD;
        if (fair > 30000 * WAD) fair = 30000 * WAD;
    }

    // ------------------------------------------------------------------
    // arbitrage (the LVR channel)
    // ------------------------------------------------------------------

    function _arb(PoincareHook h, PoolKey memory k, bool isOn, uint8 scen) internal returns (uint256 lvrUsdc) {
        (uint256 r0, uint256 r1) = h.reserves();
        uint256 p = FullMath.mulDiv(r1, WAD, r0);
        uint256 kk = r0 * r1;

        if (fair > p) {
            uint256 s = h.effectiveSpread(false); // raising price = oneForZero side
            if (FullMath.mulDiv(fair - p, WAD, p) <= s) return 0; // inside the no-arb band
            uint256 r1t = Math.sqrt(FullMath.mulDiv(kk, fair, WAD));
            if (r1t <= r1) return 0;
            (uint256 spent, uint256 got) = _swap(k, false, r1t - r1, isOn, scen, "arb");
            uint256 vOut = FullMath.mulDiv(got, fair, WAD); // token0 (WETH) valued in USDC
            if (vOut > spent) lvrUsdc = vOut - spent;
        } else if (fair < p) {
            uint256 s = h.effectiveSpread(true); // lowering price = zeroForOne side
            if (FullMath.mulDiv(p - fair, WAD, p) <= s) return 0;
            uint256 r0t = Math.sqrt(FullMath.mulDiv(kk, WAD, fair));
            if (r0t <= r0) return 0;
            (uint256 spent, uint256 got) = _swap(k, true, r0t - r0, isOn, scen, "arb");
            uint256 vIn = FullMath.mulDiv(spent, fair, WAD); // token0 (WETH) paid, in USDC
            if (got > vIn) lvrUsdc = got - vIn;
        }
    }

    // ------------------------------------------------------------------
    // noise / uninformed flow (identical order on both pools)
    // ------------------------------------------------------------------

    function _noise(uint256 blk, uint8 scen) internal {
        uint256 h = uint256(keccak256(abi.encode(SEED, blk, "noise")));
        bool zeroForOne = (h & 1) == 0;
        uint256 wethSize = 5e16 + (h % 3e18); // 0.05 .. ~3 WETH notional
        uint256 amtOn;
        uint256 amtOff;
        if (zeroForOne) {
            amtOn = wethSize;
            amtOff = wethSize;
        } else {
            // oneForZero: pay USDC ~ notional * price
            amtOn = FullMath.mulDiv(wethSize, fair, WAD);
            amtOff = amtOn;
        }
        (, uint256 gotOn) = _swap(keyOn, zeroForOne, amtOn, true, scen, "noise");
        (, uint256 gotOff) = _swap(keyOff, zeroForOne, amtOff, false, scen, "noise");
        // the live pool's noise gets less out when it faces the spread -> a benign-flow tax.
        uint256 cost;
        if (gotOff > gotOn) {
            // normalise token0 outputs to USDC for comparability
            cost = zeroForOne ? (gotOff - gotOn) : FullMath.mulDiv(gotOff - gotOn, fair, WAD);
        }
        cumNoiseOn += cost;
        noiseCostByScen[scen] += cost;
    }

    // ------------------------------------------------------------------
    // swap + order-book logging
    // ------------------------------------------------------------------

    function _swap(PoolKey memory k, bool zeroForOne, uint256 amtIn, bool isOn, uint8 scen, string memory kind)
        internal
        returns (uint256 spent, uint256 got)
    {
        if (amtIn == 0) return (0, 0);
        Currency inC = zeroForOne ? k.currency0 : k.currency1;
        Currency outC = zeroForOne ? k.currency1 : k.currency0;
        uint256 inB = inC.balanceOf(address(this));
        uint256 outB = outC.balanceOf(address(this));
        try router.swapExactTokensForTokens(amtIn, 0, zeroForOne, k, Constants.ZERO_BYTES, address(this), block.timestamp + 1)
        {
            spent = inB - inC.balanceOf(address(this));
            got = outC.balanceOf(address(this)) - outB;
            orderId++;
            _logOrder(scen, isOn, kind, zeroForOne, spent, got);
        } catch {}
    }

    function _logOrder(uint8 scen, bool isOn, string memory kind, bool z, uint256 amtIn, uint256 amtOut) internal {
        string memory r = string.concat(vm.toString(orderId), ",", vm.toString(block.number), ",", vm.toString(uint256(scen)));
        r = string.concat(r, ",", isOn ? "poincare" : "control", ",", kind);
        r = string.concat(r, ",", z ? "1" : "0", ",", vm.toString(amtIn), ",", vm.toString(amtOut));
        vm.writeLine(OB, r);
    }

    // ------------------------------------------------------------------
    // per-block recording
    // ------------------------------------------------------------------

    function _record(uint256 blk, uint8 scen) internal {
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

        string memory row = string.concat(vm.toString(blk), ",", vm.toString(uint256(scen)), ",", vm.toString(fair), ",", pOnS);
        row = string.concat(row, ",", pOffS, ",", vm.toString(hookOn.kappa()), ",", vm.toString(uint256(hookOn.trend())));
        row = string.concat(row, ",", vm.toString(hookOn.directionalEfficiency()), ",", lpOnS, ",", lpOffS);
        row = string.concat(row, ",", vm.toString(cumLvrOn), ",", vm.toString(cumLvrOff), ",", vm.toString(cumNoiseOn));
        vm.writeLine(TS, row);
    }

    function _writeSummary() internal {
        vm.writeFile(SUM, "scenario,lvr_poincare,lvr_control,lvr_reduction_bps,noise_tax_poincare\n");
        string[NSCEN] memory names = [
            "calm", "mild_up", "strong_up", "uptrend_pullbacks", "strong_down", "flash_crash", "whipsaw", "recovery_calm"
        ];
        for (uint256 i = 0; i < NSCEN; i++) {
            uint256 bps = lvrOffByScen[i] > 0 && lvrOffByScen[i] >= lvrOnByScen[i]
                ? (lvrOffByScen[i] - lvrOnByScen[i]) * 10000 / lvrOffByScen[i]
                : 0;
            string memory r = string.concat(names[i], ",", vm.toString(lvrOnByScen[i]), ",", vm.toString(lvrOffByScen[i]));
            r = string.concat(r, ",", vm.toString(bps), ",", vm.toString(noiseCostByScen[i]));
            vm.writeLine(SUM, r);
        }
    }
}
