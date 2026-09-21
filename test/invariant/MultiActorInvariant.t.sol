// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";
import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PoincareHook, PoincareConfig} from "../../src/PoincareHook.sol";
import {PoincareTestBase} from "../utils/PoincareTestBase.sol";

/// @title MultiActorHandler: several providers and a trader, interleaved at random.
///
/// @notice The existing invariant run has ONE actor, who is simultaneously the only provider and
///         the only trader. That is enough for solvency - the hook cannot leak to a party that
///         does not exist - but it cannot express dilution, because dilution needs a second
///         provider to be diluted. `LpAccounting.t.sol` covers that with scripted sequences; this
///         covers the orderings nobody thought to script.
///
///         Providers are separate addresses rather than salts on one address, so shares, burns
///         and payouts all route through distinct balances and a mint to the wrong party shows
///         up as a supply that no longer adds up.
contract MultiActorHandler is Test {
    using CurrencyLibrary for Currency;

    IUniswapV4Router04 internal router;
    PoincareHook internal hook;
    PoolKey internal key;
    Currency internal c0;
    Currency internal c1;

    address[3] public lps;

    // Success counters. Every action below swallows its own revert so the fuzzer is free to
    // propose impossible ones, which means a handler that silently never succeeds would produce
    // a green run that proved nothing. `afterInvariant` reads these.
    uint256 public adds;
    uint256 public removes;
    uint256 public transfers;
    uint256 public swaps;

    constructor(
        IUniswapV4Router04 _router,
        PoincareHook _hook,
        PoolKey memory _key,
        Currency _c0,
        Currency _c1,
        address[3] memory _lps
    ) {
        router = _router;
        hook = _hook;
        key = _key;
        c0 = _c0;
        c1 = _c1;
        lps = _lps;

        IERC20Minimal(Currency.unwrap(c0)).approve(address(router), type(uint256).max);
        IERC20Minimal(Currency.unwrap(c1)).approve(address(router), type(uint256).max);
    }

    function lpCount() external pure returns (uint256) {
        return 3;
    }

    function _who(uint256 seed) internal view returns (address) {
        return lps[seed % 3];
    }

    /// @dev A deposit at whatever the pool's ratio currently is. The hook computes the matching
    ///      counterpart itself and takes the side that limits, so an over-generous desired amount
    ///      is simply trimmed rather than rejected.
    function providerAdds(uint256 whoSeed, uint256 amtSeed) public {
        address who = _who(whoSeed);
        uint256 a0 = bound(amtSeed, 1e15, 20e18);
        (uint256 r0, uint256 r1) = hook.reserves();
        uint256 a1 = Math.mulDiv(a0, r1, r0) + 1;
        if (c0.balanceOf(who) < a0 || c1.balanceOf(who) < a1) return;

        vm.prank(who);
        try hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(a0, a1, 0, 0, block.timestamp + 1, -887220, 887220, bytes32(0))
        ) {
            adds++;
        } catch {}
    }

    function providerRemoves(uint256 whoSeed, uint256 shareSeed) public {
        address who = _who(whoSeed);
        uint256 have = hook.balanceOf(who);
        if (have == 0) return;

        vm.prank(who);
        try hook.removeLiquidity(
            BaseCustomAccounting.RemoveLiquidityParams(
                bound(shareSeed, 1, have), 0, 0, block.timestamp + 1, -887220, 887220, bytes32(0)
            )
        ) {
            removes++;
        } catch {}
    }

    /// @dev One provider hands shares to another. Free in the hook's eyes - it is a plain ERC20
    ///      transfer - which is exactly why it belongs in the sequence: it decouples "who funded"
    ///      from "who redeems".
    function providerTransfersShares(uint256 fromSeed, uint256 toSeed, uint256 amtSeed) public {
        address from = _who(fromSeed);
        address to = _who(toSeed);
        uint256 have = hook.balanceOf(from);
        if (have == 0 || from == to) return;

        vm.prank(from);
        hook.transfer(to, bound(amtSeed, 1, have));
        transfers++;
    }

    function traderSwaps(uint256 amtSeed, bool zeroForOne) public {
        uint256 amt = bound(amtSeed, 1e15, 2e18);
        try router.swapExactTokensForTokens(amt, 0, zeroForOne, key, "", address(this), block.timestamp + 1) {
            swaps++;
        } catch {}
    }

    function roll(uint256 nSeed) public {
        vm.roll(block.number + bound(nSeed, 1, 4));
    }
}

