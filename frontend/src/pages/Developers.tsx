import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon } from "@/components/ui/Icon";
import { CONTRACTS, EXPLORER } from "@/config/contracts";
import { shorten } from "@/lib/format";

/**
 * Developer docs: the SDK, the MCP server and the HTTP API on one page, with the concepts they
 * share (regime, DCA orders, statuses, keeper). Static content only; every name and default here
 * mirrors packages/ (sdk, mcp, api) and PoincareDCA.sol, so keep them in step when those change.
 */

const REPO = "https://github.com/Prakhar-30/POINCARE";
const API_BASE = "https://gogjpdgluflntcgsarhn.supabase.co/functions/v1/poincare-api";
const WIDTH = 1200;

const SECTIONS = [
  { id: "start", label: "Start here" },
  { id: "concepts", label: "Concepts" },
  { id: "sdk", label: "TypeScript SDK" },
  { id: "mcp", label: "MCP for agents" },
  { id: "api", label: "HTTP API" },
  { id: "keeper", label: "Keeper" },
  { id: "safety", label: "Safety & limits" },
] as const;

export function Developers() {
  const active = useActiveSection(SECTIONS.map((s) => s.id));
  useEffect(() => {
    const prev = document.title;
    document.title = "Developers · Poincaré: SDK, MCP and HTTP API";
    window.scrollTo({ top: 0 });
    return () => void (document.title = prev);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--page)", color: "var(--text)" }}>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <TopBar />

      <header className="mx-auto px-4 sm:px-6 pt-12 md:pt-16" style={{ maxWidth: WIDTH + 48 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "var(--lav-ink)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Developers</p>
        <h1 className="font-display mt-3" style={{ fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1.05, fontWeight: 700, letterSpacing: "-0.02em", maxWidth: "18ch" }}>
          Build on the trend detector.
        </h1>
        <p className="mt-4" style={{ fontSize: 18, lineHeight: 1.55, color: "var(--text-2)", maxWidth: "40rem" }}>
          Read the pool's regime, quote exactly what the router will execute, and run spread-aware DCA orders, from
          TypeScript, from an AI agent, or over plain HTTP. No API keys, no oracle: everything is read from the live
          pool on Unichain Sepolia.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <EntryCard id="sdk" title="TypeScript SDK" body="@poincare/sdk · one client for regime, quotes and DCA orders, with unsigned transactions for any signer." />
          <EntryCard id="mcp" title="MCP server" body="15 tools for Claude and any MCP client. Unsigned by default; sends only with your key and send: true." />
          <EntryCard id="api" title="HTTP API" body="Stateless JSON over HTTPS. Reads from the chain, returns unsigned transactions, never holds keys." />
        </div>
      </header>

      <div className="mx-auto px-4 sm:px-6 py-12 lg:grid lg:gap-12" style={{ maxWidth: WIDTH + 48, gridTemplateColumns: "200px minmax(0, 1fr)" }}>
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky" style={{ top: 92 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>On this page</p>
            <ul className="flex flex-col" style={{ gap: 2 }}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => jump(s.id)} aria-current={active === s.id ? "location" : undefined}
                    className="w-full text-left rounded-lg px-3"
                    style={{ minHeight: 34, fontSize: 14, fontWeight: active === s.id ? 800 : 600, cursor: "pointer",
                      color: active === s.id ? "var(--lav-ink)" : "var(--text-3)", background: active === s.id ? "var(--lav-soft)" : "transparent" }}>
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <main id="main" tabIndex={-1} className="min-w-0 flex flex-col" style={{ gap: 64, outline: "none" }}>
          <Start />
          <Concepts />
          <Sdk />
          <Mcp />
          <Api />
          <Keeper />
          <Safety />
        </main>
      </div>

      <footer className="mx-auto px-4 sm:px-6 pb-10" style={{ maxWidth: WIDTH + 48 }}>
        <div className="pt-6 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-3)" }}>
          <span>Unichain Sepolia testnet · research preview · test tokens carry no value.</span>
          <span>PoincareDCA is unaudited periphery code; the hook and Lens it reads were reviewed.</span>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// sections

function Start() {
  const rows: [string, string][] = [
    ["Hook", CONTRACTS.hook],
    ["Lens (quotes)", CONTRACTS.lens],
    ["PoincareDCA", CONTRACTS.dca],
    ["v4 router", CONTRACTS.router],
    ["USDC (currency0)", CONTRACTS.usdc],
    ["WETH (currency1)", CONTRACTS.weth],
  ];
  return (
    <Section id="start" title="Start here">
      <P>
        Three conventions hold everywhere: prices are <B>USDC per WETH</B>, so "up" means the chart goes up;
        <Code>buy</Code> pays USDC for WETH and <Code>sell</Code> pays WETH for USDC; amounts are decimal strings in the
        input token ("100" USDC, "0.05" WETH), and on-chain values come back as bigints (decimal strings over HTTP).
      </P>
      <H3>Network</H3>
      <Table head={["Contract", "Address (Unichain Sepolia, chain 1301)"]}
        rows={rows.map(([k, v]) => [k, <a key={k} href={`${EXPLORER}/address/${v}`} target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }} translate="no">{v} <Icon name="external" size={11} aria-hidden="true" /></a>])} />
      <H3>Get the packages</H3>
      <P>
        The packages are not on npm yet. They live in <Code>packages/</Code> of the{" "}
        <A href={REPO}>repository</A>; build them once:
      </P>
      <CodeBlock lang="sh" code={`git clone ${REPO}.git && cd POINCARE/packages
pnpm install
pnpm check        # builds, type-checks and tests sdk, mcp and api`} />
      <P>Test tokens for trying it out: the app's faucet gives 50,000 USDC and 20 WETH per claim.</P>
    </Section>
  );
}

