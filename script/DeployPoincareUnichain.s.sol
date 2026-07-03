// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {IERC20Minimal} from "@uniswap/v4-core/src/interfaces/external/IERC20Minimal.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {AddressConstants} from "hookmate/constants/AddressConstants.sol";
import {BaseCustomAccounting} from "@openzeppelin/uniswap-hooks/src/base/BaseCustomAccounting.sol";

import {PoincareHook, PoincareConfig} from "../src/PoincareHook.sol";
import {PoincareLens} from "../src/PoincareLens.sol";

/// @dev Minimal free-mint 18-decimal ERC20 for the testnet demo pool (kept in-script so it is
///      not under the build-skipped test/sim path).
contract DemoERC20 is IERC20Minimal {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s) {
        name = n;
        symbol = s;
    }

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
        totalSupply += amt;
        emit Transfer(address(0), to, amt);
    }

    function approve(address sp, uint256 amt) external returns (bool) {
        allowance[msg.sender][sp] = amt;
        emit Approval(msg.sender, sp, amt);
        return true;
    }

    function transfer(address to, uint256 amt) external returns (bool) {
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        emit Transfer(msg.sender, to, amt);
        return true;
    }

    function transferFrom(address f, address to, uint256 amt) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) allowance[f][msg.sender] = a - amt;
        balanceOf[f] -= amt;
        balanceOf[to] += amt;
        emit Transfer(f, to, amt);
        return true;
    }
}

/// @dev One-transaction faucet for the demo tokens: a fresh wallet gets both sides of the
///      pair with a single confirmation (two separate mints made wallets show two popups and
///      look broken when the second was missed).
contract DemoFaucet {
    DemoERC20 public immutable weth;
    DemoERC20 public immutable usdc;
    uint256 public constant WETH_DRIP = 20e18;
    uint256 public constant USDC_DRIP = 50_000e18;

    constructor(DemoERC20 _weth, DemoERC20 _usdc) {
        weth = _weth;
        usdc = _usdc;
    }

    function drip(address to) external {
        weth.mint(to, WETH_DRIP);
        usdc.mint(to, USDC_DRIP);
    }
}

