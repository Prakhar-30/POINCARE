import { decodeFunctionData, getAddress, maxUint256, type Address, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { erc20Abi } from "../src/abi/erc20.js";
import { routerAbi } from "../src/abi/router.js";
import { UNICHAIN_SEPOLIA } from "../src/deployments.js";
import { MAX_SWAP_SLIPPAGE_BPS, SWAP_GAS, SwapParamError, minOutFor, planSwap } from "../src/swap.js";

const dep = UNICHAIN_SEPOLIA;
const FROM = getAddress("0x00000000000000000000000000000000000000aa");
const OTHER = getAddress("0x00000000000000000000000000000000000000bb");
const KEY = { currency0: dep.usdc, currency1: dep.weth, fee: 8388608, tickSpacing: 60, hooks: dep.hook };
const NOW = 1_800_000_000;
const E18 = 10n ** 18n;

function fakeClient(o: { allowance?: bigint; out?: bigint; spreadWad?: bigint } = {}): PublicClient {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case "quoteExactInput": return o.out ?? 4_000n * E18;
        case "previewSpread": return [o.spreadWad ?? 0n, 3n * 10n ** 15n];
        case "poolKey": return KEY;
        case "allowance": return o.allowance ?? 0n;
        default: throw new Error(`unexpected read ${functionName}`);
      }
    },
  } as unknown as PublicClient;
}

describe("planSwap", () => {
  it("approves exactly the amount when the allowance is short, then swaps with a slippage floor", async () => {
    const p = await planSwap(fakeClient({ allowance: 0n }), dep, FROM, "sell", 2n * E18, { now: NOW });
    expect(p.transactions).toHaveLength(2);
    const [approve, swap] = p.transactions;
    expect(approve.to).toBe(dep.weth);
    expect(approve.gas).toBe(SWAP_GAS.approve);
    expect(decodeFunctionData({ abi: erc20Abi, data: approve.data }).args).toEqual([dep.router, 2n * E18]);

    expect(swap.to).toBe(dep.router);
    expect(swap.value).toBe(0n);
    const d = decodeFunctionData({ abi: routerAbi, data: swap.data });
    expect(d.functionName).toBe("swapExactTokensForTokens");
    const [amountIn, minOut, zeroForOne, key, hookData, receiver, deadline] = d.args;
    expect(amountIn).toBe(2n * E18);
    expect(minOut).toBe((4_000n * E18 * 9_950n) / 10_000n); // default 50 bps
    expect(zeroForOne).toBe(false); // sell = WETH in
    expect(key).toMatchObject({ hooks: dep.hook, fee: KEY.fee, tickSpacing: KEY.tickSpacing });
    expect(hookData).toBe("0x");
    expect(receiver).toBe(FROM);
    expect(deadline).toBe(BigInt(NOW + 1200));
    expect(p.warnings).toEqual([]);
  });

  it("buys spend USDC and set zeroForOne", async () => {
    const p = await planSwap(fakeClient(), dep, FROM, "buy", 100n * E18, { now: NOW });
    expect(p.tokenIn).toBe(dep.usdc);
    expect(p.transactions[0].to).toBe(dep.usdc);
    expect(decodeFunctionData({ abi: routerAbi, data: p.transactions[1].data }).args[2]).toBe(true);
  });

  it("skips the approve when the allowance already covers it", async () => {
    const p = await planSwap(fakeClient({ allowance: 5n * E18 }), dep, FROM, "sell", 2n * E18, { now: NOW });
    expect(p.transactions).toHaveLength(1);
    expect(p.transactions[0].to).toBe(dep.router);
  });

  it("never builds an unlimited approval, and flags one that already exists", async () => {
    const short = await planSwap(fakeClient({ allowance: 1n }), dep, FROM, "sell", 2n * E18, { now: NOW });
    expect(decodeFunctionData({ abi: erc20Abi, data: short.transactions[0].data }).args[1]).toBe(2n * E18);
    const unlimited = await planSwap(fakeClient({ allowance: maxUint256 }), dep, FROM, "sell", 2n * E18, { now: NOW });
    expect(unlimited.transactions).toHaveLength(1);
    expect(unlimited.warnings.join(" ")).toMatch(/UNLIMITED approval/);
  });

  it("flags a recipient other than the sender", async () => {
    const p = await planSwap(fakeClient(), dep, FROM, "sell", E18, { now: NOW, recipient: OTHER });
    expect(decodeFunctionData({ abi: routerAbi, data: p.transactions[1].data }).args[5]).toBe(OTHER);
    expect(p.warnings.join(" ")).toMatch(/not to the sender/);
  });

  it("warns when this side pays the trend spread", async () => {
    const p = await planSwap(fakeClient({ spreadWad: 41n * 10n ** 15n }), dep, FROM, "sell", E18, { now: NOW });
    expect(p.warnings.join(" ")).toMatch(/4\.10%/);
  });

  it("rejects unsafe or malformed inputs", async () => {
    const c = fakeClient();
    await expect(planSwap(c, dep, FROM, "sell", 0n)).rejects.toThrow(SwapParamError);
    await expect(planSwap(c, dep, FROM, "sell", E18, { slippageBps: MAX_SWAP_SLIPPAGE_BPS + 1 })).rejects.toThrow(/slippageBps/);
    await expect(planSwap(c, dep, FROM, "sell", E18, { slippageBps: -1 })).rejects.toThrow(/slippageBps/);
    await expect(planSwap(c, dep, FROM, "sell", E18, { slippageBps: 1.5 })).rejects.toThrow(/slippageBps/);
    await expect(planSwap(c, dep, FROM, "sell", E18, { deadlineSec: 10 })).rejects.toThrow(/deadlineSec/);
    await expect(planSwap(c, dep, FROM, "sell", E18, { deadlineSec: 86_400 })).rejects.toThrow(/deadlineSec/);
    await expect(planSwap(c, dep, "0x0000000000000000000000000000000000000000", "sell", E18)).rejects.toThrow(/from/);
    await expect(planSwap(c, dep, FROM, "sell", E18, { recipient: "0x0000000000000000000000000000000000000000" })).rejects.toThrow(/recipient/);
    await expect(planSwap(c, dep, FROM, "hold" as never, E18)).rejects.toThrow(/side/);
    await expect(planSwap(fakeClient({ out: 0n }), dep, FROM, "sell", E18)).rejects.toThrow(/zero output/);
  });

  it("floors minOut", () => {
    expect(minOutFor(1_000n, 50)).toBe(995n);
    expect(minOutFor(1_001n, 50)).toBe(995n);
    expect(minOutFor(1_000n, 0)).toBe(1_000n);
  });
});
