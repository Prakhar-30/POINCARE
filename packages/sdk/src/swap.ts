import { encodeFunctionData, getAddress, isAddress, maxUint256, zeroAddress, type Address, type PublicClient } from "viem";
import { erc20Abi } from "./abi/erc20.js";
import { hookAbi } from "./abi/hook.js";
import { routerAbi } from "./abi/router.js";
import type { TxRequest } from "./dcaClient.js";
import type { PoincareDeployment } from "./deployments.js";
import { type Quote, quoteExactInput } from "./quote.js";
import { type Side, sideToZeroForOne } from "./regime.js";
import { BPS } from "./units.js";

/** Explicit gas limits: testnet eth_estimateGas mis-simulates calls that run through the hook. */
export const SWAP_GAS = { approve: 80_000n, swap: 3_000_000n } as const;

/** Slippage above this is refused: past 10% a "swap" is more likely a mistake than a trade. */
export const MAX_SWAP_SLIPPAGE_BPS = 1_000;
export const DEFAULT_SWAP_SLIPPAGE_BPS = 50;
/** How long the signed swap stays valid. Kept short so a stale transaction cannot be replayed later. */
export const DEFAULT_SWAP_DEADLINE_SEC = 1_200;
export const MAX_SWAP_DEADLINE_SEC = 3_600;

export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

export class SwapParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwapParamError";
  }
}

export type SwapOptions = {
  /** Max shortfall vs the quote, in bps. Default 50 (0.5%), at most 1000. */
  slippageBps?: number;
  /** Who receives the output. Defaults to the sender; anything else is flagged in `warnings`. */
  recipient?: Address;
  /** Seconds the swap stays valid. Default 1200, at most 3600. */
  deadlineSec?: number;
  /** Unix seconds "now" (tests). */
  now?: number;
};

export type SwapPlan = {
  side: Side;
  from: Address;
  recipient: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  quote: Quote;
  /** The floor the router enforces: the quote less the slippage allowance. */
  minOut: bigint;
  slippageBps: number;
  deadline: bigint;
  /** The sender's current allowance to the router for the input token. */
  allowance: bigint;
  /** Things the signer should read before sending. */
  warnings: string[];
  /** In order: an exact-amount approve (only if the allowance is short), then the swap. */
  transactions: TxRequest[];
};

/** The pool key, read from the hook itself so fee and tick spacing never drift from the deployment. */
export async function readPoolKey(client: PublicClient, dep: PoincareDeployment): Promise<PoolKey> {
  const k = await client.readContract({ address: dep.hook, abi: hookAbi, functionName: "poolKey" });
  return { currency0: k.currency0, currency1: k.currency1, fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks: k.hooks };
}

export function swapTokens(dep: PoincareDeployment, side: Side): { tokenIn: Address; tokenOut: Address } {
  return side === "buy" ? { tokenIn: dep.usdc, tokenOut: dep.weth } : { tokenIn: dep.weth, tokenOut: dep.usdc };
}

/** Floor = quote * (1 - slippage), rounded down. */
export function minOutFor(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * (BPS - BigInt(slippageBps))) / BPS;
}

/** Approve exactly `amount` of the input token to the router. Never an unlimited allowance. */
export function buildSwapApproveTx(dep: PoincareDeployment, side: Side, amount: bigint): TxRequest {
  const { tokenIn } = swapTokens(dep, side);
  return {
    to: tokenIn,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [dep.router, amount] }),
    value: 0n,
    gas: SWAP_GAS.approve,
    description: `Approve exactly this swap's ${side === "buy" ? "USDC" : "WETH"} for the router`,
  };
}