/// @title MultiActorInvariantBase: what must hold no matter how providers interleave.
///
/// @notice Three properties, each one a statement the single-actor run structurally cannot make:
///
///           - The backing behind a share never falls. This is the "no provider is diluted"
///             property. Deposits and withdrawals are proportional so they leave it alone; swaps
///             round toward the pool so they raise it. Anything that lowers it is value leaving
///             the pool through a path that is not a swap.
///           - The share supply is exactly the shares somebody holds. A mint to the wrong
///             address, or a burn that missed, shows up here and nowhere else.
///           - The locked minimum stays locked. It is the reason supply cannot be driven to dust,
///             so a burn path that could reach it would quietly remove the first-depositor guard.
abstract contract MultiActorInvariantBase is PoincareTestBase {
    using CurrencyLibrary for Currency;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoincareHook hook;
    MultiActorHandler handler;

    address[3] internal lps = [address(0xA11CE), address(0xB0B), address(0xCA401)];

    /// @dev The value backing one share at the seed, which every later observation must beat.
    uint256 internal seedBacking;

    function _config() internal pure virtual returns (PoincareConfig memory);

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        hook = deployPoincare(_config(), 0x7777);
        poolKey = initPoincarePool(hook, currency0, currency1);

        IERC20Minimal t0 = IERC20Minimal(Currency.unwrap(currency0));
        IERC20Minimal t1 = IERC20Minimal(Currency.unwrap(currency1));
        t0.approve(address(hook), type(uint256).max);
        t1.approve(address(hook), type(uint256).max);

        // Seeded from the test contract, whose shares stay put for the whole run: supply never
        // returns to zero, so the run never re-enters the first-deposit branch.
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(
                200 ether, 200 ether, 0, 0, type(uint256).max, -887220, 887220, bytes32(0)
            )
        );

        for (uint256 i = 0; i < lps.length; i++) {
            t0.transfer(lps[i], 500 ether);
            t1.transfer(lps[i], 500 ether);
            vm.startPrank(lps[i]);
            t0.approve(address(hook), type(uint256).max);
            t1.approve(address(hook), type(uint256).max);
            vm.stopPrank();
        }

        handler = new MultiActorHandler(swapRouter, hook, poolKey, currency0, currency1, lps);
        t0.transfer(address(handler), 1_000 ether);
        t1.transfer(address(handler), 1_000 ether);

        seedBacking = _backingPerShare();
        targetContract(address(handler));
    }

    /// @dev `sqrt((r0 + a)(r1 + b)) / supply`, in WAD.
    ///
    ///      On the VIRTUAL reserves, because that is what the curve conserves. The real product
    ///      `r0 * r1` is maximised where the reserve ratio equals the offset ratio - the seed -
    ///      so on a deep-base pool it falls with any price move in either direction and would
    ///      report a leak on every swap. With `alphaWad = 0` the two are the same number.
    function _backingPerShare() internal view returns (uint256) {
        (uint256 r0, uint256 r1) = hook.reserves();
        (uint256 a, uint256 b) = hook.baseOffsets();
        uint256 supply = hook.totalSupply();
        if (supply == 0) return 0;
        return Math.mulDiv(Math.sqrt((r0 + a) * (r1 + b)), 1e18, supply);
    }

    /// @notice No provider is diluted by any interleaving of the others.
    /// @dev The slack is truncation, not tolerance for a leak: `_baseOffsets` floors both offsets
    ///      on every supply change, so a deposit can land with a wei or two less virtual depth
    ///      than it paid for. Expressed relatively so it cannot quietly absorb a real loss as the
    ///      pool grows.
    function invariant_backingPerShareNeverFalls() public view {
        assertGe(
            _backingPerShare() + 1e6,
            seedBacking,
            "the reserves behind a share must never fall below what they were at the seed"
        );
    }

    /// @notice Every share in existence is held by somebody this test knows about.
    function invariant_supplyIsFullyAccountedFor() public view {
        uint256 held =
            hook.balanceOf(address(this)) + hook.balanceOf(address(0xdead)) + hook.balanceOf(address(handler));
        for (uint256 i = 0; i < lps.length; i++) {
            held += hook.balanceOf(lps[i]);
        }
        assertEq(held, hook.totalSupply(), "total supply must equal the shares somebody holds");
    }

    /// @notice The first-depositor guard is permanent.
    function invariant_theLockedMinimumStaysLocked() public view {
        assertEq(
            hook.balanceOf(address(0xdead)), hook.MINIMUM_LIQUIDITY(), "the burned minimum must never be redeemable"
        );
        assertGe(hook.totalSupply(), hook.MINIMUM_LIQUIDITY(), "and supply can never fall below it");
    }

    /// @notice Everyone can still get out: the sum of every holder's proportional claim never
    ///         exceeds what the pool actually holds.
    function invariant_allProvidersCanExitTogether() public view {
        (uint256 r0, uint256 r1) = hook.reserves();
        uint256 supply = hook.totalSupply();
        uint256 owed0 = Math.mulDiv(hook.balanceOf(address(this)), r0, supply)
            + Math.mulDiv(hook.balanceOf(address(0xdead)), r0, supply)
            + Math.mulDiv(hook.balanceOf(address(handler)), r0, supply);
        uint256 owed1 = Math.mulDiv(hook.balanceOf(address(this)), r1, supply)
            + Math.mulDiv(hook.balanceOf(address(0xdead)), r1, supply)
            + Math.mulDiv(hook.balanceOf(address(handler)), r1, supply);
        for (uint256 i = 0; i < lps.length; i++) {
            owed0 += Math.mulDiv(hook.balanceOf(lps[i]), r0, supply);
            owed1 += Math.mulDiv(hook.balanceOf(lps[i]), r1, supply);
        }
        assertLe(owed0, r0, "token0 owed to providers must not exceed token0 held");
        assertLe(owed1, r1, "token1 owed to providers must not exceed token1 held");
    }

    /// @notice Non-vacuity. Every handler action catches its own revert, so a run in which
    ///         nothing ever succeeded would pass every invariant above while exercising nothing.
    ///         This is the assertion that the sequence was real, and it is the one that fails
    ///         first if a signature change or a funding mistake turns the handler into a no-op.
    function afterInvariant() public view {
        assertGt(handler.adds(), 0, "the run must have completed deposits");
        assertGt(handler.removes(), 0, "and withdrawals");
        assertGt(handler.transfers(), 0, "and share transfers");
        assertGt(handler.swaps(), 0, "and swaps");
    }

    /// @notice And the shadow stays backed, under multi-actor sequences as under single-actor.
    function invariant_shadowStaysBackedByClaims() public view {
        (uint256 r0, uint256 r1) = hook.reserves();
        (uint256 c0, uint256 c1) = hook.claimReserves();
        assertLe(r0, c0, "shadow reserve0 must be backed");
        assertLe(r1, c1, "shadow reserve1 must be backed");
    }
}

/// @notice The deployed shape: plain constant-product base, vol fee on, absolute thresholds.
contract MultiActorInvariantPlainTest is MultiActorInvariantBase {
    function _config() internal pure override returns (PoincareConfig memory c) {
        c = defaultConfig();
        c.feeGamma = 5e17;
        c.feeCap = 3e15;
    }
}

/// @notice The full-feature shape, so the offset-scaling path is interleaved too - that is the
///         one place a liquidity operation can move the executable price.
contract MultiActorInvariantDeepTest is MultiActorInvariantBase {
    function _config() internal pure override returns (PoincareConfig memory c) {
        c = adaptiveConfig();
        c.alphaWad = 5e17;
        c.feeGamma = 5e17;
        c.feeCap = 1e16;
    }
}
