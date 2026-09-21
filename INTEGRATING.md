# Integrating Poincaré

For routers, aggregators and anyone quoting this pool programmatically.

**The one thing to know:** Poincaré is a **custom-curve v4 hook** — it returns a
`BeforeSwapDelta` and prices swaps on its own invariant.

**Good news: the canonical `V4Quoter` prices it correctly.** It simulates a real swap rather than
computing a closed form, so `beforeSwap` runs and the custom curve is applied. If you already
quote through `V4Quoter`, you need to change nothing. That agreement is asserted on a fork in
[`test/sim/ForkRouterLens.t.sol`](./test/sim/ForkRouterLens.t.sol).

[`PoincareLens`](./src/PoincareLens.sol) returns the **same numbers** and exists for one reason:
it is a plain `view`. `V4Quoter.quoteExactInputSingle` is state-mutating (the unlock-and-revert
pattern), so it cannot be `staticcall`ed from a view context and costs a full swap simulation.
Use the Lens if either matters to you; use `V4Quoter` if neither does.

| | Unichain Sepolia (chain 1301) |
|---|---|
| Hook | `0xa5ABa524A96695Dc4E36BacfF3048aD2F24AAa88` |
| **Lens (quote here)** | `0x5d360309c7564270c5604067d7fa85e7d2508e02` |
| PoolManager | `0x00B036B58a818B1BC34d502D3fE730Db729e62AC` |
| Pool key | `currency0` = USDC, `currency1` = WETH, `fee` = `DYNAMIC_FEE_FLAG`, `tickSpacing` = 60 |

Addresses of record: [`deployments/unichain-sepolia.json`](./deployments/unichain-sepolia.json).

---

## Quoting

```solidity
interface IPoincareLens {
    function quoteExactInput(bool zeroForOne, uint256 amountIn)  external view returns (uint256 amountOut);
    function quoteExactOutput(bool zeroForOne, uint256 amountOut) external view returns (uint256 amountIn);
    function midPriceWad() external view returns (uint256);
    function spreads() external view returns (uint256 spreadZeroForOne, uint256 spreadOneForZero);
}
```

Both quote functions are `view`, so they cost nothing to call off-chain and can be used inside a
`staticcall` on-chain.

Execution is ordinary. The pool is a normal v4 pool as far as the router is concerned — swap
through `IUniswapV4Router04` (or any router that speaks v4) with the pool key above. No special
`hookData` is required; pass empty bytes.

**The Lens and execution agree to the wei.** That is asserted, not asserted-about: see
[`test/sim/ForkRouterLens.t.sol`](./test/sim/ForkRouterLens.t.sol), which quotes through the Lens
and executes through the canonical router on a Sepolia fork, in a calm pool, under a detected
trend, and in a fresh block.

---

## The two things that will surprise you

### 1. The price is direction-dependent, and deliberately so

Under a detected trend the pool charges a spread `κ` to the side pushing **with** that trend. The
other side trades at the plain curve price and pays nothing extra.

So `quoteExactInput(true, x)` and `quoteExactInput(false, y)` are **not** symmetric, and a
round-trip will not return the input. That is a bid–ask spread, not a bug. `spreads()` tells you
which side is currently being charged and by how much.

If you are computing an effective price for routing comparison, quote the direction you intend to
trade. Averaging the two, or quoting one and assuming the other, will mis-price by up to `κ_max`.

### 2. A quote is only good for the block you took it in

The detector samples **at most once per block**, and a swap in a new block triggers that sample
before it prices. The Lens accounts for this: it projects the detector forward rather than
reporting stored state, so a quote taken in an unsampled block already reflects what the swap
itself will cause.

What that means for you:

- **Quote and execute in the same block** and the numbers match exactly.
- **Quote in block N, execute in block N+1** and the quote may be stale — not because the Lens is
  wrong, but because the market moved and the detector responded. Re-quote, or set slippage that
  tolerates up to `κ_max` of movement.

`κ_max` is readable on-chain (`hook.kappaMax()`) and is currently **5%**. That is a hard ceiling,
not a typical value; the deployed pool's mean spread is far lower, and most volume pays nothing.

---

## Reading pool state

`PoincareLens.snapshot()` returns everything in one call:

```solidity
(
    uint256 reserve0, uint256 reserve1,
    uint256 kappa,                  // the spread currently charged to with-trend flow, WAD
    Cusum.Trend trend,              // 0 none, 1 up, 2 down
    uint256 directionalEfficiency,  // D, in [0,1]
    int256  sPos, int256 sNeg,      // the two CUSUM statistics
    int256  thresholdH,             // the level at which a trend is declared
    uint256 sigmaWad,               // the pool's live volatility estimate
    uint256 baseFeeWad              // the volatility-scaled base fee
) = lens.snapshot();
```

`kappa == 0` means the pool is quoting a plain symmetric constant-product curve in both
directions, which is most of the time.

---

## Liquidity

Liquidity is **hook-owned**, not tick-based. The native v4 liquidity path is deliberately
reverted — calling `modifyLiquidity` on the PoolManager for this pool will fail, by design.

Add and remove through the hook:

```solidity
hook.addLiquidity(BaseCustomAccounting.AddLiquidityParams({ ... }));
hook.removeLiquidity(BaseCustomAccounting.RemoveLiquidityParams({ ... }));
```

LP shares are a standard ERC20 on the hook itself, so `hook.balanceOf(lp)` and
`hook.totalSupply()` behave as expected. The MVP requires deposits at the current reserve ratio.

---

## If you are on the Uniswap side

We spent a while believing `V4Quoter` could not price custom curves, wrote
[`FEEDBACK.md`](./FEEDBACK.md) §1 saying so, and then wrote a test that disproved it. The
correction is in that document; the short version is that simulating the swap was the right
design and it works.

What remains is smaller and still worth having: `quoteExactInputSingle` is not `view`, so a
contract wanting a quote inside a view path has no option. An `IHookQuoter` convention — a hook
that *can* price itself cheaply declaring so, with routers falling back to the simulating Quoter
when it is absent — would close that without changing anything that currently works.

---

## Questions worth asking us

Open an issue. The two we expect:

**"Why use the Lens at all if `V4Quoter` works?"** Only if you need a `view`. `V4Quoter` is
state-mutating, so it cannot be `staticcall`ed from a view function and it costs a full swap
simulation — which for this hook includes a CUSUM update. If you are quoting off-chain via
`eth_call`, neither matters and `V4Quoter` is fine. The numbers are identical either way, which
is asserted rather than claimed.

**"Is `κ` predictable enough to route around?"** It is bounded by `κ_max` and rate-limited per
block by `dMax`, both readable on-chain. It is not predictable in the sense of knowing *when* it
will engage — that is a data-dependent stopping time, which is the security property the whole
design rests on.
