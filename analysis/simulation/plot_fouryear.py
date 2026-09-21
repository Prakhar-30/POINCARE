#!/usr/bin/env python3
"""
Figures for the four-year configuration comparison (test/optimal/GammaFourYear.t.sol,
test_dumpTimeseries). Four pools stepped over one identical path of 7,776 real ETH/USDC 4h
closes. Renders into ../../public/fouryear/.

Regenerate the CSV first:
  FOUNDRY_PROFILE=sweep forge test --match-path test/optimal/GammaFourYear.t.sol \
      --match-test test_dumpTimeseries
"""
import os
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, "realdata", "fouryear_compare.csv")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "fouryear"))
os.makedirs(OUT, exist_ok=True)
WAD = 1e18

C_5, C_30, C_POIN, C_HODL = "#9e9e9e", "#ff7f0e", "#2ca02c", "#bbbbbb"

plt.rcParams.update({"figure.dpi": 130, "font.size": 10, "axes.grid": True,
                     "grid.alpha": 0.25, "axes.spines.top": False,
                     "axes.spines.right": False})


def usd(x, _):
    if abs(x) >= 1e6:
        return f"${x/1e6:.2f}M"
    if abs(x) >= 1e3:
        return f"${x/1e3:.0f}k"
    return f"${x:.0f}"


d = pd.read_csv(CSV)
for c in d.columns:
    if c != "bar":
        d[c] = d[c].astype(float) / WAD

# REAL dates, not bar index. The series spans four calendar years (2022-09-19 to 2026-09-18)
# but holds 7,776 bars where a gapless 4h series would hold 8,766, so deriving the x axis from
# the bar count alone compresses it by about 11% and mislabels when things happened.
src = pd.read_csv(os.path.join(HERE, "realdata", "eth_usdc_4h_4y.csv"))
stamps = pd.to_datetime(src["iso_time"]).values
d["t"] = stamps[d["bar"].values]

BARS = int(d["bar"].iloc[-1]) + 1
QUARTER_MARKS = [stamps[int(BARS * f)] for f in (0.25, 0.5, 0.75)]

# THE DATASET HAS ONE HOLE: 2022-09-29 to 2023-03-12, 3,940 hours, which the replay is forced
# to treat as a single 4h step. Shading it keeps a reader from mistaking the straight line for
# five calm months. Excluding it entirely moves the headline by 13 to 25bps and changes no
# conclusion; see test_gapExcluded.
GAP = (np.datetime64("2022-09-29T00:00"), np.datetime64("2023-03-12T04:00"))


def mark_gap(ax, label=False):
    ax.axvspan(GAP[0], GAP[1], color="#f0f0f0", zorder=0)
    if label:
        ax.text(GAP[0] + (GAP[1] - GAP[0]) / 2, ax.get_ylim()[1],
                "no data", ha="center", va="top", fontsize=8, color="#999999")


def year_lines(ax):
    mark_gap(ax)
    for t in QUARTER_MARKS:
        ax.axvline(t, color="#cccccc", lw=0.8, ls=":", zorder=0)


# ---------------------------------------------------------------- fig 1: LP value
fig, (ax, axd) = plt.subplots(2, 1, figsize=(9, 6.4), sharex=True,
                              gridspec_kw={"height_ratios": [2.1, 1]})
ax.plot(d["t"], d["hodl"], color=C_HODL, lw=1.2, ls="--", label="buy and hold")
ax.plot(d["t"], d["lp5"], color=C_5, lw=1.3, label="normal pool, 5bps")
ax.plot(d["t"], d["lp30"], color=C_30, lw=1.4, label="normal pool, 30bps")
ax.plot(d["t"], d["lpProp"], color=C_POIN, lw=2.1, label="Poincaré")
year_lines(ax)
ax.yaxis.set_major_formatter(FuncFormatter(usd))
ax.set_ylabel("LP value, marked at the external fair price")
ax.set_title("What a $2,000,000 position was worth\n7,776 real ETH/USDC 4h bars, one identical path", loc="left")
ax.legend(frameon=False, fontsize=9, loc="upper left", ncol=2)

