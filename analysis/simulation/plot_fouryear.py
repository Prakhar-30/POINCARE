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

C_5, C_30, C_LIVE, C_PROP, C_HODL = "#9e9e9e", "#ff7f0e", "#1f77b4", "#2ca02c", "#bbbbbb"

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
ax.plot(d["t"], d["lpLive"], color=C_LIVE, lw=1.7, label="Poincare, live config")
ax.plot(d["t"], d["lpProp"], color=C_PROP, lw=1.9, label="Poincare, proposed config")
year_lines(ax)
ax.yaxis.set_major_formatter(FuncFormatter(usd))
ax.set_ylabel("LP value, marked at the external fair price")
ax.set_title("What a $2,000,000 position was worth\n7,776 real ETH/USDC 4h bars, one identical path", loc="left")
ax.legend(frameon=False, fontsize=9, loc="upper left", ncol=2)

# the four pools track within a few percent across a 2.5x price range, so the whole story is
# invisible on the raw axis; the difference against the 30bps pool is the story
axd.axhline(0, color=C_30, lw=1.4)
axd.plot(d["t"], d["lp5"] - d["lp30"], color=C_5, lw=1.2, label="5bps")
axd.plot(d["t"], d["lpLive"] - d["lp30"], color=C_LIVE, lw=1.6, label="live config")
axd.plot(d["t"], d["lpProp"] - d["lp30"], color=C_PROP, lw=1.8, label="proposed config")
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
ax.plot(d["t"], d["arbLive"], color=C_LIVE, lw=1.7, label="Poincare, live config")
ax.plot(d["t"], d["arbProp"], color=C_PROP, lw=1.9, label="Poincare, proposed config")
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
# measured independently per year in test_year3way_*; restated here
years = ["year 1\n1,308 to 2,477", "year 2\n2,469 to 3,920",
         "year 3\n3,850 to 4,026", "year 4\n4,012 to 2,481"]
live = [5, 82, 136, 82]
prop = [57, 197, 234, 129]
x = np.arange(len(years))
w = 0.36
fig, ax = plt.subplots(figsize=(9, 4.2))
ax.bar(x - w / 2, live, w, color=C_LIVE, label="live config")
ax.bar(x + w / 2, prop, w, color=C_PROP, label="proposed config")
for i, (a, b) in enumerate(zip(live, prop)):
    ax.text(i - w / 2, a + 4, f"+{a}", ha="center", fontsize=9, color=C_LIVE)
    ax.text(i + w / 2, b + 4, f"+{b}", ha="center", fontsize=9, color=C_PROP)
ax.axhline(0, color="#444", lw=1)
ax.set_xticks(x, years, fontsize=9)
ax.set_ylabel("basis points of LP value vs a 30bps pool")
ax.set_title("Advantage over an ordinary 30bps pool, year by year\neach year an independent pool seeded at that year's opening price", loc="left")
ax.legend(frameon=False, fontsize=9)
ax.grid(axis="x", visible=False)
fig.tight_layout()
fig.savefig(os.path.join(OUT, "year_by_year.png"))
plt.close(fig)

# --------------------------------------------- fig 4: what the gate change does
# Raw kappa aliases into noise at a 12-bar sample. The quantity the gate actually moves is the
# FRACTION of bars on which kappa is engaged at all, so plot that on a rolling window.
W = 45  # samples, about a month of 4h bars at this sampling rate
engL = (d["kLive"] > 0).rolling(W, min_periods=5).mean() * 100
engP = (d["kProp"] > 0).rolling(W, min_periods=5).mean() * 100

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(9, 5.4), sharex=True,
                               gridspec_kw={"height_ratios": [1.5, 1]})
ax1.plot(d["t"], d["price"], color="#444", lw=1.0)
ax1.set_ylabel("ETH/USDC")
ax1.set_title("What the gate change does\nthe detector acts on 32% of bars before, 63% after, at an unchanged mean fee", loc="left")
ax2.plot(d["t"], engL, color=C_LIVE, lw=1.6, label="live, dFloor 0.50")
ax2.plot(d["t"], engP, color=C_PROP, lw=1.8, label="proposed, dFloor 0.25")
ax2.axhline(32.0, color=C_LIVE, lw=0.9, ls=":")
ax2.axhline(63.2, color=C_PROP, lw=0.9, ls=":")
ax2.set_ylabel("% of bars with kappa engaged\n(rolling month)")
ax2.set_ylim(0, 100)
ax2.legend(frameon=False, fontsize=9, loc="lower right", ncol=2)
for a in (ax1, ax2):
    year_lines(a)
mark_gap(ax1, label=True)
fig.autofmt_xdate()
fig.tight_layout()
fig.savefig(os.path.join(OUT, "gate_engagement.png"))
plt.close(fig)

print("wrote 4 figures to", OUT)
