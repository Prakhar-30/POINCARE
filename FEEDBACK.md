# Feedback on building with Uniswap v4

Notes from building **Poincaré**, a custom-curve v4 hook. Built during UHI10, security-reviewed
through the Uniswap Foundation Security Fund, and live on Unichain Sepolia.

**Overall: 8.5 / 10.**

## What worked well

- **Integrating with Uniswap is genuinely simple**, mostly because the docs are good. As a UHI
  student I went back to them constantly to understand topics properly, and they held up every time.
- **The v4 template repo made starting easy.** Akshat introduced it to us at ETHGlobal Delhi 2025,
  and building on it is basically a step-by-step guide. I've used it for every hook since,
  including this one.
- **`beforeSwapReturnDelta` is the best part of v4.** I replaced the pricing function completely
  and still got settlement for free. That's why Poincaré is a hook and not a fork of an AMM.
- **Forking a real `PoolManager` in Foundry just works.** We replay 2,190 real market bars
  through live pools on a Sepolia fork with no workarounds.

## Where I got stuck

- **`slot0` doesn't move for custom-curve hooks.** Native pricing is bypassed, so `sqrtPriceX96`
  stays at its initial value forever. I spent a while thinking it was my bug. One line in the
  custom-curve docs would save people that time.
- **Contract size only shows up at deploy.** `deployCodeTo` skips the EIP-170 limit, so a hook can
  pass every test and still be undeployable. Ours was 28KB; optimizer + via-IR got it to ~13KB.
  A `forge build --sizes` step in the template CI would catch this early.
- **Gas estimation is unreliable for hook transactions on testnets.** Deployment took ~9M gas and
  `eth_estimateGas` got hook-routed calls wrong, so we pass explicit gas limits everywhere.
- **ERC-6909 claims can be donated to the hook.** Anyone can transfer claims in and change what the
  hook thinks its reserves are. A short note in the custom-accounting docs would help.
- **`beforeSwapReturnDelta` sign conventions** took a few reads. A worked example covering all
  four cases (exact-in/out in each direction) would go a long way.

## Links

- Repo: https://github.com/Prakhar-30/POINCARE
- App: https://www.poincaretrade.in
- Hook (Unichain Sepolia): `0x89A520e7faEd35CB6F89b0040F5Bc5ADe035Aa88`
