import {
  UNICHAIN_SEPOLIA,
  buildApproveTx,
  buildCancelTx,
  buildCloseExpiredTx,
  buildPauseTx,
  buildResumeTx,
  buildCreateOrderTx,
  buildExecuteSliceTx,
  buildOrderParams,
  dcaAbi,
  toRegime,
  withDca,
  type DcaOrder,
  type PoincareClient,
  type SlicePreview,
} from "@poincaretrade/sdk";
import { decodeFunctionData, type Hex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { createApiHandler } from "../src/handler.js";

const W = 10n ** 18n;
const NOW = 1_700_000_000;
const DCA = "0x00000000000000000000000000000000000000Dc";
const OWNER = "0x00000000000000000000000000000000000000a1";
const dep = withDca(UNICHAIN_SEPOLIA, DCA);

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
  id: 7n, owner: OWNER, recipient: OWNER, side: "buy", zeroForOne: true, pauseOnTrend: true, catchUp: true,
  cancelled: false, maxSpreadBps: 0, maxSlippageBps: 50, slices: 4, interval: 3600, filled: 2,
  startTime: BigInt(NOW), deadline: BigInt(NOW + 4 * 3600), lastSlotPlusOne: 2n, amountIn: 1000n * W,
  remaining: 500n * W, amountOut: W / 5n, minPriceWad: 0n, paused: false, refunded: 0n, scheduleBudget: 1000n * W, scheduleFilled: 2,
};

let preview: SlicePreview;

const poincare = {
  deployment: dep,
  publicClient: { getBlockNumber: async () => 5_000n },
  regime: async () => regime,
  history: async () => [
    { blockNumber: 4_100n, price: 2400, trend: "none", evidenceUp: 0, evidenceDown: 0, kappa: 0, directionalEfficiency: 0.4, sigma: 0.01, fee: 0.003 },
    { blockNumber: 4_500n, price: 2310, trend: "down", evidenceUp: 0, evidenceDown: 0.006, kappa: 0.043, directionalEfficiency: 0.8, sigma: 0.01, fee: 0.003 },
  ],
  quote: async (side: "buy" | "sell", amount: string) => ({ side, amountIn: BigInt(Math.round(Number(amount))) * W, amountOut: 43n * 10n ** 15n, price: 2314.5, spread: 0, fee: 0.003 }),
  dca: {
    order: async (id: bigint) => (id === 7n ? order : null),
    ordersOf: async () => [order],
    preview: async () => preview,
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
    },
  },
} as unknown as PoincareClient;

