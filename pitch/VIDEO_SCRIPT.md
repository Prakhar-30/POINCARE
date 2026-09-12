# Poincaré · demo video speaker notes

**Deck:** `pitch/poincare-deck.html` (arrow keys, or type a slide number to jump).
**Length:** 510 spoken words, which is 3:24 at 150 wpm and lands around **3:35** once you add
slide changes and the cuts in and out of the demo.
**Record at 720p or higher. Under 2:00 or over 4:00 is auto-rejected on upload.**

## Running order

| Time | Segment | Slides |
|---|---|---|
| 0:00 – 1:15 | Presentation, part 1 | 1 → 2 → 3 → 4 |
| 1:15 – 2:50 | Live demo (screen capture) | — |
| 2:50 – 3:45 | Presentation, part 2 | 5 → 6 → 7 |

No slides are skipped. Advance in order.

---

# PART 1 · PRESENTATION (0:00 – 1:15)

### Slide 1 · Title

> Hi, I'm Prakhar. Poincaré is a Uniswap v4 hook that watches its own price, works out when a
> trend is genuinely real, and leans its curve against it.
>
> No oracle, no keeper, nothing to bribe.

### Slide 2 · The problem

> LPs don't lose money because markets are volatile. They lose it because markets have direction.
>
> Identical steps here, only the signs reordered. The one that chops ends where it started. The
> one that trends gets arbitraged the whole way.
>
> That's loss-versus-rebalancing, and the fee isn't in that equation, which is the lever almost
> every other hook pulls.

### Slide 3 · The engine

> So the real question is: has a genuine trend started?
>
> Statisticians solved that in 1954. It's called quickest change detection, and the answer is the
> CUSUM statistic. It accumulates evidence every block and fires when that evidence crosses a
> threshold.
>
> The firing moment depends on the data, so there's no block count for an attacker to precompute.

### Slide 4 · The Detector Lab

> Those parameters decide what counts as a trend, so don't take my calibration on trust. This
> cycle I built the Detector Lab.
>
> It replays the pool's own recorded history under any parameters you choose, against the deployed
> configuration as a control. Replaying the live parameters reproduces the chain to the wei.
>
> Let's look.

---

# PART 2 · LIVE DEMO (1:15 – 2:50)

Screen capture of **poincare-beta.vercel.app** on Unichain Sepolia. Edit out any waiting.

### Dashboard, then Analytics

*(Open the app. Land on Dashboard, move to Analytics.)*

> A real pool on Unichain Sepolia, every number read straight from the contract.
>
> These two lines are the CUSUM statistics, accumulating evidence against the threshold.
> Directional efficiency is the gate that separates a real march from a thrash.
>
> And this panel reads the state back in plain English.

### Trade

*(Go to Trade. Show a quote in one direction, then flip the direction.)*

> This is who pays. When a trend is confirmed, flow pushing with it is charged a spread, and that
> spread goes to the LPs it would otherwise have been taken from.
>
> Flow trading against the trend pays nothing, quoted at the plain base price.

### The Detector Lab

*(Go to the Lab. Point at the parity badge. Drag the threshold slider. Then the directional gate.
Then press explain.)*

> And this is the Lab. That badge is the point: this replay reproduces the chain exactly.
>
> Watch when I lower the firing threshold. The candidate pulls away, fires far more often, and the
> time spent leaning jumps. That's a detector reacting to noise.
>
> Drop the directional gate to zero and the duty cycle explodes, because nothing is filtering chop.
>
> You don't have to believe my calibration. You can move the slider.

---

# PART 3 · PRESENTATION (2:50 – 3:45)

### Slide 5 · The honest test

> Does it work? Any spread lowers LVR, so beating constant product proves nothing. So I built the
> baseline most likely to beat me: a symmetric vol-scaled fee costing traders exactly the same,
> over twelve months of real ETH/USDC.
>
> On raw LVR it edges me, and I'm showing you that. But on LP value retained, Poincaré keeps thirty
> percent more for the same trader cost, because it only charges the flow taking money out.

### Slide 6 · Security

> Poincaré was selected by the Uniswap Foundation Security Fund, which sponsored a review by
> Olympix. Nine findings, none high severity, all fixed, each with a regression test that fails on
> the old code.

### Slide 7 · Close

> So: a working hook, live on chain. A hundred and thirty-one Foundry tests, forty more on the
> off-chain port, and quotes that match execution to the wei.
>
> The curve is the actuator. The detector is the contribution. Thank you.

---

## If you run long

Trim in this order. Each is self-contained.

1. **Slide 3**, drop *"The firing moment depends on the data, so there's no block count for an
   attacker to precompute."* Saves about 7 seconds.
2. **Slide 7**, drop the test-counts sentence, going straight from "live on chain" to "The curve
   is the actuator." Saves about 9 seconds.
3. **Trade section**, drop *"and that spread goes to the LPs it would otherwise have been taken
   from."* Saves about 5 seconds.

## Before you record

- Do one timed read-through. If you land past 3:55, apply trim 1.
- Have the app loaded and the wallet already connected, so no connection flow is on camera.
- Check the Lab's narration badge reads `gemini-3.6-flash`, not `computed locally`.
- Steady pace, quiet room. The rules call out rushing and background noise specifically.
