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

**The Detector Lab**, a feature that makes the project's central claim checkable by hand rather
than taken on trust, plus the backend and AI layer behind it.

The pool's detector decides when a price trend is real, using parameters (`k`, `h`, `λ`, the
directional-efficiency floor) that are derived from a return distribution and then fixed at
deploy. The honest question a reader has is whether *those* values, rather than looser ones, are
what separates a trend from chop. The Lab answers it by replaying the pool's own recorded history
under any parameters you choose, against the deployed configuration as a control.

| Area | Files | What it does |
|---|---|---|
| Detector port | `frontend/src/lib/detector.ts` | An exact BigInt port of `Cusum.sol`, `DirectionalSignal.sol` and `ControlLaw.sol`, plus the step ordering `PoincareHook._projectDetector` imposes on them |
| Replay engine | `frontend/src/lib/replay.ts`, `frontend/src/hooks/useLabReplay.ts` | Replays recorded blocks under candidate parameters, computes firing cadence, duty cycle, gate rejections, and measures parity against the chain |
| Verification | `frontend/src/lib/detector.test.ts`, `frontend/src/lib/__fixtures__/unichain-sepolia-trace.json` | 40 tests. Unit vectors lifted from the Solidity suite, plus a verbatim capture of the live trace the port must reproduce |
| UI | `frontend/src/app/screens/Lab.tsx`, `frontend/src/components/ui/{ReplayChart,ParamSlider,AiNote}.tsx` | The Lab screen, its chart and controls |
| Backend | `frontend/supabase/migration_004_lab.sql`, `frontend/src/lib/db.ts` | Exact-integer replay inputs, shareable calibrations, and the narration cache |
| AI narration | `frontend/supabase/functions/explain/index.ts`, `frontend/src/hooks/useExplain.ts`, `frontend/src/lib/narrate.ts` | A Gemini-backed plain-English read of the detector, with a deterministic local fallback |
| CI | `.github/workflows/test.yml` | Runs the port's tests, so a drift between the contracts and the port fails a build |

**The claim that makes the Lab worth anything is verified, not asserted.** Replaying the deployed
parameters reproduces the trace the hook actually emitted on Unichain Sepolia with **zero wei of
deviation** on both CUSUM statistics and no trend mismatches, across 362 real blocks. The
committed fixture holds 80 of those samples and the deployed configuration, and the assertion
runs in CI:

```bash
cd frontend && pnpm install && pnpm test
```

Also new in this window:

- **Re-calibration on a fresh 12 months** of real ETH/USDC (2025-09-13 to 2026-09-12), which
  re-derived `k = 0.25σ` and `h = 6.00σ` from the new window's first half and updated the
  replay study and its figures.
- **Three defects found and fixed** while building the above, each with a regression test:
  `toWad` used `toFixed(18)`, which prints a float's binary expansion and put parameters several
  wei off the intended value; enabling adaptive mode against a pool deployed with `sigmaFloor = 0`
  divided by zero on a cold start, which is a configuration the hook's own constructor would
  refuse; and the narration cache had no invalidation path, so one truncated answer would have
  been served permanently.

---

## 2. AI tool use

AI tools were used substantially on this project, and this section says where and how.

### 2.1 Which tool

**Claude Code** (Anthropic), used as a pair programmer throughout, in an interactive session with
a human directing scope, reviewing output, and making the design decisions.

The narration feature also calls the **Gemini API** at runtime, but that is a product feature
rather than a development tool. It is documented in README §9.3.

### 2.2 What it wrote

For the hackathon work, effectively all of the code listed in §1.3 was written by Claude Code
under direction. That includes the detector port, the replay engine, the tests, the Lab UI, the
edge function and the migrations.

The pre-existing codebase was also built with AI assistance, using the same tool and a written
specification (see §2.4).

### 2.3 What the human directed

The parts that are not code generation, and that determined what the code is:

- **Choosing the feature.** Four options were proposed; the Detector Lab was selected, and the
  AI narration was scoped as a companion to it rather than a standalone feature.
- **Setting the constraint** that no contract would change, which shaped the whole approach:
  reading the configuration through getters the hook already exposed rather than adding any.
- **Rejecting the first framing of the results** and requiring the honest one, which is why the
  README reports the year-long study that the symmetric baseline wins rather than only the
  synthetic path that Poincaré wins.
- **Reviewing deployed output and reporting defects**, including the truncated narration and the
  chart that was flattened against its axis, both caught by looking at the running application
  rather than by a test.
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
