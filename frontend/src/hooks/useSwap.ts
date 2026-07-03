import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { CONTRACTS, ERC20_ABI, EXPLORER, FAUCET_ABI, POOL_KEY, ROUTER_ABI, hasFaucet } from "@/config/contracts";
import { recordSwap } from "@/lib/db";
import { resolveGas, GAS, nextNonce } from "@/lib/gas";
import { humanizeError } from "@/lib/errors";
import { fromWei, legsOf, toWei } from "@/lib/units";
import { useStepper } from "@/hooks/useStepper";
import { useToast } from "@/components/ui/Toast";
import { fmtNum } from "@/lib/format";
import type { TradeQuote } from "@/hooks/useQuote";

export type SwapStatus = "idle" | "busy" | "success" | "error";

const erc20 = (address: `0x${string}`) => ({ address, abi: ERC20_ABI } as const);

export function useSwap() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const stepper = useStepper();
  const toast = useToast();
  const [status, setStatus] = useState<SwapStatus>("idle");

  async function swap(params: { amountIn: string; zeroForOne: boolean; minOutWei: bigint; quote: TradeQuote }) {
    if (!address || !walletClient || !publicClient) return;
    const { amountIn, zeroForOne, minOutWei, quote } = params;
    const { inSym, outSym } = legsOf(zeroForOne);
    const tokenIn = (zeroForOne ? CONTRACTS.usdc : CONTRACTS.weth) as `0x${string}`;
    const tokenOut = (zeroForOne ? CONTRACTS.weth : CONTRACTS.usdc) as `0x${string}`;
    const router = CONTRACTS.router as `0x${string}`;
    const amountInWei = toWei(amountIn, inSym);
    const outDp = outSym === "WETH" ? 5 : 2;

    let current = "swap";
    try {
      // does the router already have enough allowance?
      const allowance = (await publicClient.readContract({ ...erc20(tokenIn), functionName: "allowance", args: [address, router] })) as bigint;
      const needApprove = allowance < amountInWei;

      // The step labels double as the trade preview (pay / receive amounts): the wallet's
      // own simulation is unreliable on this chain, so the app states the numbers itself.
      stepper.begin([
        ...(needApprove ? [{ key: "approve", label: `Approve ${fmtNum(Number(amountIn), 2)} ${inSym}` }] : []),
        { key: "swap", label: `Pay ${fmtNum(Number(amountIn), 2)} ${inSym} · receive ≥ ${fmtNum(fromWei(minOutWei, outSym), outDp)} ${outSym}` },
      ]);
      setStatus("busy");

      // 1. approve the EXACT amount the router needs (no infinite approvals)
      if (needApprove) {
        current = "approve";
        stepper.activate("approve");
        const gas = await resolveGas(publicClient, { ...erc20(tokenIn), functionName: "approve", args: [router, amountInWei], account: address }, GAS.approve);
        const aHash = await walletClient.writeContract({ ...erc20(tokenIn), functionName: "approve", args: [router, amountInWei], gas, nonce: await nextNonce(publicClient, address) });
        await publicClient.waitForTransactionReceipt({ hash: aHash });
        stepper.complete("approve");
      }

      const balBefore = (await publicClient.readContract({ ...erc20(tokenOut), functionName: "balanceOf", args: [address] })) as bigint;

      // 2. swap through the v4 router (the hook prices it with the live directional spread).
      //    minOut is wei-exact from the Lens quote, so slippage protection is real.
      current = "swap";
      stepper.activate("swap");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const swapArgs = [amountInWei, minOutWei, zeroForOne, POOL_KEY, "0x", address, deadline] as const;
      const gas = await resolveGas(
        publicClient,
        { address: router, abi: ROUTER_ABI, functionName: "swapExactTokensForTokens", args: swapArgs, account: address },
        GAS.swap,
      );
      const hash = await walletClient.writeContract({ address: router, abi: ROUTER_ABI, functionName: "swapExactTokensForTokens", args: swapArgs, gas, nonce: await nextNonce(publicClient, address) });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      stepper.complete("swap");
      stepper.finish(`${EXPLORER}/tx/${hash}`);

      const balAfter = (await publicClient.readContract({ ...erc20(tokenOut), functionName: "balanceOf", args: [address] })) as bigint;
      const actualOut = fromWei(balAfter - balBefore, outSym);
      const amtIn = fromWei(amountInWei, inSym);
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
      toast.success("Swap confirmed", `${fmtNum(amtIn, 2)} ${inSym} for ${fmtNum(outShown, outDp)} ${outSym}`, `${EXPLORER}/tx/${hash}`);
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

/** Fund a fresh wallet with the demo tokens. One `drip` transaction when the faucet
 *  contract is deployed; otherwise falls back to two sequential mints (older deployment). */
export function useFaucet() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const toast = useToast();
  const [minting, setMinting] = useState(false);

  const USDC_AMT = "50000";
  const WETH_AMT = "20";

  async function mint() {
    if (!address || !walletClient || !publicClient) {
      toast.error("Connect a wallet", "Connect your wallet to get test tokens.");
      return;
    }
    setMinting(true);
    try {
      if (hasFaucet) {
        // One transaction, one wallet confirmation: the faucet mints both tokens.
        const faucet = CONTRACTS.faucet as `0x${string}`;
        const gas = await resolveGas(publicClient, { address: faucet, abi: FAUCET_ABI, functionName: "drip", args: [address], account: address }, GAS.mint * 2n);
        const hash = await walletClient.writeContract({ address: faucet, abi: FAUCET_ABI, functionName: "drip", args: [address], gas, nonce: await nextNonce(publicClient, address) });
        await publicClient.waitForTransactionReceipt({ hash });
      } else {
        // Older deployment: two mints, strictly sequential, each with the PENDING nonce
        // pinned from the node — MetaMask's own nonce cache goes stale on this chain and
        // rejects the second tx even after an activity-tab reset (see nextNonce).
        const usdc = erc20(CONTRACTS.usdc as `0x${string}`);
        const weth = erc20(CONTRACTS.weth as `0x${string}`);
        const usdcWei = toWei(USDC_AMT, "USDC");
        const wethWei = toWei(WETH_AMT, "WETH");

        const g1 = await resolveGas(publicClient, { ...usdc, functionName: "mint", args: [address, usdcWei], account: address }, GAS.mint);
        const h1 = await walletClient.writeContract({ ...usdc, functionName: "mint", args: [address, usdcWei], gas: g1, nonce: await nextNonce(publicClient, address) });
        await publicClient.waitForTransactionReceipt({ hash: h1 });

        const g2 = await resolveGas(publicClient, { ...weth, functionName: "mint", args: [address, wethWei], account: address }, GAS.mint);
        const h2 = await walletClient.writeContract({ ...weth, functionName: "mint", args: [address, wethWei], gas: g2, nonce: await nextNonce(publicClient, address) });
        await publicClient.waitForTransactionReceipt({ hash: h2 });
      }
      toast.success("Test tokens received", `${fmtNum(Number(USDC_AMT))} USDC and ${fmtNum(Number(WETH_AMT))} WETH added to your wallet`);
    } catch (e) {
      toast.error("Faucet failed", humanizeError(e));
    } finally {
      setMinting(false);
    }
  }
  return { mint, minting };
}
