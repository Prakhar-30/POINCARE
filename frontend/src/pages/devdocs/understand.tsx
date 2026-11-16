import type { ReactNode } from "react";
import { A, B, Callout, CardGrid, Code, DocLink, H2, H3, P, SiteLink, Steps, Table, Ul } from "./ui";
import { REPO, repoFile } from "./links";
import {
  ArbBarsIllustration, CompareIllustration, EvidenceIllustration, EXAMPLE, FakeTrendIllustration, LoopIllustration,
  RampIllustration, RoundTripIllustration, SidesIllustration, SwapFlowIllustration, SystemMapIllustration, TrendVsChopIllustration,
} from "./understandFigures";

/**
 * "Understand Poincaré": what the platform does, how, and why it is built this way, for a reader
 * who has never seen it. Plain words first, a figure or a worked example for every idea, and a
 * link to the code, the research or the live app wherever a claim can be checked.
 *
 * Every number here is either the deployed configuration (script/DeployPoincareUnichain.s.sol)
 * or a result published in the README; the worked examples are computed, not typed in.
 */

type Page = { slug: string; group: string; title: string; lede: string; keywords?: string; body: () => ReactNode };
const GROUP = "Understand Poincaré";
const mono = (s: string) => <Code>{s}</Code>;
const src = (path: string, label?: string) => <A href={repoFile(path)}>{label ?? path.split("/").pop()}</A>;
const readme = (anchor: string, label: string) => <A href={`${REPO}#${anchor}`}>{label}</A>;
const pct = (x: number, dp = 2) => `${(x * 100).toFixed(dp)}%`;

