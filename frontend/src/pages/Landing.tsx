import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mark, Wordmark } from "@/components/brand/Logo";
import { CurveVisual } from "@/components/brand/CurveVisual";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon, type IconName } from "@/components/ui/Icon";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const, delay },
});

function LaunchButton({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <Link
      to="/app"
      className="group inline-flex items-center gap-2 font-bold transition-transform hover:-translate-y-0.5"
      style={{
        color: "#fff",
        background: "var(--lav)",
        borderRadius: 16,
        padding: lg ? "15px 26px" : "11px 20px",
        fontSize: lg ? 15.5 : 14,
        boxShadow: "0 10px 26px rgba(142,136,216,.36)",
      }}
    >
      Launch App
      <Icon name="arrowRight" size={lg ? 19 : 17} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", backgroundAttachment: "fixed" }}>
      {/* ---- nav ---- */}
      <nav className="sticky top-0 z-50 flex items-center px-4 sm:px-6 md:px-10" style={{ height: 70, background: "var(--nav-bg)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--nav-border)" }}>
        <a href="#" className="flex items-center gap-2.5 shrink-0">
          <Mark size={34} />
          <span className="font-display hidden sm:block" style={{ fontWeight: 700, fontSize: 19, color: "var(--text)", letterSpacing: ".5px" }}>Poincaré</span>
          <span className="hidden sm:inline text-lav" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".5px", background: "var(--lav-soft)", borderRadius: 20, padding: "3px 9px" }}>v4</span>
        </a>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <a href="#how" className="hidden sm:block text-sm font-bold px-3 py-2 rounded-xl transition-colors hover:text-lav" style={{ color: "var(--text-3)" }}>How it works</a>
          <a href="#moat" className="hidden sm:block text-sm font-bold px-3 py-2 rounded-xl transition-colors hover:text-lav" style={{ color: "var(--text-3)" }}>The moat</a>
          <ThemeToggle />
          <LaunchButton />
        </div>
      </nav>

      {/* ---- hero ---- */}
      <header className="px-6 md:px-10 pt-14 md:pt-20 pb-10">
        <div className="mx-auto grid items-center gap-10 lg:gap-14 grid-cols-1 lg:grid-cols-[1.05fr_1fr]" style={{ maxWidth: 1180 }}>
          <div>
            <motion.div {...fade(0)} className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-6" style={{ background: "var(--lav-soft)", color: "var(--lav-deep)", fontSize: 12, fontWeight: 800 }}>
              <Icon name="spark" size={14} /> Adaptive liquidity · live on Unichain Sepolia
            </motion.div>

            <motion.h1 {...fade(0.06)} className="font-display" style={{ fontSize: "clamp(34px, 5vw, 56px)", fontWeight: 700, lineHeight: 1.06, color: "var(--text)", letterSpacing: "-.5px" }}>
              An AMM that feels the trend
              <span style={{ color: "var(--lav-deep)" }}> and leans into it.</span>
            </motion.h1>

            <motion.p {...fade(0.12)} className="mt-5 max-w-xl" style={{ fontSize: 17, lineHeight: 1.65, color: "var(--text-2)" }}>
              Poincaré is a Uniswap v4 hook with a tiny <span style={{ fontWeight: 700, color: "var(--text)" }}>change-point detector</span> for a brain.
              When it spots a <em>real</em> directional trend, it gently widens the spread on the side that bleeds
              liquidity providers, while staying cheap and open everywhere else. No oracle. No keeper. Just the pool's own price.
            </motion.p>

            <motion.div {...fade(0.18)} className="mt-8 flex items-center gap-4 flex-wrap">
              <LaunchButton size="lg" />
              <a href="#how" className="inline-flex items-center gap-2 font-bold" style={{ color: "var(--text-2)", fontSize: 15 }}>
                See how it works <Icon name="arrowRight" size={16} />
              </a>
            </motion.div>

            <motion.div {...fade(0.24)} className="mt-9 flex items-center gap-5 flex-wrap" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-3)" }}>
              <Trust icon="shield" text="Manipulation-bounded by design" />
              <Trust icon="check" text="91 tests · 384k-op invariant" />
              <Trust icon="target" text="No oracle, no AVS" />
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <CurveVisual />
          </motion.div>
        </div>
      </header>

      {/* ---- numbers ---- */}
      <section className="px-6 md:px-10 py-4">
        <motion.div {...fade()} className="mx-auto grid gap-3.5 grid-cols-2 md:grid-cols-4" style={{ maxWidth: 1180 }}>
          <NumberCard kpi="−14.3%" label="LVR vs constant-product" sub="back-test, same swap path" />
          <NumberCard kpi="6 mo" label="real ETH/USDC replay" sub="never worse than baseline" tint />
          <NumberCard kpi="~2×" label="less tax on benign flow" sub="vs a symmetric vol-fee" />
          <NumberCard kpi="0" label="external dependencies" sub="prices off its own reserves" />
        </motion.div>
      </section>

      {/* ---- what it does ---- */}
      <section className="px-6 md:px-10 py-16">
        <div className="mx-auto" style={{ maxWidth: 1180 }}>
          <SectionTitle eyebrow="What it is" title="Two parts, kept honest" />
          <div className="grid gap-5 mt-9 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon="brain" color="var(--lav)" title="The detector"
              body="A two-sided CUSUM quickest-change detector runs on every swap. It fires at a data-dependent moment rather than a fixed block count, so there's no countdown to game. Provably optimal for the speed-vs-false-alarm trade-off." />
            <Feature icon="wave" color="var(--honey)" title="The curve"
              body="An asymmetric bonding curve. When a trend is confirmed, the with-trend (toxic) side is charged a small directional spread the LPs keep. The stabilising side stays at the base price. A real bid-ask, written into the geometry." />
            <Feature icon="shield" color="var(--up)" title="The moat"
              body="To fool the detector you must genuinely move the price, which means spending real money and feeding arbitrageurs. Faking a trend is negative-EV. The protection is bounded by math, not wished away." />
          </div>
        </div>
      </section>

      {/* ---- how it works ---- */}
      <section id="how" className="px-6 md:px-10 py-16" style={{ background: "var(--surface-2)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="mx-auto" style={{ maxWidth: 1180 }}>
          <SectionTitle eyebrow="How it works" title="Watch · detect · lean" />
          <div className="grid gap-5 mt-9 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Step n="01" title="Watch its own price" body="Each swap, the hook samples the pool's reserve-implied price once per block and feeds the signed log-return to the detector. No oracle is consulted." />
            <Step n="02" title="Accumulate evidence" body="Two CUSUM statistics build evidence for an up- or down-trend. Noise never crosses the threshold; a real, sustained move does, and quickly when the drift is strong." />
            <Step n="03" title="Lean the curve" body="On firing, the control law ramps a bounded, rate-limited spread onto the with-trend side and routes it back to LPs. When the trend fades, the curve returns to symmetric." />
          </div>
        </div>
      </section>

      {/* ---- moat ---- */}
      <section id="moat" className="px-6 md:px-10 py-16">
        <div className="mx-auto grid gap-8 items-center grid-cols-1 lg:grid-cols-2" style={{ maxWidth: 1180 }}>
          <motion.div {...fade()}>
            <SectionTitle eyebrow="Why you can't game it" title="The manipulator pays their own toll" align="left" />
            <p className="mt-4" style={{ fontSize: 15.5, lineHeight: 1.7, color: "var(--text-2)" }}>
              To push the detector past its threshold, an attacker has to trade the price in one direction, repeatedly,
              with real capital. Every one of those trades pays price impact, and the moment detection fires they also pay
              the with-trend spread they just triggered. Arbitrageurs snap the price back the instant they stop.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <MoatRow label="Cost to fake a trend" value="impact + κ·notional" tone="down" />
              <MoatRow label="Payoff if it works" value="marginal, LPs keep the spread" tone="muted" />
              <MoatRow label="Net for the attacker" value="negative-EV" tone="up" />
            </div>
          </motion.div>
          <motion.div {...fade(0.1)} className="card grain relative overflow-hidden p-8">
            <div className="anim-floaty" style={{ position: "absolute", right: -30, top: -30, width: 150, height: 150, borderRadius: 99, background: "radial-gradient(circle, rgba(142,136,216,.18), transparent 70%)" }} />
            <Mark size={46} />
            <blockquote className="font-display mt-5" style={{ fontSize: 21, fontWeight: 600, lineHeight: 1.45, color: "var(--text)" }}>
              "The only way to fool the detector is to genuinely move the market. Which is exactly what it's supposed to react to."
            </blockquote>
            <p className="mt-4" style={{ fontSize: 13, color: "var(--text-3)" }}>
              Three layers: a data-dependent firing time, a one-sided bounded spread, and natural arbitrage.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ---- final CTA ---- */}
      <section className="px-6 md:px-10 pb-20">
        <motion.div {...fade()} className="mx-auto relative grain overflow-hidden text-center" style={{ maxWidth: 1180, borderRadius: 28, padding: "60px 24px", background: "linear-gradient(135deg, var(--lav-soft), var(--surface))", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
          <h2 className="font-display" style={{ fontSize: "clamp(26px,3.5vw,38px)", fontWeight: 700, color: "var(--text)" }}>
            Trade or provide liquidity on a pool that protects you.
          </h2>
          <p className="mt-3 mx-auto" style={{ maxWidth: 540, fontSize: 15.5, color: "var(--text-2)", lineHeight: 1.6 }}>
            Connect a wallet on Unichain Sepolia and watch the Brain in real time. Test tokens are free to mint.
          </p>
          <div className="mt-8 flex justify-center">
            <LaunchButton size="lg" />
          </div>
        </motion.div>
      </section>

      {/* ---- footer ---- */}
      <footer className="px-6 md:px-10 py-8" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="mx-auto flex items-center justify-between flex-wrap gap-4" style={{ maxWidth: 1180 }}>
          <Wordmark size={28} />
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--text-3)" }}>
            <span className="anim-pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--lav)" }} />
            Unichain Sepolia · testnet · research preview
          </div>
        </div>
      </footer>
    </div>
  );
}

