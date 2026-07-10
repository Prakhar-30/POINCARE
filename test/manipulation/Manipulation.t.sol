// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";
import {Cusum} from "../../src/libraries/Cusum.sol";
import {PoincareTestBase} from "../utils/PoincareTestBase.sol";

/// @title ManipulationTest: adversarial-CUSUM attacks against the live hook
/// @notice End-to-end (through the real PoolManager + router) checks of the manipulation layers
///         the design rests on:
///           1. A fake-trend round trip is strictly unprofitable: faking a trend to harden one
///              side gives NO recoupment on the other (soft) side, which trades at the base
///              price; the attacker only pays spread + impact. (`max_soft_gain < min_trigger_cost`
///              realised on-chain.)
///           2. A single-block flash cannot move the detector: it samples once per block off the
///              pre-swap (settled) price, so an intra-block spike that unwinds never feeds the
///              CUSUM (the A1 guard).
///           3. (v2) σ-inflation against the ADAPTIVE detector: whipsawing the pool
///              to inflate σ̂ and blind the standardized detector costs real money every block,
///              and the blindness decays with λ: a subsequent genuine trend is still detected.
contract ManipulationTest is PoincareTestBase {
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;

    uint256 constant DEADLINE = type(uint256).max;
    int24 constant MIN_TICK = -887220;
    int24 constant MAX_TICK = 887220;

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        hook = deployPoincare(defaultConfig(), 0x4444);
        poolKey = initPoincarePool(hook, currency0, currency1);

        IERC20Minimal(Currency.unwrap(currency0)).approve(address(hook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(hook), type(uint256).max);
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(100 ether, 100 ether, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );
    }

    function _sellExactIn(PoolKey memory key, uint256 amountIn, bool zeroForOne) internal returns (uint256 out) {
        Currency outC = zeroForOne ? currency1 : currency0;
        uint256 before = outC.balanceOf(address(this));
        swapRouter.swapExactTokensForTokens(
            amountIn, 0, zeroForOne, key, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        out = outC.balanceOf(address(this)) - before;
    }

    function _buyExactOut(PoolKey memory key, uint256 amountOut, bool zeroForOne) internal returns (uint256 spent) {
        Currency inC = zeroForOne ? currency0 : currency1;
        uint256 before = inC.balanceOf(address(this));
        swapRouter.swapTokensForExactTokens(
            amountOut, type(uint256).max, zeroForOne, key, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        spent = before - inC.balanceOf(address(this));
    }

    // ------------------------------------------------------------------

    /// @notice Attack layer 2: faking a trend then exploiting it round-trips at a loss. The
    ///         attacker drives a down-trend (κ engages, the SELL side hardens), then buys the
    ///         token0 back on the soft side: which trades at the base price, so there is nothing
    ///         to harvest. Net: token0 fully restored, token1 strictly down (spread + impact paid).
    function test_fakeTrendRoundTrip_isUnprofitable() public {
        uint256 t0Before = currency0.balanceOf(address(this));
        uint256 t1Before = currency1.balanceOf(address(this));

        // Fake a down-trend: sell token0 across successive blocks until the detector engages.
        for (uint256 i = 0; i < 8; i++) {
            vm.roll(block.number + 1);
            _sellExactIn(poolKey, 1 ether, true);
        }
        assertGt(hook.kappa(), 0, "attacker did engage the asymmetry");
        assertEq(uint256(hook.trend()), uint256(Cusum.Trend.Down), "trend is Down");

        // Now exploit it: buy the 8 token0 back on the soft (against-trend) side, same block so the
        // trend label stays Down (the buy side is the un-hardened one).
        _buyExactOut(poolKey, 8 ether, false);

        uint256 t0After = currency0.balanceOf(address(this));
        uint256 t1After = currency1.balanceOf(address(this));

        // token0 holding restored (we sold 8 and bought 8 back)...
        assertApproxEqAbs(t0After, t0Before, 2, "token0 holding restored by the round trip");
        // ...but token1 is strictly lower: the manipulation cost the attacker real value, and the
        // soft side offered no discount to recoup it (max_soft_gain == 0 < min_trigger_cost).
        assertLt(t1After, t1Before, "faking a trend must lose money on the round trip");
    }

    /// @notice Attack layer 1 (once-per-block sampling): a single-block flash cannot move the detector. In a
    ///         fresh block the hook samples ONE price: the pre-swap settled price: so an enormous
    ///         intra-block spike that unwinds in the same block never reaches the CUSUM.
    function test_singleBlockFlash_doesNotMoveDetector() public {
        // Establish a baseline sample in a calm pool.
        vm.roll(block.number + 1);
        _sellExactIn(poolKey, 0.01 ether, true);
        uint256 priceSampled = hook.lastSampledPriceWad();
        assertEq(hook.kappa(), 0, "calm: no asymmetry yet");

        // New block: a violent flash: dump 30 token0, then buy it all straight back: all within
        // ONE block. The detector samples once, at the start (pre-flash) price.
        vm.roll(block.number + 1);
        uint256 blockNow = block.number;
        _sellExactIn(poolKey, 30 ether, true); // first swap of the block -> the single sample happens here
        _buyExactOut(poolKey, 30 ether, false); // same block -> NOT re-sampled
        // unwind any residual so the flash is price-neutral overall
        _sellExactIn(poolKey, 0.01 ether, true);

        // The detector advanced exactly one block, off the pre-flash price: the 30-ether spike
        // was invisible to it, so it cannot be tricked into declaring a trend.
        assertEq(hook.lastSampledBlock(), blockNow, "sampled exactly this block");
        assertEq(hook.kappa(), 0, "an intra-block flash cannot engage the asymmetry");
        // The sampled price moved only by the tiny inter-block 0.01-ether trade, not the 30 spike.
        assertApproxEqRel(hook.lastSampledPriceWad(), priceSampled, 1e16, "sample tracks settled price, not the flash");
    }

    /// @notice The v2 second-order channel: inflate σ̂ with a whipsaw so the
    ///         standardized detector under-reads a subsequent real trend. Both prongs of the
    ///         defence are asserted: (a) the inflation itself burns money every block (impact
    ///         paid twice per whipsaw, priced by arbitrage in the wild), and (b) the blindness
    ///         is TRANSIENT: σ̂ decays with λ, so a sustained genuine trend still fires and the
    ///         whipsaw itself (pure chop) never engages κ.
    function test_sigmaInflation_costsMoneyAndDoesNotBlindForLong() public {
        (PoincareHook aHook, PoolKey memory aKey) = _deployAdaptivePool();

        uint256 t0Before = currency0.balanceOf(address(this));
        uint256 t1Before = currency1.balanceOf(address(this));

        // Phase 1: the attack: 12 blocks of violent whipsaw (5% of reserves, alternating).
        for (uint256 i = 0; i < 12; i++) {
            vm.roll(block.number + 1);
            _sellExactIn(aKey, 5 ether, i % 2 == 0);
        }
        uint256 sigmaInflated = aHook.sigmaWad();
        assertGt(sigmaInflated, 0, "whipsaw inflated the sigma estimate");
        assertEq(aHook.kappa(), 0, "pure chop never engages kappa (the D gate)");

        // Prong (a): the whipsaw was not free. The pool started 1:1, the whipsaw is balanced,
        // and every leg pays price impact: the attacker's combined holdings strictly shrink.
        assertLt(
            currency0.balanceOf(address(this)) + currency1.balanceOf(address(this)),
            t0Before + t1Before,
            "sigma inflation burns value every block"
        );

        // Prong (b), part 1: once the whipsaw stops, the inflation DECAYS with lambda: a calm
        // stretch (dust trades keep the per-block sampling alive) walks sigma back down.
        for (uint256 i = 0; i < 6; i++) {
            vm.roll(block.number + 1);
            _sellExactIn(aKey, 0.01 ether, i % 2 == 0);
        }
        assertLt(aHook.sigmaWad(), sigmaInflated, "sigma inflation decays once the spending stops");

        // Prong (b), part 2: a genuine sustained trend still gets detected: the standardized
        // evidence re-emerges as sigma re-anchors to the real move.
        for (uint256 i = 0; i < 14; i++) {
            vm.roll(block.number + 1);
            _sellExactIn(aKey, 2 ether, true);
        }
        assertGt(aHook.kappa(), 0, "the adaptive detector recovers and fires on a real trend");
        assertEq(uint256(aHook.trend()), uint256(Cusum.Trend.Down), "trend detected as Down");
    }

    function _deployAdaptivePool() internal returns (PoincareHook aHook, PoolKey memory aKey) {
        aHook = deployPoincare(adaptiveConfig(), 0x5555);
        aKey = initPoincarePool(aHook, currency0, currency1);
        IERC20Minimal(Currency.unwrap(currency0)).approve(address(aHook), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(aHook), type(uint256).max);
        aHook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(100 ether, 100 ether, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );
    }
}
