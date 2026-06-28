#!/usr/bin/env python3
"""
Plots for the REAL-DATA run (test/sim/ForkRealData.t.sol): 6 months of actual Binance ETHUSDC
4h closes fed through the hook on a Sepolia v4 fork. Renders into ../../public/sim/real/.
"""
import os
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import matplotlib.dates as mdates

HERE = os.path.dirname(os.path.abspath(__file__))
RD = os.path.join(HERE, "realdata")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "sim", "real"))
os.makedirs(OUT, exist_ok=True)
WAD = 1e18
C_POIN, C_CTRL, C_FAIR = "#1f77b4", "#d62728", "#444444"

plt.rcParams.update({"figure.dpi": 120, "font.size": 10, "axes.grid": True,
                     "grid.alpha": 0.25, "axes.spines.top": False, "axes.spines.right": False})


def usd(x, _):
    if abs(x) >= 1e6: return f"${x/1e6:.2f}M"
    if abs(x) >= 1e3: return f"${x/1e3:.0f}k"
    return f"${x:.0f}"


def load():
    ts = pd.read_csv(os.path.join(RD, "timeseries.csv"), dtype=str)
    for c in ["fair", "price_on", "price_off", "kappa", "d", "lp_on", "lp_off",
              "cum_lvr_on", "cum_lvr_off", "cum_noise_on"]:
        ts[c] = ts[c].astype(float) / WAD
    for c in ["block", "phase", "trend"]:
        ts[c] = ts[c].astype(int)
    # attach real dates (price row t corresponds to candle index t)
    px = pd.read_csv(os.path.join(RD, "eth_usdc_4h.csv"), parse_dates=["iso_time"])
    ts["date"] = px["iso_time"].iloc[ts["block"].values].values
    summ = pd.read_csv(os.path.join(RD, "summary.csv"))
    return ts, summ


def fig_price_kappa(ts):
    fig, ax = plt.subplots(figsize=(12, 5))
    ax.plot(ts.date, ts.fair, color=C_FAIR, lw=1.2, label="real ETH/USDC (Binance 4h)")
    ax.plot(ts.date, ts.price_on, color=C_POIN, lw=0.8, alpha=0.7, label="Poincaré pool")
    ax.set_ylabel("USDC per ETH"); ax.set_xlabel("date")
    ax.set_title("Real 6-month ETH/USDC — price, with detector engagement")
    ax.legend(loc="upper right", fontsize=8)
    axk = ax.twinx()
    axk.fill_between(ts.date, 0, ts.kappa * 100, color=C_POIN, alpha=0.25)
    axk.set_ylabel("κ spread (%)", color=C_POIN); axk.set_ylim(0, 6); axk.spines.top.set_visible(False)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    fig.tight_layout(); fig.savefig(os.path.join(OUT, "real_price_kappa.png")); plt.close(fig)


def fig_lpvalue(ts):
    fig, (ax, ax2) = plt.subplots(2, 1, figsize=(12, 6.5), sharex=True, gridspec_kw={"height_ratios": [2, 1]})
    ax.plot(ts.date, ts.lp_on, color=C_POIN, lw=1.5, label="Poincaré LP value")
    ax.plot(ts.date, ts.lp_off, color=C_CTRL, lw=1.3, label="control (x·y=k) LP value")
    ax.set_ylabel("LP value (USDC, marked at fair)"); ax.yaxis.set_major_formatter(FuncFormatter(usd))
    ax.set_title("LP value on REAL ETH/USDC history — Poincaré vs constant-product")
    ax.legend(loc="upper right", fontsize=9)
    diff = ts.lp_on - ts.lp_off
    ax2.fill_between(ts.date, 0, diff, color=C_POIN, alpha=0.35); ax2.plot(ts.date, diff, color=C_POIN, lw=1.1)
    ax2.axhline(0, color="#888", lw=0.8); ax2.set_ylabel("Poincaré − control")
    ax2.yaxis.set_major_formatter(FuncFormatter(usd)); ax2.set_xlabel("date")
    ax2.annotate(f"final advantage: {usd(diff.iloc[-1],0)}", xy=(ts.date.iloc[-1], diff.iloc[-1]),
                 xytext=(-170, 8), textcoords="offset points", fontsize=9, color=C_POIN, fontweight="bold")
    ax2.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    fig.tight_layout(); fig.savefig(os.path.join(OUT, "real_lpvalue.png")); plt.close(fig)


def fig_lvr(ts):
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.plot(ts.date, ts.cum_lvr_on, color=C_POIN, lw=1.5, label="Poincaré cumulative LVR")
    ax.plot(ts.date, ts.cum_lvr_off, color=C_CTRL, lw=1.3, label="control cumulative LVR")
    ax.fill_between(ts.date, ts.cum_lvr_on, ts.cum_lvr_off, color="green", alpha=0.12, label="LVR avoided")
    ax.set_ylabel("cumulative LVR (USDC)"); ax.yaxis.set_major_formatter(FuncFormatter(usd)); ax.set_xlabel("date")
    on, off = ts.cum_lvr_on.iloc[-1], ts.cum_lvr_off.iloc[-1]
    ax.set_title(f"Cumulative LVR on real ETH/USDC — {(off-on)/off*100:.1f}% lower with Poincaré")
    ax.legend(loc="upper left", fontsize=9)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    fig.tight_layout(); fig.savefig(os.path.join(OUT, "real_lvr.png")); plt.close(fig)


def fig_months(summ):
    fig, ax = plt.subplots(figsize=(11, 4.5))
    x = np.arange(len(summ)); w = 0.38
    on = summ.lvr_poincare.astype(float) / WAD
    off = summ.lvr_control.astype(float) / WAD
    ax.bar(x - w/2, off, w, color=C_CTRL, label="control LVR")
    ax.bar(x + w/2, on, w, color=C_POIN, label="Poincaré LVR")
    ax.set_xticks(x); ax.set_xticklabels([f"month {i+1}" for i in range(len(summ))], fontsize=8)
    ax.set_ylabel("LVR (USDC)"); ax.yaxis.set_major_formatter(FuncFormatter(usd))
    ax.set_title("LVR by month over the real 6-month window"); ax.legend(fontsize=9)
    for i in range(len(summ)):
        bps = int(summ.lvr_reduction_bps.iloc[i])
        if bps > 0:
            ax.text(x[i], max(on.iloc[i], off.iloc[i]), f"-{bps/100:.0f}%", ha="center", va="bottom",
                    fontsize=8, color="green", fontweight="bold")
    fig.tight_layout(); fig.savefig(os.path.join(OUT, "real_months.png")); plt.close(fig)


def main():
    ts, summ = load()
    fig_price_kappa(ts); fig_lpvalue(ts); fig_lvr(ts); fig_months(summ)
    on, off = ts.cum_lvr_on.iloc[-1], ts.cum_lvr_off.iloc[-1]
    adv = ts.lp_on.iloc[-1] - ts.lp_off.iloc[-1]
    print(f"points={len(ts)+1}  ETH {ts.fair.iloc[0]:.0f}->{ts.fair.iloc[-1]:.0f}")
    print(f"cum LVR poincare={on:,.0f} control={off:,.0f} reduction={(off-on)/off*100:.2f}%")
    print(f"final LP advantage = {adv:,.0f} USDC ; cumulative noise tax = {ts.cum_noise_on.iloc[-1]:,.0f} USDC")
    print(f"wrote graphs to {OUT}")


if __name__ == "__main__":
    main()
