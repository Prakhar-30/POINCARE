# Poincaré — 5-minute demo video script

Spoken content is **696 words**. At 160 wpm — a normal pitch pace, not rushed — that is
**4:21**, landing around **4:35** once you add a beat on each slide change and the cuts in and
out of the demo. At a slower 150 wpm it is 4:38 spoken, ~4:52 total, which is uncomfortably
close to the cap.

**So: do one timed read-through before you record.** If you land past 4:50, apply trim #1 at the
bottom of this file — it takes ~9s out and costs you nothing.

Judging rules require a human voice, so every word below is for you to read aloud.

Deck: `pitch/poincare-uhi10-deck.html` — arrow keys to advance, **or type a slide number to
jump**. You need the jump: the video skips slides 6, 11 and 12.

---

## Running order

| Time | Segment | Slides |
|---|---|---|
| 0:00 – 1:54 | Presentation, part 1 | 1 → 2 → 3 → 4 → 5 → **press 7** |
| 1:54 – 3:15 | Live demo (screen capture) | — |
| 3:15 – 4:40 | Presentation, part 2 | **press 8** → 9 → 10 → **press 13** |

**Skipped on camera:** slide 6 (the demo covers it), 11 (folded into slide 5), 12 (folded into
the close). They stay in the deck for judges who read it rather than watch.

---

# PART 1 — PRESENTATION (0:00 – 1:54)

### Slide 1 · Title — 0:00–0:15

> Hi, I'm Prakhar. This is Poincaré — a Uniswap v4 hook that watches its own price, works out
> when a trend is *actually* real, and leans its curve against it.
>
> No oracle. No keeper. Nothing to bribe.

---

### Slide 2 · The problem — 0:15–0:41

> LPs don't lose money because markets are volatile. They lose it because markets have
> *direction*.
>
> These two paths take identical step sizes — only the order of the signs differs. The one
> that chops ends where it started and barely leaks. The one that trends is arbitraged the
> whole way.
>
> That's loss-versus-rebalancing. And the fee isn't in that equation — which is the lever
> most hooks pull.

---

### Slide 3 · The engine — 0:41–1:16

> So the real question is: *has a genuine trend started?*
>
> Statisticians solved that in 1954. It's called quickest change detection, and the answer is
> CUSUM. It accumulates evidence every block and fires when that evidence crosses a threshold.
>
> Watch it. Noise never gets there. A real trend crosses fast — then it resets and has to earn
> the next one.
>
> And it's Lorden-optimal: provably the best trade-off between reacting fast and being fooled.
> We scanned all 562 hooks in the UHI directory. Zero use change-point detection.

*Your Original Idea slide — 30% of the score. Don't rush it. Let the chart finish growing
before you start.*

---

### Slide 4 · The design — 1:16–1:32

> Three parts. A CUSUM brain that samples once per block from *pre-swap* reserves, so a flash
> loan that unwinds inside a block is invisible to it. A curve that acts. And a fee built from
> the pool's own realised volatility — every parameter calibrated, never hard-coded.

---

### Slide 5 · The actuator — 1:32–1:54

> Here's the part I'm proudest of. The obvious design is different curve *depth* per direction.
> We built that — and found a round trip that drains the pool.
>
> So we rewrote it as a one-sided spread on a symmetric base. Toxic flow pays. Stabilising flow
> pays exactly the constant-product price.
>
> So there's no prize waiting for an attacker. Faking a trend is negative-EV by construction.

*Press `7`.*

---

### Slide 7 · Demo hand-off — 1:54–1:58

> That's the idea. Here it is running on Unichain Sepolia.

*Cut to screen capture.*

---

# PART 2 — LIVE DEMO (1:54 – 3:15, about 80 seconds)

## Before you hit record

The detector needs a **sustained, monotonic move sampled once per block** to fire. You cannot
produce that by hand-clicking swaps in 80 seconds. Use your own driver:

```bash
cd frontend
PK=0x<demo-wallet-key> STEP=0.022 UP=22 DOWN=22 node trend.mjs
```

It swaps in one direction until D climbs past the 50% floor and S⁺ crosses h, then reverses.
It prints the detector state after every swap and writes each to Supabase, so the app's charts
move while it runs.

**Start the driver 40–60 seconds before you cut to the demo.** You want to arrive on camera
with evidence already climbing and kappa about to engage — not watching a flat line. Do a full
dry run first and note how long it takes to fire, so you know exactly when to start it.

