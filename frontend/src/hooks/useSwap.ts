import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { maxUint256, parseUnits } from "viem";
import { CONTRACTS, ERC20_ABI, POOL_KEY, ROUTER_ABI } from "@/config/contracts";
import { recordSwap } from "@/lib/db";
import type { Quote } from "@/lib/curve";

export type SwapStatus = "idle" | "approving" | "swapping" | "success" | "error";

const erc20 = (address: `0x${string}`) => ({ address, abi: ERC20_ABI } as const);

export function useSwap() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [status, setStatus] = useState<SwapStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function swap(params: { amountIn: string; zeroForOne: boolean; minOut: number; quote: Quote }) {
    if (!address || !walletClient || !publicClient) return;
    setError(null);
    setTxHash(null);
    try {
      const { amountIn, zeroForOne, minOut, quote } = params;
      const tokenIn = (zeroForOne ? CONTRACTS.usdc : CONTRACTS.weth) as `0x${string}`;
      const tokenOut = (zeroForOne ? CONTRACTS.weth : CONTRACTS.usdc) as `0x${string}`;
      const router = CONTRACTS.router as `0x${string}`;
      const amountInWei = parseUnits(amountIn, 18);
      const minOutWei = parseUnits(minOut.toFixed(18), 18);

      // 1. approve the router to pull the input token, if needed
      const allowance = (await publicClient.readContract({ ...erc20(tokenIn), functionName: "allowance", args: [address, router] })) as bigint;
      if (allowance < amountInWei) {
        setStatus("approving");
        const aHash = await walletClient.writeContract({ ...erc20(tokenIn), functionName: "approve", args: [router, maxUint256] });
        await publicClient.waitForTransactionReceipt({ hash: aHash });
      }

      // measure actual output via balance delta (exact, vs the estimated quote)
      const balBefore = (await publicClient.readContract({ ...erc20(tokenOut), functionName: "balanceOf", args: [address] })) as bigint;

      // 2. swap through the v4 router (the hook prices it with the live directional spread)
      setStatus("swapping");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const hash = await walletClient.writeContract({
        address: router,
        abi: ROUTER_ABI,
        functionName: "swapExactTokensForTokens",
        args: [amountInWei, minOutWei, zeroForOne, POOL_KEY, "0x", address, deadline],
      });
      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const balAfter = (await publicClient.readContract({ ...erc20(tokenOut), functionName: "balanceOf", args: [address] })) as bigint;
      const actualOut = Number(balAfter - balBefore) / 1e18;
      const amtIn = Number(amountInWei) / 1e18;

      // 3. record to the shared order tape + LVR accounting
      await recordSwap({
        tx_hash: hash,
        block_number: Number(receipt.blockNumber),
        trader: address,
        zero_for_one: zeroForOne,
        side: zeroForOne ? "buy_weth" : "sell_weth",
        amount_in: amtIn,
        amount_out: actualOut > 0 ? actualOut : quote.out,
        price: quote.execPrice,
        notional_usdc: quote.notionalUsdc,
        kappa: quote.spread, // spread applied on this direction
        trend: quote.withTrend ? (zeroForOne ? "down" : "up") : "none",
        spread_frac: quote.spread,
        with_trend: quote.withTrend,
        lvr_captured_usdc: quote.lvrToLps,
      });

      setStatus("success");
      return hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "swap failed";
      setError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
      setStatus("error");
    }
  }

  return { swap, status, error, txHash, reset: () => { setStatus("idle"); setError(null); setTxHash(null); } };
}

/** Free-mint the demo tokens so a fresh wallet can trade. */
export function useFaucet() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [minting, setMinting] = useState(false);

  async function mint() {
    if (!address || !walletClient || !publicClient) return;
    setMinting(true);
    try {
      const h1 = await walletClient.writeContract({ ...erc20(CONTRACTS.usdc as `0x${string}`), functionName: "mint", args: [address, parseUnits("50000", 18)] });
      const h2 = await walletClient.writeContract({ ...erc20(CONTRACTS.weth as `0x${string}`), functionName: "mint", args: [address, parseUnits("20", 18)] });
      await Promise.all([publicClient.waitForTransactionReceipt({ hash: h1 }), publicClient.waitForTransactionReceipt({ hash: h2 })]);
    } finally {
      setMinting(false);
    }
  }
  return { mint, minting };
}