# the four pools track within a few percent across a 2.5x price range, so the whole story is
# invisible on the raw axis; the difference against the 30bps pool is the story
axd.axhline(0, color=C_30, lw=1.4)
axd.plot(d["t"], d["lp5"] - d["lp30"], color=C_5, lw=1.3, label="normal pool, 5bps")
axd.plot(d["t"], d["lpProp"] - d["lp30"], color=C_POIN, lw=2.0, label="Poincaré")
axd.yaxis.set_major_formatter(FuncFormatter(usd))
axd.set_ylabel("vs the 30bps pool")
axd.legend(frameon=False, fontsize=9, loc="upper left", ncol=3)
year_lines(axd)
fig.autofmt_xdate()
fig.tight_layout()
fig.savefig(os.path.join(OUT, "lp_value.png"))
plt.close(fig)

# ------------------------------------------------- fig 2: cumulative arb extracted
fig, ax = plt.subplots(figsize=(9, 4.6))
ax.plot(d["t"], d["arb5"], color=C_5, lw=1.3, label="normal pool, 5bps")
ax.plot(d["t"], d["arb30"], color=C_30, lw=1.4, label="normal pool, 30bps")
ax.plot(d["t"], d["arbProp"], color=C_POIN, lw=2.1, label="Poincaré")
year_lines(ax)
ax.yaxis.set_major_formatter(FuncFormatter(usd))
ax.set_ylabel("cumulative value taken by arbitrageurs")
ax.set_title("Arbitrage extraction, cumulative\nlower is better; this is LP money leaving the pool", loc="left")
ax.legend(frameon=False, fontsize=9, loc="upper left")
fig.autofmt_xdate()
fig.tight_layout()
fig.savefig(os.path.join(OUT, "arb_extracted.png"))
plt.close(fig)

# ------------------------------------------------------- fig 3: year-by-year bars
# Measured independently per year in test_year3way_*; each year is its own pool, seeded at that
# year's opening price, so a good start cannot carry forward.
years = ["2022-09 to 2023-09\n\$1,308 to \$2,477", "2023-09 to 2024-09\n\$2,469 to \$3,920",
         "2024-09 to 2025-09\n\$3,850 to \$4,026", "2025-09 to 2026-09\n\$4,012 to \$2,481"]
poin = [57, 197, 234, 129]
x = np.arange(len(years))
fig, ax = plt.subplots(figsize=(9, 4.2))
ax.bar(x, poin, 0.52, color=C_POIN)
for i, v in enumerate(poin):
    ax.text(i, v + 5, f"+{v}", ha="center", fontsize=10, fontweight="bold", color=C_POIN)
ax.axhline(0, color="#444", lw=1)
ax.set_xticks(x, years, fontsize=9)
ax.set_ylabel("basis points of LP value vs a 30bps pool")
ax.set_ylim(0, 270)
ax.set_title("Advantage over an ordinary 30bps pool, year by year\nahead in every year, through a doubling, a flat stretch and a 38% drawdown", loc="left")
ax.grid(axis="x", visible=False)
fig.tight_layout()
fig.savefig(os.path.join(OUT, "year_by_year.png"))
plt.close(fig)

# --------------------------------------------- fig 4: when the detector is engaged
# Raw kappa aliases into noise at a 12-bar sample. The quantity that matters is the FRACTION
# of bars on which kappa is engaged at all, so plot that on a rolling window.
W = 45  # samples, about a month of 4h bars at this sampling rate
eng = (d["kProp"] > 0).rolling(W, min_periods=5).mean() * 100

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(9, 5.4), sharex=True,
                               gridspec_kw={"height_ratios": [1.5, 1]})
ax1.plot(d["t"], d["price"], color="#444", lw=1.0)
ax1.set_ylabel("ETH/USDC")
ax1.set_title("How often the detector is engaged\n63% of bars on average, rising into trends and easing off in the quiet stretches", loc="left")
ax2.plot(d["t"], eng, color=C_POIN, lw=1.8)
ax2.axhline(63.2, color=C_POIN, lw=0.9, ls=":")
ax2.text(d["t"].iloc[-2], 63.2, " 63% avg", fontsize=8.5, color=C_POIN, fontweight="bold",
         va="center", ha="left", clip_on=False)
ax2.set_ylabel("% of bars with kappa engaged\n(rolling month)")
ax2.set_ylim(0, 100)
ax2.set_xlim(d["t"].iloc[0], d["t"].iloc[-1])
for a in (ax1, ax2):
    year_lines(a)
mark_gap(ax1, label=True)
fig.autofmt_xdate()
fig.tight_layout()
fig.savefig(os.path.join(OUT, "gate_engagement.png"))
plt.close(fig)

print("wrote 4 figures to", OUT)