const handle = createApiHandler({ poincare, now: () => NOW });
const BASE = "https://gogjpdgluflntcgsarhn.supabase.co/functions/v1/poincare-api";
const get = (path: string) => handle(new Request(`${BASE}${path}`));
const post = (path: string, body: unknown) =>
  handle(new Request(`${BASE}${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  preview = { status: "spread-too-high", amountIn: 250n * W, quoteOut: 0n, minOut: 0n, spreadBps: 0, slot: 2n, nextSlotAt: BigInt(NOW + 3 * 3600) };
});

describe("routing", () => {
  it("routes after the function name, with CORS on every answer", async () => {
    const r = await get("/health");
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(await r.json()).toEqual({ ok: true, chainId: 1301, block: "5000", dca: dep.dca });
  });

  it("answers preflight", async () => {
    const r = await handle(new Request(`${BASE}/regime`, { method: "OPTIONS" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("404 for unknown routes, 405 for the wrong method", async () => {
    expect((await get("/nope")).status).toBe(404);
    expect((await post("/regime", {})).status).toBe(405);
  });
});

describe("regime", () => {
  it("returns the regime with bigints as strings and a summary", async () => {
    const body = await (await get("/regime")).json();
    expect(body.summary).toBe("confirmed down-trend; sells pay 4.31%; evidence 100%; mid 2307.00 USDC/WETH.");
    expect(body.regime.chargedSide).toBe("sell");
    expect(body.regime.raw.kappa).toBe("43101328577184966");
  });

  it("history finds the onset", async () => {
    const body = await (await get("/regime/history?blocks=1000")).json();
    expect(body.fromBlock).toBe("4000");
    expect(body.onsets).toEqual([{ blockNumber: "4500", type: "start", trend: "down", price: 2310 }]);
  });

  it("validates history range", async () => {
    expect((await get("/regime/history?blocks=5")).status).toBe(400);
  });
});

describe("quote", () => {
  it("validates side and amount", async () => {
    expect((await get("/quote?side=hold&amount=1")).status).toBe(400);
    expect((await get("/quote?side=buy&amount=-3")).status).toBe(400);
    const ok = await (await get("/quote?side=buy&amount=100")).json();
    expect(ok.amountOut).toBe("43000000000000000");
  });
});

describe("DCA reads", () => {
  it("one order with the contract's verdict explained", async () => {
    const body = await (await get("/dca/orders/7")).json();
    expect(body.order.progress).toBe(0.5);
    expect(body.order.tokenIn).toBe("USDC");
    expect(body.nextFill.status).toBe("spread-too-high");
    expect(body.nextFill.meaning).toContain("above its cap");
    expect((await get("/dca/orders/8")).status).toBe(404);
  });

  it("orders of an owner", async () => {
    expect((await get("/dca/orders?owner=nope")).status).toBe(400);
    const body = await (await get(`/dca/orders?owner=${OWNER}`)).json();
    expect(body.count).toBe(1);
    expect(body.orders[0].nextFill).toBe("spread-too-high");
  });
});

describe("DCA plan and unsigned transactions", () => {
  const input = { side: "sell", amount: "1", slices: 4, intervalSec: 3600, maxSpreadBps: 0 };

  it("plan predicts the first fill under the live regime", async () => {
    const body = await (await post("/dca/plan", input)).json();
    expect(body.firstFillNow.status).toBe("spread-too-high"); // sellers are charged
    const buy = await (await post("/dca/plan", { ...input, side: "buy", amount: "1000" })).json();
    expect(buy.firstFillNow.status).toBe("ready");
  });

  it("plan reports the contract's reason for bad params", async () => {
    const r = await post("/dca/plan", { ...input, deadline: NOW + 60 });
    expect(r.status).toBe(400);
    expect((await r.json()).reason).toBe("deadline");
    expect((await post("/dca/plan", { ...input, slices: "4" })).status).toBe(400);
    expect((await post("/dca/plan", "{not json")).status).toBe(400);
  });

  it("create returns approve + createOrder for the owner", async () => {
    const r = await post("/dca/tx/create", { ...input, owner: OWNER });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.transactions).toHaveLength(2);
    expect(decodeFunctionData({ abi: dcaAbi, data: body.transactions[1].data as Hex }).functionName).toBe("createOrder");
    expect(body.transactions[1].gas).toBe("450000");
    expect((await post("/dca/tx/create", input)).status).toBe(400); // owner required
  });

  it("execute is refused (409) while the contract would hold the fill", async () => {
    const held = await post("/dca/tx/execute", { id: 7 });
    expect(held.status).toBe(409);
    preview = { ...preview, status: "ready" };
    const ok = await (await post("/dca/tx/execute", { id: "7" })).json();
    expect(decodeFunctionData({ abi: dcaAbi, data: ok.transactions[0].data as Hex })).toMatchObject({ functionName: "executeSlice", args: [7n] });
  });

  it("cancel and close-expired", async () => {
    const c = await (await post("/dca/tx/cancel", { id: 7 })).json();
    expect(decodeFunctionData({ abi: dcaAbi, data: c.transactions[0].data as Hex }).functionName).toBe("cancel");
    expect((await post("/dca/tx/cancel", { id: 0 })).status).toBe(400);
    expect((await post("/dca/tx/cancel", { id: 99 })).status).toBe(404);
    // the order's deadline is NOW + 4h: refunding it now would revert on chain, so say so up front
    const early = await post("/dca/tx/close-expired", { id: 7 });
    expect(early.status).toBe(409);
    expect((await early.json()).error).toContain("has not expired");
    const later = createApiHandler({ poincare, now: () => NOW + 4 * 3600 + 1 });
    const e = await (await later(new Request(`${BASE}/dca/tx/close-expired`, { method: "POST", body: JSON.stringify({ id: 7 }) }))).json();
    expect(decodeFunctionData({ abi: dcaAbi, data: e.transactions[0].data as Hex }).functionName).toBe("closeExpired");
  });

  it("pause / resume, with 409 when already in that state", async () => {
    const p = await (await post("/dca/tx/pause", { id: 7 })).json();
    expect(decodeFunctionData({ abi: dcaAbi, data: p.transactions[0].data as Hex })).toMatchObject({ functionName: "pause", args: [7n] });
    const r = await post("/dca/tx/resume", { id: 7 });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toContain("not paused");
    expect((await post("/dca/tx/pause", { id: 99 })).status).toBe(404);
  });

  it("edit returns editOrder for the remaining budget, 400 with the contract's reason when invalid", async () => {
    const e = await (await post("/dca/tx/edit", { id: 7, slices: 5, intervalSec: 1800, maxSpreadBps: 25 })).json();
    const d = decodeFunctionData({ abi: dcaAbi, data: e.transactions[0].data as Hex });
    expect(d.functionName).toBe("editOrder");
    expect(d.args[1]).toMatchObject({ slices: 5, interval: 1800, maxSpreadBps: 25, pauseOnTrend: true, deadline: BigInt(NOW + 5 * 1800) });
    const bad = await post("/dca/tx/edit", { id: 7, intervalSec: 30 });
    expect(bad.status).toBe(400);
    expect((await bad.json()).reason).toBe("interval");
    expect((await post("/dca/tx/edit", { id: 7, limitPrice: 2000 })).status).toBe(400);
  });

  it("503 with a clear message when the DCA address is not configured", async () => {
    const bare = createApiHandler({ poincare: { ...poincare, dca: { ...poincare.dca, build: { ...poincare.dca.build, cancel: (id: bigint) => buildCancelTx({ ...UNICHAIN_SEPOLIA, dca: undefined }, id) } } } as PoincareClient });
    const r = await bare(new Request(`${BASE}/dca/tx/cancel`, { method: "POST", body: JSON.stringify({ id: 7 }) }));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("POINCARE_DCA_ADDRESS");
  });
});