export function buildSwapTx(
  dep: PoincareDeployment,
  key: PoolKey,
  p: { side: Side; amountIn: bigint; minOut: bigint; recipient: Address; deadline: bigint },
): TxRequest {
  return {
    to: dep.router,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "swapExactTokensForTokens",
      args: [p.amountIn, p.minOut, sideToZeroForOne(p.side), key, "0x", p.recipient, p.deadline],
    }),
    value: 0n,
    gas: SWAP_GAS.swap,
    description: `Swap on the Poincaré pool (${p.side === "buy" ? "USDC → WETH" : "WETH → USDC"})`,
  };
}

/**
 * Plan an exact-input swap: quote it through the Lens, set a slippage floor, and return the
 * unsigned transactions (an exact approve only when the allowance is short, then the swap).
 * Nothing is sent and no key is needed.
 */
export async function planSwap(
  client: PublicClient,
  dep: PoincareDeployment,
  from: Address,
  side: Side,
  amountIn: bigint,
  opts: SwapOptions = {},
): Promise<SwapPlan> {
  if (side !== "buy" && side !== "sell") throw new SwapParamError("side must be buy or sell");
  if (!isAddress(from, { strict: false }) || getAddress(from) === zeroAddress) throw new SwapParamError("from must be a non-zero address");
  if (amountIn <= 0n) throw new SwapParamError("amount must be greater than zero");
  const slippageBps = opts.slippageBps ?? DEFAULT_SWAP_SLIPPAGE_BPS;
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_SWAP_SLIPPAGE_BPS) {
    throw new SwapParamError(`slippageBps must be an integer in 0..${MAX_SWAP_SLIPPAGE_BPS}`);
  }
  const deadlineSec = opts.deadlineSec ?? DEFAULT_SWAP_DEADLINE_SEC;
  if (!Number.isInteger(deadlineSec) || deadlineSec < 60 || deadlineSec > MAX_SWAP_DEADLINE_SEC) {
    throw new SwapParamError(`deadlineSec must be an integer in 60..${MAX_SWAP_DEADLINE_SEC}`);
  }
  const sender = getAddress(from);
  let recipient = sender;
  if (opts.recipient !== undefined) {
    if (!isAddress(opts.recipient, { strict: false }) || getAddress(opts.recipient) === zeroAddress) {
      throw new SwapParamError("recipient must be a non-zero address");
    }
    recipient = getAddress(opts.recipient);
  }

  const { tokenIn, tokenOut } = swapTokens(dep, side);
  const [quote, key, allowance] = await Promise.all([
    quoteExactInput(client, dep, side, amountIn),
    readPoolKey(client, dep),
    client.readContract({ address: tokenIn, abi: erc20Abi, functionName: "allowance", args: [sender, dep.router] }),
  ]);
  if (quote.amountOut === 0n) throw new SwapParamError("this amount quotes to zero output; try a larger amount");
  const minOut = minOutFor(quote.amountOut, slippageBps);
  if (minOut === 0n) throw new SwapParamError("the slippage floor rounds to zero; try a larger amount or lower slippage");

  const now = BigInt(opts.now ?? Math.floor(Date.now() / 1000));
  const deadline = now + BigInt(deadlineSec);

  const warnings: string[] = [];
  if (recipient !== sender) warnings.push(`The output goes to ${recipient}, not to the sender ${sender}. Only sign if you meant that.`);
  if (allowance === maxUint256) {
    warnings.push("This wallet has an UNLIMITED approval to the router for the input token. It is not needed: consider revoking it and approving exact amounts.");
  }
  if (quote.spread > 0) {
    warnings.push(`This side pays a trend spread of ${(quote.spread * 100).toFixed(2)}% right now. Waiting for the trend to end avoids it.`);
  }

  const transactions: TxRequest[] = [];
  if (allowance < amountIn) transactions.push(buildSwapApproveTx(dep, side, amountIn));
  transactions.push(buildSwapTx(dep, key, { side, amountIn, minOut, recipient, deadline }));

  return { side, from: sender, recipient, tokenIn, tokenOut, amountIn, quote, minOut, slippageBps, deadline, allowance, warnings, transactions };
}