function Concepts() {
  return (
    <Section id="concepts" title="Concepts">
      <H3>The regime</H3>
      <P>
        The hook runs a two-sided CUSUM detector on the pool's own price. When the evidence for a trend crosses its
        threshold (a data-dependent moment, not a fixed block count) and the moves are directional enough, swaps that
        push <I>with</I> the trend pay a spread of up to 5% that stays with liquidity providers. The other side pays
        the plain pool price.
      </P>
      <Table head={["Field", "Meaning"]} rows={[
        [<Code key="t">trend</Code>, "none · up · down, in market terms (up = price rising)"],
        [<Code key="l">level</Code>, "calm (no evidence) · building (evidence accumulating, or a trend whose spread is gated) · engaged (a side pays now)"],
        [<Code key="w">withTrendSide</Code>, "The side pushing with the trend: buy in an up-trend, sell in a down-trend"],
        [<Code key="c">chargedSide</Code>, "The side that pays a spread in this block, if any"],
        [<Code key="s">spread</Code>, "{ buy, sell } as fractions (0.0431 = 4.31%), projected for this block"],
        [<Code key="e">evidence</Code>, "{ up, down, threshold, progress }: progress 1 means the threshold is crossed"],
      ]} />

      <H3>Spread-aware DCA</H3>
      <P>
        A DCA order escrows its whole budget in <Code>PoincareDCA</Code> and swaps it in slices, one per interval. A
        keeper submits each slice; the contract re-checks the order's rules in the same transaction, so a keeper can
        only fill a slice the rules allow and the output goes straight to the order's recipient. The Poincaré part is
        the <B>protection</B>: whether a slice may pay the trend spread.
      </P>
      <Table head={["Protection", "maxSpreadBps", "pauseOnTrend", "Behaviour"]} rows={[
        ["Spread guard (default)", "0", "false", "Never pays the spread: a slice that would pay it waits, and later slices catch up"],
        ["Trend pause", "0", "true", "Also waits while a trend runs with the order's side, before any spread is charged"],
        ["Always fill", "10000", "false", "Fills every slot whatever the spread, like a plain exchange DCA"],
      ]} />
      <P>
        <B>Catch-up</B> (on by default) grows later slices so the order still completes by its deadline after held or
        missed slots. A slot only counts if it opens strictly before the deadline, and the default deadline gives the
        last slice a full interval. An optional <B>limit price</B> (the most a buy pays, the least a sell accepts) and
        a per-slice <B>slippage</B> bound against the in-transaction quote complete the rules.
      </P>

      <H3>Order status</H3>
      <P>The contract's verdict on the next slice (<Code>canExecute</Code>), checked in this order:</P>
      <Table head={["Status", "Code", "Meaning"]} rows={[
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
      ].map(([a, b, c]) => [<Code key={a}>{a}</Code>, b, c])} />

      <H3>Managing an order</H3>
      <Table head={["Action", "Who", "Effect"]} rows={[
        [<Code key="p">pause / resume</Code>, "Owner", "Hold and release fills. A paused order can still be cancelled or refunded"],
        [<Code key="e">editOrder</Code>, "Owner", "Re-plan the REMAINING budget from now: slices, interval, start, deadline and every rule. Side, recipient and budget are fixed; a paused order stays paused"],
        [<Code key="c">cancel</Code>, "Owner", "Refund what is left at once"],
        [<Code key="x">closeExpired</Code>, "Anyone", "After the deadline, refund what is left to the owner (never to the caller)"],
        [<Code key="s">executeSlice</Code>, "Keeper or owner", "Fill the current slot's slice if the contract says ready"],
      ]} />
      <P>
        Every order records <Code>amountIn</Code> (deposited), <Code>remaining</Code>, <Code>refunded</Code> and{" "}
        <Code>amountOut</Code>, so what was swapped is <Code>amountIn − remaining − refunded</Code> from the order alone.
      </P>
    </Section>
  );
}

