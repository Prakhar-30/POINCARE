// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseCustomCurve} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomCurve.sol";
import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

import {Cusum} from "./libraries/Cusum.sol";
import {DirectionalSignal} from "./libraries/DirectionalSignal.sol";
import {ControlLaw} from "./libraries/ControlLaw.sol";
import {AsymmetricCurve} from "./libraries/AsymmetricCurve.sol";
import {PriceLib} from "./libraries/PriceLib.sol";

/// @notice Full injected configuration of a Poincaré pool; nothing here is baked in.
///
///         Detector: `k/h/sMax` share one scale: absolute WAD log-return units when
///         `adaptive` is false, σ-units (WAD == 1σ of the live volatility estimate)
///         when true, so thresholds breathe with the market. `clipWad` Huber-clips the
///         per-block increment (same units as k/h). `sigmaFloor` (adaptive only) floors
///         the σ̂ used for standardization so a suppressed or cold σ̂ can neither make
///         the detector trigger-happy nor divide by zero.
///
///         Control law: κ bounds and the per-block rate limit. These are security
///         parameters and stay absolute, never data-driven.
///
///         Vol fee: fee = min(feeGamma·σ̂, feeCap), regenerated each block from realized
///         volatility.
///
///         Curve base: `alphaWad` sets the symmetric virtual depth; offsets are anchored
///         at the first deposit as a₀ = α·reserve0, b₀ = α·reserve1 and thereafter scale
///         with LP share supply. 0 means plain constant-product.
struct PoincareConfig {
    // detector
    int256 k; // CUSUM slack
    int256 h; // CUSUM threshold + kappa-ramp start
    int256 sMax; // CUSUM cap + kappa-ramp saturation (<= int128.max for packing)
    uint256 lambda; // EWMA decay for D and sigma
    uint256 dFloor; // directional-efficiency gate
    bool adaptive; // standardize CUSUM increments by live sigma
    uint256 sigmaFloor; // adaptive only: min sigma used for standardization (> 0)
    uint256 clipWad; // Huber clip on the increment (> 0)
    // control law
    uint256 kappaMin;
    uint256 kappaMax;
    uint256 dMax; // max kappa change per block
    // vol fee
    uint256 feeGamma; // fee = min(feeGamma * sigma / WAD, feeCap); 0 disables
    uint256 feeCap; // hard cap, WAD fraction < WAD
    // curve base
    uint256 alphaWad; // symmetric virtual-depth multiplier; 0 == pure x*y=k
}

