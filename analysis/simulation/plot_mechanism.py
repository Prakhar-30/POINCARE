#!/usr/bin/env python3
"""
The two mechanism diagrams for the README: what the actuator is, and what drives it.
Renders fig1_spread.png and fig4_control_law.png into ../../public/.

    python analysis/simulation/plot_mechanism.py

WHY THESE ARE DRAWN IN PRICE SPACE AND NOT RESERVE SPACE.

The first version of fig 1 showed three hyperbolas of different curvature - a calm one, a
"sharpened" trend side, a "kept flat" counter-trend side. That is a picture of a mechanism
this hook does not implement: a depth/curvature lever was built, measured across four years
of real ETH/USDC and lost by roughly thirty to one, and it is closed (OPEN_ITEMS E1).

The second version kept reserve space and drew the execution locus on it. That was accurate
and still wrong, for a reason worth writing down: THE CONSTANT-PRODUCT CURVE IS CURVED, so
any line drawn near it reads as "a different curve", whatever the legend says. Reserve space
cannot show a spread without implying a shape change.

A spread is not a shape. It is a price. So these are drawn the way a market maker draws a
spread - as two quotes around a mid - and no hyperbola appears anywhere. The pool's curve is
x*y=k in every regime and in both directions; what the detector moves is the price the
with-trend side is quoted, and nothing else.
"""
import os
import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, "realdata", "fouryear_compare.csv")
SRC = os.path.join(HERE, "realdata", "eth_usdc_4h_4y.csv")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public"))
os.makedirs(OUT, exist_ok=True)
WAD = 1e18

C_MID, C_SOFT, C_HARD, C_GHOST = "#6f68c9", "#1a9e6a", "#d98c00", "#9aa0a6"

plt.rcParams.update(
    {
        "figure.dpi": 130,
        "font.size": 10,
        "axes.grid": True,
        "grid.alpha": 0.22,
        "axes.spines.top": False,
        "axes.spines.right": False,
    }
)

# =====================================================================  fig 1: the spread
fig = plt.figure(figsize=(12.6, 5.2))
gs = fig.add_gridspec(2, 2, width_ratios=[1, 1.7], height_ratios=[2.6, 1], wspace=0.22, hspace=0.12)
axL = fig.add_subplot(gs[:, 0])
axR = fig.add_subplot(gs[0, 1])
axK = fig.add_subplot(gs[1, 1], sharex=axR)

# ---------------------------------------------------- left: the quote, at one instant
MID = 100.0
KAPPA = 9.0  # exaggerated; the deployed cap is 5%
BARW = 0.30

axL.axhline(MID, color=C_MID, lw=2.4, zorder=3)
axL.text(1.62, MID + 0.5, "the pool's price\n(x·y = k, unchanged)", fontsize=8.6,
         color=C_MID, fontweight="bold", va="bottom", ha="right")

for i, ask in enumerate([MID, MID + KAPPA]):
    axL.plot([i - BARW - 0.05, i - 0.02], [ask, ask], color=C_HARD, lw=6, zorder=5,
             solid_capstyle="butt")
    axL.plot([i + 0.02, i + BARW + 0.05], [MID, MID], color=C_SOFT, lw=6, zorder=5,
             solid_capstyle="butt")
    if ask > MID:
        axL.add_patch(plt.Rectangle((i - BARW - 0.05, MID), BARW + 0.03, ask - MID,
                                    color=C_HARD, alpha=0.20, zorder=2))
        axL.annotate("", xy=(i - BARW / 2, ask), xytext=(i - BARW / 2, MID),
                     arrowprops=dict(arrowstyle="<->", color="#7a5200", lw=1.5))
        axL.text(i - BARW / 2 + 0.035, MID + KAPPA / 2, "κ", ha="left", va="center",
                 fontsize=13, color="#7a5200", fontweight="bold")

axL.set_xticks([0, 1])
axL.set_xticklabels(["calm\nno trend detected", "up-trend detected\nκ on one side only"],
                    fontsize=9, fontweight="bold")
axL.set_xlim(-0.62, 1.66)
axL.set_ylim(MID - 7, MID + 15)
axL.set_ylabel("executable price")
axL.set_title("Fig 1 — The detector moves the quote", loc="left", fontweight="bold", fontsize=11)
axL.tick_params(axis="x", length=0)
axL.grid(axis="x", visible=False)

leg = [
    plt.Line2D([], [], color=C_HARD, lw=4, label="buying  ·  with the trend"),
    plt.Line2D([], [], color=C_SOFT, lw=4, label="selling  ·  against the trend"),
]
axL.legend(handles=leg, frameon=False, fontsize=8.4, loc="upper left")

