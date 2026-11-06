// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {AddressConstants} from "hookmate/constants/AddressConstants.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

import {PoincareLens} from "../src/PoincareLens.sol";
import {PoincareDCA} from "../src/periphery/PoincareDCA.sol";

/// @title DeployPoincareDCA: the spread-aware DCA periphery for the live Poincaré pool
/// @notice Reads the live hook / Lens from deployments/unichain-sepolia.json (written by the
///         hook's deploy script), uses the canonical v4 router the app already trades through,
///         deploys PoincareDCA owned by the broadcaster, and allowlists the keeper.
///
///         Touches nothing that is already deployed: the hook, Lens and pool are only read.
///
///   KEEPER=0x... FOUNDRY_PROFILE=deploy forge script script/DeployPoincareDCA.s.sol \
///     --rpc-url unichain_sepolia --private-key $PK --broadcast
///
///         (The deploy profile's optimizer brings the runtime to ~10 KB; unoptimized it is ~21 KB,
///         also under the EIP-170 limit.)
///
///         Writes deployments/unichain-sepolia-dca.json for the app, API, keeper and SDK.
contract DeployPoincareDCA is Script {
    string internal constant DEPLOYMENTS = "./deployments/unichain-sepolia.json";
    string internal constant OUT = "./deployments/unichain-sepolia-dca.json";

    function run() external returns (PoincareDCA dca) {
        string memory json = vm.readFile(DEPLOYMENTS);
        require(vm.parseJsonUint(json, ".chainId") == block.chainid, "deployments file is for another chain");
        PoincareLens lens = PoincareLens(vm.parseJsonAddress(json, ".poincareLens"));
        require(address(lens.hook()) == vm.parseJsonAddress(json, ".poincareHook"), "lens is not bound to the live hook");

        IUniswapV4Router04 router = IUniswapV4Router04(payable(AddressConstants.getV4SwapRouterAddress(block.chainid)));
        require(address(router).code.length > 0, "no v4 router on this chain");
        address keeper = vm.envOr("KEEPER", address(0));

        vm.startBroadcast();
        dca = new PoincareDCA(lens, router, msg.sender);
        if (keeper != address(0)) dca.setKeeper(keeper, true);
        vm.stopBroadcast();

        console2.log("PoincareDCA:", address(dca));
        console2.log("router     :", address(router));
        console2.log("keeper     :", keeper);

        string memory o = "dca";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "poincareDCA", address(dca));
        vm.serializeAddress(o, "poincareLens", address(lens));
        vm.serializeAddress(o, "poincareHook", address(lens.hook()));
        vm.serializeAddress(o, "router", address(router));
        vm.serializeAddress(o, "owner", msg.sender);
        vm.serializeAddress(o, "keeper", keeper);
        string memory out = vm.serializeUint(o, "deployBlock", block.number);
        vm.writeJson(out, OUT);
    }
}