/// @notice One-shot deployment of a fully usable Poincaré pool to a live network
///         (built for Unichain Sepolia, chain 1301, but chain-agnostic via AddressConstants).
///
///         Deploys: mock WETH + mock USDC -> mines & deploys PoincareHook with the correct
///         permission flags -> initialises the v4 pool -> seeds hook-owned liquidity at a
///         3000 USDC/WETH price. Writes every address to deployments/unichain-sepolia.json so
///         the frontend can pick them up.
///
///         Run (key passed inline, never committed):
///           PRIVATE_KEY=0x... forge script script/DeployPoincareUnichain.s.sol:DeployPoincareUnichain \
///             --rpc-url unichain_sepolia --broadcast
contract DeployPoincareUnichain is Script {
    // CREATE2_FACTORY (canonical deterministic deployer) is inherited from forge-std's Script.

    // ---- Detector / curve config (illustrative, lively for a live demo) ----
    // Same shape as the test/sim config: engages quickly so the lean is visible on a testnet.
    // Absolute (non-adaptive) mode: the proven live behavior. The vol fee is ON so the
    // calm-market revenue lever is visible; base depth stays plain x*y=k so demo trades keep
    // moving the price enough to exercise the detector.
    int256 constant K = 1e15; //          slack 0.001 (noise floor)
    int256 constant H = 5e15; //          threshold 0.005
    int256 constant S_MAX = 2e16; //      evidence cap 0.02
    uint256 constant KAPPA_MIN = 0; //    symmetric when calm
    uint256 constant KAPPA_MAX = 1e17; // 0.10 max directional spread
    uint256 constant D_MAX = 5e16; //     kappa ramp rate / block
    uint256 constant LAMBDA = 9e17; //    EWMA decay 0.9
    uint256 constant D_FLOOR = 5e17; //   directional-efficiency gate 0.5
    uint256 constant CLIP = 2e17; //      Huber clip: 20% log-return per block
    uint256 constant FEE_GAMMA = 5e17; // fee = 0.5 * sigma ...
    uint256 constant FEE_CAP = 3e15; //   ... capped at 0.30% (a vanilla pool's fee)
    uint256 constant ALPHA = 0; //        plain constant-product base for the demo pool

    // 1000 WETH : 3,000,000 USDC -> implied price 3000
    uint256 constant WETH_SEED = 1000e18;
    uint256 constant USDC_SEED = 3_000_000e18;

    struct Deployment {
        address poolManager;
        address hook;
        address lens;
        address faucet;
        address weth;
        address usdc;
        address currency0;
        address currency1;
    }

    function run() public {
        IPoolManager pm = IPoolManager(AddressConstants.getPoolManagerAddress(block.chainid));
        require(address(pm) != address(0), "no PoolManager for this chain");

        vm.startBroadcast();
        Deployment memory d = _deployAll(pm);
        vm.stopBroadcast();

        _log(d);
        _persist(d);
    }

    function _deployAll(IPoolManager pm) internal returns (Deployment memory d) {
        // 1. Mock tokens (free-mint, 18 decimals) so the pool is fully tradeable on testnet,
        //    plus the one-transaction faucet for fresh wallets.
        DemoERC20 weth = new DemoERC20("Poincare Wrapped Ether", "WETH");
        DemoERC20 usdc = new DemoERC20("Poincare USD Coin", "USDC");
        DemoFaucet faucet = new DemoFaucet(weth, usdc);
        weth.mint(msg.sender, WETH_SEED * 1000); // plenty left over for trading/faucet
        usdc.mint(msg.sender, USDC_SEED * 1000);

        // 2. Sort into currency0 < currency1 (v4 invariant).
        (Currency c0, Currency c1) = address(weth) < address(usdc)
            ? (Currency.wrap(address(weth)), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(address(weth)));

        // 3. Mine + CREATE2-deploy the hook with the correct permission flags, plus its Lens
        //    (the quoter routers and the frontend price through).
        PoincareHook hook = _deployHook(pm);
        PoincareLens lens = new PoincareLens(hook);

        // 4. Initialise the pool. The custom curve prices off reserves, not slot0, so the
        //    starting sqrtPrice is cosmetic; 1:1 is fine.
        PoolKey memory key = PoolKey(c0, c1, LPFeeLibrary.DYNAMIC_FEE_FLAG, 60, IHooks(hook));
        pm.initialize(key, Constants.SQRT_PRICE_1_1);

        // 5. Seed hook-owned liquidity at the 3000 price (amounts follow the sorted order).
        weth.approve(address(hook), type(uint256).max);
        usdc.approve(address(hook), type(uint256).max);
        bool wethIs0 = Currency.unwrap(c0) == address(weth);
        uint256 amt0 = wethIs0 ? WETH_SEED : USDC_SEED;
        uint256 amt1 = wethIs0 ? USDC_SEED : WETH_SEED;
        hook.addLiquidity(
            BaseCustomAccounting.AddLiquidityParams(amt0, amt1, 0, 0, type(uint256).max, -887220, 887220, bytes32(0))
        );

        d = Deployment(
            address(pm),
            address(hook),
            address(lens),
            address(faucet),
            address(weth),
            address(usdc),
            Currency.unwrap(c0),
            Currency.unwrap(c1)
        );
    }

    function _config() internal pure returns (PoincareConfig memory cfg) {
        cfg.k = K;
        cfg.h = H;
        cfg.sMax = S_MAX;
        cfg.lambda = LAMBDA;
        cfg.dFloor = D_FLOOR;
        cfg.adaptive = false;
        cfg.sigmaFloor = 0;
        cfg.clipWad = CLIP;
        cfg.kappaMin = KAPPA_MIN;
        cfg.kappaMax = KAPPA_MAX;
        cfg.dMax = D_MAX;
        cfg.feeGamma = FEE_GAMMA;
        cfg.feeCap = FEE_CAP;
        cfg.alphaWad = ALPHA;
    }

    function _deployHook(IPoolManager pm) internal returns (PoincareHook hook) {
        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        );
        PoincareConfig memory cfg = _config();
        bytes memory args = abi.encode(pm, cfg);
        (address hookAddr, bytes32 salt) = HookMiner.find(CREATE2_FACTORY, flags, type(PoincareHook).creationCode, args);
        hook = new PoincareHook{salt: salt}(pm, cfg);
        require(address(hook) == hookAddr, "hook address mismatch");
    }

    function _log(Deployment memory d) internal pure {
        console2.log("PoolManager   ", d.poolManager);
        console2.log("PoincareHook  ", d.hook);
        console2.log("PoincareLens  ", d.lens);
        console2.log("DemoFaucet    ", d.faucet);
        console2.log("WETH (mock)   ", d.weth);
        console2.log("USDC (mock)   ", d.usdc);
        console2.log("currency0     ", d.currency0);
        console2.log("currency1     ", d.currency1);
    }

    function _persist(Deployment memory d) internal {
        string memory o = "deploy";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "poolManager", d.poolManager);
        vm.serializeAddress(o, "poincareHook", d.hook);
        vm.serializeAddress(o, "poincareLens", d.lens);
        vm.serializeAddress(o, "faucet", d.faucet);
        vm.serializeAddress(o, "weth", d.weth);
        vm.serializeAddress(o, "usdc", d.usdc);
        vm.serializeAddress(o, "currency0", d.currency0);
        vm.serializeAddress(o, "currency1", d.currency1);
        vm.serializeUint(o, "tickSpacing", uint256(60));
        string memory json = vm.serializeUint(o, "fee", uint256(LPFeeLibrary.DYNAMIC_FEE_FLAG));
        vm.writeJson(json, "./deployments/unichain-sepolia.json");
    }
}
