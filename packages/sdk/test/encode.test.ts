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
    expect(() => buildCancelTx(UNICHAIN_SEPOLIA, 1n)).toThrow(DcaNotDeployedError);
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
