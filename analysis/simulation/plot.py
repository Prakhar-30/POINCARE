#!/usr/bin/env python3
"""
Poincaré fork-simulation plots.

Reads the CSVs written by test/sim/ForkSimulation.t.sol (a comparative WETH/USDC run on a
Sepolia Uniswap v4 fork: POINCARE pool vs an identical constant-product CONTROL) and renders
the comparative graphs into ../../public/sim/.

All on-chain integer columns are WAD-scaled (1e18); we divide to human units.
"""
import os
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "sim"))
os.makedirs(OUT, exist_ok=True)
WAD = 1e18

SCEN_NAMES = ["calm", "mild_up", "strong_up", "uptrend_pullbacks",
              "strong_down", "flash_crash", "whipsaw", "recovery_calm"]
LEN = 130

C_POIN = "#1f77b4"   # blue
C_CTRL = "#d62728"   # red
C_FAIR = "#555555"

plt.rcParams.update({
    "figure.dpi": 120, "font.size": 10, "axes.grid": True,
    "grid.alpha": 0.25, "axes.spines.top": False, "axes.spines.right": False,
})


def load():
    ts = pd.read_csv(os.path.join(HERE, "timeseries.csv"), dtype=str)
    for c in ["fair", "price_on", "price_off", "kappa", "d", "lp_on", "lp_off",
              "cum_lvr_on", "cum_lvr_off", "cum_noise_on"]:
        ts[c] = ts[c].astype(float) / WAD
    for c in ["block", "scenario", "trend"]:
        ts[c] = ts[c].astype(int)
    ts["idx"] = range(1, len(ts) + 1)  # logical block index 1..T
    summ = pd.read_csv(os.path.join(HERE, "summary.csv"))
    orders = pd.read_csv(os.path.join(HERE, "orders.csv"))
    for c in ["amount_in", "amount_out"]:
        orders[c] = orders[c].astype(float) / WAD
    return ts, summ, orders


def shade_scenarios(ax, ts):
    """Light vertical bands + labels per scenario segment."""
    for i, name in enumerate(SCEN_NAMES):
        x0, x1 = i * LEN + 1, (i + 1) * LEN
        if i % 2 == 1:
            ax.axvspan(x0, x1, color="#000000", alpha=0.035, zorder=0)
        ax.text((x0 + x1) / 2, ax.get_ylim()[1], name, ha="center", va="top",
                fontsize=7, color="#666", rotation=0)


def usd(x, _):
    if abs(x) >= 1e6:
        return f"${x/1e6:.2f}M"
    if abs(x) >= 1e3:
        return f"${x/1e3:.0f}k"
    return f"${x:.0f}"


def fig_price(ts):
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.plot(ts.idx, ts.fair, color=C_FAIR, lw=1.0, ls="--", label="fair price (external)")
    ax.plot(ts.idx, ts.price_on, color=C_POIN, lw=1.2, label="Poincaré pool price")
    ax.plot(ts.idx, ts.price_off, color=C_CTRL, lw=1.0, alpha=0.8, label="control (x·y=k) pool price")
    ax.set_ylabel("USDC per WETH")
    ax.set_xlabel("block")
    ax.set_title("WETH/USDC price — fair vs both pools (Sepolia v4 fork)")
    ax.legend(loc="upper left", fontsize=8)
    shade_scenarios(ax, ts)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "sim_price.png"))
    plt.close(fig)


def fig_lpvalue(ts):
    fig, (ax, ax2) = plt.subplots(2, 1, figsize=(12, 6.5), sharex=True,
                                  gridspec_kw={"height_ratios": [2, 1]})
    ax.plot(ts.idx, ts.lp_on, color=C_POIN, lw=1.6, label="Poincaré LP value")
    ax.plot(ts.idx, ts.lp_off, color=C_CTRL, lw=1.4, label="control LP value")
    ax.set_ylabel("LP value (USDC, marked at fair)")
    ax.yaxis.set_major_formatter(FuncFormatter(usd))
    ax.set_title("LP value retained — Poincaré vs constant-product control")
    ax.legend(loc="upper left", fontsize=9)
    shade_scenarios(ax, ts)

    diff = ts.lp_on - ts.lp_off
    ax2.fill_between(ts.idx, 0, diff, color=C_POIN, alpha=0.35)
    ax2.plot(ts.idx, diff, color=C_POIN, lw=1.2)
    ax2.axhline(0, color="#888", lw=0.8)
    ax2.set_ylabel("Poincaré − control")
    ax2.yaxis.set_major_formatter(FuncFormatter(usd))
    ax2.set_xlabel("block")
    final = diff.iloc[-1]
    ax2.annotate(f"final advantage: {usd(final, 0)}", xy=(ts.idx.iloc[-1], final),
                 xytext=(-160, 10), textcoords="offset points", fontsize=9,
                 color=C_POIN, fontweight="bold")
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "sim_lpvalue.png"))
    plt.close(fig)


