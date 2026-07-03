// Live Poincaré deployment on Unichain Sepolia (chain 1301).
// Source of truth: deployments/unichain-sepolia.json at the repo root — after a redeploy,
// update the DEPLOYMENT block below (and nothing else) from that file.
// These are public testnet addresses, safe to commit.

/** Paste-from-deployments block. `lens`/`faucet` may be empty on an older deployment —
 *  every feature that needs them checks `hasLens`/`hasFaucet` and degrades gracefully. */
const DEPLOYMENT = {
  chainId: 1301,
  poolManager: "0x00B036B58a818B1BC34d502D3fE730Db729e62AC",
  hook: "0xbd0FcA9CDD9a87a099F7772730D62B7C3014aa88",
  lens: "0x1b20b7c253c7217dc83d87051d023bd3212f6f74",
  faucet: "0xFB29449C95326A15495BAED5c2f6CC6885Bafe0F",
  // currency0 < currency1 (v4 sort). In this pool currency0 = USDC, currency1 = WETH
  // (the deploy tooling picks the token creation order so this holds by construction).
  usdc: "0x3Ab3D6986A1076E72d1f3Fb96D0739C0C4dd90E4",
  weth: "0x642037396D62891302f06dDE0bc21071834A0260",
  /** Block the hook was deployed at — the floor for on-chain log paging. */
  deployBlock: 56191210n,
} as const;

export const CONTRACTS = {
  ...DEPLOYMENT,
  // V4 swap router on Unichain Sepolia (hookmate IUniswapV4Router04) — canonical, survives redeploys.
  router: "0x9cD2b0a732dd5e023a5539921e0FD1c30E198Dba",
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
// Both mock tokens are 18 decimals; ALWAYS convert through TOKENS[...].decimals (lib/units.ts),
// never a hardcoded 1e18 — a real USDC is 6 decimals and silent breakage is the failure mode.
export const TOKENS = {
  WETH: { address: CONTRACTS.weth, symbol: "WETH", decimals: 18, color: "var(--eth)" },
  USDC: { address: CONTRACTS.usdc, symbol: "USDC", decimals: 18, color: "var(--usdc)" },
} as const;
export type TokenSym = keyof typeof TOKENS;

export const EXPLORER = "https://sepolia.uniscan.xyz";

// Cusum.Trend enum is 0=None, 1=Up, 2=Down — but it runs on the hook's INTERNAL price,
// priceWad = reserve1/reserve0 = WETH/USDC, which is the INVERSE of the UI's USDC/WETH
// chart price. So the hook's "Up" (WETH/USDC rising) is a falling chart, and vice-versa.
// We invert here so the UI trend label matches the direction the user sees on the chart
// (and the side that gets the with-trend spread). The spread getters are direction-based
// (effectiveSpread(zeroForOne)) and already correct, so only the label needs flipping.
export const TREND = ["none", "down", "up"] as const;
export type TrendLabel = "none" | "up" | "down";

/** Minimal ABI for the PoincareHook public read surface + LP entrypoints. */
export const HOOK_ABI = [
  { type: "function", name: "reserves", stateMutability: "view", inputs: [], outputs: [{ name: "r0", type: "uint256" }, { name: "r1", type: "uint256" }] },
  { type: "function", name: "kappa", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "trend", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "directionalEfficiency", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "effectiveSpread", stateMutability: "view", inputs: [{ name: "zeroForOne", type: "bool" }], outputs: [{ type: "uint256" }] },
  // -- detector exposure (deployments from July 2026 on) --
  { type: "function", name: "cusumState", stateMutability: "view", inputs: [], outputs: [{ name: "sPos", type: "int256" }, { name: "sNeg", type: "int256" }] },
  { type: "function", name: "sigmaWad", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "currentFeeWad", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "previewSpread", stateMutability: "view", inputs: [{ name: "zeroForOne", type: "bool" }], outputs: [{ name: "spreadWad", type: "uint256" }, { name: "feeWad", type: "uint256" }] },
  { type: "function", name: "baseOffsets", stateMutability: "view", inputs: [], outputs: [{ name: "a", type: "uint256" }, { name: "b", type: "uint256" }] },
  // -- immutable config --
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
 * The HOOK calls transferFrom(sender -> PoolManager) inside its unlock callback, so
 * the user approves USDC and WETH to the HOOK before addLiquidity (approving the
 * PoolManager does nothing — the allowance the transfer spends is [user][hook]).
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
