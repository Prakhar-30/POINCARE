import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits } from "viem";
import { CONTRACTS, ERC20_ABI, EXPLORER, POOL_KEY, ROUTER_ABI } from "@/config/contracts";
import { recordSwap } from "@/lib/db";
import { resolveGas, GAS } from "@/lib/gas";
import { humanizeError } from "@/lib/errors";
import { useStepper } from "@/hooks/useStepper";
import { useToast } from "@/components/ui/Toast";
import { fmtNum } from "@/lib/format";
import type { Quote } from "@/lib/curve";

export type SwapStatus = "idle" | "busy" | "success" | "error";

const erc20 = (address: `0x${string}`) => ({ address, abi: ERC20_ABI } as const);

export function useSwap() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const stepper = useStepper();
  const toast = useToast();
  const [status, setStatus] = useState<SwapStatus>("idle");

  async function swap(params: { amountIn: string; zeroForOne: boolean; minOut: number; quote: Quote }) {
    if (!address || !walletClient || !publicClient) return;
    const { amountIn, zeroForOne, minOut, quote } = params;
    const sellSym = zeroForOne ? "USDC" : "WETH";
    const buySym = zeroForOne ? "WETH" : "USDC";
    const tokenIn = (zeroForOne ? CONTRACTS.usdc : CONTRACTS.weth) as `0x${string}`;
    const tokenOut = (zeroForOne ? CONTRACTS.weth : CONTRACTS.usdc) as `0x${string}`;
    const router = CONTRACTS.router as `0x${string}`;
    const amountInWei = parseUnits(amountIn, 18);
    const minOutWei = parseUnits(minOut.toFixed(18), 18);

    let current = "swap";
    try {
      // does the router already have enough allowance?
      const allowance = (await publicClient.readContract({ ...erc20(tokenIn), functionName: "allowance", args: [address, router] })) as bigint;
      const needApprove = allowance < amountInWei;

      stepper.begin([
        ...(needApprove ? [{ key: "approve", label: `Approve ${sellSym}` }] : []),
        { key: "swap", label: `Swap ${sellSym} for ${buySym}` },
      ]);
      setStatus("busy");

      // 1. approve the EXACT amount the router needs (no infinite approvals)
      if (needApprove) {
        current = "approve";
        stepper.activate("approve");
        const gas = await resolveGas(publicClient, { ...erc20(tokenIn), functionName: "approve", args: [router, amountInWei], account: address }, GAS.approve);
        const aHash = await walletClient.writeContract({ ...erc20(tokenIn), functionName: "approve", args: [router, amountInWei], gas });
        await publicClient.waitForTransactionReceipt({ hash: aHash });
        stepper.complete("approve");
      }

      const balBefore = (await publicClient.readContract({ ...erc20(tokenOut), functionName: "balanceOf", args: [address] })) as bigint;

      // 2. swap through the v4 router (the hook prices it with the live directional spread)
      current = "swap";
      stepper.activate("swap");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const swapArgs = [amountInWei, minOutWei, zeroForOne, POOL_KEY, "0x", address, deadline] as const;
      const gas = await resolveGas(
        publicClient,
        { address: router, abi: ROUTER_ABI, functionName: "swapExactTokensForTokens", args: swapArgs, account: address },
        GAS.swap,
      );
      const hash = await walletClient.writeContract({ address: router, abi: ROUTER_ABI, functionName: "swapExactTokensForTokens", args: swapArgs, gas });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      stepper.complete("swap");
      stepper.finish(`${EXPLORER}/tx/${hash}`);

      const balAfter = (await publicClient.readContract({ ...erc20(tokenOut), functionName: "balanceOf", args: [address] })) as bigint;
      const actualOut = Number(balAfter - balBefore) / 1e18;
      const amtIn = Number(amountInWei) / 1e18;
      // executed USDC/WETH price from the legs (always finite & positive); fall back to the quote
      const execPrice =
        actualOut > 0
          ? zeroForOne
            ? amtIn / actualOut // pay USDC, receive WETH
            : actualOut / amtIn // pay WETH, receive USDC
          : quote.execPrice;

      // 3. record to the shared order tape + LVR accounting
      await recordSwap({
        tx_hash: hash,
        block_number: Number(receipt.blockNumber),
        trader: address,
        zero_for_one: zeroForOne,
        side: zeroForOne ? "buy_weth" : "sell_weth",
        amount_in: amtIn,
        amount_out: actualOut > 0 ? actualOut : quote.out,
        price: execPrice,
        notional_usdc: quote.notionalUsdc,
        kappa: quote.spread,
        // UI convention: buying WETH (zeroForOne) pushes the USDC/WETH chart up -> "up"
        trend: quote.withTrend ? (zeroForOne ? "up" : "down") : "none",
        spread_frac: quote.spread,
        with_trend: quote.withTrend,
        lvr_captured_usdc: quote.lvrToLps,
      });

      setStatus("success");
      const outShown = actualOut > 0 ? actualOut : quote.out;
      toast.success("Swap confirmed", `${fmtNum(amtIn, 2)} ${sellSym} for ${fmtNum(outShown, buySym === "WETH" ? 5 : 2)} ${buySym}`, `${EXPLORER}/tx/${hash}`);
      return hash;
    } catch (e) {
      const msg = humanizeError(e);
      stepper.fail(current, msg);
      toast.error("Swap failed", msg);
      setStatus("error");
    }
  }

  return { swap, status, stepper, reset: () => setStatus("idle") };
}

/** Free-mint the demo tokens so a fresh wallet can trade. */
export function useFaucet() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const toast = useToast();
  const [minting, setMinting] = useState(false);

  async function mint(usdcAmt = "50000", wethAmt = "20") {
    if (!address || !walletClient || !publicClient) {
      toast.error("Connect a wallet", "Connect your wallet to mint test tokens.");
      return;
    }
    setMinting(true);
    try {
      const usdc = erc20(CONTRACTS.usdc as `0x${string}`);
      const weth = erc20(CONTRACTS.weth as `0x${string}`);
      const usdcWei = parseUnits(usdcAmt, 18);
      const wethWei = parseUnits(wethAmt, 18);
      const g1 = await resolveGas(publicClient, { ...usdc, functionName: "mint", args: [address, usdcWei], account: address }, GAS.mint);
      const h1 = await walletClient.writeContract({ ...usdc, functionName: "mint", args: [address, usdcWei], gas: g1 });
      const g2 = await resolveGas(publicClient, { ...weth, functionName: "mint", args: [address, wethWei], account: address }, GAS.mint);
      const h2 = await walletClient.writeContract({ ...weth, functionName: "mint", args: [address, wethWei], gas: g2 });
      await Promise.all([publicClient.waitForTransactionReceipt({ hash: h1 }), publicClient.waitForTransactionReceipt({ hash: h2 })]);
      toast.success("Test tokens minted", `${fmtNum(Number(usdcAmt))} USDC and ${fmtNum(Number(wethAmt))} WETH added to your wallet`);
    } catch (e) {
      toast.error("Mint failed", humanizeError(e));
    } finally {
      setMinting(false);
    }
  }
  return { mint, minting };
}
