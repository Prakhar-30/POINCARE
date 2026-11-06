// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

import {PoincareHook} from "../../src/PoincareHook.sol";
import {PoincareLens} from "../../src/PoincareLens.sol";
import {PoincareDCA} from "../../src/periphery/PoincareDCA.sol";

interface IDemoToken {
    function mint(address to, uint256 amount) external;
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// @title ForkDCALive: PoincareDCA against the LIVE Unichain Sepolia hook, Lens and router
/// @notice Nothing here is a redeploy of the pool: the test forks the chain, reads the deployed
///         addresses from deployments/unichain-sepolia.json, deploys only the DCA periphery, and
///         trades through the canonical v4 router exactly as the app does. The demo tokens have
///         a public mint, so the test funds itself.
///
///         Run: FOUNDRY_PROFILE=fork forge test --match-path test/sim/ForkDCALive.t.sol
contract ForkDCALiveTest is Test {
    PoincareHook hook;
    PoincareLens lens;
    PoincareDCA dca;
    IDemoToken usdc; // currency0
    IDemoToken weth; // currency1

    address user = makeAddr("dca-user");
    address keeper = makeAddr("dca-keeper");

    function setUp() public {
        vm.createSelectFork("unichain_sepolia");
        string memory json = vm.readFile("./deployments/unichain-sepolia.json");
        hook = PoincareHook(vm.parseJsonAddress(json, ".poincareHook"));
        lens = PoincareLens(vm.parseJsonAddress(json, ".poincareLens"));
        usdc = IDemoToken(vm.parseJsonAddress(json, ".currency0"));
        weth = IDemoToken(vm.parseJsonAddress(json, ".currency1"));

        dca = new PoincareDCA(lens, IUniswapV4Router04(payable(AddressConstants.getV4SwapRouterAddress(block.chainid))), address(this));
        dca.setKeeper(keeper, true);

        usdc.mint(user, 10_000e18);
        weth.mint(user, 5e18);
        vm.startPrank(user);
        usdc.approve(address(dca), type(uint256).max);
        weth.approve(address(dca), type(uint256).max);
        vm.stopPrank();
    }

    function _order(bool zeroForOne, uint128 amountIn, uint32 slices) internal view returns (PoincareDCA.OrderParams memory p) {
        p.zeroForOne = zeroForOne;
        p.amountIn = amountIn;
        p.slices = slices;
        p.interval = 3600;
        p.deadline = uint64(block.timestamp + uint256(slices) * 3600);
        p.maxSpreadBps = 10_000;
        p.maxSlippageBps = 50;
    }

    function test_live_wiring() public view {
        assertEq(address(dca.hook()), address(hook), "bound to the live hook through the Lens");
        assertEq(address(dca.token0()), address(usdc));
        assertEq(address(dca.token1()), address(weth));
    }

    /// @notice One slice each way through the live pool; the fill must equal the Lens quote
    ///         taken in the same block, and the reported spread must be the hook's own.
    function test_live_sliceMatchesLensQuote_bothSides() public {
        vm.prank(user);
        uint256 buy = dca.createOrder(_order(true, 400e18, 4)); // pay USDC, receive WETH
        vm.prank(user);
        uint256 sell = dca.createOrder(_order(false, 0.4e18, 4)); // pay WETH, receive USDC

        PoincareDCA.Preview memory pb = dca.canExecute(buy);
        (uint256 spreadBuy,) = hook.previewSpread(true);
        assertEq(pb.spreadBps, (spreadBuy * 10_000 + 1e18 - 1) / 1e18, "spread is the hook's projection");
        assertEq(uint8(pb.status), uint8(PoincareDCA.Status.Ready));

        uint256 wethBefore = weth.balanceOf(user);
        vm.prank(keeper);
        uint256 outBuy = dca.executeSlice(buy);
        assertEq(outBuy, pb.quoteOut, "buy fill == Lens quote");
        assertEq(weth.balanceOf(user) - wethBefore, outBuy);

        vm.roll(block.number + 1);
        PoincareDCA.Preview memory ps = dca.canExecute(sell);
        uint256 usdcBefore = usdc.balanceOf(user);
        vm.prank(keeper);
        uint256 outSell = dca.executeSlice(sell);
        assertEq(outSell, ps.quoteOut, "sell fill == Lens quote");
        assertEq(usdc.balanceOf(user) - usdcBefore, outSell);

        console2.log("live buy  slice: 100 USDC ->", outBuy, "wei WETH, spread bps", pb.spreadBps);
        console2.log("live sell slice: 0.1 WETH ->", outSell, "wei USDC, spread bps", ps.spreadBps);
    }

    /// @notice A zero spread cap holds exactly the side the live hook currently charges.
    function test_live_spreadCapMatchesLiveCharge() public {
        PoincareDCA.OrderParams memory a = _order(true, 400e18, 4);
        a.maxSpreadBps = 0;
        PoincareDCA.OrderParams memory b = _order(false, 0.4e18, 4);
        b.maxSpreadBps = 0;
        vm.startPrank(user);
        uint256 ia = dca.createOrder(a);
        uint256 ib = dca.createOrder(b);
        vm.stopPrank();

        (uint256 s0,) = hook.previewSpread(true);
        (uint256 s1,) = hook.previewSpread(false);
        PoincareDCA.Status sa = dca.canExecute(ia).status;
        PoincareDCA.Status sb = dca.canExecute(ib).status;
        assertEq(sa == PoincareDCA.Status.SpreadTooHigh, s0 > 0, "buy side held iff the hook charges it");
        assertEq(sb == PoincareDCA.Status.SpreadTooHigh, s1 > 0, "sell side held iff the hook charges it");
        console2.log("live spreads (wad) buy/sell:", s0, s1);
    }
}
