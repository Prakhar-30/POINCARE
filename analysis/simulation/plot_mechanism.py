#!/usr/bin/env python3
"""
The two mechanism diagrams for the README: what the actuator is, and what drives it.
Renders fig1_spread.png and fig4_control_law.png into ../../public/.

    python analysis/simulation/plot_mechanism.py

WHY THESE WERE REDRAWN. The originals showed three curves of different curvature - a calm
one, a "sharpened" trend side and a "kept flat" counter-trend side - which is a picture of a
mechanism this hook does not implement. A depth/curvature lever was built, made round-trip
safe and split-invariant, measured across four years of real ETH/USDC, and lost by roughly
thirty to one (analysis/OPEN_ITEMS.md E1). It is closed, and there is no depth-asymmetry mode
in the codebase.

What ships is a NON-NEGATIVE DIRECTIONAL SPREAD on a single symmetric constant-product curve.
The pool's curve is the same shape in every regime and in both directions. Under a detected
trend the with-trend side is quoted a price worse by kappa, which the LP keeps; the
against-trend side keeps trading at the plain curve price. That asymmetry is what makes every
round trip unprofitable by construction: the spread only ever worsens the trader's execution,
and it sits on a base that never moves.
"""
import os
import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public"))
os.makedirs(OUT, exist_ok=True)

C_CURVE, C_SOFT, C_HARD, C_GHOST = "#6f68c9", "#1a9e6a", "#d98c00", "#9aa0a6"

plt.rcParams.update(
    {
        "figure.dpi": 130,
        "font.size": 10,
        "axes.grid": True,
        "grid.alpha": 0.25,
        "axes.spines.top": False,
        "axes.spines.right": False,
    }
)

# ----------------------------------------------------------------- fig 1: the spread
K = 10_000.0
X0 = 100.0
Y0 = K / X0
# Exaggerated for legibility. The deployed cap is kappa_max = 0.05; this is a diagram.
KAPPA = 0.22
RAY = 9.0

fig, (ax, axq) = plt.subplots(1, 2, figsize=(11.6, 4.9), gridspec_kw={"width_ratios": [1.25, 1]})

x = np.linspace(70, 145, 400)
ax.plot(x, K / x, color=C_CURVE, lw=3, zorder=3, label="the pool's curve, x·y = k")

slope = -K / (X0 * X0)  # dy/dx at the operating point


def ray(m, d):
    dx = d * RAY / np.sqrt(1 + m * m) * 3.2
    return [X0, X0 + dx], [Y0, Y0 + m * dx]


# WHERE THE RESERVES LAND AFTER A TRADE, which is the honest way to draw this.
#
# Against the trend the trader is quoted the plain curve price, so the post-trade reserves sit
# exactly ON the curve: the green is the purple, traced.
#
# With the trend the trader pays kappa, meaning they receive (1-kappa) of the token1 the curve
# alone would have given. Less token1 leaves the pool, so the post-trade reserves land ABOVE
# the curve, and the gap is what the LP keeps. Drawing it as a rotated tangent, as the first
# version did, quietly implies a second curve; drawing the execution locus does not.
xs = np.linspace(78, X0, 200)  # against-trend leg
xh = np.linspace(X0, 126, 200)  # with-trend leg
y_curve_h = K / xh
y_exec_h = Y0 - (Y0 - y_curve_h) * (1 - KAPPA)

ax.fill_between(xh, y_curve_h, y_exec_h, color=C_HARD, alpha=0.20, zorder=2,
                label="κ · retained by the LP")
ax.plot(xh, y_curve_h, color=C_GHOST, lw=1.5, ls="--", zorder=3)
ax.plot(xs, K / xs, color=C_SOFT, lw=3.4, zorder=4, label="against the trend · executes on the curve")
ax.plot(xh, y_exec_h, color=C_HARD, lw=3.4, zorder=4, label="with the trend · executes above it")
ax.plot([X0], [Y0], "o", ms=9, color=C_CURVE, zorder=5)

