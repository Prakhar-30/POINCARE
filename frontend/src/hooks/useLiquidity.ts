import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits, zeroHash } from "viem";
import { CONTRACTS, ERC20_ABI, EXPLORER, HOOK_LP_ABI } from "@/config/contracts";
import { recordLpEvent } from "@/lib/db";
import { resolveGas, GAS } from "@/lib/gas";
import { humanizeError } from "@/lib/errors";
import { useStepper } from "@/hooks/useStepper";
import { useToast } from "@/components/ui/Toast";
import { fmtNum } from "@/lib/format";

export type LiquidityStatus = "idle" | "busy" | "success" | "error";

const erc20 = (address: `0x${string}`) => ({ address, abi: ERC20_ABI } as const);

/** Hook-owned add/remove liquidity. Tokens settle to the PoolManager, so that is
 *  the approval target; addLiquidity/removeLiquidity are called on the hook. */
export function useLiquidity(onDone?: () => void) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const stepper = useStepper();
  const toast = useToast();
  const [status, setStatus] = useState<LiquidityStatus>("idle");

  const manager = CONTRACTS.poolManager as `0x${string}`;
  const hook = CONTRACTS.hook as `0x${string}`;

  /** Approve the EXACT amount the manager needs for this token (no infinite approvals). */
  async function approveExact(stepKey: string, token: `0x${string}`, need: bigint) {
    if (!address || !walletClient || !publicClient) return;
    const allowance = (await publicClient.readContract({ ...erc20(token), functionName: "allowance", args: [address, manager] })) as bigint;
    if (allowance >= need) {
      stepper.complete(stepKey);
      return;
    }
    stepper.activate(stepKey);
    const gas = await resolveGas(publicClient, { ...erc20(token), functionName: "approve", args: [manager, need], account: address }, GAS.approve);
    const h = await walletClient.writeContract({ ...erc20(token), functionName: "approve", args: [manager, need], gas });
    await publicClient.waitForTransactionReceipt({ hash: h });
    stepper.complete(stepKey);
  }

  async function add(params: { usdc: string; weth: string; valueUsdc: number }) {
    if (!address || !walletClient || !publicClient) return;
    const a0 = parseUnits(params.usdc || "0", 18); // currency0 = USDC
    const a1 = parseUnits(params.weth || "0", 18); // currency1 = WETH

    let current = "add";
    try {
      const al0 = (await publicClient.readContract({ ...erc20(CONTRACTS.usdc as `0x${string}`), functionName: "allowance", args: [address, manager] })) as bigint;
      const al1 = (await publicClient.readContract({ ...erc20(CONTRACTS.weth as `0x${string}`), functionName: "allowance", args: [address, manager] })) as bigint;

      stepper.begin([
        ...(al0 < a0 ? [{ key: "approve0", label: "Approve USDC" }] : []),
        ...(al1 < a1 ? [{ key: "approve1", label: "Approve WETH" }] : []),
        { key: "add", label: "Add liquidity" },
      ]);
      setStatus("busy");

      current = "approve0";
      await approveExact("approve0", CONTRACTS.usdc as `0x${string}`, a0);
      current = "approve1";
      await approveExact("approve1", CONTRACTS.weth as `0x${string}`, a1);

      current = "add";
      stepper.activate("add");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const lpArgs = [{ amount0Desired: a0, amount1Desired: a1, amount0Min: 0n, amount1Min: 0n, deadline, tickLower: 0, tickUpper: 0, userInputSalt: zeroHash }] as const;
      const gas = await resolveGas(publicClient, { address: hook, abi: HOOK_LP_ABI, functionName: "addLiquidity", args: lpArgs, account: address }, GAS.addLiquidity);
      const hash = await walletClient.writeContract({ address: hook, abi: HOOK_LP_ABI, functionName: "addLiquidity", args: lpArgs, gas });
      await publicClient.waitForTransactionReceipt({ hash });
      stepper.complete("add");
      stepper.finish(`${EXPLORER}/tx/${hash}`);

      await recordLpEvent({ tx_hash: hash, wallet: address, kind: "add", shares: 0, amount0: Number(a0) / 1e18, amount1: Number(a1) / 1e18, value_usdc: params.valueUsdc });
      setStatus("success");
      toast.success("Liquidity added", `${fmtNum(Number(a0) / 1e18, 2)} USDC and ${fmtNum(Number(a1) / 1e18, 4)} WETH`, `${EXPLORER}/tx/${hash}`);
      onDone?.();
      return hash;
    } catch (e) {
      fail(current, e);
    }
  }

  async function remove(params: { shares: bigint; valueUsdc: number; amount0: number; amount1: number }) {
    if (!address || !walletClient || !publicClient) return;
    let current = "remove";
    try {
      stepper.begin([{ key: "remove", label: "Remove liquidity" }]);
      setStatus("busy");
      current = "remove";
      stepper.activate("remove");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const rmArgs = [{ liquidity: params.shares, amount0Min: 0n, amount1Min: 0n, deadline, tickLower: 0, tickUpper: 0, userInputSalt: zeroHash }] as const;
      const gas = await resolveGas(publicClient, { address: hook, abi: HOOK_LP_ABI, functionName: "removeLiquidity", args: rmArgs, account: address }, GAS.removeLiquidity);
      const hash = await walletClient.writeContract({ address: hook, abi: HOOK_LP_ABI, functionName: "removeLiquidity", args: rmArgs, gas });
      await publicClient.waitForTransactionReceipt({ hash });
      stepper.complete("remove");
      stepper.finish(`${EXPLORER}/tx/${hash}`);

      await recordLpEvent({ tx_hash: hash, wallet: address, kind: "remove", shares: Number(params.shares) / 1e18, amount0: params.amount0, amount1: params.amount1, value_usdc: params.valueUsdc });
      setStatus("success");
      toast.success("Liquidity removed", `${fmtNum(params.amount0, 2)} USDC and ${fmtNum(params.amount1, 4)} WETH returned`, `${EXPLORER}/tx/${hash}`);
      onDone?.();
      return hash;
    } catch (e) {
      fail(current, e);
    }
  }

  function fail(stepKey: string, e: unknown) {
    const msg = humanizeError(e);
    stepper.fail(stepKey, msg);
    toast.error("Transaction failed", msg);
    setStatus("error");
  }

  return { add, remove, status, stepper, reset: () => setStatus("idle") };
}