/// @title PoincareHook - adaptive custom-curve hook
/// @notice A two-asset, custom-curve Uniswap v4 hook. Swaps are priced on a symmetric
///         (optionally deepened) constant-product base plus a volatility-scaled fee, and
///         the pool leans against detected price trends by charging a directional spread
///         on the with-trend side. Whether to lean is decided by a CUSUM quickest-change
///         detector confirmed by a directional-efficiency gate.
///
///         The detector samples at most once per block, on pre-swap reserves, so
///         intra-block flashes that unwind never feed it:
///           reserves -> executable mid -> r_t = Δln(price), Huber-clipped
///                    -> DirectionalSignal (EWMA D, σ̂) + Cusum.updateCapped (evidence S)
///                    -> D >= dFloor and S past h ? -> ControlLaw -> bounded κ
///         Then per swap: vol fee (both sides) + spread κ on the with-trend side only.
///
/// @dev    Settlement is fully delegated to {BaseCustomCurve} (ERC-6909 claims,
///         take/settle, unlock); this contract only implements pricing and liquidity.
///
///         Reserves are the hook's ERC-6909 claim balances, never a manually tracked
///         variable, so they stay consistent through settlement. The detector watches
///         the executable mid (r1+b)/(r0+a).
///
///         All detector logic lives in the view `_projectDetector`; the swap path
///         persists its result and `previewSpread`/`previewDetector` expose the same
///         projection read-only. The Lens quotes through these previews, so a quote
///         taken in a fresh block already reflects the sample the first swap of that
///         block will take: quotes match execution to the wei.
///
///         Depth safety: virtual offsets are anchored at the first deposit and scale
///         only with LP share supply. Swaps never move them, and ratio deposits and
///         withdrawals scale them homothetically, preserving the executable mid.
///         Re-anchoring offsets to current reserves per swap is round-trip drainable
///         (a two-swap counterexample empties the pool at alpha = 1) and must never
///         be reintroduced.
contract PoincareHook is BaseCustomCurve, ERC20 {
    using CurrencyLibrary for Currency;
    using Cusum for Cusum.State;
    using DirectionalSignal for DirectionalSignal.State;

    uint256 private constant WAD = 1e18;

    /// @dev Locked forever in a burn address on the first deposit, so the share supply
    ///      can never be driven to dust (first-depositor / inflation guard).
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    /// @notice One record per sampled block: the full detector trace. Indexers and the
    ///         frontend replay detector history from these, with no trusted writer.
    event DetectorSample(
        uint256 blockNumber,
        uint256 priceWad,
        int256 r,
        int256 sPos,
        int256 sNeg,
        uint256 dWad,
        uint256 sigmaWad,
        uint256 kappaWad,
        Cusum.Trend trend,
        uint256 feeWad
    );

    // configuration (injected, validated in the constructor)
    int256 public immutable k;
    int256 public immutable thresholdH;
    int256 public immutable sMax;
    uint256 public immutable lambda;
    uint256 public immutable dFloor;
    bool public immutable adaptive;
    uint256 public immutable sigmaFloor;
    uint256 public immutable clipWad;
    uint256 public immutable kappaMin;
    uint256 public immutable kappaMax;
    uint256 public immutable dMax;
    uint256 public immutable feeGamma;
    uint256 public immutable feeCap;
    uint256 public immutable alphaWad;

    // Detector state, packed to 4 slots. The downcasts are safe: sPos/sNeg live in
    // [0, sMax] with sMax <= int128.max (constructor-validated); |ewmaNet| <= ewmaTV <=
    // max|r| * WAD/(WAD-lambda) with a single-step |r| bounded by the lnWad domain
    // (~94e18), so even at lambda = WAD-1 the accumulators stay below int128.max;
    // kappa <= kappaMax < WAD < 2^63.
    int128 private _sPos;
    int128 private _sNeg; // slot 1
    int128 private _ewmaNet;
    uint128 private _ewmaTV; // slot 2
    uint64 private _kappa;
    Cusum.Trend private _trend;
    uint64 private _lastSampledBlock; // slot 3
    uint256 private _lastSampledPriceWad; // slot 4

    // Base-depth anchor, set once at the first deposit and supply-scaled after.
    uint128 private _a0;
    uint128 private _b0;
    uint256 private _supply0; // post-seed LP share supply the offsets are anchored to

    /// @dev Held across add/remove liquidity incl. settlement; `_beforeSwap` reverts while
    ///      set, so a native/callback payout recipient cannot reenter a swap mid-withdrawal
    ///      and price against half-settled reserves. Transient: lives within one tx.
    uint256 private transient _liquidityLock;

    modifier lockLiquidity() {
        _liquidityLock = 1;
        _;
        _liquidityLock = 0;
    }

    /// @dev In-memory projection of one detector step; shared by the swap path and the
    ///      read-only previews so the two can never drift.
    struct DetectorSnap {
        bool advanced; // a new-block sample happened (state to persist)
        bool hasReturn; // a log-return was processed (false for the first baseline sample)
        uint256 priceWad; // sampled executable mid (only when advanced)
        int256 r; // clipped log-return (only when hasReturn)
        int256 sPos;
        int256 sNeg;
        int256 ewmaNet;
        uint256 ewmaTV;
        uint256 d;
        uint256 sigma;
        uint256 kappa;
        Cusum.Trend trend;
        uint256 offsetA; // current base offsets, returned to save a re-read
        uint256 offsetB;
    }

    constructor(IPoolManager _poolManager, PoincareConfig memory cfg)
        BaseHook(_poolManager)
        ERC20("Poincare LP", "POIN-LP")
    {
        require(Cusum.isValidConfig(cfg.k, cfg.h), "cusum cfg");
        require(DirectionalSignal.isValidConfig(cfg.lambda), "ewma cfg");
        require(
            ControlLaw.isValidConfig(ControlLaw.Config(cfg.h, cfg.sMax, cfg.kappaMin, cfg.kappaMax, cfg.dMax)),
            "control cfg"
        );
        require(cfg.sMax <= type(int128).max, "sMax packing");
        // clip > 0 keeps the robust increment live; the upper bound keeps every hot-path
        // int256 cast of clip-derived values in range.
        require(cfg.clipWad > 0 && cfg.clipWad <= uint256(uint128(type(int128).max)), "clip cfg");
        require(!cfg.adaptive || cfg.sigmaFloor > 0, "sigmaFloor cfg");
        require(cfg.feeCap < WAD, "fee cfg");

        k = cfg.k;
        thresholdH = cfg.h;
        sMax = cfg.sMax;
        lambda = cfg.lambda;
        dFloor = cfg.dFloor;
        adaptive = cfg.adaptive;
        sigmaFloor = cfg.sigmaFloor;
        clipWad = cfg.clipWad;
        kappaMin = cfg.kappaMin;
        kappaMax = cfg.kappaMax;
        dMax = cfg.dMax;
        feeGamma = cfg.feeGamma;
        feeCap = cfg.feeCap;
        alphaWad = cfg.alphaWad;
    }

    // reentrancy guard

    /// @dev Lock the whole add so nothing can reenter a swap during settlement.
    function addLiquidity(AddLiquidityParams calldata params)
        public
        payable
        override
        lockLiquidity
        returns (BalanceDelta delta)
    {
        return super.addLiquidity(params);
    }

    /// @dev Lock the whole removal so a native/callback payout recipient cannot reenter
    ///      `_beforeSwap` before shares are burned.
    function removeLiquidity(RemoveLiquidityParams calldata params)
        public
        override
        lockLiquidity
        returns (BalanceDelta delta)
    {
        return super.removeLiquidity(params);
    }

    /// @dev Block swaps while a liquidity modification is settling; see `_liquidityLock`.
    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        require(_liquidityLock == 0, "reentrant swap");
        return super._beforeSwap(sender, key, params, hookData);
    }

    // swap pricing

    /// @inheritdoc BaseCustomCurve
    /// @dev Reads pre-swap reserves, advances the detector at most once per block, then
    ///      prices through the shared pipeline: vol fee + offset base + directional spread.
    function _getUnspecifiedAmount(SwapParams calldata params)
        internal
        override
        returns (uint256 unspecifiedAmount)
    {
        (uint256 r0, uint256 r1) = _reserves();
        require(r0 > 0 && r1 > 0, "no liquidity");

        DetectorSnap memory s = _advanceDetector(r0, r1);
        uint256 spread = _spreadGiven(s.kappa, s.trend, params.zeroForOne);
        uint256 feeWad = ControlLaw.volFee(s.sigma, feeGamma, feeCap);

        bool exactInput = params.amountSpecified < 0;
        uint256 specifiedAmount = exactInput ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);

        if (exactInput) {
            (unspecifiedAmount,) = AsymmetricCurve.swapExactInPriced(
                r0, r1, s.offsetA, s.offsetB, specifiedAmount, params.zeroForOne, spread, feeWad
            );
        } else {
            (unspecifiedAmount,) = AsymmetricCurve.swapExactOutPriced(
                r0, r1, s.offsetA, s.offsetB, specifiedAmount, params.zeroForOne, spread, feeWad
            );
        }
    }

    /// @inheritdoc BaseCustomCurve
    /// @dev Reports the vol-fee amount for the `HookSwap` event only; the fee itself is
    ///      charged inside `_getUnspecifiedAmount` and stays in reserves. Called after
    ///      `_getUnspecifiedAmount` in the same frame, so the detector has already sampled
    ///      this block and replaying the deterministic pricing recovers the exact split.
    function _getSwapFeeAmount(SwapParams calldata params, uint256)
        internal
        view
        override
        returns (uint256 swapFeeAmount)
    {
        uint256 feeWad = _storedFeeWad();
        if (feeWad == 0) return 0;

        if (params.amountSpecified < 0) {
            return FullMath.mulDivRoundingUp(uint256(-params.amountSpecified), feeWad, WAD);
        }
        return _replayExactOutFee(params.zeroForOne, uint256(params.amountSpecified), feeWad);
    }

    /// @dev Replay the deterministic exact-out pricing to recover the fee split (event only).
    function _replayExactOutFee(bool zeroForOne, uint256 amountOut, uint256 feeWad)
        internal
        view
        returns (uint256 feeAmount)
    {
        uint256 spread = _spreadGiven(_kappa, _trend, zeroForOne);
        (uint256 r0, uint256 r1) = _reserves();
        (uint256 a, uint256 b) = _baseOffsets();
        (, feeAmount) = AsymmetricCurve.swapExactOutPriced(r0, r1, a, b, amountOut, zeroForOne, spread, feeWad);
    }

    // detector core

    /// @dev The full detector step as a pure projection of current state + reserves.
    ///      Consumed by the swap path (persisted), by `previewSpread`/`previewDetector`
    ///      (read-only), and through those by the Lens. If this block already sampled or
    ///      the pool is empty, the stored state is returned unchanged.
    function _projectDetector(uint256 r0, uint256 r1) internal view returns (DetectorSnap memory s) {
        (s.offsetA, s.offsetB) = _baseOffsets();
        s.sPos = _sPos;
        s.sNeg = _sNeg;
        s.ewmaNet = _ewmaNet;
        s.ewmaTV = _ewmaTV;
        s.kappa = _kappa;
        s.trend = _trend;

        DirectionalSignal.State memory sig = DirectionalSignal.State(s.ewmaNet, s.ewmaTV);
        s.d = sig.signal();
        s.sigma = sig.sigmaWad(lambda);

        if (block.number == _lastSampledBlock || r0 == 0 || r1 == 0) return s;

        // Nonzero reserves are not enough: at an extreme ratio the marginal price can floor
        // to 0. Skip the sample (no 0 baseline to blind the detector, no lnWad(0) revert)
        // and fall back to stored state so the swap still prices.
        uint256 priceWad = AsymmetricCurve.marginalPriceWad(r0, r1, s.offsetA, s.offsetB);
        if (priceWad == 0) return s;

        s.advanced = true;
        s.priceWad = priceWad;
        uint256 prev = _lastSampledPriceWad;
        if (prev == 0) return s; // first ever sample: establish the baseline, no return yet

        s.hasReturn = true;
        int256 r = PriceLib.logReturnWad(prev, s.priceWad);

        // Huber clip + (adaptive) standardization. Sigma is taken BEFORE folding this
        // sample, so a sample is never standardized by itself, and the clip bounds any
        // single block's influence on both sigma and the evidence: inflating sigma takes
        // multiple blocks of real (arbitraged) price movement.
        int256 inc; // what the CUSUM eats: r, or r/sigma in adaptive mode
        if (adaptive) {
            uint256 sigmaEff = s.sigma < sigmaFloor ? sigmaFloor : s.sigma;
            int256 rCap = int256(FullMath.mulDiv(clipWad, sigmaEff, WAD));
            if (r > rCap) r = rCap;
            else if (r < -rCap) r = -rCap;
            inc = r >= 0
                ? int256(FullMath.mulDiv(uint256(r), WAD, sigmaEff))
                : -int256(FullMath.mulDiv(uint256(-r), WAD, sigmaEff));
        } else {
            int256 rCap = int256(clipWad);
            if (r > rCap) r = rCap;
            else if (r < -rCap) r = -rCap;
            inc = r;
        }
        s.r = r;

        sig = sig.update(r, lambda);
        s.ewmaNet = sig.ewmaNet;
        s.ewmaTV = sig.ewmaTV;
        s.d = sig.signal();
        s.sigma = sig.sigmaWad(lambda);

        Cusum.State memory cs = Cusum.State(s.sPos, s.sNeg).updateCapped(inc, k, sMax);
        s.sPos = cs.sPos;
        s.sNeg = cs.sNeg;

        (Cusum.Trend dir, int256 evidence) =
            cs.sPos >= cs.sNeg ? (Cusum.Trend.Up, cs.sPos) : (Cusum.Trend.Down, cs.sNeg);

        // Directional-efficiency gate: asymmetry engages only if the move is genuinely
        // directional; otherwise feed zero evidence so kappa ramps back down.
        int256 gatedEvidence = s.d >= dFloor ? evidence : int256(0);

        s.kappa = ControlLaw.step(s.kappa, gatedEvidence, ControlLaw.Config(thresholdH, sMax, kappaMin, kappaMax, dMax));

        // Only re-label the trend on live evidence, so the label always matches the side
        // kappa was built for while it ramps down.
        if (gatedEvidence > 0) s.trend = dir;
    }

    /// @dev Project, persist if a new block was sampled, and emit the detector trace.
    function _advanceDetector(uint256 r0, uint256 r1) internal returns (DetectorSnap memory s) {
        s = _projectDetector(r0, r1);
        if (!s.advanced) return s;

        _lastSampledPriceWad = s.priceWad;
        _lastSampledBlock = uint64(block.number);
        if (!s.hasReturn) return s; // baseline sample: statistics unchanged

        _sPos = int128(s.sPos);
        _sNeg = int128(s.sNeg);
        _ewmaNet = int128(s.ewmaNet);
        _ewmaTV = uint128(s.ewmaTV);
        _kappa = uint64(s.kappa);
        _trend = s.trend;

        emit DetectorSample(
            block.number,
            s.priceWad,
            s.r,
            s.sPos,
            s.sNeg,
            s.d,
            s.sigma,
            s.kappa,
            s.trend,
            ControlLaw.volFee(s.sigma, feeGamma, feeCap)
        );
    }

    /// @dev The spread a swap in direction `zeroForOne` pays under a given (kappa, trend):
    ///      kappa on the with-trend side, 0 otherwise. With-trend means pushing price
    ///      further along the detected trend: up-trend -> buying token0 (oneForZero),
    ///      down-trend -> selling token0 (zeroForOne). The one place this mapping exists.
    function _spreadGiven(uint256 kappaWad, Cusum.Trend t, bool zeroForOne) internal pure returns (uint256) {
        if (kappaWad == 0) return 0;
        bool withTrend = (t == Cusum.Trend.Up && !zeroForOne) || (t == Cusum.Trend.Down && zeroForOne);
        return withTrend ? kappaWad : 0;
    }

    /// @dev Vol fee from the stored sigma (current as of the last sample).
    function _storedFeeWad() internal view returns (uint256) {
        return ControlLaw.volFee(DirectionalSignal.State(_ewmaNet, _ewmaTV).sigmaWad(lambda), feeGamma, feeCap);
    }

    // liquidity (hook-owned; deposits at the current reserve ratio)

    /// @inheritdoc BaseCustomCurve
    function _getAmountIn(AddLiquidityParams memory params)
        internal
        override
        returns (uint256 amount0, uint256 amount1, uint256 shares)
    {
        (uint256 r0, uint256 r1) = _reserves();
        uint256 supply = totalSupply();

        if (supply == 0) {
            // First deposit seeds the curve; shares = geometric mean. MINIMUM_LIQUIDITY is
            // locked on the first mint (see `_mint`) so supply can't be driven to dust.
            amount0 = params.amount0Desired;
            amount1 = params.amount1Desired;
            shares = Math.sqrt(amount0 * amount1);
            require(shares > MINIMUM_LIQUIDITY, "insufficient");

            // Anchor the symmetric virtual depth to the seed. Offsets thereafter scale
            // with the share supply (see `_baseOffsets`), preserving the executable mid
            // exactly across ratio deposits/withdrawals.
            if (alphaWad != 0) {
                uint256 a0 = FullMath.mulDiv(alphaWad, amount0, WAD);
                uint256 b0 = FullMath.mulDiv(alphaWad, amount1, WAD);
                require(a0 <= type(uint128).max && b0 <= type(uint128).max, "offset overflow");
                // Both offsets must be nonzero: the mid is (r1+b)/(r0+a), so a seed that
                // floors one offset to 0 while the other stays positive anchors the curve
                // off the seeded ratio, opening an arb seam. Reject it.
                require(a0 > 0 && b0 > 0, "offset seed too small");
                _a0 = uint128(a0);
                _b0 = uint128(b0);
                _supply0 = shares;
            }
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
            // Price the mint off the scarcer funded side. Pricing off full token0 while the
            // token1 counterpart floors down would mint claims token1 never backed, letting
            // an under-funded add skim the scarce reserve on withdrawal. min() rounds against
            // the depositor; both-sides-positive rejects the zero-counterpart add.
            require(amount0 > 0 && amount1 > 0, "insufficient");
            shares = Math.min(FullMath.mulDiv(amount0, supply, r0), FullMath.mulDiv(amount1, supply, r1));
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
            _mint(address(0xdead), MINIMUM_LIQUIDITY);
            _mint(msg.sender, shares - MINIMUM_LIQUIDITY);
        } else {
            _mint(msg.sender, shares);
        }
    }

    function _burn(RemoveLiquidityParams memory, BalanceDelta, BalanceDelta, uint256 shares) internal override {
        _burn(msg.sender, shares);
    }

    // views

    /// @notice Current reserves = the hook's ERC-6909 claim balances of each currency.
    /// @dev Reserves are live claim balances, so a raw ERC20 donation is ignored (we read
    ///      claim balances, not token.balanceOf). Claim tokens are themselves transferable,
    ///      though, so anyone can credit claims here and inflate reserves outside the hook's
    ///      accounting. This is bounded, not free: donated claims mint no shares and accrue
    ///      pro-rata to existing LPs, so the donor forfeits them. Biasing the once-per-block
    ///      detector sample this way therefore costs real, gifted capital (the same
    ///      manipulation-cost moat the design rests on) and is strictly worse for the
    ///      attacker than a swap, which arbitrage can reverse. Share pricing is hardened off
    ///      the scarcer side (see `_getAmountIn`). Fully closing it needs shadow-accounted
    ///      reserves, deferred to the paid audit: a shadow value drifting from real claims
    ///      would be a worse, solvency-class bug.
    function _reserves() internal view returns (uint256 r0, uint256 r1) {
        PoolKey memory key = poolKey();
        r0 = poolManager.balanceOf(address(this), key.currency0.toId());
        r1 = poolManager.balanceOf(address(this), key.currency1.toId());
    }

    /// @dev Current base offsets: the seed anchor scaled by the LP share supply.
    function _baseOffsets() internal view returns (uint256 a, uint256 b) {
        if (alphaWad == 0) return (0, 0);
        uint256 s0 = _supply0;
        if (s0 == 0) return (0, 0); // not yet seeded
        uint256 supply = totalSupply();
        a = FullMath.mulDiv(_a0, supply, s0);
        b = FullMath.mulDiv(_b0, supply, s0);
    }

    /// @notice Expose reserves and detector state for routers / the Lens (read-only).
    function reserves() external view returns (uint256 r0, uint256 r1) {
        return _reserves();
    }

    /// @notice Current asymmetry intensity κ (WAD spread fraction), as of the last sample.
    function kappa() external view returns (uint256) {
        return _kappa;
    }

    /// @notice Current detected trend direction, as of the last sample.
    function trend() external view returns (Cusum.Trend) {
        return _trend;
    }

    /// @notice Executable mid sampled at the last detector update (WAD).
    function lastSampledPriceWad() external view returns (uint256) {
        return _lastSampledPriceWad;
    }

    /// @notice Block of the last detector update.
    function lastSampledBlock() external view returns (uint256) {
        return _lastSampledBlock;
    }

    /// @notice The two one-sided CUSUM statistics: the evidence climbing toward `thresholdH`.
    function cusumState() external view returns (int256 sPos, int256 sNeg) {
        return (_sPos, _sNeg);
    }

    /// @notice The raw EWMA accumulators behind D and σ̂.
    function signalState() external view returns (int256 ewmaNet, uint256 ewmaTV) {
        return (_ewmaNet, _ewmaTV);
    }

    /// @notice Current directional-efficiency D (WAD) implied by the detector state.
    function directionalEfficiency() external view returns (uint256) {
        return DirectionalSignal.State(_ewmaNet, _ewmaTV).signal();
    }

    /// @notice Live volatility estimate σ̂ (WAD), as of the last sample.
    function sigmaWad() external view returns (uint256) {
        return DirectionalSignal.State(_ewmaNet, _ewmaTV).sigmaWad(lambda);
    }

    /// @notice Vol fee implied by the stored σ̂ (WAD fraction).
    function currentFeeWad() external view returns (uint256) {
        return _storedFeeWad();
    }

    /// @notice Current symmetric base offsets (a on token0, b on token1). (0,0) == pure x·y=k.
    function baseOffsets() external view returns (uint256 a, uint256 b) {
        return _baseOffsets();
    }

    /// @notice The directional spread a swap in `zeroForOne` direction pays under the STORED
    ///         detector state (WAD fraction). See `previewSpread` for the value the next swap
    ///         of a fresh block will actually pay.
    function effectiveSpread(bool zeroForOne) external view returns (uint256) {
        return _spreadGiven(_kappa, _trend, zeroForOne);
    }

    /// @notice The spread and vol fee a swap in `zeroForOne` direction will pay THIS block,
    ///         including the once-per-block detector sample the first swap would take. This is
    ///         what the Lens quotes with, so quotes match execution across block boundaries.
    function previewSpread(bool zeroForOne) external view returns (uint256 spreadWad, uint256 feeWad) {
        (uint256 r0, uint256 r1) = _reserves();
        DetectorSnap memory s = _projectDetector(r0, r1);
        spreadWad = _spreadGiven(s.kappa, s.trend, zeroForOne);
        feeWad = ControlLaw.volFee(s.sigma, feeGamma, feeCap);
    }

    /// @notice Full projected detector state for this block (identity if already sampled).
    function previewDetector() external view returns (DetectorSnap memory s) {
        (uint256 r0, uint256 r1) = _reserves();
        return _projectDetector(r0, r1);
    }
}
