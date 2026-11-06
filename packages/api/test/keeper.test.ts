import { UNICHAIN_SEPOLIA, dcaAbi, withDca } from "@poincare/sdk";
import { decodeFunctionData, type Hex, type PublicClient, type WalletClient } from "viem";
import { describe, expect, it } from "vitest";
import { runKeeper } from "../src/keeper.js";

const W = 10n ** 18n;
const DCA = "0x00000000000000000000000000000000000000Dc";
const KEEPER = "0x00000000000000000000000000000000000000Ee";
const dep = withDca(UNICHAIN_SEPOLIA, DCA);

// PoincareDCA.Status codes: 0 ready, 4 expired, 7 spread-too-high, 8 trend-against
function fakeChain(statusById: Record<string, number>, opts: { keeper?: boolean } = {}) {
  const sent: { fn: string; id: bigint; gas: bigint }[] = [];
  const ids = Object.keys(statusById).map(BigInt);
  const publicClient = {
    readContract: async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
      switch (functionName) {
        case "isKeeper": return opts.keeper ?? true;
        case "openOrderCount": return BigInt(ids.length);
        case "openOrders": {
          const [off, lim] = args as [bigint, bigint];
          return ids.slice(Number(off), Number(off + lim));
        }
        case "canExecute": {
          const id = (args as [bigint])[0];
          return { status: statusById[id.toString()], amountIn: W, quoteOut: W, minOut: W, spreadBps: 0n, slot: 0n, nextSlotAt: 0n };
        }
        default: throw new Error(`unexpected read ${functionName}`);
      }
    },
    waitForTransactionReceipt: async ({ hash }: { hash: Hex }) => ({ status: "success", transactionHash: hash }),
  } as unknown as PublicClient;
  const walletClient = {
    account: { address: KEEPER },
    chain: null,
    sendTransaction: async ({ data, gas }: { data: Hex; gas: bigint }) => {
      const d = decodeFunctionData({ abi: dcaAbi, data });
      sent.push({ fn: d.functionName, id: (d.args as [bigint])[0], gas });
      return `0x${sent.length.toString(16).padStart(64, "0")}` as Hex;
    },
  } as unknown as WalletClient;
  return { publicClient, walletClient, sent };
}

describe("runKeeper", () => {
  it("fills ready orders, refunds expired ones, and only counts held ones", async () => {
    const c = fakeChain({ "1": 0, "2": 7, "3": 8, "4": 4, "5": 0, "6": 10 });
    const run = await runKeeper({ ...c, deployment: dep });
    expect(c.sent.map((s) => [s.fn, s.id])).toEqual([["executeSlice", 1n], ["closeExpired", 4n], ["executeSlice", 5n]]);
    expect(c.sent.every((s) => s.gas > 0n)).toBe(true); // explicit gas, no estimation
    expect(run.executed.map((e) => e.id)).toEqual([1n, 5n]);
    expect(run.refunded.map((e) => e.id)).toEqual([4n]);
    expect(run.held).toEqual({ "spread-too-high": 1, "trend-against": 1, paused: 1 }); // a paused order is never sent
    expect(run.checked).toBe(6);
    expect(run.errors).toEqual([]);
  });

  it("caps transactions per pass and defers the rest", async () => {
    const c = fakeChain({ "1": 0, "2": 0, "3": 0 });
    const run = await runKeeper({ ...c, deployment: dep, maxTx: 2 });
    expect(c.sent).toHaveLength(2);
    expect(run.deferred).toBe(1);
  });

  it("refuses to run with a key the contract does not allow", async () => {
    const c = fakeChain({ "1": 0 }, { keeper: false });
    await expect(runKeeper({ ...c, deployment: dep })).rejects.toThrow("not an allowlisted keeper");
    expect(c.sent).toHaveLength(0);
  });

  it("a failing order does not stop the pass", async () => {
    const c = fakeChain({ "1": 0, "2": 0 });
    const orig = c.walletClient.sendTransaction;
    let first = true;
    (c.walletClient as unknown as { sendTransaction: unknown }).sendTransaction = async (a: never) => {
      if (first) { first = false; throw new Error("nonce too low"); }
      return orig(a);
    };
    const run = await runKeeper({ ...c, deployment: dep });
    expect(run.errors).toEqual([{ id: 1n, error: "nonce too low" }]);
    expect(run.executed.map((e) => e.id)).toEqual([2n]);
  });
});