Also have ready:

- The app open at **poincare-beta.vercel.app**, wallet connected, on Unichain Sepolia.
- Testnet ETH plus minted USDC/WETH in the demo wallet.
- A second tab already showing the trade tape — your fallback if a swap stalls.

Two things that can bite you on camera. Testnet `eth_estimateGas` mis-simulates hook calls; the
app passes explicit gas, but a swap can still hang — if it does, **cut, don't fight it**. And
the app charts USDC-per-WETH while the hook stores WETH/USDC, so the frontend deliberately
inverts the trend label to match its own chart. That's correct, not a bug — worth knowing if a
judge asks.

Record the demo as its own take and edit it in. Don't attempt one continuous run.

## On camera

**0:00–0:10 — establish that it's real**
> This is the live app on Unichain Sepolia. The hook for this pool is the Poincaré contract,
> right there. Everything on screen is read from chain state.

**0:10–0:32 — the detector holding fire**
> These two lines are the CUSUM evidence, read from the hook's own DetectorSample event — one
> sample per block.
>
> I've got a driver pushing a sustained trend through the pool, so you can watch the evidence
> climb. But look at kappa: still zero. It's refusing to act. It will not lean on noise.

**0:32–0:48 — the commit**
> There. Evidence crossed the threshold, the trend flips, and kappa ramps in — rate-limited,
> so it can never snap. Nothing scheduled that. It fired when the data earned it.

**0:48–1:08 — who actually pays**
> Now watch who pays. Quote a buy — pushing *with* the trend — and I get the spread.
>
> Quote a sell, against the trend, same block, same pool: plain constant-product price. Zero.
> The side stabilising the pool isn't charged anything.

**1:08–1:18 — close the loop**
> That quote comes from the Lens, which prices through the same libraries as the swap path —
> so quotes and execution agree to the wei.

*Cut back to the deck. Press `8`.*

---

# PART 3 — PRESENTATION (3:15 – 4:40)

### Slide 8 · Stress results — 3:15–3:36

> Back to the evidence. Two identical pools on the real v4 PoolManager — same price path, same
> 3,842 swaps. LPs kept half a million dollars more.
>
> And look *where*. Nothing in calm markets, which is correct. Then 83% off the flash crash,
> where LPs bleed hardest.

---

### Slide 9 · The honest test — 3:36–4:02

> But any spread lowers LVR, so beating constant product proves nothing.
>
> So we built the baseline most likely to beat us — a symmetric volatility fee costing traders
> the same — over twelve months of real ETH/USDC.
>
> Across the full year it edges us. In the out-of-sample half, the one with the February crash,
> we win. We show you the run we lose, because that's what makes the run we win believable.

*This slide is why judges should trust every other number in the deck. Say it plainly.*

---

### Slide 10 · Security — 4:02–4:25

> New since our last iteration: the **Uniswap Foundation Security Fund** sponsored a pre-audit
> scan of the contracts by **Olympix**.
>
> Nine findings. Zero high severity. All nine fixed — each with a regression test that fails
> on the pre-fix code and passes now.
>
> We also say plainly that a scan is not a human audit. That's still required before mainnet.

---

### Slide 13 · Close — 4:25–4:40

> So: a working v4 hook, 131 tests green, live on testnet with a frontend you can open right
> now. No oracle, no keeper, no partner dependencies — the only input is the pool's own price.
>
> The curve is the actuator. The detector is the contribution. Thanks for watching.

---

## If you still run long

Trim in this order — each keeps the argument intact:

1. **Slide 4** — cut to: *"A CUSUM brain sampling once per block, a curve that acts, and a fee
   built from real volatility."* Saves ~9s.
2. **Demo 0:00–0:10** — drop the last sentence. Saves ~4s.
3. **Slide 8** — drop the flash-crash line, keep the half-million. Saves ~7s.

Do **not** cut slide 3 or slide 9. Slide 3 carries Original Idea (30%); slide 9 is what makes
every other number you quote credible.

## Delivery notes

- Slides 2, 3, 8 and 9 animate their charts on entry (~1.5s). Land, take a beat, then talk.
- Say "kappa", not "κ".
- The two numbers people remember are **half a million dollars** and **nine findings, zero
  high**. Land both cleanly.
- The eligibility facts (valid v4 hook, public repo, tests *and* frontend, no partner
  integrations, original code) are all on slide 13 in writing — you don't need to recite them.