ax.annotate(
    "operating point\n(current reserves)",
    xy=(X0, Y0),
    xytext=(X0 + 2.5, Y0 + 16),
    fontsize=9,
    arrowprops=dict(arrowstyle="->", color="#444", lw=1.1),
)
ax.annotate(
    "one curve.\nthe shape never changes.",
    xy=(88, K / 88),
    xytext=(80.5, 96.5),
    fontsize=9,
    color=C_CURVE,
    fontweight="bold",
    arrowprops=dict(arrowstyle="->", color=C_CURVE, lw=1.1),
)

ax.set_xlabel("reserve  x  (token0)")
ax.set_ylabel("reserve  y  (token1)")
ax.set_title(
    "Fig 1 — The asymmetry is in the quote, not the curve",
    loc="left",
    fontweight="bold",
)
ax.set_xlim(78, 126)
ax.set_ylim(78, 126)
ax.legend(frameon=False, fontsize=8.2, loc="lower left")

# right panel: the same thing as a price, which is where a trader actually meets it
sizes = np.linspace(0, 18, 200)
mid = K / (X0 + sizes) / ((K / (X0 + sizes))[0] / (Y0 / X0))  # cosmetic normalisation
base = (K / (X0 + sizes) - Y0) / -sizes[1:].mean()  # marginal price proxy
base = Y0 / (X0 + sizes)  # price of token0 in token1 along the curve

axq.plot(sizes, base, color=C_SOFT, lw=3, label="against the trend · base price")
axq.plot(sizes, base * (1 - KAPPA), color=C_HARD, lw=3, label="with the trend · base − κ")
axq.fill_between(sizes, base * (1 - KAPPA), base, color=C_HARD, alpha=0.18, label="κ retained by the LP")
axq.set_xlabel("trade size")
axq.set_ylabel("token1 received per token0 in")
axq.set_ylim(base[-1] * 0.955 * (1 - KAPPA), base[0] * 1.012)
axq.set_title("The same κ, seen as execution", loc="left", fontweight="bold")
axq.text(0.985, 0.975, "κ exaggerated for legibility;\ndeployed cap is 0.05", transform=axq.transAxes,
         ha="right", va="top", fontsize=7.8, color="#888")
axq.legend(frameon=False, fontsize=8.6, loc="lower left")
axq.annotate(
    "both sides fall away with size\nfor the ordinary constant-product\nreason; only the gap is κ",
    xy=(12.5, base[139] * (1 - KAPPA / 2)),
    xytext=(1.2, base[0] * 0.90),
    fontsize=8.4,
    color="#555",
    arrowprops=dict(arrowstyle="->", color="#777", lw=1.0),
)

fig.tight_layout()
fig.savefig(os.path.join(OUT, "fig1_spread.png"))
plt.close(fig)

# ------------------------------------------------- fig 4: evidence to a bounded spread
fig, ax = plt.subplots(figsize=(9, 4.3))
s = np.linspace(0, 9, 500)
h, smax = 4.5, 7.4
t = np.clip((s - h) / (smax - h), 0, 1)
kappa = 0.05 + (1.0 - 0.05) * (t * t * (3 - 2 * t))  # smoothstep, as ControlLaw does

ax.plot(s, kappa, color=C_CURVE, lw=3.2)
ax.axvline(h, color="#d64550", lw=1.8, ls="--", label="detection threshold  h")
ax.axhline(1.0, color="#888", lw=1, ls=":")
ax.axhline(0.05, color="#888", lw=1, ls=":")

ax.annotate(
    "below threshold: no spread.\nboth directions get the base price.",
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
ax.set_title(
    "Fig 4 — The control law: evidence to a bounded spread",
    loc="left",
    fontweight="bold",
)
ax.set_ylim(-0.04, 1.12)
ax.legend(frameon=False, fontsize=9, loc="center right")
fig.tight_layout()
fig.savefig(os.path.join(OUT, "fig4_control_law.png"))
plt.close(fig)

print("wrote fig1_spread.png and fig4_control_law.png to", OUT)