function Sdk() {
  return (
    <Section id="sdk" title="TypeScript SDK" lead="@poincare/sdk · viem-based, ESM, fully typed">
      <P>One client covers everything. Reads need no wallet; pass a viem <Code>walletClient</Code> only to send.</P>
      <CodeBlock lang="ts" code={`import { createPoincareClient } from "@poincare/sdk";

const poincare = createPoincareClient();            // live Unichain Sepolia deployment, public RPC
// createPoincareClient({ rpcUrl, publicClient, walletClient, deployment })

const r = await poincare.regime();
// { trend: "down", level: "engaged", withTrendSide: "sell", chargedSide: "sell",
//   spread: { buy: 0, sell: 0.0431 }, evidence: { up, down, threshold, progress },
//   price: 2307.63, fee: 0.003, ... }

const q = await poincare.quote("buy", "100");       // 100 USDC -> WETH, matches the router to the wei
// { amountIn, amountOut, price, spread, fee }`} />

      <H3>Watch for trend onsets</H3>
      <CodeBlock lang="ts" code={`const stop = poincare.watchRegime({
  onEvent: (e) => {
    // trend-started | trend-ended | trend-flipped | evidence-building | spread-engaged | spread-released
    if (e.type === "spread-engaged") console.log(\`\${e.side}s now pay \${(e.spread * 100).toFixed(2)}%\`);
  },
});
const samples = await poincare.history(fromBlock);  // the hook's DetectorSample trace`} />

      <H3>Open a DCA order</H3>
      <P>
        <Code>recurringOrder</Code> and <Code>twapOrder</Code> describe plans the way exchanges do; both default to the
        spread guard. <Code>create</Code> approves exactly the budget (never an unlimited allowance) and resolves to the
        order id.
      </P>
      <CodeBlock lang="ts" code={`import { createPoincareClient, recurringOrder, twapOrder } from "@poincare/sdk";

const poincare = createPoincareClient({ walletClient });   // a viem WalletClient with an account

// 100 USDC of WETH every hour, 10 times, never paying the trend spread
const id = await poincare.dca.create(
  recurringOrder({ side: "buy", amountPerBuy: "100", frequency: "1h", count: 10, protection: "spread-guard" }),
);

// Sell 2 WETH evenly over 4 hours (a slice every ~5 minutes), with a floor price
await poincare.dca.create(twapOrder({ side: "sell", total: "2", durationSec: 14_400, limitPrice: "2200" }));

// Or every field by hand (validated exactly like the contract, same reason strings)
await poincare.dca.create({ side: "buy", amount: "1000", slices: 6, interval: 3600, maxSpreadBps: 25, pauseOnTrend: true });`} />

      <H3>Follow and manage it</H3>
      <CodeBlock lang="ts" code={`const o = await poincare.dca.order(id);       // DcaOrder: filled, remaining, refunded, amountOut, paused, ...
const next = await poincare.dca.preview(id);  // { status: "spread-too-high", amountIn, quoteOut, minOut, spreadBps, nextSlotAt }

await poincare.dca.pause(id);
await poincare.dca.edit(id, { slices: 12, interval: 1800, limitPrice: null });  // re-plan what is left; null removes the limit
await poincare.dca.resume(id);
await poincare.dca.cancel(id);                // refund the rest now`} />

      <H3>Sign elsewhere</H3>
      <P>
        Every write also exists unsigned under <Code>dca.build</Code>: <Code>{"{ to, data, value, gas, description }"}</Code>,
        ready for a browser wallet, a multisig or an agent. Each carries an explicit gas limit, because testnet gas
        estimation mis-simulates calls that run through the hook.
      </P>
      <CodeBlock lang="ts" code={`const txs = await poincare.dca.build.create(owner, input);   // [approve (if needed), createOrder]
const tx  = poincare.dca.build.pause(id);                    // also: execute, cancel, closeExpired, resume
const edit = await poincare.dca.build.edit(id, { slices: 8 });`} />

      <H3>Reference</H3>
      <Table head={["Export", "What it is"]} rows={[
        [<Code key="1">createPoincareClient</Code>, "regime, watchRegime, history, quote, and dca.{order, ordersOf, openOrderIds, preview, create, execute, pause, resume, edit, cancel, closeExpired, build.*}"],
        [<Code key="2">recurringOrder · twapOrder</Code>, "Plan builders; FREQUENCIES 5m 15m 1h 4h 1d 1w; PROTECTIONS spread-guard · trend-pause · always"],
        [<Code key="3">buildOrderParams · buildEditParams</Code>, "Validate like createOrder / editOrder; throw DcaParamError with the contract's reason"],
        [<Code key="4">planSlice · sliceAmount · slotInfo</Code>, "Offline mirror of the contract's slice rules"],
        [<Code key="5">spentOf · progressOf · statusOf</Code>, "Order helpers; DCA_STATUS_TEXT explains every status"],
        [<Code key="6">readRegime · diffRegime · trendOnsets</Code>, "Lower-level regime reads and event diffing"],
        [<Code key="7">build*Tx · sendTx · DCA_GAS</Code>, "Unsigned transactions with explicit gas, and a sender that fails loudly on a revert"],
        [<Code key="8">hookAbi · lensAbi · dcaAbi · erc20Abi</Code>, "Typed ABIs generated from the contracts"],
        [<Code key="9">UNICHAIN_SEPOLIA · withDca</Code>, "The live deployment, and a helper to point at another PoincareDCA"],
      ]} />
    </Section>
  );
}