def fig_lvr(ts):
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.plot(ts.idx, ts.cum_lvr_on, color=C_POIN, lw=1.6, label="Poincaré cumulative LVR")
    ax.plot(ts.idx, ts.cum_lvr_off, color=C_CTRL, lw=1.4, label="control cumulative LVR")
    ax.fill_between(ts.idx, ts.cum_lvr_on, ts.cum_lvr_off, color="green", alpha=0.12,
                    label="LVR avoided")
    ax.set_ylabel("cumulative LVR (USDC)")
    ax.yaxis.set_major_formatter(FuncFormatter(usd))
    ax.set_xlabel("block")
    on, off = ts.cum_lvr_on.iloc[-1], ts.cum_lvr_off.iloc[-1]
    red = (off - on) / off * 100 if off else 0
    ax.set_title(f"Cumulative LVR (arbitrageur extraction) — {red:.1f}% lower with Poincaré")
    ax.legend(loc="upper left", fontsize=9)
    shade_scenarios(ax, ts)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "sim_lvr.png"))
    plt.close(fig)


def fig_kappa(ts):
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.plot(ts.idx, ts.price_on / ts.price_on.iloc[0], color=C_FAIR, lw=1.0,
            label="Poincaré price (normalised)")
    ax.set_ylabel("normalised price")
    ax.set_xlabel("block")
    axk = ax.twinx()
    axk.fill_between(ts.idx, 0, ts.kappa * 100, color=C_POIN, alpha=0.35, label="κ (spread %)")
    axk.plot(ts.idx, ts.d * 100, color="#ff7f0e", lw=0.9, alpha=0.8, label="D (directional eff. %)")
    axk.set_ylabel("κ spread (%)  /  D (%)")
    axk.set_ylim(0, 105)
    axk.spines.top.set_visible(False)
    ax.set_title("Detector response — κ engages only on confirmed trends, 0 in calm")
    l1, lab1 = ax.get_legend_handles_labels()
    l2, lab2 = axk.get_legend_handles_labels()
    ax.legend(l1 + l2, lab1 + lab2, loc="upper left", fontsize=8)
    shade_scenarios(ax, ts)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "sim_kappa.png"))
    plt.close(fig)


def fig_scenarios(summ):
    fig, ax = plt.subplots(figsize=(12, 4.8))
    x = np.arange(len(summ))
    w = 0.38
    on = summ.lvr_poincare.astype(float) / WAD
    off = summ.lvr_control.astype(float) / WAD
    ax.bar(x - w/2, off, w, color=C_CTRL, label="control LVR")
    ax.bar(x + w/2, on, w, color=C_POIN, label="Poincaré LVR")
    ax.set_xticks(x)
    ax.set_xticklabels(summ.scenario, rotation=25, ha="right", fontsize=8)
    ax.set_ylabel("LVR (USDC)")
    ax.yaxis.set_major_formatter(FuncFormatter(usd))
    ax.set_title("LVR per stress scenario — Poincaré helps most where LVR is largest")
    ax.legend(fontsize=9)
    for i in range(len(summ)):
        bps = int(summ.lvr_reduction_bps.iloc[i])
        if bps > 0:
            ax.text(x[i], max(on.iloc[i], off.iloc[i]), f"-{bps/100:.0f}%",
                    ha="center", va="bottom", fontsize=8, color="green", fontweight="bold")
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "sim_scenarios.png"))
    plt.close(fig)


