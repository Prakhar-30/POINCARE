import { encodeFunctionData, getAddress, isAddress, maxUint256, zeroAddress, zeroHash, type Address, type PublicClient } from "viem";
import { erc20Abi } from "./abi/erc20.js";
import { liquidityAbi } from "./abi/liquidity.js";
import type { TxRequest } from "./dcaClient.js";
import type { PoincareDeployment } from "./deployments.js";
import { DEFAULT_SWAP_DEADLINE_SEC, DEFAULT_SWAP_SLIPPAGE_BPS, MAX_SWAP_DEADLINE_SEC, MAX_SWAP_SLIPPAGE_BPS, minOutFor } from "./swap.js";
import { WAD } from "./units.js";

/** Explicit gas limits: testnet eth_estimateGas mis-simulates calls that run through the hook. */
export const LP_GAS = { approve: 80_000n, add: 3_000_000n, remove: 2_500_000n } as const;

export class LpParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LpParamError";
  }
}

export type Position = {
  owner: Address;
  /** LP shares held (the hook's own 18-decimal ERC-20). */
  shares: bigint;
  totalShares: bigint;
  /** Share of the pool, 0..1. */
  sharePct: number;
  /** What the shares redeem for right now (USDC, WETH). */
  usdc: bigint;
  weth: bigint;
  /** Both legs marked at the pool's reserve price, in USDC (display only). */
  valueUsdc: number;
  reserves: { usdc: bigint; weth: bigint };
  /** USDC per WETH implied by the reserves. */
  price: number;
};

export type LpOptions = { slippageBps?: number; deadlineSec?: number; now?: number };

export type AddLiquidityPlan = {
  from: Address;
  usdc: bigint;
  weth: bigint;
  usdcMin: bigint;
  wethMin: bigint;
  /** Shares the deposit should mint at today's reserves (the contract rounds against the depositor). */
  expectedShares: bigint;
  slippageBps: number;
  deadline: bigint;
  warnings: string[];
  transactions: TxRequest[];
};

export type RemoveLiquidityPlan = {
  from: Address;
  shares: bigint;
  usdc: bigint;
  weth: bigint;
  usdcMin: bigint;
  wethMin: bigint;
  slippageBps: number;
  deadline: bigint;
  warnings: string[];
  transactions: TxRequest[];
};

const ratio = (a: bigint, b: bigint): number => (b === 0n ? 0 : Number((a * WAD) / b) / 1e18);

async function readPool(client: PublicClient, dep: PoincareDeployment) {
  const [[r0, r1], supply] = await Promise.all([
    client.readContract({ address: dep.hook, abi: liquidityAbi, functionName: "reserves" }),
    client.readContract({ address: dep.hook, abi: liquidityAbi, functionName: "totalSupply" }),
  ]);
  return { r0, r1, supply };
}

function checkAddress(v: string, name: string): Address {
  if (!isAddress(v, { strict: false }) || getAddress(v) === zeroAddress) throw new LpParamError(`${name} must be a non-zero address`);
  return getAddress(v);
}

function checkOptions(opts: LpOptions): { slippageBps: number; deadline: bigint } {
  const slippageBps = opts.slippageBps ?? DEFAULT_SWAP_SLIPPAGE_BPS;
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_SWAP_SLIPPAGE_BPS) {
    throw new LpParamError(`slippageBps must be an integer in 0..${MAX_SWAP_SLIPPAGE_BPS}`);
  }
  const deadlineSec = opts.deadlineSec ?? DEFAULT_SWAP_DEADLINE_SEC;
  if (!Number.isInteger(deadlineSec) || deadlineSec < 60 || deadlineSec > MAX_SWAP_DEADLINE_SEC) {
    throw new LpParamError(`deadlineSec must be an integer in 60..${MAX_SWAP_DEADLINE_SEC}`);
  }
  return { slippageBps, deadline: BigInt(opts.now ?? Math.floor(Date.now() / 1000)) + BigInt(deadlineSec) };
}

/** An address's LP position, read from the hook's share token and reserves. */
export async function readPosition(client: PublicClient, dep: PoincareDeployment, owner: Address): Promise<Position> {
  const who = checkAddress(owner, "owner");
  const [{ r0, r1, supply }, shares] = await Promise.all([
    readPool(client, dep),
    client.readContract({ address: dep.hook, abi: liquidityAbi, functionName: "balanceOf", args: [who] }),
  ]);
  const usdc = supply === 0n ? 0n : (shares * r0) / supply;
  const weth = supply === 0n ? 0n : (shares * r1) / supply;
  const price = ratio(r0, r1);
  return {
    owner: who,
    shares,
    totalShares: supply,
    sharePct: ratio(shares, supply),
    usdc,
    weth,
    valueUsdc: Number(usdc) / 1e18 + (Number(weth) / 1e18) * price,
    reserves: { usdc: r0, weth: r1 },
    price,
  };
}

/**
 * Plan a deposit at the pool's current ratio. Give the USDC side or the WETH side; the other is
 * sized from the reserves, exactly as the hook sizes it. Returns exact-amount approvals (only where
 * short, never unlimited) and the addLiquidity call with real minimums, not zero.
 */