function Mcp() {
  return (
    <Section id="mcp" title="MCP server for AI agents" lead="@poincare/mcp · stdio · 15 tools">
      <P>
        Give Claude (or any MCP client) the regime, quotes and DCA orders as tools. Out of the box it reads and
        returns <B>unsigned</B> transactions; nothing is ever sent unless you add a key and the agent calls a tool with{" "}
        <Code>send: true</Code>.
      </P>
      <H3>Claude Code</H3>
      <CodeBlock lang="sh" code={`pnpm --dir packages/mcp build
claude mcp add poincare -- node /absolute/path/to/packages/mcp/dist/index.js`} />
      <H3>Claude Desktop and other clients</H3>
      <CodeBlock lang="json" code={`{
  "mcpServers": {
    "poincare": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"],
      "env": {
        "POINCARE_RPC_URL": "https://sepolia.unichain.org",
        "POINCARE_PRIVATE_KEY": ""
      }
    }
  }
}`} />
      <P>
        <Code>POINCARE_PRIVATE_KEY</Code> is optional: with it, write tools called with <Code>send: true</Code> broadcast
        from that key, and owner-only tools refuse orders it does not own. Use a testnet key you are happy to delegate.{" "}
        <Code>POINCARE_DCA_ADDRESS</Code> overrides the live PoincareDCA.
      </P>
      <Table head={["Tool", "Does", "Writes"]} rows={[
        ["get_regime", "Trend, evidence and who pays, as one plain-English line plus the data", "–"],
        ["get_regime_history", "Detector samples and trend onsets over recent blocks", "–"],
        ["wait_for_regime_change", "Waits until a trend starts, ends or flips, or the spread engages", "–"],
        ["quote", "Exact-input quote with this side's spread and fee", "–"],
        ["dca_plan_order", "Validates an order like the contract; says what its first fill would do now", "–"],
        ["dca_create_order", "Approve + createOrder", "yes"],
        ["dca_get_order · dca_list_orders · dca_preview_slice", "Order state and the contract's verdict on the next fill", "–"],
        ["dca_pause_order · dca_resume_order · dca_edit_order", "Owner controls; edit re-plans what is left", "yes"],
        ["dca_execute_slice · dca_cancel_order · dca_close_expired", "Fill now (refused unless ready), cancel, refund after the deadline", "yes"],
      ].map(([a, b, c]) => [<Code key={a}>{a}</Code>, b, c])} />
      <H3>Try asking</H3>
      <ul className="flex flex-col" style={{ gap: 6, fontSize: 15, color: "var(--text-2)", paddingLeft: 18, listStyle: "disc" }}>
        <li>"Is the Poincaré pool trending right now, and which side pays?"</li>
        <li>"Plan a DCA that buys 500 USDC of WETH over a day without ever paying the trend spread."</li>
        <li>"Wait for the next trend onset, then tell me the spread."</li>
        <li>"Pause my DCA order 4 and stretch what is left over the next 12 hours."</li>
      </ul>
    </Section>
  );
}

