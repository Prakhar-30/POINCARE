# Developer feedback on the Uniswap v4 stack

Feedback from building **Poincaré**, a custom-curve Uniswap v4 hook, through two development
cycles: an initial build entered at the Uniswap Hook Incubator 10, a security review sponsored by
the Uniswap Foundation Security Fund, and a further feature cycle. It is deployed and live on
Unichain Sepolia against the canonical v4 `PoolManager`.

Everything below is something we actually hit, with the workaround we used. It is ordered by how
much time it cost us, not by severity.

**Overall rating: 8 / 10.** `beforeSwapReturnDelta` is a genuinely excellent abstraction and the
reason this project is a few hundred lines of hook rather than a fork of an AMM. The friction we
hit was almost entirely documentation rather than protocol design.

---

## 1. The default Quoter silently mis-prices every custom-curve hook

**The problem.** A custom-curve hook replaces the pricing function, but the canonical Quoter still
assumes `x·y=k`. It does not revert, it does not warn. It returns a confidently wrong number.

This is the single largest integration gap in v4 today, because it is invisible. A router
integrating a custom-curve pool will quote incorrectly and only discover it when executions
diverge from quotes. The failure mode is silent and it lands on the integrator rather than the
hook author.

**What we did.** Shipped `PoincareLens`, a first-class quoter that prices through the exact same
libraries and the same detector projection the swap path uses, so a quote cannot drift from
execution.

**What would help.** A prominent warning in the custom-curve documentation, not a footnote: *if
your hook returns a `BeforeSwapDelta`, the default Quoter cannot price your pool and you must ship
your own.* Better still, a `IHookQuoter` interface convention so routers have a standard place to
look, and the Quoter reverting rather than guessing when it detects `beforeSwapReturnDelta` in the
hook's permission bits.

---

## 2. `slot0` is meaningless for a custom-curve hook, and nothing says so

**The problem.** Because native pricing is bypassed, `slot0.sqrtPriceX96` sits frozen at whatever
value the pool was initialised with, forever. Anything reading price from `slot0`, which is the
obvious first instinct and what most v4 examples do, gets a stale constant.

We lost real time establishing this, because a frozen value looks like a bug in your own code
before it looks like a property of the design.

**What we did.** Derive price from the hook's own reserves, which for us are ERC-6909 claim
balances. This is documented in our `PriceLib` as a warning to our own future readers.

**What would help.** One sentence in the custom-curve docs. *Custom-curve hooks bypass native
pricing, so `slot0` will not track your pool's price. Derive it from your own state.*

---

## 3. EIP-170 is invisible until the moment you deploy

**The problem.** `deployCodeTo`, which every hook test harness uses because hook addresses must
encode permission flags, **bypasses the contract size limit**. So a hook can be comfortably green
across a full test suite and be undeployable. You find out at deployment, which is the worst
possible time.

Ours was 28KB unoptimized. Optimizer plus via-IR brought it to roughly 13KB.

**What would help.** A `forge build --sizes` step in the hook template's CI, or a note in the
scaffold README. This is a five-minute fix that would save people an afternoon.

---

## 4. CREATE2 hook deployment gas is far higher than you would guess

**The problem.** Mining the salt with `HookMiner` is cheap and well documented. The deployment
transaction is not: ours needed roughly **9M gas**. Compounding it, `eth_estimateGas` mis-simulates
hook transactions on testnets, so we had to pass explicit gas limits for deployment and for swaps
routed through the hook rather than relying on estimation.

**What would help.** A line next to the `HookMiner` docs giving a realistic gas figure, and a note
that estimation is unreliable for hook-routed calls on testnets.

---

## 5. ERC-6909 claims are transferable, which is a donation surface

**The problem.** Holding reserves as ERC-6909 claims is the natural choice for a custom-accounting
hook and what the examples point you toward. But claims are transferable, so **anyone can send
claims to your hook and move what it believes its reserves are**, outside its own accounting.

It is bounded rather than free, because donated claims mint no shares and accrue pro-rata to
existing LPs, so the donor forfeits them. But it interacts badly with naive share-pricing maths: a
donation can shift the ratio that a deposit is priced against. Our security review surfaced a
related finding here, and we now price shares off the scarcer funded side.

**What would help.** A note in the custom-accounting documentation that claim balances are not a
safe proxy for "reserves this contract controls", with a pointer to shadow accounting as the
hardened alternative and its trade-offs.

---

## 6. `BaseCustomCurve` is the right base and it is hard to find

**The problem.** The most useful starting point for a custom-curve hook is
`BaseCustomCurve` / `BaseCustomAccounting` in **OpenZeppelin's `uniswap-hooks`**, not in
`v4-periphery`. It is well written and it handles the settlement correctly. We found it late, and
the relationship between it and the official custom-curve example is not documented anywhere.

**What would help.** Link it from the custom-curve docs, and say plainly which of the two to start
from and why.

---

## 7. Smaller notes

- **`beforeSwapReturnDelta` sign conventions** took a couple of readings to get right. A worked
  example showing all four cases (exact-in and exact-out, each direction) with the sign of each
  delta spelled out would be worth its weight. The single example that exists covers one case.
- **Reverting the native liquidity path** is the correct thing for a custom-curve hook to do, but
  which of `beforeAddLiquidity` / `beforeRemoveLiquidity` to revert in, and what that means for
  `modifyLiquidity` callers, is left to inference.
- **Dynamic fee flag** (`0x800000`) is easy to find but its interaction with a hook that computes
  its own fee inside pricing is not discussed. We charge the fee inside `_getUnspecifiedAmount` and
  report it via `_getSwapFeeAmount` purely so the `HookSwap` event is accurate, which took some
  reading of periphery source to settle.
- **Forking a real `PoolManager` in Foundry works flawlessly.** We replay 2,190 real market bars
  through three live pools on a forked Sepolia `PoolManager` with no workarounds at all. Worth
  saying, since most of this document is criticism.

---

## What is genuinely excellent

- **`beforeSwapReturnDelta` is a complete abstraction.** Being able to replace the pricing function
  entirely while inheriting settlement is what made an adaptive AMM a hook rather than a fork. We
  did not have to reimplement a single piece of accounting.
- **The unlock pattern** is easy to reason about once you have read it once, and it makes
  reentrancy analysis tractable. Our mutating swap path makes no external calls at all except one
  view, which is a property the pattern gave us for free.
- **Hook permission flags encoded in the address** is elegant. It makes a hook's capabilities
  statically checkable by anyone, with no registry and no trust.
- **ERC-6909 claims for reserves** (caveat 5 aside) removed an entire class of token-transfer
  accounting from our hook.

---

## Where our integration lives

For verification, the relevant code is mapped in the README under
[Where the Uniswap v4 integration lives](./README.md#where-the-uniswap-v4-integration-lives).
The two files that matter most:

- [`src/PoincareHook.sol`](./src/PoincareHook.sol) — the hook, including `_getUnspecifiedAmount`
  (custom-curve pricing) and the hook-owned liquidity path.
- [`src/PoincareLens.sol`](./src/PoincareLens.sol) — the quoter that exists because of item 1.

Repository: https://github.com/Prakhar-30/POINCARE
Live app: https://poincare-beta.vercel.app
Hook on Unichain Sepolia: `0x9F110F6cC0dfE0CE47f3d49CaF22e9E3220e6A88`
