import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  UNICHAIN_SEPOLIA,
  buildApproveTx,
  buildCancelTx,
  buildCloseExpiredTx,
  buildEditParams,
  buildEditTx,
  buildPauseTx,
  buildResumeTx,
  buildCreateOrderTx,
  buildExecuteSliceTx,
  buildOrderParams,
  dcaAbi,
  erc20Abi,
  toRegime,
  withDca,
  type DcaEditInput,
  type DcaOrder,
  type PoincareClient,
  type SlicePreview,
  type TxRequest,
} from "@poincare/sdk";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, type TransactionReceipt } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { jsonSafe } from "../src/format.js";
import { createServer, type Signer } from "../src/server.js";

const W = 10n ** 18n;
const NOW = 1_700_000_000;
const DCA = "0x00000000000000000000000000000000000000Dc";
const OWNER = "0x00000000000000000000000000000000000000A1";
const dep = withDca(UNICHAIN_SEPOLIA, DCA);

// A live-like regime: confirmed market down-trend, sellers pay 4.31%.
const regime = toRegime(
  100n,
  { sPos: 6n * 10n ** 15n, sNeg: 0n, d: (8n * W) / 10n, sigma: W / 100n, kappa: 43101328577184966n, trend: 1 },
  [0n, (3n * W) / 1000n],
  [43101328577184966n, (3n * W) / 1000n],
  5n * 10n ** 15n,
  W / 2n,
  W / 20n,
  (W * W) / (2307n * W),
);

const order: DcaOrder = {
  id: 7n, owner: OWNER, recipient: OWNER, side: "sell", zeroForOne: false, pauseOnTrend: false, catchUp: true,
  cancelled: false, maxSpreadBps: 0, maxSlippageBps: 50, slices: 4, interval: 3600, filled: 1,
  startTime: BigInt(NOW), deadline: BigInt(NOW + 4 * 3600), lastSlotPlusOne: 1n, amountIn: 2n * W,
  remaining: (3n * W) / 2n, amountOut: 1150n * W, minPriceWad: 0n, paused: false, scheduleBudget: 2n * W, scheduleFilled: 1,
};

let preview: SlicePreview;

const fake = {
  deployment: dep,
  publicClient: { getBlockNumber: async () => 1_000n },
  regime: async () => regime,
  history: async () => [],
  quote: async (side: "buy" | "sell", amount: string) => ({ side, amountIn: BigInt(Number(amount)) * W, amountOut: 1n, price: 2300, spread: 0, fee: 0.003 }),
  dca: {
    order: async (id: bigint) => (id === 7n ? order : null),
    ordersOf: async () => [order],
    openOrderIds: async () => [7n],
    preview: async () => preview,
    params: () => { throw new Error("unused"); },
    build: {
      create: async (_from: string, input: Parameters<typeof buildOrderParams>[0]) => {
        const p = buildOrderParams(input, NOW);
        return [buildApproveTx(dep, input.side, p.amountIn), buildCreateOrderTx(dep, p)];
      },
      execute: (id: bigint) => buildExecuteSliceTx(dep, id),
      cancel: (id: bigint) => buildCancelTx(dep, id),
      closeExpired: (id: bigint) => buildCloseExpiredTx(dep, id),
      pause: (id: bigint) => buildPauseTx(dep, id),
      resume: (id: bigint) => buildResumeTx(dep, id),
      edit: async (id: bigint, input: DcaEditInput) => buildEditTx(dep, id, buildEditParams(order, input, NOW)),
    },
  },
} as unknown as PoincareClient;

/** A receipt carrying OrderCreated(id=5) from the DCA contract, as the chain would return it. */
function createdReceipt(): TransactionReceipt {
  const topics = encodeEventTopics({ abi: dcaAbi, eventName: "OrderCreated", args: { id: 5n, owner: OWNER } });
  const data = encodeAbiParameters(
    [{ type: "bool" }, { type: "uint256" }, { type: "uint32" }, { type: "uint32" }, { type: "uint64" }, { type: "uint64" }],
    [false, W, 4, 3600, BigInt(NOW), BigInt(NOW + 14_400)],
  );
  return {
    status: "success", transactionHash: `0x${"ab".repeat(32)}`, blockNumber: 2n,
    logs: [{ address: DCA.toLowerCase(), topics, data, blockNumber: 2n, logIndex: 0, transactionIndex: 0, transactionHash: `0x${"ab".repeat(32)}`, blockHash: `0x${"cd".repeat(32)}`, removed: false }],
  } as unknown as TransactionReceipt;
}

