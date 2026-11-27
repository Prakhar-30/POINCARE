import { decodeFunctionData, getAddress, maxUint256, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { erc20Abi } from "../src/abi/erc20.js";
import { liquidityAbi } from "../src/abi/liquidity.js";
import { UNICHAIN_SEPOLIA } from "../src/deployments.js";
import { LpParamError, depositTaken, planAddLiquidity, planRemoveLiquidity, readPosition, withdrawalOut } from "../src/lp.js";

const dep = UNICHAIN_SEPOLIA;
const FROM = getAddress("0x00000000000000000000000000000000000000aa");
const E18 = 10n ** 18n;
const NOW = 1_800_000_000;
// Pool: 225,000 USDC and 100 WETH (price 2,250), 1,000 shares.
const R0 = 225_000n * E18, R1 = 100n * E18, SUPPLY = 1_000n * E18;

function fake(o: { balance?: bigint; al0?: bigint; al1?: bigint; supply?: bigint } = {}): PublicClient {
  return {
    readContract: async ({ functionName, address }: { functionName: string; address: string }) => {
      switch (functionName) {
        case "reserves": return [R0, R1];
        case "totalSupply": return o.supply ?? SUPPLY;
        case "balanceOf": return o.balance ?? 0n;
        case "allowance": return address === dep.usdc ? (o.al0 ?? 0n) : (o.al1 ?? 0n);
        default: throw new Error(`unexpected read ${functionName}`);
      }
    },
  } as unknown as PublicClient;
}

describe("readPosition", () => {
  it("redeems shares pro rata and values both legs at the reserve price", async () => {
    const p = await readPosition(fake({ balance: 100n * E18 }), dep, FROM);
    expect(p.sharePct).toBeCloseTo(0.1);
    expect(p.usdc).toBe(22_500n * E18);
    expect(p.weth).toBe(10n * E18);
    expect(p.price).toBeCloseTo(2250);
    expect(p.valueUsdc).toBeCloseTo(45_000);
  });
});

describe("planAddLiquidity", () => {
  it("sizes the other side from the ratio, approves exactly, and sets real minimums", async () => {
    const p = await planAddLiquidity(fake(), dep, FROM, { usdc: 2_250n * E18 }, { now: NOW });
    expect(p.weth).toBe(1n * E18);
    expect(p.expectedShares).toBe(10n * E18);
    expect(p.transactions).toHaveLength(3);
    expect(decodeFunctionData({ abi: erc20Abi, data: p.transactions[0].data }).args).toEqual([dep.hook, 2_250n * E18]);
    expect(decodeFunctionData({ abi: erc20Abi, data: p.transactions[1].data }).args).toEqual([dep.hook, 1n * E18]);
    const add = decodeFunctionData({ abi: liquidityAbi, data: p.transactions[2].data });
    expect(add.functionName).toBe("addLiquidity");
    expect(add.args[0]).toMatchObject({ amount0Desired: 2_250n * E18, amount1Desired: E18, amount0Min: (2_250n * E18 * 9_950n) / 10_000n, amount1Min: (E18 * 9_950n) / 10_000n, deadline: BigInt(NOW + 1200), tickLower: 0, tickUpper: 0 });
    expect(p.transactions[2].to).toBe(dep.hook);
  });

  it("works from the WETH side and skips approvals already covered, flagging unlimited ones", async () => {
    const p = await planAddLiquidity(fake({ al0: maxUint256, al1: 5n * E18 }), dep, FROM, { weth: 2n * E18 }, { now: NOW });
    expect(p.usdc).toBe(4_500n * E18);
    expect(p.transactions).toHaveLength(1);
    expect(p.warnings.join(" ")).toMatch(/UNLIMITED USDC/);
  });

  it("refuses ambiguous, empty, unsafe or seeding deposits", async () => {
    await expect(planAddLiquidity(fake(), dep, FROM, {})).rejects.toThrow(LpParamError);
    await expect(planAddLiquidity(fake(), dep, FROM, { usdc: E18, weth: E18 })).rejects.toThrow(/exactly one/);
    await expect(planAddLiquidity(fake(), dep, FROM, { usdc: 0n })).rejects.toThrow(/greater than zero/);
    await expect(planAddLiquidity(fake(), dep, FROM, { usdc: E18 }, { slippageBps: 2_000 })).rejects.toThrow(/slippageBps/);
    await expect(planAddLiquidity(fake({ supply: 0n }), dep, FROM, { usdc: E18 })).rejects.toThrow(/not been seeded/);
    await expect(planAddLiquidity(fake(), dep, FROM, { usdc: 1n })).rejects.toThrow(/too small/);
  });
});

describe("planAddLiquidity rounding", () => {
  it("from the WETH side, sizes WETH exactly as the hook will take it", async () => {
    const odd = E18 + 7n; // floor(floor(odd*R0/R1)*R1/R0) is below odd
    const p = await planAddLiquidity(fake(), dep, FROM, { weth: odd }, { slippageBps: 0 });
    expect(p.weth).toBe((p.usdc * R1) / R0);
    expect(p.weth <= odd).toBe(true);
    const add = decodeFunctionData({ abi: liquidityAbi, data: p.transactions.at(-1)!.data });
    expect(add.args[0]).toMatchObject({ amount1Desired: p.weth, amount1Min: p.weth });
  });
});

describe("planRemoveLiquidity", () => {
  it("burns a percentage with minimums from the reserves", async () => {
    const p = await planRemoveLiquidity(fake({ balance: 100n * E18 }), dep, FROM, { percent: 50 }, { now: NOW });
    expect(p.shares).toBe(50n * E18);
    expect(p.usdc).toBe(11_250n * E18);
    expect(p.weth).toBe(5n * E18);
    const rm = decodeFunctionData({ abi: liquidityAbi, data: p.transactions[0].data });
    expect(rm.functionName).toBe("removeLiquidity");
    expect(rm.args[0]).toMatchObject({ liquidity: 50n * E18, amount0Min: (11_250n * E18 * 9_950n) / 10_000n, amount1Min: (5n * E18 * 9_950n) / 10_000n });
  });

  it("100% burns the exact balance", async () => {
    const odd = 123_456_789_012_345_678_901n;
    const p = await planRemoveLiquidity(fake({ balance: odd }), dep, FROM, { percent: 100 });
    expect(p.shares).toBe(odd);
  });

  it("refuses more than the balance, nothing held, or bad percentages", async () => {
    await expect(planRemoveLiquidity(fake({ balance: E18 }), dep, FROM, { shares: 2n * E18 })).rejects.toThrow(/only/);
    await expect(planRemoveLiquidity(fake({ balance: 0n }), dep, FROM, { percent: 10 })).rejects.toThrow(/no LP shares/);
    await expect(planRemoveLiquidity(fake({ balance: E18 }), dep, FROM, { percent: 0 })).rejects.toThrow(/percent/);
    await expect(planRemoveLiquidity(fake({ balance: E18 }), dep, FROM, { percent: 101 })).rejects.toThrow(/percent/);
    await expect(planRemoveLiquidity(fake({ balance: E18 }), dep, FROM, { percent: 10, shares: 1n })).rejects.toThrow(/exactly one/);
  });
});

describe("hook mirrors", () => {
  it("depositTaken takes the limiting side, like the hook", () => {
    // ratio 2,250 USDC per WETH; offering extra WETH: the USDC side limits
    expect(depositTaken(R0, R1, 2_250n * E18, 5n * E18)).toEqual({ usdc: 2_250n * E18, weth: E18 });
    // offering extra USDC: the WETH side limits
    expect(depositTaken(R0, R1, 9_000n * E18, E18)).toEqual({ usdc: 2_250n * E18, weth: E18 });
    // empty pool: taken as offered
    expect(depositTaken(0n, 0n, 5n, 7n)).toEqual({ usdc: 5n, weth: 7n });
  });

  it("withdrawalOut is pro rata and floors", () => {
    expect(withdrawalOut(100n * E18, R0, R1, SUPPLY)).toEqual({ usdc: 22_500n * E18, weth: 10n * E18 });
    expect(withdrawalOut(1n, 3n, 3n, 2n)).toEqual({ usdc: 1n, weth: 1n });
    expect(withdrawalOut(1n, R0, R1, 0n)).toEqual({ usdc: 0n, weth: 0n });
  });
});
