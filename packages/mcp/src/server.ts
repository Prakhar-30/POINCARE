import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DCA_STATUS_TEXT,
  type DcaOrder,
  type DcaOrderInput,
  type PoincareClient,
  type Regime,
  type RegimeEvent,
  type TxRequest,
  buildOrderParams,
  diffRegime,
  minPriceWadToLimit,
  orderIdFromReceipt,
  planSlice,
  progressOf,
  formatAmount,
  trendOnsets,
  wadToBpsUp,
} from "@poincare/sdk";
import { getAddress, type Address, type TransactionReceipt } from "viem";
import { z } from "zod";
import { describeRegime, fail, ok } from "./format.js";

/** The user's own key, if they configured one. Without it every write tool returns unsigned txs. */
export type Signer = { address: Address; send: (tx: TxRequest) => Promise<TransactionReceipt> };

export type ServerOptions = {
  poincare: PoincareClient;
  signer?: Signer;
  /** Clock override for tests. */
  now?: () => number;
};

const side = z.enum(["buy", "sell"]).describe("buy = pay USDC for WETH; sell = pay WETH for USDC");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "an 0x address");
const orderId = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).describe("DCA order id");
const sendFlag = z
  .boolean()
  .optional()
  .describe("Broadcast with the key configured in POINCARE_PRIVATE_KEY. Omit or false to get unsigned transactions instead.");

const orderShape = {
  side,
  amount: z.string().regex(/^\d+(\.\d+)?$/).describe("Total budget in the input token (USDC to buy, WETH to sell), e.g. \"1000\""),
  slices: z.number().int().min(1).max(10_000).describe("Number of fills"),
  intervalSec: z.number().int().min(60).describe("Seconds between fills (>= 60)"),
  startTime: z.number().int().optional().describe("Unix seconds; omit to start immediately"),
  deadline: z.number().int().optional().describe("Unix seconds; default one spare interval after the last planned fill"),
  maxSpreadBps: z.number().int().min(0).max(10_000).optional().describe("Skip a fill while the trend spread on this side exceeds this (bps). 0 = never pay the spread. Default 10000 (no cap)"),
  pauseOnTrend: z.boolean().optional().describe("Hold fills while a trend runs with this side (the side the pool charges); resume when it ends. Default false"),
  catchUp: z.boolean().optional().describe("Grow later fills to make up skipped ones, so the order completes by the deadline. Default true"),
  maxSlippageBps: z.number().int().min(0).max(10_000).optional().describe("Max shortfall vs the in-transaction quote (bps). Default 50"),
  limitPrice: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("USDC per WETH: the most a buy pays / the least a sell accepts"),
  recipient: address.optional().describe("Receives every fill; default the owner"),
};

type OrderArgs = { [K in keyof typeof orderShape]: z.infer<(typeof orderShape)[K]> };

function toInput(a: OrderArgs): DcaOrderInput {
  return {
    side: a.side,
    amount: a.amount,
    slices: a.slices,
    interval: a.intervalSec,
    startTime: a.startTime,
    deadline: a.deadline,
    maxSpreadBps: a.maxSpreadBps,
    pauseOnTrend: a.pauseOnTrend,
    catchUp: a.catchUp,
    maxSlippageBps: a.maxSlippageBps,
    limitPrice: a.limitPrice,
    recipient: a.recipient as Address | undefined,
  };
}

function orderView(o: DcaOrder) {
  const tokenIn = o.side === "buy" ? "USDC" : "WETH";
  const tokenOut = o.side === "buy" ? "WETH" : "USDC";
  return {
    ...o,
    tokenIn,
    tokenOut,
    amountInFormatted: `${formatAmount(o.amountIn)} ${tokenIn}`,
    remainingFormatted: `${formatAmount(o.remaining)} ${tokenIn}`,
    amountOutFormatted: `${formatAmount(o.amountOut)} ${tokenOut}`,
    progress: progressOf(o),
    limitPrice: minPriceWadToLimit(o.side, o.minPriceWad),
    startsAt: new Date(Number(o.startTime) * 1000).toISOString(),
    deadlineAt: new Date(Number(o.deadline) * 1000).toISOString(),
  };
}