async function connect(signer?: Signer) {
  const server = createServer({ poincare: fake, signer, now: () => NOW });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

type Res = { isError?: boolean; structuredContent?: Record<string, any>; content: { text: string }[] };
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => (await c.callTool({ name, arguments: args })) as Res;

beforeEach(() => {
  preview = { status: "ready", amountIn: W / 2n, quoteOut: 1100n * W, minOut: 1094n * W, spreadBps: 0, slot: 1n, nextSlotAt: BigInt(NOW + 7200) };
});

describe("tool surface", () => {
  it("exposes the regime and DCA tools with honest annotations", async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([
      "dca_cancel_order", "dca_close_expired", "dca_create_order", "dca_edit_order", "dca_execute_slice", "dca_get_order",
      "dca_list_orders", "dca_pause_order", "dca_plan_order", "dca_preview_slice", "dca_resume_order", "get_regime", "get_regime_history", "quote", "wait_for_regime_change",
    ]);
    for (const n of ["get_regime", "get_regime_history", "quote", "dca_plan_order", "dca_get_order", "dca_list_orders", "dca_preview_slice", "wait_for_regime_change"]) {
      expect(byName[n].annotations?.readOnlyHint, n).toBe(true);
    }
    expect(byName.dca_cancel_order.annotations?.destructiveHint).toBe(true);
    expect(byName.dca_create_order.annotations?.readOnlyHint).toBe(false);
  });
});

describe("regime", () => {
  it("summarises in plain English, market orientation", async () => {
    const r = await call(await connect(), "get_regime");
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.summary).toContain("Confirmed down-trend (sellers push with it)");
    expect(r.structuredContent!.summary).toContain("sells pay a 4.31% spread");
    expect(r.structuredContent!.regime.chargedSide).toBe("sell");
    expect(r.structuredContent!.regime.raw.spreadSell).toBe("43101328577184966"); // bigints as strings
  });
});

