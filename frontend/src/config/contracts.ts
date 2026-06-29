// Live Poincaré deployment on Unichain Sepolia (chain 1301).
// Source of truth: deployments/unichain-sepolia.json at the repo root.
// These are public testnet addresses, safe to commit.

export const CONTRACTS = {
  chainId: 1301,
  poolManager: "0x00B036B58a818B1BC34d502D3fE730Db729e62AC",
  hook: "0x8dBcb4eA2855faC53237fA5Fc607Ccd16E47aA88",
  // V4 swap router on Unichain Sepolia (hookmate IUniswapV4Router04).
  router: "0x9cD2b0a732dd5e023a5539921e0FD1c30E198Dba",
  // currency0 < currency1 (v4 sort). In this pool currency0 = USDC, currency1 = WETH.
  usdc: "0x414e989a41638735F2Efe5b6d4c4AD826A918823",
  weth: "0x5B150f01CfBd968b4E7A6bFD5FC8eb3870A3C512",
  currency0: "0x414e989a41638735F2Efe5b6d4c4AD826A918823", // USDC
  currency1: "0x5B150f01CfBd968b4E7A6bFD5FC8eb3870A3C512", // WETH
  fee: 0x800000, // DYNAMIC_FEE_FLAG
  tickSpacing: 60,
} as const;

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
// Both mock tokens are 18 decimals, so price (USDC per WETH) = r0 / r1.
export const TOKENS = {
  WETH: { address: CONTRACTS.weth, symbol: "WETH", decimals: 18, color: "var(--eth)" },
  USDC: { address: CONTRACTS.usdc, symbol: "USDC", decimals: 18, color: "var(--usdc)" },
} as const;

export const EXPLORER = "https://sepolia.uniscan.xyz";

// 0 = None, 1 = Up, 2 = Down  (Cusum.Trend)
export const TREND = ["none", "up", "down"] as const;
export type TrendLabel = (typeof TREND)[number];

/** Minimal ABI for the PoincareHook public read surface + LP entrypoints. */
export const HOOK_ABI = [
  { type: "function", name: "reserves", stateMutability: "view", inputs: [], outputs: [{ name: "r0", type: "uint256" }, { name: "r1", type: "uint256" }] },
  { type: "function", name: "kappa", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "trend", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "directionalEfficiency", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "effectiveSpread", stateMutability: "view", inputs: [{ name: "zeroForOne", type: "bool" }], outputs: [{ type: "uint256" }] },
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

/**
 * Hook-owned liquidity (BaseCustomAccounting). LP shares are the hook's own ERC20.
 * Liquidity tokens settle via transferFrom(sender -> PoolManager), so the user
 * approves USDC and WETH to the PoolManager (not the hook) before addLiquidity.
 * tickLower/tickUpper/userInputSalt are unused by the custom curve -> pass 0.
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
