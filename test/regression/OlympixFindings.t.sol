// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";
import {PoincareLens} from "../../src/PoincareLens.sol";
import {AsymmetricCurve} from "../../src/libraries/AsymmetricCurve.sol";
import {PoincareTestBase} from "../utils/PoincareTestBase.sol";

/// @title OlympixFindingsTest: regression tests for the Olympix BugPoCer scan
/// @notice One test per finding, each failing on the pre-fix code and passing now. Findings
///         L-2/L-4 (log-price domain) are covered in PriceLib.t.sol; M-1 (reentrancy) needs a
///         native-ETH pool and lives in OlympixReentrancyTest below.
contract OlympixFindingsTest is PoincareTestBase {
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;

    uint256 constant WAD = 1e18;
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

    function _addParams(uint256 a0, uint256 a1, bytes32 salt)
        internal
        pure
        returns (BaseCustomAccounting.AddLiquidityParams memory)
    {
        return BaseCustomAccounting.AddLiquidityParams(a0, a1, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, salt);
    }

    // M-2 (4.1.2): a zero-counterpart add cannot mint shares.

    function test_M2_zeroCounterpartAdd_reverts() public {
        // Drive the pool to an extreme ratio so a token0-only add floors its token1 side to 0.
        swapRouter.swapExactTokensForTokens(
            9_900 ether, 0, true, poolKey, Constants.ZERO_BYTES, address(this), block.timestamp + 1
        );
        (uint256 r0, uint256 r1) = hook.reserves();
        assertGt(r0, 1_000 * r1, "pool is imbalanced enough for zero-counterpart rounding");

        uint256 token0Only = (r0 - 1) / r1; // largest token0 whose token1 optimal floors to 0
        assertEq(FullMath.mulDiv(token0Only, r1, r0), 0, "token1 optimal floors to zero");

        vm.expectRevert(bytes("insufficient"));
        hook.addLiquidity(_addParams(token0Only, 0, bytes32(uint256(1))));
    }

    function test_M2_balancedAdd_stillWorks() public {
        uint256 sharesBefore = hook.balanceOf(address(this));
        hook.addLiquidity(_addParams(10 ether, 10 ether, bytes32(uint256(2))));
        assertGt(hook.balanceOf(address(this)), sharesBefore, "a proportional add still mints shares");
    }

    // L-1 (4.2.1): the Lens rejects a zero-amount quote like the PoolManager does.

    function test_L1_lensZeroAmountQuote_reverts() public {
        PoincareLens lens = new PoincareLens(hook);
        vm.expectRevert(IPoolManager.SwapAmountCannotBeZero.selector);
        lens.quoteExactInput(true, 0);
        vm.expectRevert(IPoolManager.SwapAmountCannotBeZero.selector);
        lens.quoteExactOutput(true, 0);
    }

    // L-5 (4.2.5): a first-deposit seed that floors a virtual offset to zero is rejected.

    function test_L5_offsetSeedFloorsToZero_reverts() public {
        PoincareConfig memory c = defaultConfig();
        c.alphaWad = 1e17; // 0.1 depth, so alpha*amount0/WAD floors to 0 for amount0 < 10
        PoincareHook ah = deployPoincare(c, 0x7777);
        initPoincarePool(ah, currency0, currency1);
        IERC20Minimal(Currency.unwrap(currency0)).approve(address(ah), type(uint256).max);
        IERC20Minimal(Currency.unwrap(currency1)).approve(address(ah), type(uint256).max);

        // amount0 = 9 -> a0 = floor(0.1 * 9) = 0, while b0 > 0. Geometric-mean shares clear
        // MINIMUM_LIQUIDITY, so only the offset guard can stop this.
        vm.expectRevert(bytes("offset seed too small"));
        ah.addLiquidity(_addParams(9, 1 ether, bytes32(0)));
        // A healthy seed at the same alpha anchors fine.
        ah.addLiquidity(_addParams(10 ether, 10 ether, bytes32(0)));
    }

    // L-7 (4.2.7): exact-out spread is not cheaper than the exact-in haircut inverse.

    function test_L7_exactOutSpread_notCheaperThanExactInInverse() public view {
        (uint256 r0, uint256 r1) = hook.reserves();
        uint256 spreadWad = 1e17; // 10%, the config's kappaMax
        uint256 amountOut = 1 ether;

        uint256 quotedInput = AsymmetricCurve.swapExactOutWithSpread(r0, r1, 0, 0, amountOut, true, spreadWad);

        // The exact-in inverse: base input for the pre-haircut output ceil(amountOut/(1-spread)).
        uint256 preHaircut = FullMath.mulDivRoundingUp(amountOut, WAD, WAD - spreadWad);
        uint256 inverseInput = AsymmetricCurve.swapExactOut(r0, r1, 0, 0, preHaircut, true);
        assertGe(quotedInput, inverseInput, "exact-out must not undercharge vs the haircut inverse");

        // Operationally: paying the exact-out quote through the exact-in path buys at least amountOut.
        uint256 outIfPaid = AsymmetricCurve.swapExactInWithSpread(r0, r1, 0, 0, quotedInput, true, spreadWad);
        assertGe(outIfPaid, amountOut, "quoted input must buy the requested post-spread output");
    }

    // L-3 / L-6 (4.2.3 / 4.2.6): a claim donation is forfeited to existing LPs, not profitable.

    function test_L3_claimDonation_isForfeitedToLPs() public {
        (uint256 r0Before,) = hook.reserves();
        uint256 myShares = hook.balanceOf(address(this));
        uint256 redeemable0Before = FullMath.mulDiv(myShares, r0Before, hook.totalSupply());

        ClaimDonationAttacker attacker = new ClaimDonationAttacker(poolManager);
        uint256 donation = 50 ether;
        IERC20Minimal(Currency.unwrap(currency0)).approve(address(attacker), donation);
        attacker.donateClaimByTransfer(currency0, address(hook), donation);

        // Documented, accepted behavior: a claim donation does raise reserves...
        (uint256 r0After,) = hook.reserves();
        assertEq(r0After, r0Before + donation, "claim donation raises reserves (known, bounded)");
        // ...but mints the donor no LP shares, so the donation is forfeited...
        assertEq(hook.balanceOf(address(attacker)), 0, "donor is credited no LP shares");
        // ...and accrues pro-rata to existing LPs, who can now redeem strictly more token0.
        uint256 redeemable0After = FullMath.mulDiv(myShares, r0After, hook.totalSupply());
        assertGt(redeemable0After, redeemable0Before, "donation accrues to existing LPs, not the donor");
    }
}

