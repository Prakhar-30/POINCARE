import type { PublicClient } from "viem";
import { hookAbi } from "./abi/hook.js";
import { lensAbi } from "./abi/lens.js";
import type { PoincareDeployment } from "./deployments.js";
import { type Side, sideToZeroForOne } from "./regime.js";
import { fromWad } from "./units.js";

export type Quote = {
  side: Side;
  amountIn: bigint;
  amountOut: bigint;
  /** Executed price, USDC per WETH. */
  price: number;
  /** Spread this side pays in this block, fraction. */
  spread: number;
  /** Base fee this block, fraction. */
  fee: number;
};

/**
 * Exact-input quote through the Lens, which projects this block's detector sample, so it matches
 * what the router executes in the same block to the wei.
 */
export async function quoteExactInput(client: PublicClient, dep: PoincareDeployment, side: Side, amountIn: bigint): Promise<Quote> {
  const zeroForOne = sideToZeroForOne(side);
  const [amountOut, [spreadWad, feeWad]] = await Promise.all([
    client.readContract({ address: dep.lens, abi: lensAbi, functionName: "quoteExactInput", args: [zeroForOne, amountIn] }),
    client.readContract({ address: dep.hook, abi: hookAbi, functionName: "previewSpread", args: [zeroForOne] }),
  ]);
  // buy: USDC in, WETH out; sell: WETH in, USDC out
  const usdc = side === "buy" ? amountIn : amountOut;
  const weth = side === "buy" ? amountOut : amountIn;
  return {
    side,
    amountIn,
    amountOut,
    price: weth > 0n ? Number(usdc) / Number(weth) : 0,
    spread: fromWad(spreadWad),
    fee: fromWad(feeWad),
  };
}