# ---------------------------------------------- right: the same thing, on a real trend
d = pd.read_csv(CSV)
d["price"] = d["price"].astype(float) / WAD
d["k"] = d["kProp"].astype(float) / WAD
stamps = pd.to_datetime(pd.read_csv(SRC)["iso_time"]).values
d["t"] = stamps[d["bar"].values]

LO, HI = np.datetime64("2025-06-20"), np.datetime64("2025-09-05")
seg = d[(d["t"] >= LO) & (d["t"] <= HI)].reset_index(drop=True)
mid, k, tr = seg["price"].values, seg["k"].values, seg["trendProp"].values

# Only the WITH-trend side is moved, and which side that is comes from the detector's own
# output rather than being assumed.
ask = mid * (1 + np.where(tr == 1, k, 0.0))
bid = mid * (1 - np.where(tr == 2, k, 0.0))

axR.fill_between(seg["t"], mid, ask, color=C_HARD, alpha=0.75, lw=0, zorder=3,
                 label="κ · charged to whoever pushes WITH the trend")
axR.fill_between(seg["t"], bid, mid, color=C_HARD, alpha=0.75, lw=0, zorder=3)
axR.plot(seg["t"], mid, color=C_MID, lw=2.0, zorder=4,
         label="the pool's price · the same curve throughout")
axR.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"${v:,.0f}"))
axR.set_ylabel("ETH/USDC")
axR.set_title("…and here it is on real ETH/USDC", loc="left", fontweight="bold", fontsize=11)
axR.legend(frameon=False, fontsize=8.4, loc="upper left")
axR.tick_params(labelbottom=False)

axK.fill_between(seg["t"], 0, k * 1e4, where=(tr == 1), color=C_HARD, alpha=0.9, lw=0,
                 label="up-trend: buyers pay")
axK.fill_between(seg["t"], 0, -k * 1e4, where=(tr == 2), color=C_SOFT, alpha=0.9, lw=0,
                 label="down-trend: sellers pay")
axK.axhline(0, color="#888", lw=1)
axK.set_ylabel("κ (bps)", fontsize=9)
axK.legend(frameon=False, fontsize=7.8, ncol=2, loc="lower left")
axK.set_yticks([-500, 0, 500])
axK.set_yticklabels(["500", "0", "500"], fontsize=8)

plt.setp(axK.get_xticklabels(), rotation=28, ha="right", fontsize=8.5)
fig.text(0.635, -0.055,
         "The band opens on ONE side at a time, sized by the evidence, and closes when the trend does. "
         "The price line underneath it never moves.",
         ha="center", fontsize=8.8, color="#555")
fig.savefig(os.path.join(OUT, "fig1_spread.png"), bbox_inches="tight")
plt.close(fig)

# ==========================================  fig 4: evidence to a bounded spread
fig, ax = plt.subplots(figsize=(9, 4.3))
s = np.linspace(0, 9, 500)
h, smax = 4.5, 7.4
t = np.clip((s - h) / (smax - h), 0, 1)
kappa = 0.05 + (1.0 - 0.05) * (t * t * (3 - 2 * t))  # smoothstep, as ControlLaw does

ax.plot(s, kappa, color=C_MID, lw=3.2)
ax.axvline(h, color="#d64550", lw=1.8, ls="--", label="detection threshold  h")
ax.axhline(1.0, color="#888", lw=1, ls=":")
ax.axhline(0.05, color="#888", lw=1, ls=":")

ax.annotate(
    "below threshold: no spread.\nboth sides are quoted the pool price.",
    xy=(1.6, 0.05),
    xytext=(0.35, 0.30),
    fontsize=9,
    color=C_SOFT,
    arrowprops=dict(arrowstyle="->", color=C_SOFT, lw=1.1),
)
ax.annotate(
    "bounded: κ_max caps the spread, so the soft-side\ngain can never exceed the cost to trigger",
    xy=(8.1, 1.0),
    xytext=(4.75, 0.66),
    fontsize=9,
    color=C_HARD,
    arrowprops=dict(arrowstyle="->", color=C_HARD, lw=1.1),
)

ax.set_xlabel("accumulated evidence  $S_t$  (CUSUM)")
ax.set_ylabel("directional spread  κ  (fraction of κ_max)")
ax.set_title("Fig 4 — The control law: evidence to a bounded spread", loc="left", fontweight="bold")
ax.set_ylim(-0.04, 1.12)
ax.legend(frameon=False, fontsize=9, loc="center right")
fig.tight_layout()
fig.savefig(os.path.join(OUT, "fig4_control_law.png"))
plt.close(fig)

print("wrote fig1_spread.png and fig4_control_law.png to", OUT)
