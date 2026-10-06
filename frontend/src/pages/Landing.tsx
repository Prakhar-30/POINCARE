import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mark } from "@/components/brand/Logo";
import { CurveVisual } from "@/components/brand/CurveVisual";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AnnouncementMarquee } from "@/components/ui/AnnouncementMarquee";

const REPO = "https://github.com/Prakhar-30/POINCARE";
const SECURITY_REVIEW = `${REPO}#11-security-review`;

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay },
});

const scrollToId = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

function LaunchButton({ large }: { large?: boolean }) {
  return (
    <Link to="/app" className="btn btn-primary group" style={large ? { height: 48, padding: "0 22px" } : { height: 40, fontSize: 14, padding: "0 16px" }}>
      Launch app
      <Icon name="arrowRight" size={16} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--text)" }}>
      <AnnouncementMarquee />

      {/* nav */}
      <nav className="sticky top-0 z-50" style={{ background: "var(--nav-bg)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)" }}>
        <div className="wrap flex items-center gap-8" style={{ height: 64 }}>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5 shrink-0" style={{ cursor: "pointer" }}>
            <Mark size={30} />
            <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-.01em" }}>Poincaré</span>
          </button>
          <div className="hidden md:flex items-center gap-7" style={{ fontSize: 14, fontWeight: 500 }}>
            <NavLink onClick={scrollToId("how")}>How it works</NavLink>
            <NavLink onClick={scrollToId("recognition")}>Recognition</NavLink>
            <NavLink onClick={scrollToId("security")}>Security</NavLink>
            <a href={REPO} target="_blank" rel="noreferrer" className="transition-colors hover:text-lav" style={{ color: "var(--text-3)" }}>Docs</a>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <ThemeToggle />
            <LaunchButton />
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="wrap" style={{ paddingTop: "clamp(48px, 8vw, 88px)", paddingBottom: 72 }}>
        <div className="grid items-center gap-12 lg:gap-14 grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
          <div className="flex flex-col" style={{ gap: 24 }}>
            <motion.div {...fade(0)} className="eyebrow">Uniswap v4 hook · adaptive liquidity</motion.div>
            <motion.h1 {...fade(0.05)} className="m-0" style={{ fontSize: "clamp(38px, 5.4vw, 60px)", lineHeight: 1.03, letterSpacing: "-.035em", fontWeight: 600 }}>
              Liquidity that reads the trend and prices against it.
            </motion.h1>
            <motion.p {...fade(0.1)} className="m-0" style={{ fontSize: 18, lineHeight: 1.6, color: "var(--text-2)", maxWidth: 540 }}>
              A <span style={{ fontWeight: 600, color: "var(--text)" }}>CUSUM change-point detector</span> watches the pool's own price.
              When a real directional move is confirmed, the with-trend side pays a bounded spread that goes straight to LPs.
              No oracle. No keeper.
            </motion.p>
            <motion.div {...fade(0.15)} className="flex flex-wrap gap-3">
              <LaunchButton large />
              <button type="button" onClick={scrollToId("how")} className="btn btn-ghost" style={{ height: 48 }}>
                Read the mechanism
              </button>
            </motion.div>
            <motion.div {...fade(0.2)} className="flex flex-wrap items-center gap-x-4 gap-y-2" style={{ fontSize: 13, color: "var(--text-3)", paddingTop: 4 }}>
              <span>UHI10 hookathon winner</span>
              <Slash />
              <span>Olympix security review · 9/9 fixed</span>
              <Slash />
              <span>228 tests · 384k-op invariants</span>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="min-w-0">
            <CurveVisual />
          </motion.div>
        </div>
      </header>

      {/* results band */}
      <section style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <motion.div {...fade()} className="wrap grid grid-cols-2 md:grid-cols-4">
          <Result kpi="−22.9%" label="LVR on the stress path" sub="mean of 5 seeded runs (19–30%)" good />
          <Result kpi="12 mo" label="Real ETH/USDC replay" sub="never worse than baseline" />
          <Result kpi="0%" label="Spread on stabilising flow" sub="counter-trend and calm, always" />
          <Result kpi="0" label="External dependencies" sub="prices off its own reserves" last />
        </motion.div>
      </section>

      {/* how it works */}
      <section id="how" className="wrap" style={{ paddingTop: 104, paddingBottom: 96, scrollMarginTop: 64 }}>
        <SectionHead eyebrow="How it works" title="Watch. Detect. Lean." body="Every swap runs through the same three steps inside the hook. Nothing is off-chain, nothing is scheduled." />
        <div className="grid gap-4 mt-12 grid-cols-1 md:grid-cols-3">
          <Step n="01" tag="Watch" title="Sample its own price" body="Once per block the hook reads the reserve-implied price and feeds the signed log-return to the detector. No oracle is consulted." delay={0} />
          <Step n="02" tag="Detect" title="Accumulate evidence" body="Two CUSUM statistics build evidence for an up- or down-trend. Noise never crosses the threshold; a real, sustained move does, and quickly when the drift is strong." delay={0.05} />
          <Step n="03" tag="Lean" title="Price the toxic side" body="On firing, the control law ramps a bounded, rate-limited spread onto with-trend flow and routes it to LPs. When the trend fades, the curve returns to symmetric." delay={0.1} />
        </div>
      </section>

      {/* recognition and review */}
      <section id="recognition" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", scrollMarginTop: 64 }}>
        <div className="wrap" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <SectionHead
            eyebrow="Recognition and review"
            title="Selected, funded, reviewed."
            body="Poincaré was selected as a UHI10 winner and then by the Uniswap Foundation Security Fund, which sponsored an independent security review."
          />
          <div className="grid gap-4 mt-12 grid-cols-1 md:grid-cols-3">
            <Recognition
              icon="spark"
              tag="Uniswap Hook Incubator 10"
              title="Hookathon winner"
              body="Submitted to the UHI10 hookathon, where it was selected as one of the winners."
              delay={0}
            />
            <Recognition
              icon="layers"
              tag="Uniswap Foundation"
              title="Security Fund selection"
              body="Subsequently selected by the Uniswap Foundation Security Fund, which sponsored a security review by Olympix."
              delay={0.05}
            />
            <Recognition
              icon="shield"
              tag="Olympix review"
              title="9 of 9 findings fixed"
              body="All nine reported findings are fixed, and each carries a regression test that fails on the pre-fix code."
              href={SECURITY_REVIEW}
              cta="Read §11 · Security review"
              delay={0.1}
            />
          </div>
        </div>
      </section>

      {/* security model */}
      <section id="security" style={{ background: "var(--ink)", color: "var(--ink-text)", scrollMarginTop: 64 }}>
        <div className="wrap grid gap-12 lg:gap-16 items-center grid-cols-1 lg:grid-cols-2" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <motion.div {...fade()} className="flex flex-col gap-4">
            <div className="eyebrow" style={{ color: "#c2bcf5" }}>Security model</div>
            <h2 className="m-0" style={{ fontSize: "clamp(30px, 3.6vw, 40px)", lineHeight: 1.1, letterSpacing: "-.03em", fontWeight: 600 }}>
              A manipulator pays their own toll.
            </h2>
            <p className="m-0" style={{ fontSize: 16, lineHeight: 1.65, color: "var(--ink-text-2)" }}>
              To push the detector past its threshold, an attacker has to trade one way, repeatedly, with real capital.
              Every trade pays price impact, and once detection fires they also pay the with-trend spread they triggered.
              Arbitrageurs snap the price back the moment they stop.
            </p>
          </motion.div>
          <motion.div {...fade(0.08)} style={{ border: "1px solid var(--ink-border)", borderRadius: "var(--r-xl)", overflow: "hidden" }}>
            <MoatRow label="Cost to fake a trend" value="impact + κ·notional" color="#ef9db0" />
            <MoatRow label="Payoff if it works" value="marginal · LPs keep the spread" />
            <MoatRow label="Net for the attacker" value="negative EV" color="#8fd8ba" strong />
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="wrap" style={{ paddingTop: 96, paddingBottom: 96 }}>
        <motion.div {...fade()} className="panel grid gap-8 items-center grid-cols-1 md:grid-cols-[1.4fr_1fr]" style={{ padding: "clamp(28px, 4vw, 48px)" }}>
          <div className="flex flex-col gap-2.5">
            <h2 className="m-0" style={{ fontSize: "clamp(24px, 3vw, 32px)", letterSpacing: "-.025em", fontWeight: 600 }}>
              Trade or provide liquidity on a pool that protects you.
            </h2>
            <p className="m-0" style={{ fontSize: 15, color: "var(--text-2)" }}>
              Connect a wallet on Unichain Sepolia. Test tokens are free from the in-app faucet.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <a className="btn btn-ghost" href={REPO} target="_blank" rel="noreferrer">View source</a>
            <LaunchButton large />
          </div>
        </motion.div>
      </section>

      <footer style={{ borderTop: "1px solid var(--border)" }}>
        <div className="wrap flex flex-wrap items-center justify-between gap-4" style={{ minHeight: 72, paddingTop: 16, paddingBottom: 16, fontSize: 13, color: "var(--text-3)" }}>
          <span className="flex items-center gap-2.5">
            <Mark size={22} />
            Poincaré · Unichain Sepolia · research preview
          </span>
          <div className="flex items-center gap-5">
            <a href="https://x.com/Poincare_AMM" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-lav" style={{ color: "var(--text-2)" }}>
              <Icon name="xSocial" size={13} /> @Poincare_AMM
            </a>
            <a href={REPO} target="_blank" rel="noreferrer" className="transition-colors hover:text-lav" style={{ color: "var(--text-2)" }}>GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="transition-colors hover:text-lav" style={{ color: "var(--text-3)", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function Slash() {
  return <span aria-hidden style={{ color: "var(--faint)" }}>/</span>;
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <motion.div {...fade()} className="flex flex-col gap-3" style={{ maxWidth: 640 }}>
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="m-0" style={{ fontSize: "clamp(30px, 3.6vw, 40px)", lineHeight: 1.1, letterSpacing: "-.03em", fontWeight: 600 }}>{title}</h2>
      <p className="m-0" style={{ fontSize: 16, lineHeight: 1.6, color: "var(--text-2)" }}>{body}</p>
    </motion.div>
  );
}

function Result({ kpi, label, sub, good, last }: { kpi: string; label: string; sub: string; good?: boolean; last?: boolean }) {
  return (
    <div className={`py-7 pr-5 md:pl-6 md:first:pl-0 ${last ? "" : "md:border-r"}`} style={{ borderColor: "var(--divider)" }}>
      <div className="num" style={{ fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 600, color: good ? "var(--up-deep)" : "var(--text)" }}>{kpi}</div>
      <div style={{ fontSize: 14, fontWeight: 500, marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Step({ n, tag, title, body, delay }: { n: string; tag: string; title: string; body: string; delay: number }) {
  return (
    <motion.div {...fade(delay)} className="panel flex flex-col gap-3.5" style={{ padding: 28 }}>
      <div className="num" style={{ fontSize: 12, color: "var(--lav-deep)", letterSpacing: ".06em" }}>{n} · {tag.toUpperCase()}</div>
      <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.01em" }}>{title}</div>
      <p className="m-0" style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-2)" }}>{body}</p>
    </motion.div>
  );
}

function Recognition({
  icon, tag, title, body, href, cta, delay,
}: { icon: IconName; tag: string; title: string; body: string; href?: string; cta?: string; delay: number }) {
  return (
    <motion.div {...fade(delay)} className="flex flex-col gap-3.5" style={{ padding: 28, borderRadius: "var(--r-card)", border: "1px solid var(--border)", background: "var(--page)" }}>
      <div className="flex items-center justify-between">
        <span className="flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: "var(--r-sm)", background: "var(--lav-soft)", color: "var(--lav-deep)" }}>
          <Icon name={icon} size={18} />
        </span>
        <span className="num" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>{tag}</span>
      </div>
      <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.01em", marginTop: 6 }}>{title}</div>
      <p className="m-0" style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-2)" }}>{body}</p>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 500, color: "var(--lav-deep)", paddingTop: 6 }}>
          {cta} <Icon name="external" size={13} />
        </a>
      )}
    </motion.div>
  );
}

function MoatRow({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" style={{ padding: "20px 24px", borderTop: "1px solid var(--ink-border)", marginTop: -1, background: strong ? "var(--ink-2)" : undefined }}>
      <span style={{ color: strong ? "var(--ink-text)" : "var(--ink-text-2)", fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span className="num" style={{ color: color ?? "var(--ink-text)", fontWeight: strong ? 600 : 400 }}>{value}</span>
    </div>
  );
}
