// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseCustomCurve} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomCurve.sol";
import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

import {Cusum} from "./libraries/Cusum.sol";
import {DirectionalSignal} from "./libraries/DirectionalSignal.sol";
import {ControlLaw} from "./libraries/ControlLaw.sol";
import {AsymmetricCurve} from "./libraries/AsymmetricCurve.sol";
import {PriceLib} from "./libraries/PriceLib.sol";

/// @title PoincareHook — adaptive custom-curve hook (CLAUDE.md §5; assembles M1–M4)
/// @notice A two-asset, custom-curve Uniswap v4 hook. It prices swaps on a constant-product
///         base and leans against detected price trends by charging a directional spread on
///         the with-trend side. The decision of *whether* to lean is made by a CUSUM
///         quickest-change detector confirmed by a directional-efficiency gate.
///
///         Pipeline, once per block (the A1 manipulation guard — intra-block flashes that
///         unwind do not feed the detector):
///           reserves -> price -> r_t = Δln(price)
///                    -> DirectionalSignal (EWMA D)  +  Cusum.updateCapped (evidence S)
///                    -> D >= D_floor AND S past h ?  -> ControlLaw -> bounded κ
///           per swap: with-trend side pays spread κ, stabilising side trades at base price.
///
/// @dev    SETTLEMENT is fully delegated to {BaseCustomCurve} (ERC-6909 claims, take/settle,
///         unlock). We only implement pricing (`_getUnspecifiedAmount`) and liquidity
///         (`_getAmountIn`/`_getAmountOut`/`_mint`/`_burn`).
/// @dev    RESERVES are the hook's ERC-6909 claim balances (read via `poolManager.balanceOf`),
///         never a manually-tracked variable — they stay consistent with actual holdings and
///         auto-update through settlement (OPEN_ITEMS B3). The detector watches THIS price,
///         not PoolManager slot0.
/// @dev    MVP SCOPE. Base depth is symmetric pure constant-product (offsets a=b=0); ALL
///         asymmetry is the arb-safe directional spread (OPEN_ITEMS D2/E1 — the curvature
///         lever is deferred pending the §4.2 manipulation sizing). `κ_max` is a tuning cap,
///         not yet the security cap (A3); manipulation sims (A4) are not yet built.
contract PoincareHook is BaseCustomCurve, ERC20 {
    using CurrencyLibrary for Currency;
    using Cusum for Cusum.State;
    using DirectionalSignal for DirectionalSignal.State;

    /// @dev Permanently-locked LP shares minted to a burn address on the first deposit, so the
    ///      share supply can never be driven to dust (first-depositor / inflation guard, A10).
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    // --- detector / curve configuration (injected, validated; CLAUDE.md §8) ---
    int256 public immutable k; //         CUSUM slack / noise floor
    int256 public immutable thresholdH; // CUSUM threshold + κ-ramp start
    int256 public immutable sMax; //      CUSUM cap + κ-ramp saturation
    uint256 public immutable kappaMin;
    uint256 public immutable kappaMax;
    uint256 public immutable dMax; //     max κ change per block (seam safety)
    uint256 public immutable lambda; //   EWMA decay
    uint256 public immutable dFloor; //   directional-efficiency gate (D must clear this)

    // --- detector state (single pool) ---
    Cusum.State private _cusum;
    DirectionalSignal.State private _signal;
    uint256 public kappa; //      current asymmetry intensity (WAD spread fraction)
    Cusum.Trend public trend; //  current detected trend direction
    uint256 public lastSampledPriceWad;
    uint256 public lastSampledBlock;

    constructor(
        IPoolManager _poolManager,
        int256 _k,
        int256 _h,
        int256 _sMax,
        uint256 _kappaMin,
        uint256 _kappaMax,
        uint256 _dMax,
        uint256 _lambda,
        uint256 _dFloor
    ) BaseHook(_poolManager) ERC20("Poincare LP", "POIN-LP") {
        require(Cusum.isValidConfig(_k, _h), "cusum cfg");
        require(DirectionalSignal.isValidConfig(_lambda), "ewma cfg");
        require(ControlLaw.isValidConfig(ControlLaw.Config(_h, _sMax, _kappaMin, _kappaMax, _dMax)), "control cfg");

        k = _k;
        thresholdH = _h;
        sMax = _sMax;
        kappaMin = _kappaMin;
        kappaMax = _kappaMax;
        dMax = _dMax;
        lambda = _lambda;
        dFloor = _dFloor;
    }

    // ------------------------------------------------------------------
    // swap pricing (the detector + curve)
    // ------------------------------------------------------------------

    /// @inheritdoc BaseCustomCurve
    /// @dev Reads pre-swap reserves, advances the detector at most once per block, then prices
    ///      the swap on the constant-product base with the active directional spread.
    function _getUnspecifiedAmount(SwapParams calldata params)
        internal
        override
        returns (uint256 unspecifiedAmount)
    {
        (uint256 r0, uint256 r1) = _reserves();
        require(r0 > 0 && r1 > 0, "no liquidity");

        _sampleAndUpdateDetector(r0, r1);

        bool exactInput = params.amountSpecified < 0;
        uint256 specifiedAmount = exactInput ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        uint256 spread = _spreadFor(params.zeroForOne);

        if (exactInput) {
            unspecifiedAmount =
                AsymmetricCurve.swapExactInWithSpread(r0, r1, 0, 0, specifiedAmount, params.zeroForOne, spread);
        } else {
            unspecifiedAmount =
                AsymmetricCurve.swapExactOutWithSpread(r0, r1, 0, 0, specifiedAmount, params.zeroForOne, spread);
        }
    }

    /// @dev Advance the detector using the inter-block price change, at most once per block.
    ///      Sampling at the first swap of a block uses pre-swap reserves (= previous block's
    ///      settled state), so an intra-block flash that unwinds cannot move the detector (A1).
    function _sampleAndUpdateDetector(uint256 r0, uint256 r1) internal {
        if (block.number == lastSampledBlock) return;

        uint256 priceNow = PriceLib.priceWad(r0, r1);
        uint256 prev = lastSampledPriceWad;
        lastSampledPriceWad = priceNow;
        lastSampledBlock = block.number;
        if (prev == 0) return; // first ever sample: establish the baseline, no return yet

        int256 r = PriceLib.logReturnWad(prev, priceNow);
        _signal = _signal.update(r, lambda);
        _cusum = _cusum.updateCapped(r, k, sMax);

        // Dominant side = candidate trend + its evidence (statistics are already >= 0, capped).
        (Cusum.Trend dir, int256 evidence) =
            _cusum.sPos >= _cusum.sNeg ? (Cusum.Trend.Up, _cusum.sPos) : (Cusum.Trend.Down, _cusum.sNeg);

        // Directional-efficiency gate: asymmetry engages only if the move is genuinely
        // directional (D >= D_floor), not just a sustained drift. Otherwise feed 0 evidence
        // so κ ramps back down (CLAUDE.md §1.1 D as confirmation; resolves OPEN_ITEMS G1).
        int256 gatedEvidence = _signal.signal() >= dFloor ? evidence : int256(0);

        kappa = ControlLaw.step(kappa, gatedEvidence, ControlLaw.Config(thresholdH, sMax, kappaMin, kappaMax, dMax));

        // Only re-label the trend when there is live (gated) evidence. If evidence is gated
        // off (chop / D below floor) we retain the prior label so it keeps matching the side
        // κ was built for while κ ramps back down — otherwise a noise-driven flip of the
        // dominant statistic could harden the wrong side during a reversal (a stale-label
        // seam). Once κ reaches 0 the label is irrelevant (`_spreadFor` returns 0).
        if (gatedEvidence > 0) trend = dir;
    }

    /// @inheritdoc BaseCustomCurve
    /// @dev No LP fee mechanism — the lever is the curve/detector, not a fee (CLAUDE.md §10).
    ///      The directional spread already routes value to LPs by hardening the toxic side.
    function _getSwapFeeAmount(SwapParams calldata, uint256) internal pure override returns (uint256) {
        return 0;
    }

    /// @dev The spread applied to a swap: κ on the with-trend side, 0 otherwise.
    ///      With-trend = pushing price further along the detected trend:
    ///        up-trend  -> buying token0  (price up)   -> oneForZero (!zeroForOne)
    ///        down-trend-> selling token0 (price down) -> zeroForOne
    function _spreadFor(bool zeroForOne) internal view returns (uint256) {
        if (kappa == 0) return 0;
        bool withTrend =
            (trend == Cusum.Trend.Up && !zeroForOne) || (trend == Cusum.Trend.Down && zeroForOne);
        return withTrend ? kappa : 0;
    }

    /// @notice The directional spread the curve would charge a swap in `zeroForOne` direction,
    ///         given the CURRENT detector state (WAD fraction). Exposed so the Lens (and routers)
    ///         price off the EXACT value the swap path uses — there is no duplicated spread logic
    ///         to drift from `_getUnspecifiedAmount` (CLAUDE.md §5 "cannot diverge").
    /// @dev    A quote reflects the detector state as of the last update. At the first swap of a
    ///         new block the detector re-samples in `beforeSwap` BEFORE pricing, so a realized
    ///         swap may use a freshly-updated spread; quote consumers should treat this as a
    ///         same-block quote (true for any stateful-fee AMM).
    function effectiveSpread(bool zeroForOne) external view returns (uint256) {
        return _spreadFor(zeroForOne);
    }

    // ------------------------------------------------------------------
    // liquidity (hook-owned; deposits at the current reserve ratio)
    // ------------------------------------------------------------------

    /// @inheritdoc BaseCustomCurve
    function _getAmountIn(AddLiquidityParams memory params)
        internal
        override
        returns (uint256 amount0, uint256 amount1, uint256 shares)
    {
        (uint256 r0, uint256 r1) = _reserves();
        uint256 supply = totalSupply();

        if (supply == 0) {
            // First deposit seeds the curve; shares = geometric mean of the deposit. A fixed
            // MINIMUM_LIQUIDITY is locked forever on the first mint (see `_mint`) so the share
            // supply can never be driven to dust — the standard first-depositor / inflation
            // guard (OPEN_ITEMS A10). Reserves are ERC-6909 claims, not raw `balanceOf`, so a
            // plain token donation cannot skew them either; this is belt-and-suspenders.
            amount0 = params.amount0Desired;
            amount1 = params.amount1Desired;
            shares = Math.sqrt(amount0 * amount1);
            require(shares > MINIMUM_LIQUIDITY, "insufficient");
        } else {
            // Add at the current reserve ratio; take the side that limits.
            uint256 amount1Optimal = FullMath.mulDiv(params.amount0Desired, r1, r0);
            if (amount1Optimal <= params.amount1Desired) {
                amount0 = params.amount0Desired;
                amount1 = amount1Optimal;
            } else {
                amount0 = FullMath.mulDiv(params.amount1Desired, r0, r1);
                amount1 = params.amount1Desired;
            }
            shares = FullMath.mulDiv(amount0, supply, r0);
            require(shares > 0, "insufficient");
        }
    }

    /// @inheritdoc BaseCustomCurve
    function _getAmountOut(RemoveLiquidityParams memory params)
        internal
        override
        returns (uint256 amount0, uint256 amount1, uint256 shares)
    {
        (uint256 r0, uint256 r1) = _reserves();
        uint256 supply = totalSupply();
        shares = params.liquidity;
        amount0 = FullMath.mulDiv(shares, r0, supply);
        amount1 = FullMath.mulDiv(shares, r1, supply);
    }

    function _mint(AddLiquidityParams memory, BalanceDelta, BalanceDelta, uint256 shares) internal override {
        if (totalSupply() == 0) {
            // Lock MINIMUM_LIQUIDITY permanently in a burn address on the first mint (A10).
            _mint(address(0xdead), MINIMUM_LIQUIDITY);
            _mint(msg.sender, shares - MINIMUM_LIQUIDITY);
        } else {
            _mint(msg.sender, shares);
        }
    }

    function _burn(RemoveLiquidityParams memory, BalanceDelta, BalanceDelta, uint256 shares) internal override {
        _burn(msg.sender, shares);
    }

    // ------------------------------------------------------------------
    // views
    // ------------------------------------------------------------------

    /// @notice Current reserves = the hook's ERC-6909 claim balances of each currency.
    function _reserves() internal view returns (uint256 r0, uint256 r1) {
        PoolKey memory key = poolKey();
        r0 = poolManager.balanceOf(address(this), key.currency0.toId());
        r1 = poolManager.balanceOf(address(this), key.currency1.toId());
    }

    /// @notice Expose reserves and detector state for routers / the Lens (read-only).
    function reserves() external view returns (uint256 r0, uint256 r1) {
        return _reserves();
    }

    /// @notice Current directional-efficiency D (WAD) implied by the detector state.
    function directionalEfficiency() external view returns (uint256) {
        return _signal.signal();
    }
}
