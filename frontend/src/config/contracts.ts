// Live Poincaré deployments, one entry per chain.
// Source of truth is deployments/<chain>.json at the repo root; after a redeploy,
// update the matching DEPLOYMENTS entry below (and nothing else) from that file.
// Public testnet addresses, safe to commit.

/** `lens`/`faucet` may be empty on an older deployment; every feature that needs them
 *  checks `hasLens`/`hasFaucet` and degrades gracefully. An entry whose `hook` is empty
 *  is treated as not-yet-live and excluded from the chain switcher. */
type Deployment = {
  chainId: number;
  name: string;
  nativeSymbol: string;
  explorer: string;
  poolManager: string;
  hook: string;
  lens: string;
  faucet: string;
  /** hookmate IUniswapV4Router04 the swap UI targets (canonical on Unichain, ours on Monad). */
  router: string;
  // currency0 < currency1 (v4 sort). In these pools currency0 = USDC, currency1 = WETH
  // (the deploy tooling picks the token creation order so this holds by construction).
  usdc: string;
  weth: string;
  /** Block the hook was deployed at; the floor for on-chain log paging. */
  deployBlock: bigint;
};

export const DEPLOYMENTS: Record<number, Deployment> = {
  1301: {
    chainId: 1301,
    name: "Unichain Sepolia",
    nativeSymbol: "ETH",
    explorer: "https://sepolia.uniscan.xyz",
    poolManager: "0x00B036B58a818B1BC34d502D3fE730Db729e62AC",
    hook: "0x9F110F6cC0dfE0CE47f3d49CaF22e9E3220e6A88",
    lens: "0x1ca28a5de680109513ce26c861e049116a2643c2",
    faucet: "0x8ef741ed7bb6033914aedb6bc33220cee32b826b",
    router: "0x9cD2b0a732dd5e023a5539921e0FD1c30E198Dba",
    usdc: "0x729C49092b54CC946d343C53Ad45c3785016b481",
    weth: "0xfb82FAAc0D9DdEbB1646a090c8Ab6a395A3e6aBD",
    deployBlock: 57598397n,
  },
  // Additional chains slot in here once a deployment exists (entry shape above);
  // Monad testnet was evaluated and dropped for now: no canonical Uniswap v4 there.
};

const isLive = (d: Deployment) => d.hook.length === 42;
export const LIVE_CHAIN_IDS = Object.values(DEPLOYMENTS).filter(isLive).map((d) => d.chainId);

/** The whole config layer (and several module-level captures downstream) is bound to one
 *  chain per page load; switching chains persists the choice and reloads. */
const STORAGE_KEY = "poincare.chainId";
const stored = typeof localStorage !== "undefined" ? Number(localStorage.getItem(STORAGE_KEY)) : NaN;
export const ACTIVE_CHAIN_ID = LIVE_CHAIN_IDS.includes(stored) ? stored : 1301;
export function setActiveChain(chainId: number) {
  if (!LIVE_CHAIN_IDS.includes(chainId) || chainId === ACTIVE_CHAIN_ID) return;
  localStorage.setItem(STORAGE_KEY, String(chainId));
  window.location.reload();
}

const DEPLOYMENT = DEPLOYMENTS[ACTIVE_CHAIN_ID];
export const CHAIN_NAME = DEPLOYMENT.name;

export const CONTRACTS = {
  ...DEPLOYMENT,
  currency0: DEPLOYMENT.usdc,
  currency1: DEPLOYMENT.weth,
  fee: 0x800000, // DYNAMIC_FEE_FLAG
  tickSpacing: 60,
} as const;

export const hasLens = CONTRACTS.lens.length === 42;
export const hasFaucet = CONTRACTS.faucet.length === 42;

/** PoolKey tuple for router/manager calls: (currency0, currency1, fee, tickSpacing, hooks). */
export const POOL_KEY = {
  currency0: CONTRACTS.currency0 as `0x${string}`,
  currency1: CONTRACTS.currency1 as `0x${string}`,
  fee: CONTRACTS.fee,
  tickSpacing: CONTRACTS.tickSpacing,
  hooks: CONTRACTS.hook as `0x${string}`,
} as const;

/** Single-pool exact-input swap on the v4 router. */
export const ROUTER_ABI = [
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "zeroForOne", type: "bool" },
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "hookData", type: "bytes" },
      { name: "receiver", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "delta", type: "int256" }],
  },
] as const;

