# Poincaré · demo video speaker notes

**Deck:** `pitch/poincare-deck.html` (arrow keys, or type a slide number to jump).
**Length:** 508 spoken words, which is 3:23 at 150 wpm and lands around **3:30** once you add
slide changes and the cuts in and out of the demo.
**Record at 720p or higher. Under 2:00 or over 4:00 is auto-rejected on upload.**

## Running order

| Time | Segment | Slides |
|---|---|---|
| 0:00 – 1:15 | Presentation, part 1 | 1 → 2 → 3 → 4 |
| 1:15 – 2:40 | Live demo (screen capture) | · |
| 2:40 – 3:30 | Presentation, part 2 | 5 → 6 → 7 |

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

### Slide 4 · The actuator

> So once a trend is confirmed, what actually changes? Flow pushing with the trend pays a small,
> capped spread that goes to the LPs it would otherwise have been taken from.
>
> Flow trading against the trend pays nothing. A symmetric fee taxes everyone on every block; this
> only charges the side taking money out.
>
> Let's watch it work.

---

# PART 2 · LIVE DEMO (1:15 – 2:40)

Screen capture of **poincare-beta.vercel.app** on Unichain Sepolia. The trade driver is already
running in a terminal before you start recording (see *Before you record*). Edit out any waiting.

### Dashboard

*(Cut to the app on the Dashboard. Point at the evidence chart, then the two gauges.)*

> Before I started talking I kicked off a script making real swaps against this pool, one per
> block. So this is the detector working live, every number read straight from the contract.
>
> These two lines are the CUSUM statistics accumulating evidence against the threshold. That gauge
> is directional efficiency, separating a real march from a thrash. And kappa, ramping in,
> rate-limited so it can never snap.

### Trade

*(Go to Trade. Quote a buy, point at the spread. Then flip to a sell of the same size.)*

> This is who pays. I'm buying WETH, which is the side pushing with the detected trend, and the
> quote carries the spread. That spread goes back to the LPs it would otherwise have been taken
> from.
>
> Now the same size the other way. Trading against the trend, and the spread is zero. Plain base
> price. Punishing the traders who stabilise your pool is bad business.
>
> And nobody set that number. It came out of the detector, rate-limited, and it goes back to zero
> on its own when the trend does.

---

# PART 3 · PRESENTATION (2:40 – 3:30)

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

> So: a working hook, live on chain. A hundred and thirty-one Foundry tests, invariants at a
> hundred and twenty-eight thousand calls, quotes matching execution to the wei.
>
> The curve is the actuator. The detector is the contribution. Thank you.

---

## If you run long

Trim in this order. Each is self-contained.

1. **Slide 3**, drop *"The firing moment depends on the data, so there's no block count for an
   attacker to precompute."* Saves about 7 seconds.
2. **Slide 7**, drop the test-counts sentence, going straight from "live on chain" to "The curve
   is the actuator." Saves about 9 seconds.
3. **Trade**, drop the last line *"And nobody set that number..."*. Saves about 8 seconds.

## Before you record

**Start the trade driver first.** From `frontend/`, with a funded key:

```
PK=0x... STEP=0.002 UP=40 DOWN=0 node trend.mjs
```

Start it, then begin recording. By the time you reach the demo at 1:15 the detector is engaged and
still climbing.

Why those values rather than the defaults:

- `STEP=0.002` makes the evidence cross the threshold around swap 6 and ramp kappa to its cap by
  swap 21, so the climb is watchable. The default `STEP=0.022` fires on swap **one** and maxes
  kappa on swap two, which leaves nothing to see.
- `UP=40 DOWN=0` keeps the trend pointing one way for the whole demo. The default second phase
  reverses it, which would flip the trend label mid-demo.
- 40 swaps at roughly three to five seconds each runs two to three and a half minutes, covering
  the demo. If it finishes early nothing is lost: the detector only samples when a swap lands, so
  kappa freezes where it was rather than decaying off screen.

Also:

- Do one timed read-through. If you land past 3:55, apply trim 1.
- Have the app loaded and the wallet already connected, so no connection flow is on camera.
- Check the Analytics narration badge reads `gemini-3.6-flash`, not `computed locally`.
- Steady pace, quiet room. The rules call out rushing and background noise specifically.
