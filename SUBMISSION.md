# Submission notes: Continuity track and AI tool use

This document exists to satisfy two ETHOnline requirements that apply to this entry: the
**Continuity track** rule that pre-existing work is clearly documented and separated from work
done during the hackathon, and the **AI tools** rule that AI assistance is attributed
specifically rather than generally.

Everything below is checkable against the repository. Where a claim can be verified by a command,
the command is given.

---

## 1. Continuity track

Poincaré is an existing codebase entered under the Continuity track. It was submitted to the
**Uniswap Hook Incubator 10 (UHI10)** hookathon, where it was selected as one of the winners, and
it was subsequently selected by the **Uniswap Foundation Security Fund**, which sponsored a
security review by **Olympix**.

### 1.1 The boundary

The last commit of pre-existing work is **`efd8cb1`**. Everything after it was built during the
hackathon window.

```bash
git log --oneline efd8cb1..HEAD          # every commit of new work
git diff --stat efd8cb1..HEAD            # every file it touched
```

### 1.2 What pre-existed

All of the on-chain system, and the application around it:

- the hook and its libraries: `src/PoincareHook.sol`, `src/PoincareLens.sol`,
  `src/libraries/{Cusum,DirectionalSignal,ControlLaw,AsymmetricCurve,PriceLib}.sol`;
- the Foundry suite: unit, fuzz, invariant, manipulation, calibration and regression tests;
- the deployment on Unichain Sepolia, and the web application in `frontend/`;
- the backtests and simulations in `analysis/`, and the Olympix review with its fixes.

**No Solidity was changed during the hackathon.** That is verifiable:

```bash
git diff --name-only efd8cb1..HEAD -- '*.sol'   # only the re-calibrated sim constants
```

### 1.3 What was built during the hackathon

**Detector narration.** The detector publishes numbers that are precise and hard to read: two
CUSUM statistics, a directional-efficiency ratio, a live volatility estimate, a spread intensity.
The Analytics screen now reads that state back in plain English, so a visitor can tell whether the
pool is holding fire, engaged, or gated by the directional floor, without interpreting the
statistics themselves.

| Area | Files | What it does |
|---|---|---|
| Narration endpoint | `frontend/supabase/functions/explain/index.ts` | A Deno edge function calling Gemini. The key is a server-side secret, because anything a Vite app reads at runtime ships in the bundle |
| Cache and schema | `frontend/supabase/migration_004_lab.sql` | `ai_notes`, keyed by hook, kind and a namespaced cache key, written only by the service role |
| Client | `frontend/src/hooks/useExplain.ts`, `frontend/src/lib/narrate.ts`, `frontend/src/components/ui/AiNote.tsx` | Fetch, fall back, and label which source is showing |
| Surface | `frontend/src/app/screens/Analytics.tsx` | The panel itself |

**Every narration path has a deterministic local fallback**, computed from the same on-chain
numbers, so an unset key or an exhausted free tier degrades the prose rather than breaking the
panel, and the badge says which one is on screen.

**Re-calibration on a fresh 12 months.** The detector's `k` and `h` were re-derived from a new
window of real ETH/USDC (2025-09-13 to 2026-09-12), giving `k = 0.25σ` and `h = 6.00σ`, and the
three-pool replay study and its figures were re-run against it. The first run tripped the
harness's equal-friction assertion at 28.5%, catching that Poincaré was spending 40% more of its
traders' money than the baseline it was being compared against; `FEE_GAMMA` was retuned until both
cost 3,521 USDC, matched to 0.01%, and the study re-run. Both resulting metrics are published,
including the one where the simpler baseline wins.

**Defects found and fixed**, each with a cause worth recording: `toWad` used `toFixed(18)`, which
prints a float's binary expansion rather than its value, so parameters arrived several wei off;
the narration cache had no invalidation path, so a single truncated answer would have been served
permanently, now fixed by namespacing keys with a `CACHE_VERSION`; and Gemini 3.x spends thought
tokens against `maxOutputTokens`, so a budget sized for three sentences was consumed by reasoning
and truncated the reply.

**Removed after the hackathon.** A **Detector Lab** was also built during this window: an in-app
replay of the pool's recorded history under arbitrary detector parameters, backed by an exact
TypeScript port of the on-chain `Cusum`, `DirectionalSignal` and `ControlLaw` libraries, which
reproduced the live trace to **0 wei** across 362 real blocks. It was removed from the product
afterwards as not earning its place: a verification tool answering a reviewer's question rather
than something a trader or LP used. It remains in git history, and the removal is recorded in
[`analysis/OPEN_ITEMS.md`](./analysis/OPEN_ITEMS.md) §J.

## 2. AI tool use

AI tools were used substantially on this project, and this section says where and how.

### 2.1 Which tool

**Claude Code** (Anthropic), used as a pair programmer throughout, in an interactive session with
a human directing scope, reviewing output, and making the design decisions.

The narration feature also calls the **Gemini API** at runtime, but that is a product feature
rather than a development tool, and it is listed in §1.3.

### 2.2 What it wrote

For the hackathon work, effectively all of the code listed in §1.3 was written by Claude Code
under direction. That includes the narration client and its fallback, the edge function, the
migrations, and the Detector Lab that was later removed.

The pre-existing codebase was also built with AI assistance, using the same tool and a written
specification (see §2.4).

### 2.3 What the human directed

The parts that are not code generation, and that determined what the code is:

- **Choosing the feature**, and later **deciding to remove the larger half of it.** Four options
  were proposed and the Detector Lab was selected, with the narration scoped as its companion.
  After shipping, the Lab was judged not to earn its place in the product and was removed, which
  is a call the AI did not make and would not have made.
- **Setting the constraint** that no contract would change, which shaped the whole approach:
  reading the configuration through getters the hook already exposed rather than adding any.
- **Rejecting the first framing of the results** and requiring the honest one, which is why the
  README reports the year-long study that the symmetric baseline wins rather than only the
  synthetic path that Poincaré wins.
- **Reviewing deployed output and reporting defects**, including the truncated narration and a
  chart flattened against its axis, both caught by looking at the running application rather than
  by a test.
- **Security review of the work**, including catching a credential that was pasted into a tracked
  file before it was committed.

### 2.4 Spec artifacts

The project was built spec-first. The specification is **`CLAUDE.md`** at the repository root: a
detailed build brief covering the detector, the curve, the control law, the manipulation-cost
requirement, the testing gates and the scope guardrails. It was written before implementation and
the implementation was held to it.

> **Note for judges:** `CLAUDE.md` is currently listed in `.gitignore` and is therefore not
> tracked in the public repository. Under the Spec-Driven Development rule it should be included.
> See the checklist item in §3.

Beyond that file, direction was given conversationally in the interactive session rather than
through a spec framework such as OpenSpec, Kiro or spec-kit.

### 2.5 Honest characterisation

The rules ask that AI assist development rather than replace the team's contribution. The
accurate description of this project is that AI wrote most of the code, and the human supplied
the research direction, the specification, the design decisions, the correctness standard, and
the review that caught what the AI got wrong. The defects listed in §1.3 were found because
output was checked rather than accepted.

---

## 3. Pre-submission checklist

- [ ] Decide whether to track `CLAUDE.md` (remove it from `.gitignore`), as the
      Spec-Driven Development rule requires spec files to be in the submission repository.
- [ ] Confirm the hackathon window dates and state them in §1.1 alongside commit `efd8cb1`.
- [ ] Confirm which partner prize tracks are being entered, since partner eligibility for
      Continuity submissions varies by partner.
- [ ] Record the demo video at 720p or higher, between 2 and 4 minutes.