// reserves() returns (r0, r1) = (USDC, WETH); reserve-implied price = r1/r0 in raw units.
// Both mock tokens are 18 decimals, but always convert through TOKENS[...].decimals
// (lib/units.ts), never a hardcoded 1e18: a real USDC is 6 decimals and the breakage
// would be silent.
export const TOKENS = {
  WETH: { address: CONTRACTS.weth, symbol: "WETH", decimals: 18, color: "var(--eth)" },
  USDC: { address: CONTRACTS.usdc, symbol: "USDC", decimals: 18, color: "var(--usdc)" },
} as const;
export type TokenSym = keyof typeof TOKENS;

export const EXPLORER = DEPLOYMENT.explorer;

// Cusum.Trend enum is 0=None, 1=Up, 2=Down, but it runs on the hook's internal price
// (reserve1/reserve0 = WETH/USDC), the inverse of the UI's USDC/WETH chart price. The
// hook's "Up" is therefore a falling chart and vice-versa, so the label is inverted here
// to match what the user sees. The spread getters are direction-based
// (effectiveSpread(zeroForOne)) and already correct; only the label needs flipping.
export const TREND = ["none", "down", "up"] as const;
export type TrendLabel = "none" | "up" | "down";

/** Minimal ABI for the PoincareHook public read surface + LP entrypoints. */
export const HOOK_ABI = [
  { type: "function", name: "reserves", stateMutability: "view", inputs: [], outputs: [{ name: "r0", type: "uint256" }, { name: "r1", type: "uint256" }] },
  { type: "function", name: "kappa", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "trend", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "directionalEfficiency", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "effectiveSpread", stateMutability: "view", inputs: [{ name: "zeroForOne", type: "bool" }], outputs: [{ type: "uint256" }] },
  // detector exposure (deployments from July 2026 on)
  { type: "function", name: "cusumState", stateMutability: "view", inputs: [], outputs: [{ name: "sPos", type: "int256" }, { name: "sNeg", type: "int256" }] },
  { type: "function", name: "sigmaWad", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "currentFeeWad", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "previewSpread", stateMutability: "view", inputs: [{ name: "zeroForOne", type: "bool" }], outputs: [{ name: "spreadWad", type: "uint256" }, { name: "feeWad", type: "uint256" }] },
  { type: "function", name: "baseOffsets", stateMutability: "view", inputs: [], outputs: [{ name: "a", type: "uint256" }, { name: "b", type: "uint256" }] },
  // immutable config
  { type: "function", name: "thresholdH", stateMutability: "view", inputs: [], outputs: [{ type: "int256" }] },
  { type: "function", name: "k", stateMutability: "view", inputs: [], outputs: [{ type: "int256" }] },
  { type: "function", name: "sMax", stateMutability: "view", inputs: [], outputs: [{ type: "int256" }] },
  { type: "function", name: "kappaMin", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "kappaMax", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "dMax", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lambda", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "dFloor", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lastSampledPriceWad", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lastSampledBlock", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

/** PoincareLens: quotes that match hook execution to the wei (incl. the projected
 *  once-per-block detector sample, so fresh-block quotes are exact too). */
export const LENS_ABI = [
  { type: "function", name: "quoteExactInput", stateMutability: "view", inputs: [{ name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint256" }], outputs: [{ name: "amountOut", type: "uint256" }] },
  { type: "function", name: "quoteExactOutput", stateMutability: "view", inputs: [{ name: "zeroForOne", type: "bool" }, { name: "amountOut", type: "uint256" }], outputs: [{ name: "amountIn", type: "uint256" }] },
  { type: "function", name: "midPriceWad", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "spreads", stateMutability: "view", inputs: [], outputs: [{ name: "spreadZeroForOne", type: "uint256" }, { name: "spreadOneForZero", type: "uint256" }] },
] as const;

/** DemoFaucet: both demo tokens in one transaction. */
export const FAUCET_ABI = [
  { type: "function", name: "drip", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [] },
] as const;

/**
 * Hook-owned liquidity (BaseCustomAccounting). LP shares are the hook's own ERC20.
 * The hook calls transferFrom(sender -> PoolManager) inside its unlock callback, so
 * the user must approve USDC and WETH to the HOOK before addLiquidity. Approving the
 * PoolManager does nothing: the allowance the transfer spends is [user][hook].
 * tickLower/tickUpper/userInputSalt are unused by the custom curve; pass 0.
 */
export const HOOK_LP_ABI = [
  {
    type: "function",
    name: "addLiquidity",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "userInputSalt", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ name: "delta", type: "int256" }],
  },
  {
    type: "function",
    name: "removeLiquidity",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "liquidity", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "userInputSalt", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ name: "delta", type: "int256" }],
  },
] as const;

/** ERC20 (incl. free mint on the demo tokens). */
export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amt", type: "uint256" }], outputs: [] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
