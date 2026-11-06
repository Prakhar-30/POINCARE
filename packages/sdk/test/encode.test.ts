import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { dcaAbi } from "../src/abi/dca.js";
import { erc20Abi } from "../src/abi/erc20.js";
import { buildOrderParams } from "../src/dca.js";
import {
  DCA_GAS,
  buildApproveTx,
  buildCancelTx,
  buildCloseExpiredTx,
  buildCreateOrderTx,
  buildExecuteSliceTx,
} from "../src/dcaClient.js";
import { DcaNotDeployedError, UNICHAIN_SEPOLIA, withDca } from "../src/deployments.js";
import { decimalToWad, toAmount, wadToBpsUp } from "../src/units.js";

const DCA = "0x00000000000000000000000000000000000000Dc";
const dep = withDca(UNICHAIN_SEPOLIA, DCA);

describe("transaction builders", () => {
  it("createOrder encodes the params struct", () => {
    const p = buildOrderParams({ side: "sell", amount: "2", slices: 4, interval: 3600, maxSpreadBps: 25, pauseOnTrend: true, limitPrice: "2100" }, 1_700_000_000n);
    const tx = buildCreateOrderTx(dep, p);
    expect(tx.to.toLowerCase()).toBe(DCA.toLowerCase());
    expect(tx.gas).toBe(DCA_GAS.createOrder);
    const { functionName, args } = decodeFunctionData({ abi: dcaAbi, data: tx.data });
    expect(functionName).toBe("createOrder");
    expect(args[0]).toMatchObject({ zeroForOne: false, amountIn: 2n * 10n ** 18n, slices: 4, maxSpreadBps: 25, pauseOnTrend: true, minPriceWad: 2100n * 10n ** 18n });
  });

  it("approves the input token for exactly the budget", () => {
    const buy = buildApproveTx(dep, "buy", 123n);
    expect(buy.to).toBe(UNICHAIN_SEPOLIA.usdc);
    expect(decodeFunctionData({ abi: erc20Abi, data: buy.data }).args).toEqual([dep.dca, 123n]);
    expect(buildApproveTx(dep, "sell", 1n).to).toBe(UNICHAIN_SEPOLIA.weth);
  });

  it("execute / cancel / closeExpired", () => {
    for (const [build, fn] of [[buildExecuteSliceTx, "executeSlice"], [buildCancelTx, "cancel"], [buildCloseExpiredTx, "closeExpired"]] as const) {
      const tx = build(dep, 7n);
      const d = decodeFunctionData({ abi: dcaAbi, data: tx.data });
      expect(d.functionName).toBe(fn);
      expect(d.args).toEqual([7n]);
    }
  });

  it("refuses to build DCA transactions where the contract is not deployed", () => {
    expect(() => buildCancelTx({ ...UNICHAIN_SEPOLIA, dca: undefined }, 1n)).toThrow(DcaNotDeployedError);
    expect(UNICHAIN_SEPOLIA.dca).toBe("0x1E2ad927D95F284fB588eAA3f56D031f92AAe50a"); // shipped default
  });
});

describe("units", () => {
  it("decimals without float drift", () => {
    expect(decimalToWad("0.1")).toBe(10n ** 17n);
    expect(decimalToWad(0.1)).toBe(10n ** 17n);
    expect(toAmount(2307.47)).toBe(230747n * 10n ** 16n);
    expect(toAmount(5n)).toBe(5n);
    expect(() => toAmount("-1")).toThrow();
    expect(() => toAmount("1e3")).toThrow();
  });
  it("bps rounding matches the contract (up)", () => {
    expect(wadToBpsUp(43101328577184966n)).toBe(432); // live sell-side spread seen on the fork
    expect(wadToBpsUp(0n)).toBe(0);
    expect(wadToBpsUp(10n ** 14n)).toBe(1);
  });
});

describe("pause / resume / edit builders", () => {
  it("encode the owner actions", async () => {
    const { buildPauseTx, buildResumeTx, buildEditTx } = await import("../src/dcaClient.js");
    expect(decodeFunctionData({ abi: dcaAbi, data: buildPauseTx(dep, 3n).data })).toMatchObject({ functionName: "pause", args: [3n] });
    expect(decodeFunctionData({ abi: dcaAbi, data: buildResumeTx(dep, 3n).data })).toMatchObject({ functionName: "resume", args: [3n] });
    const edit = buildEditTx(dep, 3n, { slices: 6, interval: 900, startTime: 0n, deadline: 1_700_005_400n, maxSpreadBps: 0, pauseOnTrend: true, catchUp: true, maxSlippageBps: 50, minPriceWad: 0n });
    const d = decodeFunctionData({ abi: dcaAbi, data: edit.data });
    expect(d.functionName).toBe("editOrder");
    expect(d.args[0]).toBe(3n);
    expect(d.args[1]).toMatchObject({ slices: 6, interval: 900, pauseOnTrend: true, deadline: 1_700_005_400n });
    expect(edit.gas).toBe(150_000n);
  });
});

describe("allowance reads after a transaction", () => {
  it("pins to the given block and retries a replica that does not have it yet", async () => {
    const { allowanceFor } = await import("../src/dcaClient.js");
    const seen: (bigint | undefined)[] = [];
    let calls = 0;
    const client = {
      readContract: async ({ blockNumber }: { blockNumber?: bigint }) => {
        seen.push(blockNumber);
        if (++calls < 3) throw new Error("header not found"); // a lagging replica
        return 7n;
      },
    } as unknown as Parameters<typeof allowanceFor>[0];
    expect(await allowanceFor(client, dep, "0x00000000000000000000000000000000000000a1", "sell", 123n)).toBe(7n);
    expect(seen).toEqual([123n, 123n, 123n]);
  });
});