def fig_orderbook(orders):
    """Two 'order books' side by side: execution price of each order vs block, sized by notional."""
    fig, axes = plt.subplots(1, 2, figsize=(13, 5), sharey=True)
    for ax, pool, color in [(axes[0], "poincare", C_POIN), (axes[1], "control", C_CTRL)]:
        d = orders[orders["pool"] == pool].copy()
        # execution price USDC/WETH: zeroForOne sells WETH for USDC -> price = out/in;
        # oneForZero buys WETH with USDC -> price = in/out.
        z = d["zeroForOne"] == 1
        price = np.where(z, d.amount_out / d.amount_in.replace(0, np.nan),
                         d.amount_in / d.amount_out.replace(0, np.nan))
        size = np.where(z, d.amount_in, d.amount_out)  # WETH notional
        arb = d["kind"] == "arb"
        ax.scatter(d.block[arb], price[arb.values], s=np.clip(size[arb.values]*6, 2, 60),
                   c=color, alpha=0.5, label="arb orders", edgecolors="none")
        ax.scatter(d.block[~arb], price[(~arb).values], s=12, marker="x",
                   c="#888", alpha=0.5, label="noise orders")
        ax.set_title(f"{pool} order book")
        ax.set_xlabel("block")
        ax.legend(fontsize=8, loc="upper left")
    axes[0].set_ylabel("execution price (USDC/WETH)")
    fig.suptitle("Order books — every executed swap on each pool (size ∝ notional)", y=1.02)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "sim_orderbook.png"), bbox_inches="tight")
    plt.close(fig)


def fig_dashboard(ts, summ):
    fig, axs = plt.subplots(2, 2, figsize=(15, 9))
    # price
    a = axs[0, 0]
    a.plot(ts.idx, ts.fair, C_FAIR, ls="--", lw=0.9, label="fair")
    a.plot(ts.idx, ts.price_on, C_POIN, lw=1.1, label="Poincaré")
    a.plot(ts.idx, ts.price_off, C_CTRL, lw=0.9, alpha=0.8, label="control")
    a.set_title("price (USDC/WETH)"); a.legend(fontsize=7, loc="upper left")
    # lp value
    a = axs[0, 1]
    a.plot(ts.idx, ts.lp_on, C_POIN, lw=1.4, label="Poincaré LP")
    a.plot(ts.idx, ts.lp_off, C_CTRL, lw=1.2, label="control LP")
    a.yaxis.set_major_formatter(FuncFormatter(usd))
    adv = (ts.lp_on.iloc[-1] - ts.lp_off.iloc[-1])
    a.set_title(f"LP value retained (final advantage {usd(adv,0)})"); a.legend(fontsize=7, loc="upper left")
    # lvr
    a = axs[1, 0]
    a.plot(ts.idx, ts.cum_lvr_on, C_POIN, lw=1.4, label="Poincaré")
    a.plot(ts.idx, ts.cum_lvr_off, C_CTRL, lw=1.2, label="control")
    a.fill_between(ts.idx, ts.cum_lvr_on, ts.cum_lvr_off, color="green", alpha=0.12)
    a.yaxis.set_major_formatter(FuncFormatter(usd))
    on, off = ts.cum_lvr_on.iloc[-1], ts.cum_lvr_off.iloc[-1]
    a.set_title(f"cumulative LVR ({(off-on)/off*100:.1f}% lower)"); a.legend(fontsize=7, loc="upper left")
    # kappa
    a = axs[1, 1]
    a.fill_between(ts.idx, 0, ts.kappa * 100, color=C_POIN, alpha=0.4)
    a.set_ylabel("κ (%)"); a.set_title("detector asymmetry κ (engages on trends)")
    for ax in axs.flat:
        ax.set_xlabel("block")
    fig.suptitle("Poincaré vs constant-product — WETH/USDC stress simulation on a Sepolia v4 fork",
                 fontsize=13, y=1.0)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "sim_dashboard.png"), bbox_inches="tight")
    plt.close(fig)


def main():
    ts, summ, orders = load()
    fig_price(ts)
    fig_lpvalue(ts)
    fig_lvr(ts)
    fig_kappa(ts)
    fig_scenarios(summ)
    fig_orderbook(orders)
    fig_dashboard(ts, summ)
    on, off = ts.cum_lvr_on.iloc[-1], ts.cum_lvr_off.iloc[-1]
    adv = ts.lp_on.iloc[-1] - ts.lp_off.iloc[-1]
    print(f"blocks={len(ts)}  orders={len(orders)}")
    print(f"cum LVR: poincare={on:,.0f}  control={off:,.0f}  reduction={(off-on)/off*100:.1f}%")
    print(f"final LP advantage (poincare - control) = {adv:,.0f} USDC")
    print(f"wrote graphs to {OUT}")


if __name__ == "__main__":
    main()
