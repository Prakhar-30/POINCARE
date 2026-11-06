import type { ReactNode } from "react";
import { CONTRACTS, EXPLORER } from "@/config/contracts";
import { Icon } from "@/components/ui/Icon";
import { A, B, Callout, CardGrid, Code, CodeBlock, CodeTabs, DocLink, H2, P, Steps, Table, Ul } from "./ui";

/**
 * The developer docs, one entry per page. Every name, default and route here mirrors packages/
 * (sdk, mcp, api), PoincareDCA.sol and the edge functions: keep them in step when those change.
 */

export const REPO = "https://github.com/Prakhar-30/POINCARE";
export const API_BASE = "https://gogjpdgluflntcgsarhn.supabase.co/functions/v1/poincare-api";

export type DocPage = { slug: string; group: string; title: string; lede: string; keywords?: string; body: () => ReactNode };

const mono = (s: string) => <Code>{s}</Code>;

export const PAGES: DocPage[] = [
  // ------------------------------------------------------------------ Get started
  {
    slug: "overview",
    group: "Get started",
    title: "Build on Poincaré",
    lede: "Read the pool's trend regime, quote exactly what the router will execute, and run spread-aware DCA orders: from TypeScript, from an AI agent, or over plain HTTP. No API keys and no oracle; everything comes from the live pool on Unichain Sepolia.",
    keywords: "intro sdk mcp api tools",
    body: () => (
      <>
        <CardGrid items={[
          { to: "quickstart", title: "Quickstart", body: "Read the regime, quote a swap and plan a DCA order in five minutes.", icon: "spark" },
          { to: "sdk", title: "TypeScript SDK", body: "@poincare/sdk: one client for regime, quotes and DCA orders, with unsigned transactions for any signer.", icon: "layers" },
          { to: "mcp", title: "MCP server", body: "15 tools for Claude and any MCP client. Unsigned by default; sends only with your key and send: true.", icon: "curve" },
          { to: "http-api", title: "HTTP API", body: "Stateless JSON over HTTPS. Reads from the chain, returns unsigned transactions, never holds keys.", icon: "chart" },
        ]} />
        <H2>What you can build</H2>
        <Ul>
          <li><B>Trend-aware trading bots</B> that wait out the spread instead of paying it, or act at the onset of a confirmed trend.</li>
          <li><B>DCA and TWAP products</B> on top of PoincareDCA: recurring buys that never pay the trend spread and still finish on time.</li>
          <li><B>Agents</B> that explain the market regime and manage a user's orders through MCP tools.</li>
          <li><B>Dashboards</B> on the detector's own signal: evidence, directional efficiency, who pays and how much.</li>
        </Ul>
        <H2>Conventions</H2>
        <Table head={["Thing", "Convention"]} rows={[
          ["Prices", <>USDC per WETH, so "up" means the chart goes up</>],
          ["Sides", <>{mono("buy")} pays USDC for WETH; {mono("sell")} pays WETH for USDC</>],
          ["Amounts in", <>Decimal strings in the input token: {mono("\"100\"")} USDC, {mono("\"0.05\"")} WETH</>],
          ["Amounts out", "bigints with 18 decimals in the SDK; decimal strings over HTTP and MCP"],
          ["Spreads", <>Fractions in the SDK ({mono("0.0431")} = 4.31%), basis points on chain and in orders</>],
        ]} />
        <Callout kind="note" title="Testnet">Poincaré runs on Unichain Sepolia (chain 1301). Test tokens have no value; the app's faucet gives 50,000 USDC and 20 WETH per claim.</Callout>
      </>
    ),
  },
  {
    slug: "quickstart",
    group: "Get started",
    title: "Quickstart",
    lede: "Three steps, in whichever interface you prefer: read the regime, quote a swap, plan a DCA order. Nothing here sends a transaction.",
    keywords: "install setup first steps example curl",
    body: () => (
      <>
        <H2>Set up</H2>
        <P>The SDK and the MCP server are on npm under {mono("@poincare")}; the HTTP API needs nothing at all.</P>
        <CodeTabs tabs={[
          { label: "SDK", lang: "sh", code: "npm i @poincare/sdk viem" },
          { label: "MCP", lang: "sh", code: "claude mcp add poincare -- npx -y @poincare/mcp" },
          { label: "From source", lang: "sh", code: `git clone ${REPO}.git && cd POINCARE/packages
pnpm install && pnpm check    # builds, type-checks and tests sdk, mcp and api` },
        ]} />
        <H2>Try it</H2>
        <Steps>{[
          <div key="1">
            <B>Read the regime</B>: is there a confirmed trend, and which side pays?
            <CodeTabs tabs={[
              { label: "SDK", lang: "ts", code: `import { createPoincareClient } from "@poincare/sdk";

const poincare = createPoincareClient();
const r = await poincare.regime();
console.log(r.trend, r.level, r.chargedSide, r.spread);
// "down" "engaged" "sell" { buy: 0, sell: 0.0431 }` },
              { label: "HTTP", lang: "sh", code: `curl ${API_BASE}/regime` },
              { label: "MCP", lang: "text", code: `Ask your agent: "Is the Poincaré pool trending right now, and which side pays?"
→ calls get_regime` },
            ]} />
          </div>,
          <div key="2">
            <B>Quote a swap</B>, to the wei of what the router will execute in this block.
            <CodeTabs tabs={[
              { label: "SDK", lang: "ts", code: `const q = await poincare.quote("buy", "100");   // 100 USDC -> WETH
// { amountIn, amountOut, price, spread, fee }` },
              { label: "HTTP", lang: "sh", code: `curl "${API_BASE}/quote?side=buy&amount=100"` },
              { label: "MCP", lang: "text", code: `"What would 100 USDC buy right now?"  → calls quote` },
            ]} />
          </div>,
          <div key="3">
            <B>Plan a DCA order</B>: validated exactly like the contract, with a preview of the first fill.
            <CodeTabs tabs={[
              { label: "SDK", lang: "ts", code: `import { buildOrderParams, recurringOrder } from "@poincare/sdk";

const input = recurringOrder({ side: "buy", amountPerBuy: "100", frequency: "1h", count: 10 });
const params = buildOrderParams(input);            // throws DcaParamError with the contract's reason
const txs = await poincare.dca.build.create(owner, input);   // [approve, createOrder], unsigned` },
              { label: "HTTP", lang: "sh", code: `curl -X POST ${API_BASE}/dca/plan -H 'content-type: application/json' \\
  -d '{"side":"buy","amount":"1000","slices":10,"intervalSec":3600,"maxSpreadBps":0}'` },
              { label: "MCP", lang: "text", code: `"Plan a DCA that buys 1,000 USDC of WETH hourly over 10 hours, never paying the trend spread."
→ calls dca_plan_order` },
            ]} />
          </div>,
        ]}</Steps>
        <P>Next: <DocLink to="regime">how the regime works</DocLink>, then <DocLink to="dca-orders">DCA orders</DocLink>.</P>
      </>
    ),
  },

  // ------------------------------------------------------------------ Concepts
  {
    slug: "regime",
    group: "Concepts",
    title: "The regime",
    lede: "The hook runs a two-sided CUSUM detector on the pool's own price. When it confirms a trend, swaps that push with it pay a spread of up to 5%, which stays with liquidity providers. The other side pays the plain pool price.",
    keywords: "trend cusum spread evidence detector kappa",
    body: () => (
      <>
        <H2>How a trend is confirmed</H2>
        <P>
          Each block's return feeds two CUSUM statistics, one per direction. A trend is declared when the evidence for one
          crosses its threshold, a <B>data-dependent moment</B>, never a fixed number of blocks, so nobody can precompute
          it. The spread also needs the moves to be directional enough (directional efficiency above its floor); random
          noise keeps that gate shut. The spread then ramps, rate-limited, up to a hard 5% cap.
        </P>
        <H2>Fields</H2>
        <Table head={["Field", "Meaning"]} rows={[
          [mono("trend"), "none · up · down, in market terms (up = price rising)"],
          [mono("level"), "calm (no evidence) · building (evidence accumulating, or a trend whose spread is gated) · engaged (a side pays now)"],
          [mono("withTrendSide"), "The side pushing with the trend: buy in an up-trend, sell in a down-trend"],
          [mono("chargedSide"), "The side that pays a spread in this block, if any"],
          [mono("spread"), "{ buy, sell } as fractions, projected for this block"],
          [mono("evidence"), "{ up, down, threshold, progress }: progress 1 means the threshold is crossed"],
          [mono("gated"), "Directional efficiency is under its floor: moves read as chop, nothing is charged"],
          [mono("fee"), "The volatility-scaled base fee every swap pays"],
        ]} />
        <H2>Events to react to</H2>
        <P>{mono("watchRegime")} in the SDK and {mono("wait_for_regime_change")} in MCP diff consecutive snapshots into:</P>
        <Table head={["Event", "When"]} rows={[
          [mono("trend-started"), "The detector confirms a trend"],
          [mono("trend-ended"), "The trend's evidence is gone"],
          [mono("trend-flipped"), "One trend replaced by the opposite one"],
          [mono("evidence-building"), "Evidence is accumulating toward the threshold"],
          [mono("spread-engaged"), "A side starts paying the spread"],
          [mono("spread-released"), "That side stops paying"],
        ]} />
        <Callout kind="note" title="Orientation">The hook's internal price is WETH per USDC, so its own "Up" is a falling chart. The SDK, API and MCP all report market terms; you never see the inversion.</Callout>
      </>
    ),
  },
  {
    slug: "dca-orders",
    group: "Concepts",
    title: "Spread-aware DCA",
    lede: "A DCA order escrows its budget in PoincareDCA and swaps it in slices, one per interval. The Poincaré part is the protection: whether a slice may pay the trend spread.",
    keywords: "dca twap recurring protection spread guard catch-up limit slippage keeper",
    body: () => (
      <>
        <H2>How a slice fills</H2>
        <P>
          A keeper submits each slice; the contract re-checks the order's rules in the same transaction, quotes with the Lens
          and swaps through the canonical v4 router, and the output goes straight to the order's recipient. A keeper can
          only fill a slice the rules allow, and the owner can always fill their own.
        </P>
        <H2>Protections</H2>
        <Table head={["Preset", "maxSpreadBps", "pauseOnTrend", "Behaviour"]} rows={[
          ["Spread guard (default)", "0", "false", "Never pays the spread: a slice that would pay it waits, and later slices catch up"],
          ["Trend pause", "0", "true", "Also waits while a trend runs with the order's side, before any spread is charged"],
          ["Always fill", "10000", "false", "Fills every slot whatever the spread, like a plain exchange DCA"],
        ]} />
        <H2>Schedule and catch-up</H2>
        <P>
          Slot <i>n</i> opens at {mono("startTime + n × interval")}. Only slots that open <B>strictly before</B> the deadline
          count, and the default deadline ({mono("start + slices × interval")}) gives the last slice a full interval. With
          {" "}{mono("catchUp")} (on by default), later slices grow to spread what is left over the slots left, so an order that
          waited out a trend still finishes on time.
        </P>
        <H2>Price protection</H2>
        <Ul>
          <li>{mono("limitPrice")}: the most a buy pays, the least a sell accepts (USDC per WETH). A slice below it is held.</li>
          <li>{mono("maxSlippageBps")}: the router's floor against the quote taken in the same transaction (default 50).</li>
        </Ul>
        <Callout kind="tip" title="Why same-transaction quotes matter">A market swap quoted one block early can land after a spread engages and revert on slippage. DCA slices quote and swap atomically, so they never see that gap.</Callout>
      </>
    ),
  },
  {
    slug: "order-lifecycle",
    group: "Concepts",
    title: "Order lifecycle",
    lede: "Every order can be paused, resumed, re-planned and cancelled by its owner. The contract's verdict on the next slice tells you exactly why it is or is not filling.",
    keywords: "status paused cancel edit refund expired ready held",
    body: () => (
      <>
        <H2>Status</H2>
        <P>{mono("canExecute(id)")} returns one status, checked in this order:</P>
        <Table head={["Status", "Code", "Meaning"]} rows={([
          ["cancelled", "2", "Cancelled by its owner; the rest was refunded"],
          ["filled", "3", "Nothing left: completed, or the rest was refunded (check refunded)"],
          ["expired", "4", "Past the deadline; anyone may refund the rest to the owner"],
          ["paused", "10", "Paused by its owner; nothing fills until it is resumed"],
          ["not-started", "5", "Before the start time"],
          ["waiting-for-slot", "6", "This slot already filled; the next opens at nextSlotAt"],
          ["spread-too-high", "7", "This side's spread is above the order's cap: held"],
          ["trend-against", "8", "Trend pause is on and a trend runs with this side: held"],
          ["below-limit", "9", "The quote is worse than the order's limit price: held"],
          ["ready", "0", "The next slice can fill now"],
        ] as const).map(([a, b, c]) => [mono(a), b, c])} />
        <H2>Managing an order</H2>
        <Table head={["Call", "Who", "Effect"]} rows={[
          [mono("pause / resume"), "Owner", "Hold and release fills. A paused order can still be cancelled or refunded"],
          [mono("editOrder"), "Owner", "Re-plan the REMAINING budget from now: slices, interval, deadline and every rule. Side, recipient and budget are fixed; a paused order stays paused"],
          [mono("cancel"), "Owner", "Refund what is left at once"],
          [mono("closeExpired"), "Anyone", "After the deadline, refund what is left to the owner, never to the caller"],
          [mono("executeSlice"), "Keeper or owner", "Fill the current slot's slice if the verdict is ready"],
        ]} />
        <H2>The refund record</H2>
        <P>
          Every order keeps {mono("amountIn")} (deposited), {mono("remaining")}, {mono("refunded")} and {mono("amountOut")}, so
          what was actually swapped is {mono("amountIn − remaining − refunded")} from the order alone. The SDK's
          {" "}{mono("spentOf")} and {mono("progressOf")} do this for you.
        </P>
        <Callout kind="warning" title="The deadline is exact">A slice that lands even one second after the deadline reverts as expired; the rest is then refunded.</Callout>
      </>
    ),
  },

  // ------------------------------------------------------------------ Build
  {
    slug: "sdk",
    group: "Build",
    title: "TypeScript SDK",
    lede: "@poincare/sdk is a typed, viem-based ESM package. One client covers the regime, quotes and DCA orders; reads need no wallet.",
    keywords: "typescript viem client createPoincareClient recurringOrder twapOrder watchRegime",
    body: () => (
      <>
        <H2>Install</H2>
        <CodeBlock lang="sh" code="npm i @poincare/sdk viem" />
        <P>viem 2 is a peer dependency. The package is ESM-only and ships its own types.</P>
        <H2>Create a client</H2>
        <CodeBlock lang="ts" code={`import { createPoincareClient } from "@poincare/sdk";

const poincare = createPoincareClient();      // the live Unichain Sepolia deployment, public RPC
// createPoincareClient({ rpcUrl, publicClient, walletClient, deployment })`} />
        <H2>Regime and quotes</H2>
        <CodeBlock lang="ts" code={`const r = await poincare.regime();
const q = await poincare.quote("sell", "0.5");

const stop = poincare.watchRegime({
  onEvent: (e) => {
    if (e.type === "spread-engaged") console.log(\`\${e.side}s now pay \${(e.spread * 100).toFixed(2)}%\`);
  },
});
const samples = await poincare.history(fromBlock);   // the hook's DetectorSample trace`} />
        <H2>Open a DCA order</H2>
        <P>{mono("create")} approves exactly the budget (never an unlimited allowance) and resolves to the order id.</P>
        <CodeBlock lang="ts" code={`import { createPoincareClient, recurringOrder, twapOrder } from "@poincare/sdk";

const poincare = createPoincareClient({ walletClient });

// 100 USDC of WETH every hour, 10 times, never paying the trend spread
const id = await poincare.dca.create(
  recurringOrder({ side: "buy", amountPerBuy: "100", frequency: "1h", count: 10, protection: "spread-guard" }),
);

// 2 WETH sold evenly over 4 hours, with a floor
await poincare.dca.create(twapOrder({ side: "sell", total: "2", durationSec: 14_400, limitPrice: "2200" }));

// every field by hand
await poincare.dca.create({ side: "buy", amount: "1000", slices: 6, interval: 3600, maxSpreadBps: 25, pauseOnTrend: true });`} />
        <H2>Follow and manage it</H2>
        <CodeBlock lang="ts" code={`const o = await poincare.dca.order(id);      // filled, remaining, refunded, amountOut, paused, ...
const next = await poincare.dca.preview(id); // { status, amountIn, quoteOut, minOut, spreadBps, nextSlotAt }

await poincare.dca.pause(id);
await poincare.dca.edit(id, { slices: 12, interval: 1800, limitPrice: null });  // re-plan what is left
await poincare.dca.resume(id);
await poincare.dca.cancel(id);`} />
        <H2>Sign elsewhere</H2>
        <P>Every write also exists unsigned under {mono("dca.build")}, as {mono("{ to, data, value, gas, description }")}, ready for a browser wallet, a multisig or an agent.</P>
        <CodeBlock lang="ts" code={`const txs  = await poincare.dca.build.create(owner, input);  // [approve (if needed), createOrder]
const tx   = poincare.dca.build.pause(id);                   // also execute, cancel, closeExpired, resume
const edit = await poincare.dca.build.edit(id, { slices: 8 });`} />
        <Callout kind="warning" title="Gas and RPC lag">Every built transaction carries an explicit gas limit: testnet estimation mis-simulates calls through the hook. After a transaction, the client pins its next allowance read to that block, so a lagging public RPC replica cannot make it skip an approval.</Callout>
        <H2>Reference</H2>
        <Table head={["Export", "What it is"]} rows={[
          [mono("createPoincareClient"), "regime, watchRegime, history, quote, and dca.{order, ordersOf, openOrderIds, preview, create, execute, pause, resume, edit, cancel, closeExpired, build.*}"],
          [mono("recurringOrder · twapOrder"), "Plan builders; FREQUENCIES 5m 15m 1h 4h 1d 1w; PROTECTIONS spread-guard · trend-pause · always"],
          [mono("buildOrderParams · buildEditParams"), "Validate like createOrder / editOrder; throw DcaParamError with the contract's reason"],
          [mono("planSlice · sliceAmount · slotInfo"), "Offline mirror of the contract's slice rules"],
          [mono("spentOf · progressOf · statusOf"), "Order helpers; DCA_STATUS_TEXT explains every status"],
          [mono("readRegime · diffRegime · trendOnsets"), "Lower-level regime reads and event diffing"],
          [mono("build*Tx · sendTx · DCA_GAS"), "Unsigned transactions with explicit gas, and a sender that fails loudly on a revert"],
          [mono("hookAbi · lensAbi · dcaAbi · erc20Abi"), "Typed ABIs generated from the contracts"],
          [mono("UNICHAIN_SEPOLIA · withDca"), "The live deployment, and a helper to point at another PoincareDCA"],
        ]} />
      </>
    ),
  },
  {
    slug: "mcp",
    group: "Build",
    title: "MCP server",
    lede: "Give Claude, or any MCP client, the regime, quotes and DCA orders as tools. It reads and returns unsigned transactions; nothing is sent unless you add a key and the agent calls a tool with send: true.",
    keywords: "claude agent tools model context protocol desktop code",
    body: () => (
      <>
        <H2>Install</H2>
        <CodeTabs tabs={[
          { label: "Claude Code", lang: "sh", code: "claude mcp add poincare -- npx -y @poincare/mcp" },
          { label: "Claude Desktop", lang: "json", code: `{
  "mcpServers": {
    "poincare": {
      "command": "npx",
      "args": ["-y", "@poincare/mcp"],
      "env": { "POINCARE_RPC_URL": "https://sepolia.unichain.org" }
    }
  }
}` },
        ]} />
        <H2>Configuration</H2>
        <Table head={["Variable", "Meaning"]} rows={[
          [mono("POINCARE_RPC_URL"), "RPC endpoint (default: the public Unichain Sepolia RPC)"],
          [mono("POINCARE_DCA_ADDRESS"), "Overrides the live PoincareDCA"],
          [mono("POINCARE_PRIVATE_KEY"), "Optional. With it, write tools called with send: true broadcast from this key, and owner-only tools refuse orders it does not own"],
        ]} />
        <Callout kind="warning" title="Delegating a key">Only give the server a testnet key you are comfortable letting an agent use. Without one, every write comes back unsigned for you to review.</Callout>
        <H2>Tools</H2>
        <Table head={["Tool", "Does", "Writes"]} rows={([
          ["get_regime", "Trend, evidence and who pays, as one plain-English line plus the data", "–"],
          ["get_regime_history", "Detector samples and trend onsets over recent blocks", "–"],
          ["wait_for_regime_change", "Waits until a trend starts, ends or flips, or the spread engages", "–"],
          ["quote", "Exact-input quote with this side's spread and fee", "–"],
          ["dca_plan_order", "Validates an order like the contract; says what its first fill would do now", "–"],
          ["dca_create_order", "Approve + createOrder", "yes"],
          ["dca_get_order · dca_list_orders · dca_preview_slice", "Order state and the contract's verdict on the next fill", "–"],
          ["dca_pause_order · dca_resume_order · dca_edit_order", "Owner controls; edit re-plans what is left", "yes"],
          ["dca_execute_slice · dca_cancel_order · dca_close_expired", "Fill now (refused unless ready), cancel, refund after the deadline", "yes"],
        ] as const).map(([a, b, c]) => [mono(a), b, c])} />
        <H2>Try asking</H2>
        <Ul>
          <li>"Is the Poincaré pool trending right now, and which side pays?"</li>
          <li>"Plan a DCA that buys 500 USDC of WETH over a day without ever paying the trend spread."</li>
          <li>"Wait for the next trend onset, then tell me the spread."</li>
          <li>"Pause my DCA order 4 and stretch what is left over the next 12 hours."</li>
        </Ul>
      </>
    ),
  },
  {
    slug: "http-api",
    group: "Build",
    title: "HTTP API",
    lede: "Stateless JSON over HTTPS. Every answer is read from the chain at request time; every write comes back as unsigned transactions for your own wallet. The API never holds keys or funds.",
    keywords: "rest endpoints curl json routes status codes",
    body: () => (
      <>
        <H2>Base URL</H2>
        <CodeBlock lang="text" code={API_BASE} />
        <P>No authentication. Bigints are decimal strings. CORS is open for GET and POST.</P>
        <H2>Endpoints</H2>
        <Table head={["Method", "Path", "Returns"]} rows={([
          ["GET", "/health", "Chain, latest block, the PoincareDCA address"],
          ["GET", "/regime", "The regime and a one-line summary"],
          ["GET", "/regime/history?blocks=3000", "Detector samples and trend onsets (100 to 20,000 blocks)"],
          ["GET", "/quote?side=buy&amount=100", "Exact-input quote with spread and fee"],
          ["GET", "/dca/orders?owner=0x…", "An address's orders, each with spent, progress and next-fill status"],
          ["GET", "/dca/orders/:id", "One order and the contract's verdict on its next fill"],
          ["POST", "/dca/plan", "Validates an order and previews its first fill"],
          ["POST", "/dca/tx/create", "Unsigned approve + createOrder"],
          ["POST", "/dca/tx/pause · /resume", "Unsigned tx; 409 if already in that state"],
          ["POST", "/dca/tx/edit", "Unsigned editOrder for the remaining budget"],
          ["POST", "/dca/tx/execute", "Unsigned executeSlice; 409 while the fill would be held"],
          ["POST", "/dca/tx/cancel · /close-expired", "Unsigned tx; 409 if closed or not yet expired"],
        ] as const).map(([m, p, r]) => [mono(m), mono(p), r])} />
        <H2>Request bodies</H2>
        <Table head={["Route", "Fields"]} rows={[
          [mono("/dca/plan · /dca/tx/create"), <>{mono("side")}, {mono("amount")} (decimal string), {mono("slices")}, {mono("intervalSec")}; optional {mono("startTime")}, {mono("deadline")}, {mono("maxSpreadBps")}, {mono("pauseOnTrend")}, {mono("catchUp")}, {mono("maxSlippageBps")}, {mono("limitPrice")}, {mono("recipient")}; create also takes {mono("owner")}</>],
          [mono("/dca/tx/edit"), <>{mono("id")}; optional {mono("slices")}, {mono("intervalSec")}, {mono("durationSec")}, {mono("deadline")}, {mono("maxSpreadBps")}, {mono("pauseOnTrend")}, {mono("catchUp")}, {mono("maxSlippageBps")}, {mono("limitPrice")} ({mono("null")} removes it)</>],
          [mono("other /dca/tx/*"), mono("{ id }")],
        ]} />
        <H2>Example</H2>
        <CodeBlock lang="sh" code={`curl -X POST ${API_BASE}/dca/tx/create -H 'content-type: application/json' -d '{
  "owner": "0xYourAddress", "side": "sell", "amount": "1", "slices": 4, "intervalSec": 3600, "maxSpreadBps": 0
}'
# { "owner": "0x…", "transactions": [ { "to", "data", "value", "gas", "description" }, … ] }`} />
        <H2>Errors</H2>
        <Table head={["Status", "When"]} rows={([
          ["400", "Bad input. Invalid orders add reason, the contract's own (e.g. \"deadline\", \"interval\")"],
          ["404", "No such order or route"],
          ["409", "The action would revert now: held fill, closed order, not yet expired, already paused"],
          ["502", "The upstream RPC failed; retry"],
          ["503", "The DCA contract is not configured on this deployment"],
        ] as const).map(([a, b]) => [mono(a), b])} />
      </>
    ),
  },
  {
    slug: "keeper",
    group: "Build",
    title: "Keeper & indexed data",
    lede: "A keeper fills the slices the contract says are due. The hosted one also indexes every DCA event into a database, which the app reads first.",
    keywords: "keeper cron supabase index database dca_orders dca_fills",
    body: () => (
      <>
        <H2>What a keeper can do</H2>
        <P>
          Any allowlisted address may call {mono("executeSlice")} when the verdict is ready, and {mono("closeExpired")} after a
          deadline. Nothing else: no withdrawals, no edits, and the contract re-checks every rule in the fill. Orders never
          depend on one keeper, because owners can fill their own slices.
        </P>
        <CodeBlock lang="ts" code={`import { makeKeeper } from "@poincare/api";

const pass = makeKeeper({ dcaAddress, privateKey: process.env.KEEPER_PRIVATE_KEY!, maxTx: 20 });
const run = await pass();
// { checked, executed: [{ id, amountIn, spreadBps }], refunded, held: { "spread-too-high": 2 }, deferred }`} />
        <P>The contract owner adds or removes keepers with {mono("setKeeper(address, bool)")}.</P>
        <H2>Indexed data</H2>
        <P>
          Public RPCs serve at most 1,000 blocks per log query, so history comes from an index: after each keeper pass the
          hosted {mono("dca-keeper")} function reads every PoincareDCA event since its cursor and writes two public, read-only
          tables.
        </P>
        <Table head={["Table", "One row per", "Main columns"]} rows={[
          [mono("dca_orders"), "Order (latest state)", "order_id, owner, side, status (open · completed · refunded · cancelled), paused, amount_in, spent, refunded, amount_out, fills, slices"],
          [mono("dca_fills"), "Executed slice", "order_id, owner, side, amount_in, amount_out, price, spread_bps, ts, tx_hash"],
        ]} />
        <Callout kind="tip" title="Read order">Read the tables first; ask the chain only for open orders' live verdict and for the newest blocks the index has not reached. That is what the app does.</Callout>
        <P>Running it yourself: see <A href={`${REPO}/blob/main/DCA.md`}>DCA.md</A> for the edge functions, secrets and the pg_cron schedule.</P>
      </>
    ),
  },

  // ------------------------------------------------------------------ Reference
  {
    slug: "contracts",
    group: "Reference",
    title: "Contracts & events",
    lede: "Every address on Unichain Sepolia, and the events PoincareDCA emits.",
    keywords: "addresses explorer abi events hook lens router usdc weth",
    body: () => (
      <>
        <H2>Addresses</H2>
        <Table head={["Contract", "Address (chain 1301)"]} rows={([
          ["Hook", CONTRACTS.hook],
          ["Lens (quotes)", CONTRACTS.lens],
          ["PoincareDCA", CONTRACTS.dca],
          ["v4 router", CONTRACTS.router],
          ["USDC (currency0)", CONTRACTS.usdc],
          ["WETH (currency1)", CONTRACTS.weth],
        ] as const).map(([k, v]) => [k, (
          <a key={k} href={`${EXPLORER}/address/${v}`} target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1" style={{ fontFamily: "var(--font-mono)", fontSize: 13, overflowWrap: "anywhere" }} translate="no">
            {v} <Icon name="external" size={11} aria-hidden="true" />
          </a>
        )])} />
        <H2>PoincareDCA events</H2>
        <Table head={["Event", "Fields"]} rows={([
          ["OrderCreated", "id, owner, zeroForOne, amountIn, slices, interval, startTime, deadline"],
          ["SliceExecuted", "id, slot, amountIn, amountOut, spreadBps, filled, remaining"],
          ["OrderPaused · OrderResumed", "id"],
          ["OrderEdited", "id, slices, interval, startTime, deadline"],
          ["OrderCancelled · OrderExpired", "id, refunded"],
          ["OrderFilled", "id, amountOut"],
          ["KeeperSet", "keeper, allowed"],
        ] as const).map(([a, b]) => [mono(a), b])} />
        <P>Typed ABIs ship in the SDK ({mono("dcaAbi")}, {mono("hookAbi")}, {mono("lensAbi")}). Sources and tests: <A href={REPO}>GitHub</A>.</P>
      </>
    ),
  },
  {
    slug: "safety",
    group: "Reference",
    title: "Safety & limits",
    lede: "What is guaranteed, what is not, and what we learned running it live.",
    keywords: "security audit risks limits testnet",
    body: () => (
      <>
        <Ul>
          <li><B>Testnet, research preview.</B> PoincareDCA is unaudited periphery code. The hook and the Lens it reads were reviewed (SFS-Labs, Olympix).</li>
          <li><B>Funds stay yours.</B> No admin withdrawal exists. Only an order's owner can pause, edit or cancel it; refunds always go to the owner; fills go to the recipient.</li>
          <li><B>Exact approvals.</B> The SDK approves exactly the order budget, never an unlimited allowance.</li>
          <li><B>Explicit gas.</B> Every transaction the SDK builds carries a gas limit; do not rely on estimation for calls through the hook.</li>
          <li><B>Public RPCs lag.</B> Reads can come from a replica a block or two behind. After a transaction, pin decision-making reads to its block, or use your own RPC.</li>
          <li><B>Quotes are for this block.</B> A spread can engage between a quote and a swap that lands later; the router's slippage bound then reverts it.</li>
          <li><B>The deadline is exact.</B> A slice that lands one second late reverts as expired, and the rest is refunded instead.</li>
        </Ul>
        <Callout kind="note" title="Tested live">Every order of the live Unichain Sepolia run was audited against the chain's events: filled plus refunded equals deposited on all of them. Details in <A href={`${REPO}/blob/main/DCA.md`}>DCA.md</A>.</Callout>
      </>
    ),
  },
];

export const GROUPS = [...new Set(PAGES.map((p) => p.group))];
export const pageBySlug = (slug?: string) => PAGES.find((p) => p.slug === slug) ?? PAGES[0];
