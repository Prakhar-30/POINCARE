import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { UNICHAIN_SEPOLIA, withDca } from "@poincare/sdk";
import { indexDca, statusOfRow } from "../src/indexer.js";

const DCA = "0x00000000000000000000000000000000000000Dc";
const dep = withDca(UNICHAIN_SEPOLIA, DCA);
const OWNER = "0x00000000000000000000000000000000000000A1";
const W = 10n ** 18n;

const onChainOrder = (over: Record<string, unknown> = {}) => ({
  owner: OWNER, recipient: OWNER, zeroForOne: true, pauseOnTrend: false, catchUp: true, cancelled: false, paused: false,
  maxSpreadBps: 0, maxSlippageBps: 50, slices: 4, interval: 60, filled: 2, scheduleFilled: 2,
  startTime: 1_700_000_000n, deadline: 1_700_000_240n, lastSlotPlusOne: 2n, amountIn: 400n * W, scheduleBudget: 400n * W,
  remaining: 0n, amountOut: W / 10n, refunded: 200n * W, minPriceWad: 0n, ...over,
});

function fakeClient(head: bigint, logsByRange: (from: bigint, to: bigint) => unknown[]) {
  const ranges: [bigint, bigint][] = [];
  const client = {
    getBlockNumber: async () => head,
    getContractEvents: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      ranges.push([fromBlock, toBlock]);
      return logsByRange(fromBlock, toBlock);
    },
    readContract: async () => onChainOrder(),
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: 1_700_000_000n + blockNumber }),
  } as unknown as PublicClient;
  return { client, ranges };
}

const slice = (block: bigint, id: bigint, amountIn: bigint, amountOut: bigint, logIndex = 0) => ({
  eventName: "SliceExecuted", blockNumber: block, transactionHash: `0x${block.toString(16).padStart(64, "0")}`, logIndex,
  args: { id, slot: 0n, amountIn, amountOut, spreadBps: 0n, filled: 1, remaining: 0n },
});

describe("indexDca", () => {
  it("pages eth_getLogs in 1,000-block chunks and stops at the head", async () => {
    const { client, ranges } = fakeClient(12_345n, () => []);
    const r = await indexDca({ publicClient: client, deployment: dep, fromBlock: 10_000n, maxChunks: 10 });
    expect(ranges).toEqual([[10_000n, 10_999n], [11_000n, 11_999n], [12_000n, 12_345n]]);
    expect(r.toBlock).toBe(12_345n);
  });

  it("caps one run at maxChunks so the cursor advances in steps", async () => {
    const { client, ranges } = fakeClient(50_000n, () => []);
    const r = await indexDca({ publicClient: client, deployment: dep, fromBlock: 0n, maxChunks: 3 });
    expect(ranges.length).toBe(3);
    expect(r.toBlock).toBe(2_999n);
  });

  it("turns SliceExecuted into fill rows and touched orders into state rows", async () => {
    const created = { eventName: "OrderCreated", blockNumber: 5n, transactionHash: "0x01", logIndex: 0, args: { id: 7n } };
    const { client } = fakeClient(100n, (from) => (from === 0n ? [created, slice(9n, 7n, 100n * W, W / 20n)] : []));
    const r = await indexDca({ publicClient: client, deployment: dep, fromBlock: 0n });
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0]).toMatchObject({ order_id: 7, owner: OWNER.toLowerCase(), side: "buy", amount_in: "100", amount_out: "0.05", price: 2000, block_number: 9 });
    expect(r.fills[0].ts).toBe(new Date(1_700_000_009 * 1000).toISOString());
    expect(r.orders[0]).toMatchObject({ order_id: 7, status: "refunded", spent: "200", refunded: "200", created_block: 5, fills: 2 });
  });

  it("a range with nothing new returns no rows", async () => {
    const { client } = fakeClient(10n, () => []);
    const r = await indexDca({ publicClient: client, deployment: dep, fromBlock: 11n });
    expect(r).toMatchObject({ fills: [], orders: [] });
    expect(r.toBlock).toBe(10n);
  });
});

describe("statusOfRow", () => {
  it("names how an order ended", () => {
    expect(statusOfRow({ cancelled: true, remaining: 0n, refunded: 5n })).toBe("cancelled");
    expect(statusOfRow({ cancelled: false, remaining: 1n, refunded: 0n })).toBe("open");
    expect(statusOfRow({ cancelled: false, remaining: 0n, refunded: 5n })).toBe("refunded");
    expect(statusOfRow({ cancelled: false, remaining: 0n, refunded: 0n })).toBe("completed");
  });
});