function Trust({ icon, text }: { icon: IconName; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span style={{ color: "var(--lav)" }}><Icon name={icon} size={15} /></span>
      {text}
    </span>
  );
}

function NumberCard({ kpi, label, sub, tint }: { kpi: string; label: string; sub: string; tint?: boolean }) {
  return (
    <div className="rounded-card p-5" style={{ background: tint ? "var(--green-stat-bg)" : "var(--surface)", border: `1px solid ${tint ? "var(--green-border)" : "var(--border)"}`, boxShadow: "var(--shadow-sm)" }}>
      <div className="font-display" style={{ fontSize: 30, fontWeight: 700, color: tint ? "var(--green-label)" : "var(--lav-deep)" }}>{kpi}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)", marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function SectionTitle({ eyebrow, title, align = "center" }: { eyebrow: string; title: string; align?: "center" | "left" }) {
  return (
    <div style={{ textAlign: align }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".6px", color: "var(--lav)", textTransform: "uppercase" }}>{eyebrow}</div>
      <h2 className="font-display mt-2" style={{ fontSize: "clamp(24px,3vw,34px)", fontWeight: 700, color: "var(--text)" }}>{title}</h2>
    </div>
  );
}

function Feature({ icon, color, title, body }: { icon: IconName; color: string; title: string; body: string }) {
  return (
    <motion.div {...fade()} className="card p-6">
      <div className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)", color }}>
        <Icon name={icon} size={22} />
      </div>
      <h3 className="font-display mt-4" style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{title}</h3>
      <p className="mt-2" style={{ fontSize: 14, lineHeight: 1.65, color: "var(--text-3)" }}>{body}</p>
    </motion.div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <motion.div {...fade()} className="card-quiet p-6">
      <div className="font-display" style={{ fontSize: 14, fontWeight: 700, color: "var(--lav)" }}>{n}</div>
      <h3 className="font-display mt-2" style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>{title}</h3>
      <p className="mt-2" style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--text-3)" }}>{body}</p>
    </motion.div>
  );
}

function MoatRow({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "muted" }) {
  const color = tone === "up" ? "var(--green-label)" : tone === "down" ? "var(--down-deep)" : "var(--text-2)";
  return (
    <div className="flex items-center justify-between rounded-md px-4 py-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, color: "var(--text-3)" }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}