export async function planAddLiquidity(
  client: PublicClient,
  dep: PoincareDeployment,
  from: Address,
  amount: { usdc?: bigint; weth?: bigint },
  opts: LpOptions = {},
): Promise<AddLiquidityPlan> {
  const sender = checkAddress(from, "from");
  const hasUsdc = amount.usdc !== undefined;
  const hasWeth = amount.weth !== undefined;
  if (hasUsdc === hasWeth) throw new LpParamError("give exactly one side: usdc or weth; the other is sized from the pool's ratio");
  const given = (hasUsdc ? amount.usdc : amount.weth)!;
  if (given <= 0n) throw new LpParamError("amount must be greater than zero");
  const { slippageBps, deadline } = checkOptions(opts);

  const [{ r0, r1, supply }, al0, al1] = await Promise.all([
    readPool(client, dep),
    client.readContract({ address: dep.usdc, abi: erc20Abi, functionName: "allowance", args: [sender, dep.hook] }),
    client.readContract({ address: dep.weth, abi: erc20Abi, functionName: "allowance", args: [sender, dep.hook] }),
  ]);
  if (supply === 0n || r0 === 0n || r1 === 0n) throw new LpParamError("the pool has not been seeded; the first deposit sets the curve and is not done through this tool");

  // Same rounding as the hook: the counterpart floors, so the desired pair is taken in full.
  const usdc = hasUsdc ? given : (given * r0) / r1;
  const weth = hasWeth ? given : (given * r1) / r0;
  if (usdc === 0n || weth === 0n) throw new LpParamError("too small: one side rounds to zero at the pool's ratio");
  const expectedShares = [(usdc * supply) / r0, (weth * supply) / r1].reduce((a, b) => (a < b ? a : b));
  if (expectedShares === 0n) throw new LpParamError("too small: the deposit would mint no shares");

  const warnings: string[] = [];
  for (const [sym, al] of [["USDC", al0], ["WETH", al1]] as const) {
    if (al === maxUint256) warnings.push(`This wallet has an UNLIMITED ${sym} approval to the hook. It is not needed: consider revoking it.`);
  }

  const transactions: TxRequest[] = [];
  for (const [token, sym, need, have] of [[dep.usdc, "USDC", usdc, al0], [dep.weth, "WETH", weth, al1]] as const) {
    if (have < need) {
      transactions.push({
        to: token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [dep.hook, need] }),
        value: 0n,
        gas: LP_GAS.approve,
        description: `Approve exactly this deposit's ${sym} for the Poincaré hook`,
      });
    }
  }
  const usdcMin = minOutFor(usdc, slippageBps);
  const wethMin = minOutFor(weth, slippageBps);
  transactions.push({
    to: dep.hook,
    data: encodeFunctionData({
      abi: liquidityAbi,
      functionName: "addLiquidity",
      args: [{ amount0Desired: usdc, amount1Desired: weth, amount0Min: usdcMin, amount1Min: wethMin, deadline, tickLower: 0, tickUpper: 0, userInputSalt: zeroHash }],
    }),
    value: 0n,
    gas: LP_GAS.add,
    description: "Add liquidity to the Poincaré pool",
  });

  return { from: sender, usdc, weth, usdcMin, wethMin, expectedShares, slippageBps, deadline, warnings, transactions };
}

/**
 * Plan a withdrawal: a percentage of the position (1..100) or an exact share count. Minimums come
 * from the current reserves less the slippage allowance, so the burn cannot be sandwiched for free.
 */
export async function planRemoveLiquidity(
  client: PublicClient,
  dep: PoincareDeployment,
  from: Address,
  amount: { percent?: number; shares?: bigint },
  opts: LpOptions = {},
): Promise<RemoveLiquidityPlan> {
  const sender = checkAddress(from, "from");
  const hasPct = amount.percent !== undefined;
  const hasShares = amount.shares !== undefined;
  if (hasPct === hasShares) throw new LpParamError("give exactly one of percent or shares");
  if (hasPct && (!Number.isFinite(amount.percent) || amount.percent! <= 0 || amount.percent! > 100)) {
    throw new LpParamError("percent must be greater than 0 and at most 100");
  }
  const { slippageBps, deadline } = checkOptions(opts);

  const [{ r0, r1, supply }, balance] = await Promise.all([
    readPool(client, dep),
    client.readContract({ address: dep.hook, abi: liquidityAbi, functionName: "balanceOf", args: [sender] }),
  ]);
  if (balance === 0n) throw new LpParamError("this address holds no LP shares");
  // 100% burns the exact balance (no float round-trip), so a full exit leaves no dust behind.
  const shares = hasShares
    ? amount.shares!
    : amount.percent === 100
      ? balance
      : (balance * BigInt(Math.round(amount.percent! * 100))) / 10_000n;
  if (shares <= 0n) throw new LpParamError("too small: that is zero shares");
  if (shares > balance) throw new LpParamError(`only ${balance} shares are held`);

  const usdc = (shares * r0) / supply;
  const weth = (shares * r1) / supply;
  if (usdc === 0n && weth === 0n) throw new LpParamError("too small: the burn would return nothing");
  const usdcMin = minOutFor(usdc, slippageBps);
  const wethMin = minOutFor(weth, slippageBps);

  return {
    from: sender,
    shares,
    usdc,
    weth,
    usdcMin,
    wethMin,
    slippageBps,
    deadline,
    warnings: [],
    transactions: [{
      to: dep.hook,
      data: encodeFunctionData({
        abi: liquidityAbi,
        functionName: "removeLiquidity",
        args: [{ liquidity: shares, amount0Min: usdcMin, amount1Min: wethMin, deadline, tickLower: 0, tickUpper: 0, userInputSalt: zeroHash }],
      }),
      value: 0n,
      gas: LP_GAS.remove,
      description: "Remove liquidity from the Poincaré pool",
    }],
  };
}