/// @notice Untrusted ERC-6909 claim holder (from the report's PoC): settles real ERC20 into the
///         PoolManager, mints the matching claims to itself, then transfers them to the hook via
///         the public ERC-6909 path, bypassing hook liquidity accounting.
contract ClaimDonationAttacker is IUnlockCallback {
    using CurrencyLibrary for Currency;

    IPoolManager internal immutable manager;

    constructor(IPoolManager _manager) {
        manager = _manager;
    }

    function donateClaimByTransfer(Currency currency, address receiver, uint256 amount) external {
        IERC20Minimal(Currency.unwrap(currency)).transferFrom(msg.sender, address(this), amount);
        manager.unlock(abi.encode(currency, amount));
        manager.transfer(receiver, currency.toId(), amount);
    }

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        require(msg.sender == address(manager), "only PoolManager");
        (Currency currency, uint256 amount) = abi.decode(data, (Currency, uint256));
        manager.sync(currency);
        IERC20Minimal(Currency.unwrap(currency)).transfer(address(manager), amount);
        manager.settle();
        manager.mint(address(this), currency.toId(), amount);
        return bytes("");
    }
}

/// @title OlympixReentrancyTest: M-1 (4.1.1) on a native-ETH pool
/// @notice A native-ETH payout recipient that reenters a swap mid-withdrawal is blocked by the
///         liquidity lock, so the withdrawal completes without the reentrant swap ever pricing.
contract OlympixReentrancyTest is PoincareTestBase {
    using CurrencyLibrary for Currency;

    Currency constant NATIVE = CurrencyLibrary.ADDRESS_ZERO;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;

    function setUp() public {
        deployArtifactsAndLabel();
        MockERC20 token = deployToken();
        currency1 = Currency.wrap(address(token));

        hook = deployPoincare(defaultConfig(), 0x4444);
        poolKey = initPoincarePool(hook, NATIVE, currency1);
    }

    function test_M1_reentrantSwapDuringRemove_isBlocked() public {
        ReentrantNativeLP lp = new ReentrantNativeLP(poolManager, hook, poolKey, Currency.unwrap(currency1));
        vm.deal(address(lp), 100 ether);
        MockERC20(Currency.unwrap(currency1)).transfer(address(lp), 100 ether);

        lp.seed(10 ether, 10 ether);
        uint256 shares = hook.balanceOf(address(lp));

        // Removing half pays native ETH back to the LP; on that payout it tries to reenter a
        // swap. The guard must block that swap, and the removal must still complete cleanly.
        lp.attackRemove(shares / 2);
        assertTrue(lp.reentryReverted(), "a reentrant swap during withdrawal was blocked");
        assertGt(address(lp).balance, 0, "the withdrawal still paid native ETH out");
    }
}

/// @notice Malicious LP: on receiving its native-ETH withdrawal it calls PoolManager.swap
///         directly (the manager is unlocked mid-removal) to reenter the hook's swap path.
contract ReentrantNativeLP {
    IPoolManager internal immutable pm;
    PoincareHook internal immutable hook;
    PoolKey internal key;
    bool internal arming;
    bool public reentryReverted;

    uint256 constant DEADLINE = type(uint256).max;
    int24 constant MIN_TICK = -887220;
    int24 constant MAX_TICK = 887220;

    constructor(IPoolManager _pm, PoincareHook _hook, PoolKey memory _key, address token1) {
        pm = _pm;
        hook = _hook;
        key = _key;
        IERC20Minimal(token1).approve(address(_hook), type(uint256).max);
    }

    function seed(uint256 ethAmt, uint256 tokenAmt) external {
        hook.addLiquidity{value: ethAmt}(
            BaseCustomAccounting.AddLiquidityParams(ethAmt, tokenAmt, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );
    }

    function attackRemove(uint256 shares) external {
        arming = true;
        hook.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(shares, 0, 0, DEADLINE, MIN_TICK, MAX_TICK, bytes32(0))
        );
        arming = false;
    }

    receive() external payable {
        if (!arming) return;
        arming = false; // attempt the reentry once
        try pm.swap(
            key,
            SwapParams({zeroForOne: false, amountSpecified: -1e15, sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1}),
            ""
        ) {
            reentryReverted = false;
        } catch {
            reentryReverted = true;
        }
    }
}