function Api() {
  return (
    <Section id="api" title="HTTP API" lead="Stateless JSON · no keys · unsigned transactions">
      <P>
        Every answer is read from the chain at request time, and every write comes back as unsigned transactions for
        your own wallet to sign. The API never holds keys or funds. Bigints are decimal strings.
      </P>
      <CodeBlock lang="sh" code={`BASE=${API_BASE}

curl "$BASE/regime"
curl "$BASE/quote?side=sell&amount=0.5"
curl -X POST "$BASE/dca/plan" -H 'content-type: application/json' \\
  -d '{"side":"buy","amount":"1000","slices":10,"intervalSec":3600,"maxSpreadBps":0}'`} />
      <Table head={["Method", "Path", "Returns"]} rows={[
        ["GET", "/health", "Chain, latest block, the PoincareDCA address"],
        ["GET", "/regime", "The regime and a one-line summary"],
        ["GET", "/regime/history?blocks=3000", "Detector samples and trend onsets (100 to 20,000 blocks)"],
        ["GET", "/quote?side=buy&amount=100", "Exact-input quote with spread and fee"],
        ["GET", "/dca/orders?owner=0x…", "An address's orders, each with spent, progress and next-fill status"],
        ["GET", "/dca/orders/:id", "One order and the contract's verdict on its next fill"],
        ["POST", "/dca/plan", "Validates an order and previews its first fill"],
        ["POST", "/dca/tx/create", "Unsigned approve + createOrder ({ owner, side, amount, slices, intervalSec, … })"],
        ["POST", "/dca/tx/pause · /resume", "Unsigned tx ({ id }); 409 if already in that state"],
        ["POST", "/dca/tx/edit", "Unsigned editOrder ({ id, slices?, intervalSec?, durationSec?, maxSpreadBps?, pauseOnTrend?, catchUp?, maxSlippageBps?, limitPrice? (null removes) })"],
        ["POST", "/dca/tx/execute", "Unsigned executeSlice; 409 while the fill would be held"],
        ["POST", "/dca/tx/cancel · /close-expired", "Unsigned tx; 409 if the order is closed or not yet expired"],
      ].map(([m, p, r]) => [<Code key={p}>{m}</Code>, <Code key={p + "p"}>{p}</Code>, r])} />
      <P>
        Order fields in POST bodies match the SDK: <Code>side</Code>, <Code>amount</Code> (decimal string),{" "}
        <Code>slices</Code>, <Code>intervalSec</Code>, and optionally <Code>startTime</Code>, <Code>deadline</Code>,{" "}
        <Code>maxSpreadBps</Code>, <Code>pauseOnTrend</Code>, <Code>catchUp</Code>, <Code>maxSlippageBps</Code>,{" "}
        <Code>limitPrice</Code>, <Code>recipient</Code>.
      </P>
      <Table head={["Status", "When"]} rows={[
        ["400", "Bad input; invalid orders add reason, the contract's own (e.g. \"deadline\", \"interval\")"],
        ["404", "No such order or route"],
        ["409", "The action would revert now: held fill, closed order, not yet expired, already paused"],
        ["502", "The upstream RPC failed; retry"],
        ["503", "The DCA contract is not configured on this deployment"],
      ].map(([a, b]) => [<Code key={a}>{a}</Code>, b])} />
    </Section>
  );
}