export function createServer(opts: ServerOptions): McpServer {
  const { poincare, signer } = opts;
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const server = new McpServer({ name: "poincare", version: "0.1.0" });

  type RunResult =
    | { sent: false; transactions: TxRequest[]; note: string }
    | { sent: true; transactions: { hash: string; block: bigint; status: string }[]; receipts: TransactionReceipt[] };

  const run = async (txs: TxRequest[], send: boolean | undefined): Promise<RunResult> => {
    if (!send) return { sent: false, transactions: txs, note: "Unsigned. Sign and send these in order from the owner's wallet." };
    if (!signer) throw new Error("send=true needs POINCARE_PRIVATE_KEY in the MCP server's environment");
    const receipts: TransactionReceipt[] = [];
    for (const tx of txs) receipts.push(await signer.send(tx));
    return { sent: true, transactions: receipts.map((r) => ({ hash: r.transactionHash, block: r.blockNumber, status: r.status })), receipts };
  };

  const ownerOf = (given?: string): Address => {
    if (given) return getAddress(given);
    if (signer) return signer.address;
    throw new Error("pass `owner` (no signing key is configured)");
  };

  // ---------------------------------------------------------------- regime

  server.registerTool(
    "get_regime",
    {
      title: "Current trend regime",
      description:
        "What the next swap on the Poincaré WETH/USDC pool sees this block: the confirmed trend (CUSUM, data-dependent), evidence toward the threshold, which side pays the trend spread and how much, base fee and mid price. Market orientation: USDC per WETH.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const r = await poincare.regime();
        return ok({ summary: describeRegime(r), regime: r });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_regime_history",
    {
      title: "Trend history",
      description: "The hook's own detector samples over recent blocks, with where trends started, ended or flipped.",
      inputSchema: { blocks: z.number().int().min(100).max(20_000).optional().describe("How many recent blocks to scan (default 3000)") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ blocks }) => {
      try {
        const head = await poincare.publicClient.getBlockNumber();
        const from = head - BigInt(blocks ?? 3000);
        const samples = await poincare.history(from > 0n ? from : 0n, head);
        return ok({ fromBlock: from, toBlock: head, sampleCount: samples.length, onsets: trendOnsets(samples), latest: samples.slice(-10) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "wait_for_regime_change",
    {
      title: "Wait for a trend onset",
      description:
        "Block until the regime changes (trend started/ended/flipped, evidence building, spread engaged/released) or the timeout passes. Use it to react to the onset of a trend instead of polling.",
      inputSchema: {
        timeoutSec: z.number().int().min(5).max(300).optional().describe("Give up after this many seconds (default 60)"),
        events: z
          .array(z.enum(["trend-started", "trend-ended", "trend-flipped", "evidence-building", "spread-engaged", "spread-released"]))
          .optional()
          .describe("Only return on these event types (default: any)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ timeoutSec, events }) => {
      try {
        let prev: Regime = await poincare.regime();
        const deadline = Date.now() + (timeoutSec ?? 60) * 1000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2_000));
          const next = await poincare.regime();
          const hit = diffRegime(prev, next).filter((e: RegimeEvent) => !events || events.includes(e.type));
          prev = next;
          if (hit.length) return ok({ changed: true, events: hit, summary: describeRegime(next), regime: next });
        }
        return ok({ changed: false, summary: describeRegime(prev), regime: prev });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "quote",
    {
      title: "Quote a swap",
      description: "Exact-input quote from the pool's Lens (matches router execution in the same block to the wei), with the spread and fee this side pays.",
      inputSchema: { side, amount: z.string().regex(/^\d+(\.\d+)?$/).describe("Input amount: USDC to buy, WETH to sell") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ side: s, amount }) => {
      try {
        const q = await poincare.quote(s, amount);
        return ok({ ...q, amountOutFormatted: `${formatAmount(q.amountOut)} ${s === "buy" ? "WETH" : "USDC"}` });
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---------------------------------------------------------------- DCA

  server.registerTool(
    "dca_plan_order",
    {
      title: "Plan a spread-aware DCA order",
      description:
        "Validate a DCA order exactly as the contract will, show its schedule, and say what the first fill would do under the current regime. Sends nothing.",
      inputSchema: orderShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const t = now();
        const p = buildOrderParams(toInput(args as OrderArgs), t);
        const start = p.startTime === 0n ? BigInt(t) : p.startTime;
        const r = await poincare.regime();
        const sideSpread = args.side === "buy" ? r.raw.spreadBuy : r.raw.spreadSell;
        const first = planSlice(
          {
            id: 0n, owner: "0x0000000000000000000000000000000000000000", recipient: p.recipient, side: args.side,
            zeroForOne: p.zeroForOne, pauseOnTrend: p.pauseOnTrend, catchUp: p.catchUp, cancelled: false,
            maxSpreadBps: p.maxSpreadBps, maxSlippageBps: p.maxSlippageBps, slices: p.slices, interval: p.interval,
            filled: 0, startTime: start, deadline: p.deadline, lastSlotPlusOne: 0n, amountIn: p.amountIn,
            remaining: p.amountIn, amountOut: 0n, minPriceWad: p.minPriceWad,
          },
          { now: BigInt(t), spreadBps: wadToBpsUp(sideSpread), trendWithSide: r.withTrendSide === args.side },
        );
        const schedule = Array.from({ length: Math.min(p.slices, 12) }, (_, i) => ({
          slice: i + 1,
          opensAt: new Date(Number(start + BigInt(i * p.interval)) * 1000).toISOString(),
        }));
        return ok({
          params: p,
          perSlice: `${formatAmount(p.amountIn / BigInt(p.slices))} ${args.side === "buy" ? "USDC" : "WETH"}`,
          schedule,
          deadlineAt: new Date(Number(p.deadline) * 1000).toISOString(),
          firstFillNow: { status: first.status, meaning: DCA_STATUS_TEXT[first.status] },
          regime: describeRegime(r),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "dca_create_order",
    {
      title: "Create a DCA order",
      description:
        "Escrow the budget in the PoincareDCA contract and open the order. Returns the unsigned approve + create transactions, or sends them when send=true and a key is configured.",
      inputSchema: { ...orderShape, owner: address.optional().describe("Order owner; defaults to the configured key's address"), send: sendFlag },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const from = ownerOf(args.owner);
        if (args.send && signer && from.toLowerCase() !== signer.address.toLowerCase()) {
          throw new Error("send=true creates the order from the configured key; `owner` must be that address");
        }
        const txs = await poincare.dca.build.create(from, toInput(args as unknown as OrderArgs));
        const res = await run(txs, args.send);
        if (res.sent) {
          const id = orderIdFromReceipt(poincare.deployment, res.receipts[res.receipts.length - 1]);
          return ok({ sent: true, orderId: id, transactions: res.transactions });
        }
        return ok({ owner: from, ...res });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "dca_get_order",
    {
      title: "Get a DCA order",
      description: "An order's state and progress, plus the contract's own verdict on its next fill.",
      inputSchema: { id: orderId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        const o = await poincare.dca.order(BigInt(id));
        if (!o) return fail(new Error(`no DCA order #${id}`));
        const next = await poincare.dca.preview(BigInt(id));
        return ok({ order: orderView(o), nextFill: { ...next, meaning: DCA_STATUS_TEXT[next.status] } });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "dca_list_orders",
    {
      title: "List DCA orders",
      description: "Every DCA order an address has opened, newest last, with each one's next-fill status.",
      inputSchema: { owner: address.optional().describe("Defaults to the configured key's address") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ owner }) => {
      try {
        const orders = await poincare.dca.ordersOf(ownerOf(owner));
        const views = await Promise.all(
          orders.slice(-50).map(async (o) => {
            const next = await poincare.dca.preview(o.id);
            return { ...orderView(o), nextFill: next.status };
          }),
        );
        return ok({ count: orders.length, orders: views });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "dca_preview_slice",
    {
      title: "Can the next fill run now?",
      description: "PoincareDCA.canExecute: the next fill's size, quote, floor, the spread this block, and why it would be held if it would.",
      inputSchema: { id: orderId },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ id }) => {
      try {
        const p = await poincare.dca.preview(BigInt(id));
        return ok({ ...p, meaning: DCA_STATUS_TEXT[p.status] });
      } catch (e) {
        return fail(e);
      }
    },
  );

  const orderAction = (
    name: string,
    title: string,
    description: string,
    build: (id: bigint) => TxRequest,
    destructive: boolean,
    precheck?: (id: bigint) => Promise<void>,
  ) =>
    server.registerTool(
      name,
      { title, description, inputSchema: { id: orderId, send: sendFlag }, annotations: { readOnlyHint: false, destructiveHint: destructive, openWorldHint: true } },
      async ({ id, send }) => {
        try {
          const n = BigInt(id);
          if (precheck) await precheck(n);
          const res = await run([build(n)], send);
          return ok({ orderId: n, sent: res.sent, transactions: res.transactions, ...(res.sent ? {} : { note: res.note }) });
        } catch (e) {
          return fail(e);
        }
      },
    );

  orderAction(
    "dca_execute_slice",
    "Fill the next slice now",
    "Fill the current slot's slice of your own order (keepers do this automatically; the owner may too). Checks the contract's verdict first and refuses if the fill would be held.",
    (id) => poincare.dca.build.execute(id),
    false,
    async (id) => {
      const p = await poincare.dca.preview(id);
      if (p.status !== "ready") throw new Error(`not fillable now: ${p.status}. ${DCA_STATUS_TEXT[p.status]}`);
    },
  );
  orderAction("dca_cancel_order", "Cancel a DCA order", "Cancel your order and refund its unfilled budget. Only the owner can.", (id) => poincare.dca.build.cancel(id), true);
  orderAction(
    "dca_close_expired",
    "Refund an expired order",
    "After the deadline, return an order's unfilled budget to its owner. Anyone may send this; the refund always goes to the owner.",
    (id) => poincare.dca.build.closeExpired(id),
    false,
  );

  return server;
}
