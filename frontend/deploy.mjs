// Direct deployment of the full Poincaré system to Unichain Sepolia, bypassing
// `forge script --broadcast` (this chain's eth_estimateGas is unreliable for these
// txns, so every tx here carries an explicit gas limit, the same workaround the
// frontend uses). Also guarantees USDC = currency0: token CREATE addresses are
// precomputed from the deployer nonce and the constructor order is chosen so the
// USDC token lands on the lower address (the whole app assumes that orientation).
//
//   PK=0x.. node deploy.mjs
//
// Reads artifacts from ../out (build with FOUNDRY_PROFILE=deploy first) and writes
// ../deployments/unichain-sepolia.json (including the hook's deploy block).
import fs from "node:fs";
import {
  createPublicClient, createWalletClient, http, defineChain, formatEther,
  encodeDeployData, encodeFunctionData, getContractAddress, getCreate2Address,
  keccak256, concat, pad, toHex, parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://sepolia.unichain.org";
const PK = process.env.PK?.startsWith("0x") ? process.env.PK : `0x${process.env.PK}`;
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const POOL_MANAGER = "0x00B036B58a818B1BC34d502D3fE730Db729e62AC";
const SQRT_PRICE_1_1 = 79228162514264337593543950336n; // 2^96

// config, mirrored from script/DeployPoincareUnichain.s.sol
const CFG = {
  k: 10n ** 15n, //            slack 0.001
  h: 5n * 10n ** 15n, //       threshold 0.005
  sMax: 2n * 10n ** 16n, //    evidence cap 0.02
  lambda: 9n * 10n ** 17n, //  EWMA decay 0.9
  dFloor: 5n * 10n ** 17n, //  D gate 0.5
  adaptive: false,
  sigmaFloor: 0n,
  clipWad: 2n * 10n ** 17n, // Huber clip 20%/block
  kappaMin: 0n,
  kappaMax: 10n ** 17n, //     0.10 max directional spread
  dMax: 5n * 10n ** 16n, //    kappa ramp / block
  feeGamma: 5n * 10n ** 17n, // fee = 0.5 * sigma ...
  feeCap: 3n * 10n ** 15n, //  ... capped at 0.30%
  alphaWad: 0n, //             plain x*y=k base for the demo pool
};
const WETH_SEED = parseUnits("1000", 18);
const USDC_SEED = parseUnits("3000000", 18);
const EXTRA_MINT = 1000n; // seed x1000 spare for trading/faucet

// v4 hook permission flags (the lowest 14 address bits must match)
const FLAGS =
  (1n << 13n) /* BEFORE_INITIALIZE */ |
  (1n << 11n) /* BEFORE_ADD_LIQUIDITY */ |
  (1n << 9n) /* BEFORE_REMOVE_LIQUIDITY */ |
  (1n << 7n) /* BEFORE_SWAP */ |
  (1n << 3n); /* BEFORE_SWAP_RETURNS_DELTA */
const FLAG_MASK = 0x3fffn;

const chain = defineChain({ id: 1301, name: "Unichain Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const account = privateKeyToAccount(PK);
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

const artifact = (p) => JSON.parse(fs.readFileSync(new URL(`../out/${p}`, import.meta.url), "utf8"));
const ERC20_ART = artifact("DeployPoincareUnichain.s.sol/DemoERC20.json");
const FAUCET_ART = artifact("DeployPoincareUnichain.s.sol/DemoFaucet.json");
const HOOK_ART = artifact("PoincareHook.sol/PoincareHook.json");
const LENS_ART = artifact("PoincareLens.sol/PoincareLens.json");

const ERC20_ABI = [
  { type: "constructor", inputs: [{ type: "string" }, { type: "string" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
];
const FAUCET_ABI = [{ type: "constructor", inputs: [{ type: "address" }, { type: "address" }] }];
const LENS_ABI = [{ type: "constructor", inputs: [{ type: "address" }] }];
const HOOK_CTOR = [
  { type: "address" },
  { type: "tuple", components: [
    { name: "k", type: "int256" }, { name: "h", type: "int256" }, { name: "sMax", type: "int256" },
    { name: "lambda", type: "uint256" }, { name: "dFloor", type: "uint256" },
    { name: "adaptive", type: "bool" }, { name: "sigmaFloor", type: "uint256" }, { name: "clipWad", type: "uint256" },
    { name: "kappaMin", type: "uint256" }, { name: "kappaMax", type: "uint256" }, { name: "dMax", type: "uint256" },
    { name: "feeGamma", type: "uint256" }, { name: "feeCap", type: "uint256" }, { name: "alphaWad", type: "uint256" },
  ] },
];
const POOL_KEY_T = { type: "tuple", components: [
  { name: "currency0", type: "address" }, { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" },
] };
const PM_ABI = [
  { type: "function", name: "initialize", stateMutability: "nonpayable",
    inputs: [POOL_KEY_T, { name: "sqrtPriceX96", type: "uint160" }], outputs: [{ type: "int24" }] },
];
const HOOK_LP_ABI = [
  { type: "function", name: "addLiquidity", stateMutability: "payable",
    inputs: [{ type: "tuple", components: [
      { name: "amount0Desired", type: "uint256" }, { name: "amount1Desired", type: "uint256" },
      { name: "amount0Min", type: "uint256" }, { name: "amount1Min", type: "uint256" },
      { name: "deadline", type: "uint256" }, { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" }, { name: "userInputSalt", type: "bytes32" },
    ] }], outputs: [{ type: "int256" }] },
];

let nonce;
async function send(desc, tx, gas) {
  const hash = await wallet.sendTransaction({ ...tx, gas, nonce: nonce++ });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  if (rcpt.status !== "success") throw new Error(`${desc} reverted (${hash})`);
  console.log(`  ${desc} · gas ${rcpt.gasUsed} · ${rcpt.contractAddress ?? tx.to}`);
  return rcpt;
}
const deployData = (art, abi, args) => encodeDeployData({ abi, bytecode: art.bytecode.object, args });

async function main() {
  console.log(`deployer ${account.address} · balance ${formatEther(await pub.getBalance({ address: account.address }))} ETH`);
  nonce = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });

  // Tokens: choose constructor order so USDC gets the lower address (currency0).
  const addrA = getContractAddress({ from: account.address, nonce: BigInt(nonce) });
  const addrB = getContractAddress({ from: account.address, nonce: BigInt(nonce) + 1n });
  const usdcFirst = addrA.toLowerCase() < addrB.toLowerCase();
  const [usdcAddr, wethAddr] = usdcFirst ? [addrA, addrB] : [addrB, addrA];
  console.log(`token order: ${usdcFirst ? "USDC then WETH" : "WETH then USDC"} -> currency0 = USDC ${usdcAddr}`);

  const deployToken = (name, symbol) =>
    send(`deploy ${symbol}`, { data: deployData(ERC20_ART, ERC20_ABI, [name, symbol]) }, 1_500_000n);
  if (usdcFirst) {
    await deployToken("Poincare USD Coin", "USDC");
    await deployToken("Poincare Wrapped Ether", "WETH");
  } else {
    await deployToken("Poincare Wrapped Ether", "WETH");
    await deployToken("Poincare USD Coin", "USDC");
  }

  // Faucet.
  const faucetRcpt = await send("deploy DemoFaucet", { data: deployData(FAUCET_ART, FAUCET_ABI, [wethAddr, usdcAddr]) }, 1_000_000n);
  const faucetAddr = faucetRcpt.contractAddress;

  // Mine and CREATE2-deploy the hook (permission flags live in the address).
  const hookInit = deployData(HOOK_ART, [{ type: "constructor", inputs: HOOK_CTOR }], [POOL_MANAGER, CFG]);
  const initHash = keccak256(hookInit);
  let salt = 0n, hookAddr;
  for (;;) {
    hookAddr = getCreate2Address({ from: CREATE2_FACTORY, salt: pad(toHex(salt), { size: 32 }), bytecodeHash: initHash });
    if ((BigInt(hookAddr) & FLAG_MASK) === FLAGS) break;
    salt++;
  }
  console.log(`mined hook salt ${salt} -> ${hookAddr}`);
  const hookRcpt = await send("deploy PoincareHook (CREATE2)", { to: CREATE2_FACTORY, data: concat([pad(toHex(salt), { size: 32 }), hookInit]) }, 6_000_000n);
  const deployBlock = hookRcpt.blockNumber;
  // Public RPC is load-balanced; a replica can lag the just-mined block. Retry the code check.
  for (let tries = 0; ; tries++) {
    const code = await pub.getCode({ address: hookAddr }).catch(() => undefined);
    if (code && code !== "0x") break;
    if (tries >= 10) throw new Error("hook code missing after CREATE2");
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Lens.
  const lensRcpt = await send("deploy PoincareLens", { data: deployData(LENS_ART, LENS_ABI, [hookAddr]) }, 2_000_000n);
  const lensAddr = lensRcpt.contractAddress;

  const sendCall = (desc, to, abi, fn, args, gas) =>
    send(desc, { to, data: encodeFunctionData({ abi, functionName: fn, args }) }, gas);

  // Initialise the pool; the custom curve prices off reserves, so sqrtPrice is cosmetic.
  const poolKey = { currency0: usdcAddr, currency1: wethAddr, fee: 0x800000, tickSpacing: 60, hooks: hookAddr };
  await sendCall("initialize pool", POOL_MANAGER, PM_ABI, "initialize", [poolKey, SQRT_PRICE_1_1], 600_000n);

  // Mint spare balances and seed hook-owned liquidity at 3000 USDC/WETH.

  await sendCall("mint USDC", usdcAddr, ERC20_ABI, "mint", [account.address, USDC_SEED * EXTRA_MINT], 300_000n);
  await sendCall("mint WETH", wethAddr, ERC20_ABI, "mint", [account.address, WETH_SEED * EXTRA_MINT], 300_000n);
  await sendCall("approve USDC -> hook", usdcAddr, ERC20_ABI, "approve", [hookAddr, USDC_SEED], 200_000n);
  await sendCall("approve WETH -> hook", wethAddr, ERC20_ABI, "approve", [hookAddr, WETH_SEED], 200_000n);
  await sendCall("seed liquidity", hookAddr, HOOK_LP_ABI, "addLiquidity", [{
    amount0Desired: USDC_SEED, amount1Desired: WETH_SEED, amount0Min: 0n, amount1Min: 0n,
    deadline: 2n ** 255n, tickLower: -887220, tickUpper: 887220,
    userInputSalt: "0x0000000000000000000000000000000000000000000000000000000000000000",
  }], 2_500_000n);

  // Persist.
  const out = {
    chainId: 1301,
    poolManager: POOL_MANAGER,
    poincareHook: hookAddr,
    poincareLens: lensAddr,
    faucet: faucetAddr,
    weth: wethAddr,
    usdc: usdcAddr,
    currency0: usdcAddr,
    currency1: wethAddr,
    tickSpacing: 60,
    fee: 8388608,
    deployBlock: Number(deployBlock),
  };
  fs.writeFileSync(new URL("../deployments/unichain-sepolia.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
  console.log("\n===== DEPLOYED =====");
  console.log(JSON.stringify(out, null, 2));
  console.log(`balance left: ${formatEther(await pub.getBalance({ address: account.address }))} ETH`);
}

main().catch((e) => { console.error(e); process.exit(1); });
