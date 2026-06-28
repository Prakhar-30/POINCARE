// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook} from "../src/PoincareHook.sol";
import {PoincareLens} from "../src/PoincareLens.sol";
import {Cusum} from "../src/libraries/Cusum.sol";
import {BaseTest} from "./utils/BaseTest.sol";

/// @title PoincareLensTest — the Lens quotes must match on-chain execution (CLAUDE.md §5, M7)
/// @notice Proves the read-only quoter prices identically to the hook's swap path — to the wei,
///         rounding included — in both the calm (symmetric, spread 0) and trend (hardened side)
///         regimes, for exact-input and exact-output. This is the "cannot diverge" guarantee:
///         the Lens reads reserves + the directional spread from the hook and runs the SAME
///         `AsymmetricCurve` library the hook runs.
contract PoincareLensTest is BaseTest {
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;
    PoincareLens lens;

    uint256 constant DEADLINE = type(uint256).max;
    int24 constant MIN_TICK = -887220;
    int24 constant MAX_TICK = 887220;

    // Same illustrative config as PoincareHook.t.sol (a real move engages quickly).
    int256 constant K = 1e15;
    int256 constant H = 5e15;
    int256 constant S_MAX = 2e16;
    uint256 constant KAPPA_MIN = 0;
    uint256 constant KAPPA_MAX = 1e17;
    uint256 constant D_MAX = 5e16;
    uint256 constant LAMBDA = 9e17;
    uint256 constant D_FLOOR = 5e17;

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        address flags = address(
            uint160(
                Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                    | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
            ) ^ (0x4444 << 144)
        );
        bytes memory args = abi.encode(poolManager, K, H, S_MAX, KAPPA_MIN, KAPPA_MAX, D_MAX, LAMBDA, D_FLOOR);
        deployCodeTo("PoincareHook.sol:PoincareHook", args, flags);
        hook = PoincareHook(payable(flags));
        lens = new PoincareLens(hook);

        poolKey = PoolKey(currency0, currency1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        IERC20Minimal(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(10 ether, 10 ether, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );
    }

    function _swapIn(uint256 amountIn, bool zeroForOne) internal returns (uint256 received) {
        Currency outC = zeroForOne ? currency1 : currency0;
        uint256 before = outC.balanceOf(address(this));
        swapRouter.swapExactTokensForTokens(amountIn, 0, zeroForOne, poolKey, Constants.ZERO_BYTES, address(this), block.timestamp + 1);
        received = outC.balanceOf(address(this)) - before;
    }

    function _swapOut(uint256 amountOut, bool zeroForOne) internal returns (uint256 spent) {
        Currency inC = zeroForOne ? currency0 : currency1;
        uint256 before = inC.balanceOf(address(this));
        swapRouter.swapTokensForExactTokens(
            amountOut, type(uint256).max, zeroForOne, poolKey, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        spent = before - inC.balanceOf(address(this));
    }

    function _engageDownTrend() internal {
        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            _swapIn(1 ether, true); // sell token0 -> price falls -> down-trend
        }
    }

    // ------------------------------------------------------------------

    function test_midPrice_isReserveRatio() public view {
        // 10:10 reserves -> price token1/token0 == 1.0 (WAD).
        assertEq(lens.midPriceWad(), 1e18, "mid price = r1/r0");
    }

    function test_snapshot_reportsSeededState() public view {
        (uint256 r0, uint256 r1, uint256 kappa, Cusum.Trend trend, uint256 d) = lens.snapshot();
        assertEq(r0, 10 ether, "reserve0");
        assertEq(r1, 10 ether, "reserve1");
        assertEq(kappa, 0, "calm: kappa 0");
        assertEq(uint256(trend), uint256(Cusum.Trend.None), "calm: no trend");
        assertEq(d, 0, "calm: D 0 before any move");
    }

    function test_quoteExactInput_matchesExecution_calm() public {
        uint256 quote = lens.quoteExactInput(true, 1 ether);
        uint256 received = _swapIn(1 ether, true);
        assertEq(received, quote, "calm exact-in quote must equal execution");
        assertGt(received, 0, "non-trivial output");
    }

    function test_quoteExactOutput_matchesExecution_calm() public {
        uint256 quote = lens.quoteExactOutput(true, 1 ether);
        uint256 spent = _swapOut(1 ether, true);
        assertEq(spent, quote, "calm exact-out quote must equal execution");
    }

    function test_quoteExactInput_matchesExecution_withTrend() public {
        _engageDownTrend();
        // Still in the last engaged block: the detector already sampled this block, so a further
        // swap will NOT re-sample -> spread is stable -> the quote must match execution exactly.
        assertGt(hook.kappa(), 0, "trend engaged");
        (uint256 sZ41,) = lens.spreads();
        assertGt(sZ41, 0, "with-trend (zeroForOne) side is hardened");

        uint256 quote = lens.quoteExactInput(true, 1 ether); // with-trend (down) side
        uint256 received = _swapIn(1 ether, true);
        assertEq(received, quote, "with-trend exact-in quote must equal execution");
    }

    function test_quoteExactInput_matchesExecution_againstTrend() public {
        _engageDownTrend();
        // Against-trend (oneForZero) side trades at the base price (spread 0).
        (, uint256 sOneForZero) = lens.spreads();
        assertEq(sOneForZero, 0, "against-trend side carries no spread");

        uint256 quote = lens.quoteExactInput(false, 1 ether);
        uint256 received = _swapIn(1 ether, false);
        assertEq(received, quote, "against-trend exact-in quote must equal execution");
    }

    function test_quoteExactOutput_matchesExecution_withTrend() public {
        _engageDownTrend();
        uint256 quote = lens.quoteExactOutput(true, 1 ether);
        uint256 spent = _swapOut(1 ether, true);
        assertEq(spent, quote, "with-trend exact-out quote must equal execution");
    }

    function test_spreads_areAsymmetricInTrend() public {
        _engageDownTrend();
        (uint256 sZeroForOne, uint256 sOneForZero) = lens.spreads();
        // Down-trend: selling token0 (zeroForOne) is with-trend (hardened); buying is soft.
        assertEq(sZeroForOne, hook.kappa(), "with-trend spread == kappa");
        assertEq(sOneForZero, 0, "against-trend spread == 0");
        assertGt(sZeroForOne, sOneForZero, "executable curve has a directional bid-ask spread");
    }
}