describe("dca_plan_order", () => {
  it("predicts that a zero-cap sell waits while sellers are charged", async () => {
    const c = await connect();
    const held = await call(c, "dca_plan_order", { side: "sell", amount: "1", slices: 4, intervalSec: 3600, maxSpreadBps: 0 });
    expect(held.structuredContent!.firstFillNow.status).toBe("spread-too-high");
    const free = await call(c, "dca_plan_order", { side: "buy", amount: "1000", slices: 4, intervalSec: 3600, maxSpreadBps: 0 });
    expect(free.structuredContent!.firstFillNow.status).toBe("ready");
    expect(free.structuredContent!.perSlice).toBe("250 USDC");
    expect(free.structuredContent!.schedule).toHaveLength(4);
  });

  it("returns the contract's own reason for invalid params", async () => {
    const r = await call(await connect(), "dca_plan_order", { side: "buy", amount: "10", slices: 4, intervalSec: 3600, deadline: NOW + 60 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("deadline");
  });

  it("schema rejects nonsense before it reaches the SDK", async () => {
    const r = await call(await connect(), "dca_plan_order", { side: "hold", amount: "-1", slices: 0, intervalSec: 1 });
    expect(r.isError).toBe(true);
  });
});

describe("writes are unsigned unless explicitly sent", () => {
  it("create returns approve + create, unsigned, by default", async () => {
    const r = await call(await connect(), "dca_create_order", { side: "sell", amount: "1", slices: 4, intervalSec: 3600, owner: OWNER });
    expect(r.structuredContent!.sent).toBe(false);
    const txs = r.structuredContent!.transactions as TxRequest[];
    expect(txs).toHaveLength(2);
    // 1) approve the input token (WETH for a sell) for exactly the budget, 2) createOrder
    expect(txs[0].to).toBe(UNICHAIN_SEPOLIA.weth);
    expect(decodeFunctionData({ abi: erc20Abi, data: txs[0].data })).toMatchObject({ functionName: "approve", args: [dep.dca, W] });
    expect(decodeFunctionData({ abi: dcaAbi, data: txs[1].data }).functionName).toBe("createOrder");
  });

  it("send=true without a configured key is refused", async () => {
    const r = await call(await connect(), "dca_create_order", { side: "sell", amount: "1", slices: 4, intervalSec: 3600, owner: OWNER, send: true });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("POINCARE_PRIVATE_KEY");
  });

  it("send=true with a key sends both transactions and returns the order id", async () => {
    const sent: TxRequest[] = [];
    const signer: Signer = { address: OWNER, send: async (tx) => { sent.push(tx); return createdReceipt(); } };
    const r = await call(await connect(signer), "dca_create_order", { side: "sell", amount: "1", slices: 4, intervalSec: 3600, send: true });
    expect(r.isError).toBeFalsy();
    expect(sent).toHaveLength(2);
    expect(r.structuredContent!.orderId).toBe("5");
  });

  it("a key cannot create an order for someone else", async () => {
    const signer: Signer = { address: OWNER, send: async () => createdReceipt() };
    const r = await call(await connect(signer), "dca_create_order", {
      side: "sell", amount: "1", slices: 4, intervalSec: 3600, owner: "0x00000000000000000000000000000000000000B2", send: true,
    });
    expect(r.isError).toBe(true);
  });
});

describe("order tools", () => {
  it("get_order formats amounts and explains the next fill", async () => {
    const r = await call(await connect(), "dca_get_order", { id: 7 });
    expect(r.structuredContent!.order.remainingFormatted).toBe("1.5 WETH");
    expect(r.structuredContent!.order.progress).toBe(0.25);
    expect(r.structuredContent!.nextFill.status).toBe("ready");
    expect((await call(await connect(), "dca_get_order", { id: 8 })).isError).toBe(true);
  });

  it("execute refuses a fill the contract would hold, and builds it when ready", async () => {
    const c = await connect();
    preview = { ...preview, status: "spread-too-high", spreadBps: 432 };
    const held = await call(c, "dca_execute_slice", { id: 7 });
    expect(held.isError).toBe(true);
    expect(held.content[0].text).toContain("spread-too-high");

    preview = { ...preview, status: "ready", spreadBps: 0 };
    const ok = await call(c, "dca_execute_slice", { id: "7" });
    const tx = (ok.structuredContent!.transactions as TxRequest[])[0];
    expect(decodeFunctionData({ abi: dcaAbi, data: tx.data })).toMatchObject({ functionName: "executeSlice", args: [7n] });
  });

  it("cancel builds cancel(id)", async () => {
    const r = await call(await connect(), "dca_cancel_order", { id: 7 });
    const tx = (r.structuredContent!.transactions as TxRequest[])[0];
    expect(decodeFunctionData({ abi: dcaAbi, data: tx.data })).toMatchObject({ functionName: "cancel", args: [7n] });
  });
});

describe("pause / resume / edit", () => {
  it("pause builds pause(id); resume refuses an order that is not paused", async () => {
    const c = await connect();
    const p = await call(c, "dca_pause_order", { id: 7 });
    expect(decodeFunctionData({ abi: dcaAbi, data: (p.structuredContent!.transactions as TxRequest[])[0].data })).toMatchObject({ functionName: "pause", args: [7n] });
    const r = await call(c, "dca_resume_order", { id: 7 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("not paused");
  });

  it("edit re-plans the remaining budget and validates like the contract", async () => {
    const c = await connect();
    const r = await call(c, "dca_edit_order", { id: 7, slices: 6, intervalSec: 900, pauseOnTrend: true, limitPrice: "none" });
    expect(r.isError).toBeFalsy();
    const d = decodeFunctionData({ abi: dcaAbi, data: (r.structuredContent!.transactions as TxRequest[])[0].data });
    expect(d.functionName).toBe("editOrder");
    expect(d.args[1]).toMatchObject({ slices: 6, interval: 900, pauseOnTrend: true, minPriceWad: 0n, deadline: BigInt(NOW + 6 * 900) });
    const bad = await call(c, "dca_edit_order", { id: 7, slices: 4, deadline: NOW + 60 });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain("deadline");
  });

  it("refuses to send for an order the configured key does not own", async () => {
    const stranger: Signer = { address: "0x00000000000000000000000000000000000000Ee", send: async () => createdReceipt() };
    const r = await call(await connect(stranger), "dca_pause_order", { id: 7, send: true });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("not the configured key");
  });
});

describe("configuration errors", () => {
  it("names the env var when the DCA address is missing", async () => {
    const noDca = { ...fake, dca: { ...fake.dca, order: async () => buildCancelTx({ ...UNICHAIN_SEPOLIA, dca: undefined }, 1n) } } as unknown as PoincareClient;
    const server = createServer({ poincare: noDca, now: () => NOW });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const r = await call(client, "dca_get_order", { id: 1 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("POINCARE_DCA_ADDRESS");
  });
});

describe("jsonSafe", () => {
  it("stringifies nested bigints", () => {
    expect(jsonSafe({ a: 1n, b: [2n, { c: 3n }], d: "x" })).toEqual({ a: "1", b: ["2", { c: "3" }], d: "x" });
  });
});