function Keeper() {
  return (
    <Section id="keeper" title="Keeper">
      <P>
        A keeper is any allowlisted address that calls <Code>executeSlice</Code> when the contract says a slice is ready,
        and <Code>closeExpired</Code> for orders past their deadline. It cannot do anything else: no withdrawals, no
        edits, and the contract re-checks every rule in the fill itself. The order's owner can always fill their own
        slices too, so orders never depend on one keeper.
      </P>
      <CodeBlock lang="ts" code={`import { makeKeeper } from "@poincare/api";

const pass = makeKeeper({ dcaAddress, privateKey: process.env.KEEPER_PRIVATE_KEY!, maxTx: 20 });
const run = await pass();
// { checked, executed: [{ id, amountIn, spreadBps }], refunded, held: { "spread-too-high": 2, paused: 1 }, deferred }`} />
      <P>
        The hosted keeper is a Supabase edge function (<Code>dca-keeper</Code>) called every minute by pg_cron with a
        shared secret; see <A href={`${REPO}/blob/main/DCA.md`}>DCA.md</A> for the runbook. The contract owner adds or
        removes keepers with <Code>setKeeper(address, bool)</Code>.
      </P>
    </Section>
  );
}

function Safety() {
  return (
    <Section id="safety" title="Safety & limits">
      <ul className="flex flex-col" style={{ gap: 10, fontSize: 15, lineHeight: 1.6, color: "var(--text-2)", paddingLeft: 18, listStyle: "disc" }}>
        <li><B>Testnet, research preview.</B> PoincareDCA is unaudited periphery code. The hook and the Lens it reads were reviewed (SFS-Labs, Olympix).</li>
        <li><B>Funds stay yours.</B> No admin withdrawal exists. Only an order's owner can pause, edit or cancel it; refunds always go to the owner; fills go to the recipient.</li>
        <li><B>Exact approvals.</B> The SDK approves exactly the order budget, never an unlimited allowance.</li>
        <li><B>Explicit gas.</B> Every transaction the SDK builds carries a gas limit; do not rely on estimation for calls through the hook.</li>
        <li><B>Public RPCs lag.</B> Reads can come from a replica a block or two behind. After a transaction, pin decision-making reads to its block (the SDK does this for allowances), or use your own RPC.</li>
        <li><B>Quotes are for this block.</B> A spread can engage between a quote and a swap that lands a block later, and the router's slippage bound then reverts it. DCA slices quote and swap in the same transaction, so they never see this gap.</li>
        <li><B>The deadline is exact.</B> A slice that lands one second past the deadline reverts as expired, and the rest is refunded instead.</li>
      </ul>
      <p style={{ fontSize: 14, color: "var(--text-3)" }}>
        Source, tests and the strategy write-up: <A href={REPO}>GitHub</A> · PoincareDCA{" "}
        <A href={`${EXPLORER}/address/${CONTRACTS.dca}`}>{shorten(CONTRACTS.dca)}</A>
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------------
// pieces

function TopBar() {
  return (
    <nav aria-label="Main" className="sticky top-0 z-50" style={{ background: "var(--nav-bg)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--nav-border)" }}>
      <div className="mx-auto flex items-center gap-3 px-4 sm:px-6" style={{ maxWidth: WIDTH + 48, height: 68 }}>
        <Link to="/" aria-label="Poincaré home" className="flex items-center gap-2.5 shrink-0 rounded-xl" style={{ minHeight: 44 }}>
          <Mark size={30} decorative />
          <span className="font-display hidden min-[380px]:inline" style={{ fontWeight: 700, fontSize: 18, color: "var(--lp-head)", letterSpacing: "-0.01em" }}>Poincaré</span>
        </Link>
        {/* phones keep the mark and the actions; the crumb would push "Launch app" off the edge */}
        <span aria-hidden="true" className="hidden sm:inline" style={{ color: "var(--border-strong)" }}>/</span>
        <span className="hidden sm:inline" style={{ fontSize: 15, fontWeight: 700, color: "var(--text-2)" }}>Developers</span>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <a href={REPO} target="_blank" rel="noreferrer" className="link-quiet hidden sm:inline-flex items-center gap-1.5 rounded-full px-3" style={{ minHeight: 40, fontSize: 15, fontWeight: 700 }}>
            GitHub <Icon name="external" size={13} aria-hidden="true" />
          </a>
          <ThemeToggle />
          <Link to="/app" className="btn btn-sm lp-btn-ink">Launch app</Link>
        </div>
      </div>
    </nav>
  );
}

function EntryCard({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <button type="button" onClick={() => jump(id)} className="card text-left flex flex-col" style={{ padding: "16px 18px", gap: 6, cursor: "pointer" }}>
      <span className="flex items-center justify-between gap-2 font-display" style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
        {title} <Icon name="arrowRight" size={15} aria-hidden="true" style={{ color: "var(--lav-ink)" }} />
      </span>
      <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-3)" }}>{body}</span>
    </button>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col" style={{ gap: 14, scrollMarginTop: 88 }}>
      <div>
        <h2 id={`${id}-title`} tabIndex={-1} className="font-display" style={{ fontSize: "clamp(26px, 3vw, 32px)", fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.15, outline: "none" }}>{title}</h2>
        {lead && <p className="mt-1" style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{lead}</p>}
      </div>
      {children}
    </section>
  );
}

const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className="font-display mt-3" style={{ fontSize: 19, fontWeight: 700, color: "var(--text)" }}>{children}</h3>
);
const P = ({ children }: { children: ReactNode }) => (
  <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text-2)", maxWidth: "72ch" }}>{children}</p>
);
const B = ({ children }: { children: ReactNode }) => <b style={{ color: "var(--text)", fontWeight: 700 }}>{children}</b>;
const I = ({ children }: { children: ReactNode }) => <em>{children}</em>;
const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--lav-ink)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>{children}</a>
);
const Code = ({ children }: { children: ReactNode }) => (
  <code translate="no" style={{ fontFamily: "var(--font-mono)", fontSize: "0.88em", padding: "1px 6px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)", whiteSpace: "nowrap" }}>{children}</code>
);

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  };
  return (
    <div className="relative rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-4" style={{ minHeight: 36, borderBottom: "1px solid var(--divider)" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{lang}</span>
        <button type="button" onClick={() => void copy()} className="link-quiet inline-flex items-center gap-1 rounded-md px-2" style={{ minHeight: 32, fontSize: 12, fontWeight: 800 }}
          aria-label={copied ? "Copied" : `Copy ${lang} code`}>
          <Icon name={copied ? "check" : "copy"} size={13} aria-hidden="true" /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto" style={{ margin: 0, padding: "14px 16px", fontSize: 13, lineHeight: 1.6 }}>
        <code translate="no" style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{code}</code>
      </pre>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
      <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            {head.map((h) => (
              <th key={h} scope="col" className="text-left" style={{ padding: "9px 14px", fontSize: 12, fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--divider)" }}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: "9px 14px", verticalAlign: "top", lineHeight: 1.5, color: j === 0 ? "var(--text)" : "var(--text-2)", fontWeight: j === 0 ? 700 : 400 }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const jump = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
};

/** The section nearest the top of the viewport, for the table of contents. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -60% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}