export const UNDERSTAND_PAGES: Page[] = [
  // ------------------------------------------------------------------------------------------
  {
    slug: "how-it-works",
    group: GROUP,
    title: "How Poincaré works",
    lede: "Poincaré is a Uniswap v4 pool that can tell when the market is trending. While a trend lasts, trades that push with it pay a small extra charge, and the people who supplied the pool's liquidity keep it. Everyone else trades at the normal price.",
    keywords: "explain overview lvr problem idea beginner what is poincare introduction",
    body: () => (
      <>
        <H2>The problem: liquidity providers lose money in trends</H2>
        <P>
          A liquidity pool holds two tokens, say USDC and WETH, and lets anyone swap one for the other. The people who
          deposit those tokens are <B>liquidity providers</B> (LPs), and they earn a fee on every swap.
        </P>
        <P>
          The pool sets its price from its own balances. It does not know the price anywhere else. So when the price of
          WETH rises on other exchanges, the pool is briefly too cheap, and <B>arbitrageurs</B> buy from it until its
          price catches up. Each of those trades takes a little value out of the pool. That loss has a name:{" "}
          <B>loss-versus-rebalancing</B> (LVR).
        </P>
        <Callout kind="note" title="An example">
          WETH goes from $3,000 to $3,300 over an hour, in small steps. At every step the pool is a little behind, and
          at every step someone buys the cheap WETH from it. The LPs end the hour holding less WETH than if they had
          simply kept their tokens, and the difference went to the arbitrageurs.
        </Callout>
        <P>
          A choppy market that moves up and down but goes nowhere costs LPs very little. A market that{" "}
          <B>keeps moving one way</B> is what drains them. A normal pool cannot tell these apart, so it gives the same
          price to the trades that hurt it and the trades that do not.
        </P>

        <H2>The idea</H2>
        <P>Poincaré does three things a normal pool does not.</P>
        <Steps>
          {[
            <><B>It watches its own price.</B> Once per block, it records how much its price moved. No outside price feed is used.</>,
            <><B>It decides whether a real trend has started.</B> A statistical test adds up one-way movement and ignores noise. See <DocLink to="detector">The trend detector</DocLink>.</>,
            <><B>It charges only the trades that push with the trend.</B> They pay a spread of up to 5%, which stays in the pool for LPs. Trades in the other direction, and all trades in calm markets, pay the plain price. See <DocLink to="pricing">The spread and the fee</DocLink>.</>,
          ]}
        </Steps>
        <LoopIllustration />

        <H2>The same trend, in two pools</H2>
        <CompareIllustration />
        <P>
          Poincaré does not remove the loss. LPs still hold both tokens and still feel real market moves. It reduces the
          part that is avoidable: the value that trend-following trades take.
        </P>

        <H2>What is actually deployed</H2>
        <SystemMapIllustration />
        <Table head={["Part", "What it does", "Source"]} rows={[
          ["PoincareHook", "The pool itself: the detector, the pricing and the liquidity", src("src/PoincareHook.sol")],
          ["PoincareLens", "Read-only quotes that match what a swap will really pay", src("src/PoincareLens.sol")],
          ["PoincareDCA", "Orders that buy or sell over time and wait out the spread", src("src/periphery/PoincareDCA.sol")],
          ["Five libraries", "The maths, one job each (price, signal, detector, spread, curve)", <A href={`${REPO}/tree/main/src/libraries`}>src/libraries</A>],
        ]} />
        <P>
          It is live on Unichain Sepolia, a test network: the tokens have no value. Addresses are on the{" "}
          <DocLink to="contracts">Contracts</DocLink> page.
        </P>

        <H2>See it live</H2>
        <Ul>
          <li><SiteLink to="/app?tab=analytics">Analytics</SiteLink> charts the detector block by block, read from the chain.</li>
          <li><SiteLink to="/app?tab=trade">Trade</SiteLink> shows which side pays a spread right now, before you swap. No wallet is needed to look.</li>
          <li><SiteLink to="/app?tab=pool">Pool</SiteLink> shows the liquidity and what LPs have earned from the spread.</li>
        </Ul>

        <H2>Read next</H2>
        <CardGrid items={[
          { to: "detector", title: "The trend detector", body: "How the pool decides a trend is real, with a worked example.", icon: "gauge" },
          { to: "pricing", title: "The spread and the fee", body: "Who pays what, and why the curve keeps one shape.", icon: "curve" },
          { to: "swap-lifecycle", title: "A swap, step by step", body: "What happens inside the hook when you trade.", icon: "swap" },
          { to: "design-choices", title: "Why it is built this way", body: "The choices, the alternatives, the evidence and the limits.", icon: "shield" },
        ]} />
      </>
    ),
  },

  // ------------------------------------------------------------------------------------------
  {
    slug: "detector",
    group: GROUP,
    title: "The trend detector",
    lede: "The detector answers one question: has the price started moving one way for real, or is this just noise? It uses a test called CUSUM, fed only by the pool's own price, and it fires when the evidence is strong enough, not after a fixed wait.",
    keywords: "cusum detector evidence threshold directional efficiency gate sampling explain",
    body: () => (
      <>
        <H2>Step 1: measure the move</H2>
        <P>
          On the first swap of every block, the hook reads its price from its reserves, as they were before that swap,
          and compares it with the price it recorded last time. The result is the block's <B>return</B>: +0.3% means the
          price rose 0.3%.
        </P>
        <P>
          Returns are measured as log-returns, so a 1% move counts the same at $100 as at $4,000, and a rise and a fall
          of the same size weigh the same. Source: {src("src/libraries/PriceLib.sol")}.
        </P>

        <H2>Step 2: add up the evidence</H2>
        <P>
          The detector keeps a running score for each direction. Every block it adds the return and subtracts a small
          allowance for noise, called the slack <B>k</B>. The score can never go below zero.
        </P>
        <Ul>
          <li>Small moves, or moves that reverse, are smaller than the slack. The score stays at zero.</li>
          <li>Moves that keep going one way are bigger than the slack. The score climbs.</li>
          <li>When the score crosses the threshold <B>h</B>, a trend is confirmed.</li>
        </Ul>
        <P>
          This test is called <B>CUSUM</B>. It is a standard tool for spotting a change as early as possible without
          reacting to noise, and it has a proven property (Lorden, 1971): for a given rate of false alarms, it keeps the
          worst-case delay before detecting a real change as short as possible. Source: {src("src/libraries/Cusum.sol")}.
        </P>

        <H3>A worked example</H3>
        <P>
          Six quiet blocks, then ten blocks that each rise 0.3%. The slack is 0.001 (0.1%), so each trending block adds
          0.003 − 0.001 = 0.002 to the score. The threshold is 0.005.
        </P>
        <EvidenceIllustration />
        <Table head={["Block", "Return", "Evidence", "Spread charged"]} rows={EXAMPLE.filter((e) => e.block >= 5 && e.block <= 12).map((e) => [
          String(e.block),
          `${e.r > 0 ? "+" : "−"}${pct(Math.abs(e.r))}`,
          e.s.toFixed(3),
          e.kappa > 0 ? pct(e.kappa) : e.s > 0 ? "none yet" : "none",
        ])} />
        <P>
          The trend starts at block 7. Two blocks later the evidence passes 0.005 and the spread begins, small at first.
          A stronger move would cross sooner and a weaker one later. That is the point of the design: the moment depends
          on the data, so nobody can count blocks and time it.
        </P>

        <H2>Step 3: check that the move is really one-way</H2>
        <P>
          A wild, jumpy market can also build a score without going anywhere. So there is a second check, called{" "}
          <B>directional efficiency</B> (D): how far the price ended up, divided by how much it moved in total.
        </P>
        <TrendVsChopIllustration />
        <P>
          Evidence only becomes a spread while D is at least 0.25. Below that, the pool treats the movement as chop and
          charges nothing. D is tracked as a fading average that gives recent blocks more weight, so there is no fixed
          window an attacker could wait out. Source: {src("src/libraries/DirectionalSignal.sol")}.
        </P>

        <H2>Why once per block, before the swap</H2>
        <Ul>
          <li><B>Once per block:</B> a trade that is reversed within the same block never reaches the detector. To move it, someone has to hold the price across blocks, where arbitrageurs can trade against them.</li>
          <li><B>Before the swap:</B> the trade that triggers the reading cannot influence it.</li>
          <li><B>Capped:</B> one block's return is limited to 20%, so a single freak price cannot swing the score.</li>
        </Ul>

        <H2>The settings in use</H2>
        <Table head={["Setting", "Value", "Meaning"]} rows={[
          ["Slack k", "0.001", "Moves under 0.1% a block count as noise"],
          ["Threshold h", "0.005", "Evidence needed before any spread"],
          ["Evidence cap", "0.02", "The score stops here; the spread is at its maximum"],
          ["Efficiency gate", "0.25", "How one-way the movement must be"],
          ["Memory", "0.9 per block", "How quickly old blocks fade from D and volatility"],
        ]} />
        <P>
          These were measured, not guessed: they were tested one at a time against four years of real ETH/USDC prices.
          The reasoning is in {readme("94-why-the-configuration-changed-and-what-it-was-read-against", "the README, section 9.4")}.
          All of them are fixed when the pool is deployed and cannot be changed afterwards.
        </P>

        <Callout kind="tip" title="Watch it happen">
          <SiteLink to="/app?tab=analytics">Analytics</SiteLink> plots the real evidence against its threshold for every
          sampled block. To read the same numbers in code, see <DocLink to="regime">The regime</DocLink>.
        </Callout>
      </>
    ),
  },

  // ------------------------------------------------------------------------------------------
  {
    slug: "pricing",
    group: GROUP,
    title: "The spread and the fee",
    lede: "Once a trend is confirmed, the pool changes one thing: the price it gives to the side pushing with the trend. The curve itself never changes shape. This page shows who pays what, with numbers, and why it is done this way.",
    keywords: "spread kappa fee curve price control law round trip explain example",
    body: () => (
      <>
        <H2>One curve, always</H2>
        <P>
          Poincaré prices swaps on the same curve as the original Uniswap: the two balances multiplied together stay
          constant ({mono("x · y = k")}). That holds in calm markets and in trends, for buys and for sells. What changes in
          a trend is a <B>spread</B> added on top for one side.
        </P>
        <SidesIllustration />

        <H2>How big is the spread</H2>
        <P>
          It grows with the evidence from <DocLink to="detector">the detector</DocLink>: nothing below the threshold, a
          straight ramp above it, and a hard stop at 5%.
        </P>
        <RampIllustration />
        <P>Source: {src("src/libraries/ControlLaw.sol")}.</P>

        <H2>A worked example</H2>
        <P>
          The pool holds 3,000,000 USDC and 1,000 WETH, so its price is $3,000. You buy WETH with 30,000 USDC. The base
          fee is 0.10% at the time.
        </P>
        <Table head={["Situation", "You receive", "Your price", "Kept by LPs"]} rows={[
          ["Calm market", "9.8912 WETH", "$3,033", "The 30 USDC fee"],
          ["Price rising, spread at its 5% cap", "9.3966 WETH", "$3,193", "The fee, plus 0.4946 WETH (about $1,484)"],
          ["Price falling (you are against the trend)", "9.8912 WETH", "$3,033", "The 30 USDC fee"],
        ]} />
        <P>
          The calm price is above $3,000 because any large trade moves the price, in every pool of this kind. The trend
          spread is the extra on the second row, and it only appears when you are buying into a rise (or selling into a
          fall). The <SiteLink to="/app?tab=trade">Trade</SiteLink> screen shows this split before you confirm.
        </P>
        <Callout kind="tip" title="If you are not in a hurry">
          A <DocLink to="dca-orders">spread-aware DCA order</DocLink> can wait while your side is being charged and fill
          when it is free again.
        </Callout>

        <H2>The base fee</H2>
        <P>
          Every swap also pays a small fee that follows volatility: half of the pool's recent average move per block,
          never more than 0.30%. In a quiet market it is close to zero. Like the spread, it stays in the pool for LPs.
        </P>

        <H2>Why not reshape the curve instead</H2>
        <P>
          The obvious way to lean against a trend is to make the curve steeper in one direction. We built that first,
          and it fails.
        </P>
        <RoundTripIllustration />
        <P>
          A safe version of the two-curve idea was then built and measured against the spread on four years of real
          prices. It lost by about thirty to one, because a steeper curve taxes every trade, including the ordinary
          ones the pool wants. So the curve stays symmetric, and a test in the repository keeps that setting locked off.
          Source: {src("src/libraries/AsymmetricCurve.sol")}, evidence in {src("analysis/OPEN_ITEMS.md", "OPEN_ITEMS.md (E1)")}.
        </P>

        <H2>Rounding</H2>
        <P>
          Every amount is rounded in the pool's favour: fees up, what you receive down. Each rounding is worth less
          than one unit of the smallest token amount, but it means no sequence of swaps can take value out of the pool
          through rounding. A test of 384,000 random operations checks this.
        </P>
      </>
    ),
  },

  // ------------------------------------------------------------------------------------------
  {
    slug: "swap-lifecycle",
    group: GROUP,
    title: "A swap, step by step",
    lede: "What happens between pressing Swap and receiving your tokens: how the hook plugs into Uniswap v4, where the liquidity sits, and why a quote always matches what you get.",
    keywords: "hook beforeSwap pool manager lifecycle liquidity shares lens quote uniswap v4 explain",
    body: () => (
      <>
        <H2>What a hook is</H2>
        <P>
          Uniswap v4 keeps every pool inside one contract, the <B>PoolManager</B>. A pool can name a <B>hook</B>: a
          contract the PoolManager calls at set moments, such as just before a swap. Most hooks adjust a fee. Poincaré
          goes further and <B>replaces the pricing</B>: it works out the swap itself and tells the PoolManager the
          amounts.
        </P>
        <SwapFlowIllustration />

        <H2>The steps</H2>
        <Steps>
          {[
            <>You send a swap through Uniswap's router, exactly as for any v4 pool.</>,
            <>The PoolManager calls the hook's {mono("beforeSwap")}.</>,
            <>If this is the first swap of the block, the hook reads its price and updates <DocLink to="detector">the detector</DocLink>. Later swaps in the block reuse that result.</>,
            <>The hook prices your swap: the base fee, the curve, and the <DocLink to="pricing">spread</DocLink> if you are trading with a confirmed trend.</>,
            <>The hook hands the amounts back. The PoolManager takes your tokens and pays you.</>,
            <>The hook records the new balances in its own books.</>,
          ]}
        </Steps>
        <P>Source: {src("src/PoincareHook.sol")}. The detector costs about 96,000 gas on the first swap of a block and nothing extra after that.</P>

        <H2>Where the liquidity sits</H2>
        <P>
          In a normal v4 pool, LPs choose a price range and hold a position of their own. Here, LPs deposit both tokens
          into the hook and receive <B>shares</B>, an ordinary token. Each share is a claim on the same pot.
        </P>
        <Ul>
          <li><B>Why:</B> the hook prices every swap on its own curve, so liquidity placed the usual way would never be used.</li>
          <li><B>What you gain:</B> fees and spread land in the pot, so every share grows in step. Nothing to claim, no range to manage.</li>
          <li><B>What you give up:</B> you cannot concentrate liquidity in a price range, so each dollar is used less intensively than in a managed v4 position.</li>
        </Ul>
        <P>
          Add or remove liquidity on the <SiteLink to="/app?tab=pool">Pool</SiteLink> screen. An{" "}
          <DocLink to="lp-strategy">example strategy</DocLink> shows how a bot could size a position by regime.
        </P>

        <H2>Why a quote equals what you get</H2>
        <P>
          The detector's calculation lives in one read-only function. A swap runs it and saves the result. A quote runs
          the very same function and saves nothing. Because both use one piece of code, a quote from{" "}
          <B>PoincareLens</B> matches the swap to the smallest unit, even in a new block where nobody has traded yet.
        </P>
        <Callout kind="warning" title="A quote is for one block">
          The spread can change when a new block is sampled. Take the quote and swap in the same block, or set a
          slippage limit, as the app does. Integrators: see {src("INTEGRATING.md")}.
        </Callout>

        <H2>Safety rails inside the hook</H2>
        <Table head={["Rail", "What it prevents"]} rows={[
          ["The hook keeps its own record of its balances", "Someone sending tokens to the hook to shift the price it reads"],
          ["Swaps are blocked while liquidity is being added or removed", "A trade slipping in against half-updated balances"],
          ["The hook accepts one pool, set when it is deployed", "Someone attaching it to a pool of their choosing"],
          ["Extreme prices are clamped or skipped", "The detector making a swap fail"],
          ["1,000 shares are locked for ever at the first deposit", "The first depositor manipulating the share price"],
        ]} />
        <P>
          Most of these came out of the two security reviews. The findings and fixes are listed in{" "}
          {src("SECURITY.md")}, and every code fix has a test that fails without it.
        </P>
      </>
    ),
  },

  // ------------------------------------------------------------------------------------------
  {
    slug: "design-choices",
    group: GROUP,
    title: "Why it is built this way",
    lede: "Every part of Poincaré is a choice against an alternative. This page lists the choices, what was tried instead, the evidence, and the limits that still apply.",
    keywords: "why design decisions alternatives evidence results backtest limits manipulation security reviews",
    body: () => (
      <>
        <H2>The choices</H2>
        <Table head={["We chose", "Instead of", "Because"]} rows={[
          ["The pool's own price", "An outside price feed (oracle)", "A feed adds a party to trust and a delay. The pool's price needs neither."],
          ["A CUSUM test that fires on evidence", "A fixed wait, or a moving average", "A fixed rule can be timed. CUSUM is also proven to be the fastest for a given false-alarm rate."],
          ["A spread for one side", "A higher fee for everyone", "A fee taxes the ordinary trades LPs want. The spread charges only the flow that costs them."],
          ["One curve plus a spread", "A different curve per direction", "Two curves can be drained by a round trip, and lost by about 30 to 1 when measured."],
          ["One reading per block, before the swap", "A reading on every swap", "A move reversed inside one block never counts."],
          ["Settings fixed at deployment, no admin", "Settings an owner can change", "Nobody can move the limits that protect LPs, including us."],
          ["Liquidity held by the hook", "Uniswap's usual positions", "The hook does the pricing, so only liquidity it holds is used."],
        ]} />

        <H2>What if someone fakes a trend</H2>
        <FakeTrendIllustration />
        <P>
          Three things work together. The firing moment cannot be predicted. The side that is not charged gets the
          plain price and never a discount, so there is no prize to collect. And moving the real price is expensive,
          because arbitrageurs trade against it. The attack simulations are in{" "}
          <A href={`${REPO}/tree/main/test/manipulation`}>test/manipulation</A>.
        </P>
        <Callout kind="note" title="What this does not claim">
          The design raises the cost of manipulation and limits what it can gain. It does not claim manipulation is
          impossible.
        </Callout>

        <H2>The evidence</H2>
        <P>All of these are back-tests on historical or simulated prices, not live trading results.</P>
        <ArbBarsIllustration />
        <Table head={["Study", "Result"]} rows={[
          [<>Four years of real ETH/USDC, a $2M position. {readme("93-four-years-of-real-ethusdc", "README 9.3")}</>, "LPs finish $185,167 ahead of a normal 30 bps pool, and ahead in each of the four years. Arbitrageurs take 32% less."],
          [<>Twelve months, against a volatility fee that costs traders the same. {readme("91-against-real-market-data-12-months-of-ethusdc", "README 9.1")}</>, "The volatility fee cuts measured LVR more (5.66% against 4.67%). Poincaré keeps 45% more value for LPs."],
          [<>A stress test built from trends, a flash crash and whipsaw. {readme("9-proof-a-wethusdc-stress-simulation-on-a-sepolia-v4-fork", "README 9")}</>, "About 50% less LVR than a plain pool, averaged over five runs. This path is made of trends, so it flatters the design."],
        ]} />
        <P>
          The second row is there on purpose. On one measure a simpler design wins, and the README says so. Three more
          elaborate mechanisms were also built and tested, and none beat the current one.
        </P>

        <H2>Reviews</H2>
        <Ul>
          <li><B>Olympix</B>, sponsored by the Uniswap Foundation Security Fund: nine findings, none high, all fixed.</li>
          <li><B>SFS-Labs</B>, an independent scoped review: no critical, high or medium issues; two low findings and eight notes, the lows fixed.</li>
        </Ul>
        <P>Neither is a full audit. Details: {src("SECURITY.md")} and {readme("11-security-review", "README 11")}.</P>

        <H2>Limits you should know</H2>
        <Ul>
          <li><B>Testnet only.</B> Nothing here holds real funds yet, and the activity on the live pool is a demonstration.</li>
          <li><B>The DCA contract has not been reviewed.</B> The hook and the Lens were; PoincareDCA is newer.</li>
          <li><B>The studies use 4-hour prices.</B> The hook reads every block. The 5% cap in particular should be re-checked at block speed.</li>
          <li><B>Liquidity is full-range.</B> It is less capital-efficient than a concentrated position.</li>
          <li><B>A self-tuning mode exists but is switched off</B> until its worst case is worked out.</li>
        </Ul>
        <P>The full list of open items, including the closed ones and why: {src("analysis/OPEN_ITEMS.md", "OPEN_ITEMS.md")}.</P>

        <H2>Go deeper</H2>
        <CardGrid items={[
          { to: "regime", title: "The regime, in code", body: "Read the detector's state from the SDK, the API or an agent.", icon: "wave" },
          { to: "dca-orders", title: "Spread-aware DCA", body: "Orders that use the detector to avoid the spread.", icon: "layers" },
          { to: "contracts", title: "Contracts", body: "Addresses and the functions worth knowing.", icon: "lock" },
          { to: "safety", title: "Safety", body: "What the tools can and cannot do with your funds.", icon: "shield" },
        ]} />
        <P>
          For the full argument, with the mathematics, read the <A href={`${REPO}#readme`}>README</A>. For a five-minute
          tour of what to verify, read {src("REVIEWERS.md")}.
        </P>
      </>
    ),
  },
];
