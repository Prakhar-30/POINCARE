import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon } from "@/components/ui/Icon";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { LiquidityDepth } from "@/components/ui/LiquidityDepth";
import { Seg, SourceTag } from "@/components/ui/Panel";
import { Skel } from "@/components/ui/Skeleton";
import { usePoolState } from "@/hooks/usePoolState";
import { useDetectorConfig } from "@/hooks/useDetectorConfig";
import { usePoolTotals } from "@/hooks/useBackend";
import { fromWei } from "@/lib/units";
import { fmtNum, fmtPct, fmtUsd, shorten } from "@/lib/format";
import { CONTRACTS, EXPLORER } from "@/config/contracts";
import { loadAppRoute } from "@/app/preload";

// start fetching the app chunk the moment a visitor shows intent, so the click lands instantly
const warmApp = { onPointerEnter: () => void loadAppRoute(), onFocus: () => void loadAppRoute(), onTouchStart: () => void loadAppRoute() };

/**
 * The public landing page. The structure follows the large DeFi venues: a centred claim with the
 * live product on a soft stage, the three states of the pool as cards, a black evidence band with
 * the headline numbers, the arbitrage chart, reviews and tests as metric cards, a two-column FAQ
 * and a closing stage with one way in for each audience. Black carries the primary action and the
 * evidence band; the soft palette carries everything else. The hero has the only load animation.
 */

const REPO = "https://github.com/Prakhar-30/POINCARE";
const README = `${REPO}#readme`;
const SECURITY_DOC = `${REPO}/blob/main/SECURITY.md`;
const WIDTH = 1200;
const MOCKUP = `${import.meta.env.BASE_URL}landing/app-mockup`;
const MOCKUP_LQIP = "data:image/webp;base64,UklGRm4AAABXRUJQVlA4IGIAAADwAwCdASoYABAAPu1iqk2ppaQiMAgBMB2JYgAAYfXnuLP7Uc4b5yMAAP7sO0+7JOKIOFXFrReAcphwayw8vASOX8OnZT1YiWWIMCHepYhfONrsYpXZvZJLdcQ3CnYGUBQAAA==";

const enter = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const, delay },
});

// In-page scroll (HashRouter owns the URL hash, so these are buttons, not href="#id").
const scrollToId = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

const NAV = [
  { id: "how", label: "How it works" },
  { id: "proof", label: "Proof" },
  { id: "security", label: "Security" },
  { id: "faq", label: "FAQ" },
];

/** "Launch app" is the landing page's one black action (other calls to action keep the theme
 *  lavender). On a dark surface it flips to light so it still stands out; only the nav copy
 *  carries the arrow. */
function LaunchButton({ size = "md", label = "Launch app", nav = false, onDark = false }: { size?: "md" | "lg"; label?: string; nav?: boolean; onDark?: boolean }) {
  const lg = size === "lg";
  return (
    <Link to="/app" {...warmApp} className={`group btn ${onDark ? "lp-btn-light" : "lp-btn-ink"}${lg ? " btn-lg" : ""}`} style={{ padding: lg ? "0 28px" : "0 18px" }}>
      {label}
      {nav && <Icon name="arrowRight" size={lg ? 18 : 16} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
    </Link>
  );
}

/** Centred section heading in the landing type: large, medium weight, tight. */
function Heading({ id, title, lede, align = "center", tone }: { id: string; title: ReactNode; lede?: ReactNode; align?: "center" | "left"; tone?: "band" }) {
  const c = align === "center";
  return (
    <div className={c ? "mx-auto text-center" : ""} style={{ maxWidth: c ? 760 : 560 }}>
      <h2 id={id} className="lp-head" style={{ fontSize: "clamp(32px, 4.6vw, 56px)", lineHeight: 1.05, color: tone ? "var(--lp-band-text)" : undefined }}>{title}</h2>
      {lede && <p className="mt-5" style={{ fontSize: 18, lineHeight: 1.6, color: tone ? "var(--lp-band-muted)" : "var(--text-2)", textWrap: "pretty" }}>{lede}</p>}
    </div>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen" style={{ background: "var(--page)" }}>
      <a href="#top" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("top")?.focus(); }}>
        Skip to content
      </a>
      <Nav />
      <main id="top" tabIndex={-1} style={{ outline: "none" }}>
        <Hero />
        <States />
        <Showcase />
        <EvidenceBand />
        <Proof />
        <Security />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// chrome

function Nav() {
  return (
    <nav aria-label="Main" className="sticky top-0 z-50" style={{ background: "var(--nav-bg)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--nav-border)" }}>
      <div className="mx-auto flex items-center gap-3 sm:gap-6 px-4 sm:px-6" style={{ maxWidth: WIDTH + 48, height: 68 }}>
        <button type="button" onClick={scrollTop} aria-label="Poincaré, back to top" className="flex items-center gap-2.5 shrink-0 rounded-xl" style={{ cursor: "pointer", minHeight: 44 }}>
          <Mark size={30} decorative />
          {/* the narrowest phones keep the mark alone, so the launch button never runs off the edge */}
          <span className="font-display hidden min-[380px]:inline" style={{ fontWeight: 700, fontSize: 18, color: "var(--lp-head)", letterSpacing: "-0.01em" }}>Poincaré</span>
        </button>
        <div className="hidden lg:flex flex-1 items-center justify-center gap-1">
          {NAV.map((n) => (
            <button key={n.id} type="button" onClick={scrollToId(n.id)} className="link-quiet rounded-full px-4" style={{ cursor: "pointer", minHeight: 40, fontSize: 15, fontWeight: 700 }}>
              {n.label}
            </button>
          ))}
        </div>
        <div className="ml-auto lg:ml-0 flex items-center gap-2 sm:gap-3">
          <a href={REPO} target="_blank" rel="noreferrer" className="link-quiet hidden sm:inline-flex items-center gap-1.5 rounded-full px-3" style={{ minHeight: 40, fontSize: 15, fontWeight: 700 }}>
            GitHub <Icon name="external" size={13} aria-hidden="true" />
          </a>
          <ThemeToggle />
          <LaunchButton nav />
        </div>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------
// hero

function Hero() {
  // the two chips read the same live state as the panel: what is charged now, and who trades free
  const s = usePoolState();
  const ready = s.price > 0;
  const buy = s.spreadZeroForOne, sell = s.spreadOneForZero;
  const charged = buy > 0 || sell > 0;
  const spreadNow = !ready ? <Skel w="8ch" /> : charged ? `+${fmtPct(Math.max(buy, sell))} on ${buy >= sell ? "buys" : "sells"}` : "None";
  const freeNow = !ready ? <Skel w="7ch" /> : !charged ? "Every swap" : buy > 0 ? "Every sell" : "Every buy";
  return (
    <header className="relative overflow-hidden">
      <div className="relative mx-auto px-4 sm:px-6 pt-14 md:pt-20 text-center" style={{ maxWidth: WIDTH + 48 }}>
        <motion.div {...enter(0)} className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
          <span className="anim-pulse-dot" aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--up)" }} />
          Live on Unichain Sepolia
        </motion.div>

        <motion.h1 {...enter(0.05)} className="lp-head mx-auto mt-7" style={{ fontSize: "clamp(42px, 6.6vw, 84px)", lineHeight: 1, maxWidth: "17ch" }}>
          Liquidity that charges the trend, not the trader.
        </motion.h1>

        <motion.p {...enter(0.1)} className="mx-auto mt-6" style={{ fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.5, color: "var(--text-2)", maxWidth: "30rem", textWrap: "balance" }}>
          Swaps that push with a confirmed trend pay a spread. Liquidity providers keep it.
        </motion.p>

        <motion.div {...enter(0.15)} className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <LaunchButton size="lg" />
          <a href={README} target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1.5" style={{ fontSize: 15, fontWeight: 700, minHeight: 44 }}>
            Read the research <Icon name="external" size={14} aria-hidden="true" />
          </a>
        </motion.div>

        <motion.div {...enter(0.18)}>
          <Reviewers />
        </motion.div>

        <motion.div {...enter(0.2)} className="relative mx-auto mt-12 md:mt-14 lp-stage px-3 sm:px-10 pt-10 sm:pt-14 pb-10 sm:pb-14" style={{ maxWidth: 1100 }}>
          {/* floating facts around the product, desktop only */}
          <div className="hidden lg:block absolute" style={{ left: 28, top: 70, zIndex: 2 }} aria-hidden="true">
            <Chip tone={charged ? "honey" : "green"} k="Trend spread now" v={spreadNow} />
          </div>
          <div className="hidden lg:block absolute" style={{ right: 28, top: 150, zIndex: 2 }} aria-hidden="true">
            <Chip tone="green" k="Trading spread-free now" v={freeNow} />
          </div>
          <div className="relative mx-auto text-left" style={{ maxWidth: 620, transform: "translateY(1px)" }}>
            <LivePanel />
          </div>
        </motion.div>
      </div>
    </header>
  );
}

/** Who has looked at the contracts, each credited by name and linked to the reviewer's own profile.
 *  The labels keep each review's real scope: Olympix ran a pre-audit scan, SFS-Labs a scoped review. */
const REVIEWERS = [
  { name: "Olympix", role: "Pre-audit scan", href: "https://x.com/OlympixSecurity", avatar: "olympix" },
  { name: "SFS-Labs", role: "Independent scoped review", href: "https://x.com/SFS_Labs", avatar: "sfs-labs" },
];

function Reviewers() {
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>Contracts reviewed by</span>
      <ul className="flex flex-wrap items-center justify-center gap-2.5">
        {REVIEWERS.map((r) => (
          <li key={r.name}>
            <a href={r.href} target="_blank" rel="noreferrer" className="lp-reviewer inline-flex items-center gap-2.5 rounded-full pl-2 pr-4"
              style={{ minHeight: 44 }} aria-label={`${r.name}, ${r.role.toLowerCase()}, on X (opens in a new tab)`}>
              {/* the reviewer's own X profile picture, kept locally rather than hot-linked */}
              <img src={`${import.meta.env.BASE_URL}landing/${r.avatar}.webp`} alt="" width={30} height={30}
                style={{ width: 30, height: 30, borderRadius: 99, border: "1px solid var(--border)" }} />
              <span className="text-left leading-tight">
                <span className="flex items-center gap-1.5 font-display" style={{ fontSize: 14, fontWeight: 700, color: "var(--lp-head)" }}>
                  {r.name}
                  {/* X's own app-icon form (solid tile, white mark), so it reads as "on X", not as a close button */}
                  <span aria-hidden="true" className="inline-flex items-center justify-center"
                    style={{ width: 18, height: 18, borderRadius: 5, background: "#000", color: "#fff", boxShadow: "0 0 0 1px var(--border-strong)" }}>
                    <Icon name="xSocial" size={12} />
                  </span>
                </span>
                <span className="block" style={{ fontSize: 12, color: "var(--text-3)" }}>{r.role}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ k, v, tone }: { k: string; v: ReactNode; tone: "green" | "lav" | "honey" }) {
  return (
    <div className="rounded-2xl px-4 py-3 text-left" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)", minWidth: 168 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>{k}</div>
      <div className="font-display" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: tone === "green" ? "var(--green-label)" : tone === "honey" ? "var(--honey-ink)" : "var(--lav-ink)" }}>{v}</div>
    </div>
  );
}

/** The product itself, live: the pool's real book, with a switch that shows what the hook does. */
function LivePanel() {
  const s = usePoolState();
  const cfg = useDetectorConfig();
  const totals = usePoolTotals().data;
  const [mode, setMode] = useState<"live" | "trend">("live");
  const x = fromWei(s.r0, "USDC");
  const y = fromWei(s.r1, "WETH");
  const buy = mode === "trend" ? cfg.kappaMax : s.spreadZeroForOne;
  const sell = mode === "trend" ? 0 : s.spreadOneForZero;
  const regime = s.trend === "up" ? "Up-trend" : s.trend === "down" ? "Down-trend" : "Calm";
  const sideV = (sp: number) => (sp > 0 ? `+${fmtPct(sp)}` : "Free");

  return (
    <section aria-label="Live pool preview" className="card" style={{ padding: 0, overflow: "hidden", boxShadow: "var(--shadow-lg)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
        <div className="flex items-center gap-2.5">
          <span className="flex" aria-hidden="true">
            <TokenIcon sym="WETH" size={22} />
            <span style={{ marginLeft: -7 }}><TokenIcon sym="USDC" size={22} /></span>
          </span>
          <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>WETH / USDC</span>
          <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text-2)" }}>{s.loading ? <Skel w="7ch" /> : s.price > 0 ? fmtNum(s.price, 2) : "—"}</span>
        </div>
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>
          <span className="anim-pulse-dot" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--up)" }} />
          Live · detector {regime.toLowerCase()}
        </span>
      </div>
      <div className="px-4 pt-3 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Order book depth, read from the curve</span>
          <div className="flex items-center gap-2">
            {mode === "trend" && <SourceTag kind="preview" />}
            <Seg label="Market state" value={mode} onChange={setMode} options={[{ id: "live", label: "Live" }, { id: "trend", label: "Trend fires" }]} />
          </div>
        </div>
        <LiquidityDepth x={x} y={y} fee={s.fee} spreadBuy={buy} spreadSell={sell} range={0.1} height={230} />
      </div>
      <dl className="grid grid-cols-3" style={{ borderTop: "1px solid var(--divider)" }}>
        {[
          { l: "Buy side", v: sideV(buy), c: buy > 0 ? "var(--honey-ink)" : "var(--up-ink)" },
          { l: "Sell side", v: sideV(sell), c: sell > 0 ? "var(--honey-ink)" : "var(--up-ink)" },
          { l: "Kept for LPs", v: !totals ? <Skel /> : totals.swap_count > 0 ? fmtUsd(totals.lvr_avoided, { compact: true }) : "—", c: "var(--green-label)" },
        ].map((c, i) => (
          <div key={c.l} className="px-4 py-3" style={{ borderLeft: i ? "1px solid var(--divider)" : undefined }}>
            <dt style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{c.l}</dt>
            <dd className="font-display" style={{ fontSize: 17, fontWeight: 700, color: c.c }}>{c.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}


// ---------------------------------------------------------------------------------------------
// sections

function Wrap({ id, children, className = "", style }: { id?: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={className} style={{ scrollMarginTop: 76, ...style }}>
      <div className="mx-auto px-4 sm:px-6 py-20 md:py-28" style={{ maxWidth: WIDTH + 48 }}>{children}</div>
    </section>
  );
}

/** One side of the book, as a labelled bar: free (green) or charged (honey). */
function Side({ label, charge }: { label: string; charge: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>{label}</span>
      <span className="rounded-full px-2.5 py-0.5" style={{ fontSize: 12, fontWeight: 800, background: charge ? "var(--warn-bg)" : "var(--change-up-bg)", color: charge ? "var(--honey-ink)" : "var(--up-ink)" }}>
        {charge ?? "Plain price"}
      </span>
    </div>
  );
}

function States() {
  const cfg = useDetectorConfig();
  const cap = cfg.kappaMax ? fmtPct(cfg.kappaMax, 0) : "5%";
  const states = [
    { tag: "Calm market", t: "Both sides pay the plain price.", d: "With no confirmed trend the curve is symmetric, the same constant-product price any Uniswap pool would quote.", buy: null, sell: null },
    { tag: "Trend confirmed", t: "Only with-trend swaps pay.", d: `A CUSUM test on the pool's own price fires once the evidence adds up. Swaps pushing with the trend pay a spread of up to ${cap}, ramped in gradually.`, buy: `Up to ${cap}`, sell: null },
    { tag: "Trend fades", t: "The spread returns to zero.", d: "As the evidence decays the spread ramps back down and the pool is symmetric again. What it collected stays in the pool, credited to LP shares.", buy: null, sell: null, kept: true },
  ];
  return (
    <Wrap id="how">
      <Heading id="how-title" title="One pool that knows when the market is trending."
        lede="Poincaré is a custom-curve Uniswap v4 hook. It reads only its own reserves, so there is no oracle to feed and no keeper to run." />
      <ol className="mt-14 grid gap-5 md:grid-cols-3">
        {states.map((s, i) => (
          <li key={s.tag} className="lp-card p-6 sm:p-7 flex flex-col">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center font-display" aria-hidden="true"
                style={{ width: 26, height: 26, borderRadius: 99, background: "var(--lp-ink)", color: "var(--lp-on-ink)", fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--lav-ink)" }}>{s.tag}</span>
            </div>
            <h3 className="lp-head mt-5" style={{ fontSize: 24, lineHeight: 1.15, letterSpacing: "-0.025em" }}>{s.t}</h3>
            <p className="mt-3" style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-2)" }}>{s.d}</p>
            <div className="mt-auto pt-6 flex flex-col gap-2">
              {s.kept ? (
                <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5" style={{ background: "var(--green-bg)", border: "1px solid var(--green-border)" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--green-sub)" }}>Spread collected</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--green-label)" }}>Kept by LPs</span>
                </div>
              ) : null}
              <Side label="With-trend side" charge={s.buy} />
              <Side label="Against-trend side" charge={s.sell} />
            </div>
          </li>
        ))}
      </ol>
    </Wrap>
  );
}

/** The app on a phone. The render is a concept design, so it is labelled as one: its figures
 *  are illustrative, and the live numbers are in the band below and in the hero. */
function Showcase() {
  return (
    <section aria-labelledby="showcase-title">
      <div className="mx-auto px-4 sm:px-6 pb-20 md:pb-28" style={{ maxWidth: WIDTH + 48 }}>
        <div className="lp-showcase grid items-center overflow-hidden lg:grid-cols-[0.85fr_1.15fr]">
          <div className="px-6 sm:px-12 pt-12 lg:py-16">
            <h2 id="showcase-title" className="lp-head" style={{ fontSize: "clamp(30px, 3.8vw, 48px)", lineHeight: 1.06, color: "#f6f3fb" }}>
              See the trend before you trade.
            </h2>
            <p className="mt-5" style={{ fontSize: 17, lineHeight: 1.6, color: "#b9b3cc", maxWidth: 420 }}>
              The app reads the pool and the detector live, so every quote shows whether a spread is active and which side pays it.
            </p>
            <div className="mt-8"><LaunchButton size="lg" onDark /></div>
            <p className="mt-6" style={{ fontSize: 12, color: "#9a94ad" }}>Concept design. Figures shown on the phones are illustrative.</p>
          </div>
          {/* a 24x16 blurred copy of the render paints first (160 bytes, inline), so the card never
              shows an empty hole while the real image loads; the edge mask covers both */}
          <div className="relative lp-showcase-img" style={{ backgroundImage: `url(${MOCKUP_LQIP})`, backgroundSize: "cover", aspectRatio: "3 / 2" }}>
            <img src={`${MOCKUP}.webp`} srcSet={`${MOCKUP}-768.webp 768w, ${MOCKUP}.webp 1536w`}
              sizes="(min-width: 1024px) 680px, 100vw" width={1536} height={1024} loading="lazy" decoding="async"
              alt="Three phone screens of the Poincaré app: a liquidity position, total value locked with a trend-detected alert, and market insights."
              className="block w-full h-auto" />
          </div>
        </div>
      </div>
    </section>
  );
}

function EvidenceBand() {
  const s = usePoolState();
  const totals = usePoolTotals().data;
  const tvl = fromWei(s.r0, "USDC") + fromWei(s.r1, "WETH") * s.price;
  const kept = !totals ? <Skel w="6ch" h="0.8em" r={14} /> : totals.swap_count > 0 ? fmtUsd(totals.lvr_avoided, { dp: 0 }) : "—";
  const figures = [
    { v: "+6.44%", l: "LP value against a 30 bps pool" },
    { v: "−32%", l: "Value taken by arbitrageurs, against a 30 bps pool" },
    { v: "+45%", l: "LP value against a vol-fee pool at matched friction" },
    { v: "50.6%", l: "Average LVR cut on trend-heavy stress paths" },
  ];
  const live = [
    { l: "Total value locked", v: s.loading ? <Skel /> : tvl > 0 ? fmtUsd(tvl, { compact: true }) : "—" },
    { l: "Volume traded", v: totals ? fmtUsd(totals.volume_usdc, { compact: true }) : <Skel /> },
    { l: "Swaps settled", v: totals ? fmtNum(totals.swap_count, 0) : <Skel /> },
  ];
  return (
    <section id="proof" aria-labelledby="proof-title" className="lp-band" style={{ scrollMarginTop: 76 }}>
      <div className="mx-auto px-4 sm:px-6 py-20 md:py-28" style={{ maxWidth: WIDTH + 48 }}>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] items-end">
          <Heading id="proof-title" align="left" tone="band" title="Measured on four years of real prices."
            lede="The live pool has traded through four years of real ETH prices, one swap per day. Every spread it charged a with-trend swap stayed in the pool." />
          {/* the headline is the live figure, read from the swap log, not a backtest number */}
          <div className="lg:text-right">
            <div className="inline-flex items-center gap-2" style={{ fontSize: 15, fontWeight: 700, color: "var(--lp-band-muted)" }}>
              <span className="anim-pulse-dot" aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--up)" }} />
              Kept for LPs
            </div>
            <div className="lp-head mt-2" style={{ fontSize: "clamp(56px, 9.5vw, 124px)", lineHeight: 0.9, color: "var(--lp-band-text)", fontVariantNumeric: "tabular-nums" }}>{kept}</div>
            <div className="mt-4" style={{ fontSize: 16, color: "var(--lp-band-muted)" }}>
              Spread paid by with-trend swaps on the live pool{totals ? `, across ${fmtNum(totals.swap_count, 0)} swaps` : ""}
            </div>
          </div>
        </div>

        <div className="mt-16 mb-4" style={{ fontSize: 14, fontWeight: 700, color: "var(--lp-band-muted)" }}>From the backtests: real-data replays and synthetic stress paths</div>
        <dl className="grid gap-px overflow-hidden rounded-3xl sm:grid-cols-2 lg:grid-cols-4" style={{ background: "var(--lp-band-line)", border: "1px solid var(--lp-band-line)" }}>
          {figures.map((f) => (
            <div key={f.l} className="p-6 sm:p-8" style={{ background: "var(--lp-band)" }}>
              <dd className="lp-head" style={{ fontSize: "clamp(36px, 4vw, 52px)", lineHeight: 1, color: "var(--lp-band-text)", fontVariantNumeric: "tabular-nums" }}>{f.v}</dd>
              <dt className="mt-3" style={{ fontSize: 15, lineHeight: 1.5, color: "var(--lp-band-muted)" }}>{f.l}</dt>
            </div>
          ))}
        </dl>

        <div className="mt-12 pt-8 flex flex-wrap items-end justify-between gap-8" style={{ borderTop: "1px solid var(--lp-band-line)" }}>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-10 gap-y-6">
            {live.map((c) => (
              <div key={c.l}>
                <dt style={{ fontSize: 13, color: "var(--lp-band-muted)" }}>{c.l}</dt>
                <dd className="font-display mt-1" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--lp-band-text)", fontVariantNumeric: "tabular-nums" }}>{c.v}</dd>
              </div>
            ))}
          </dl>
          <a href={`${EXPLORER}/address/${CONTRACTS.hook}`} target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1.5" translate="no"
            style={{ fontSize: 13, fontWeight: 700 }} aria-label={`Live figures from the hook contract ${CONTRACTS.hook} on the block explorer (opens in a new tab)`}>
            <span className="anim-pulse-dot" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--up)" }} />
            Live from hook {shorten(CONTRACTS.hook)} <Icon name="external" size={12} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Proof() {
  // Four-year replay, $2,000,000 position, arbitrage extracted (README, "Four years of real data").
  const rows = [
    { l: "Normal pool, 5 bps fee", v: 473_696, c: "var(--faint)" },
    { l: "Normal pool, 30 bps fee", v: 387_110, c: "var(--faint)" },
    { l: "Poincaré", v: 264_835, c: "var(--lav)" },
  ];
  const max = rows[0].v;
  return (
    <Wrap>
      <Heading id="chart-title" title="Less for arbitrageurs, more for LPs."
        lede="Over four years Poincaré gave arbitrageurs $122,275 less than a 30 bps pool and finished $185,167 ahead of it." />
      <figure className="lp-card mx-auto mt-14 p-6 sm:p-10" style={{ marginBottom: 0, maxWidth: 960 }} aria-labelledby="chart-title">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2 mb-8">
          <span className="font-display" style={{ fontSize: 18, fontWeight: 700, color: "var(--lp-head)" }}>Value taken by arbitrageurs</span>
          <span style={{ fontSize: 13, color: "var(--text-3)" }}>$2M position, ETH/USDC 2022 to 2026</span>
        </figcaption>
        <div className="flex flex-col" style={{ gap: 22 }} role="list">
          {rows.map((r) => (
            <div key={r.l} role="listitem">
              <div className="flex justify-between" style={{ fontSize: 15, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: r.l === "Poincaré" ? "var(--lp-head)" : "var(--text-2)" }}>{r.l}</span>
                <span className="font-display" style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: r.l === "Poincaré" ? "var(--lav-ink)" : "var(--text-2)" }}>{fmtUsd(r.v, { dp: 0 })}</span>
              </div>
              <div style={{ height: 14, borderRadius: 99, background: "var(--track)", overflow: "hidden" }} aria-hidden="true">
                <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: r.v / max }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                  style={{ height: "100%", width: "100%", background: r.c, transformOrigin: "left", borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>

        <details className="faq mt-10 pt-6" style={{ borderTop: "1px solid var(--border)" }}>
          <summary className="flex items-center justify-between gap-4" style={{ cursor: "pointer", fontSize: 15, fontWeight: 800, color: "var(--lp-head)", listStyle: "none" }}>
            Methodology, caveat and sources
            <span className="faq-icon shrink-0" aria-hidden="true" style={{ color: "var(--text-3)" }}><Icon name="plus" size={18} /></span>
          </summary>
          <div className="pt-4 flex flex-col gap-4" style={{ fontSize: 14, lineHeight: 1.65, color: "var(--text-2)", maxWidth: "75ch" }}>
            <p>
              Every figure comes from the open-source backtest harness. LP value nets fees, spread, arbitrage and inventory, and
              comparisons run at a matched operating point, because an unmatched baseline flatters whichever pool it is compared with.
            </p>
            <p>
              <b style={{ color: "var(--text)" }}>The caveat.</b> At a matched friction budget a symmetric vol-scaled fee removes slightly more
              raw LVR (5.66% against 4.67% on the 12-month replay). Poincaré wins on what an LP keeps, because it charges the side that
              causes the loss instead of taxing all flow.
            </p>
            <ul className="flex flex-col gap-1.5" style={{ fontSize: 13, color: "var(--text-3)" }}>
              <li><b style={{ color: "var(--text-2)" }}>4-year replay:</b> 2022-09-19 to 2026-09-18, 7,776 four-hour closes, $2,000,000 position.</li>
              <li><b style={{ color: "var(--text-2)" }}>12-month calibration:</b> real data against a vol-fee pool, total friction matched to 0.13%.</li>
              <li><b style={{ color: "var(--text-2)" }}>Stress harness:</b> five seeded trend-dense paths (47.1% to 53.2%), fresh order book per run.</li>
            </ul>
            <a href={README} target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1 self-start" style={{ fontSize: 13, fontWeight: 700 }}>
              Full results in the README <Icon name="external" size={12} aria-hidden="true" />
            </a>
          </div>
        </details>
      </figure>
    </Wrap>
  );
}

function Security() {
  const cfg = useDetectorConfig();
  const cards = [
    { who: "SFS-Labs", what: "Independent scoped review", v: "0", l: "Critical, High or Medium issues within the reviewed scope. Both Low findings fixed.", href: `${SECURITY_DOC}#independent-scoped-review-by-sfs-labs-2026-10` },
    { who: "Olympix", what: "Pre-audit scan", v: "100%", l: "Of findings fixed, each with its own regression test.", href: `${SECURITY_DOC}#prior-review-olympix-2026-07` },
    { who: "Foundry", what: "Test suite", v: "243", l: "Passing tests, including invariant and adversarial-manipulation suites.", href: `${REPO}/tree/main/test` },
    { who: "In the contract", what: "Bounded by design", v: cfg.kappaMax ? fmtPct(cfg.kappaMax, 0) : "5%", l: "Maximum spread, changing gradually block by block, so a faked trend has a capped prize.", href: SECURITY_DOC },
  ];
  return (
    <Wrap id="security" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-end justify-between gap-8">
        <Heading id="security-title" align="left" title="Built so that faking a trend doesn't pay."
          lede="Triggering the detector means really moving the price and paying impact the whole way, while arbitrageurs undo the move behind you." />
        <a href={SECURITY_DOC} target="_blank" rel="noreferrer" className="btn lp-btn-ghost" style={{ padding: "0 20px" }}>
          Security model <Icon name="external" size={14} aria-hidden="true" />
        </a>
      </div>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <a key={c.who} href={c.href} target="_blank" rel="noreferrer" className="lp-card lp-card-link group p-6 flex flex-col"
            style={{ minHeight: 260 }}
            aria-label={`${c.who}, ${c.what}: ${c.v} ${c.l} (opens in a new tab)`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display" style={{ fontSize: 17, fontWeight: 700, color: "var(--lp-head)" }}>{c.who}</div>
                <div style={{ fontSize: 13, color: "var(--text-3)" }}>{c.what}</div>
              </div>
              <span aria-hidden="true" style={{ color: "var(--text-3)" }} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"><Icon name="external" size={15} /></span>
            </div>
            <div className="mt-auto pt-8">
              <div className="lp-head" style={{ fontSize: 48, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{c.v}</div>
              <p className="mt-3" style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text-2)" }}>{c.l}</p>
            </div>
          </a>
        ))}
      </div>
    </Wrap>
  );
}

function Faq() {
  const qs = [
    { q: "What is LVR, and why should an LP care?", a: "Loss-versus-rebalancing is the value a passive pool hands to arbitrageurs when the market moves before the pool does. It is the main reason providing liquidity loses money in trending markets, and LPs pay it whether or not fees cover it." },
    { q: "Does Poincaré make trading more expensive?", a: "Only for flow pushing with a confirmed trend, and only up to the spread cap. Counter-trend swaps and every swap in a calm market pay the plain constant-product price plus the base fee, so most volume is never charged." },
    { q: "Can someone fake a trend to exploit it?", a: "To trigger the detector you have to really move the price in one direction, block after block, paying impact the whole way and then the spread you triggered. The reward is capped by the spread limit, and arbitrageurs restore the price as soon as you stop." },
    { q: "How is this different from a dynamic fee?", a: "A dynamic fee raises the price for everyone, including the uninformed flow LPs want to keep. Poincaré charges one side of the book only. At a matched friction budget it keeps 45% more LP value than a vol-scaled fee on the 12-month replay." },
    { q: "Is it live, and is it audited?", a: "It is deployed on Unichain Sepolia as a research preview with free test tokens. The contracts have had an independent scoped review by SFS-Labs (no Critical, High or Medium issues confirmed within the reviewed scope; two Low findings, both fixed) and a pre-audit scan by Olympix (every finding fixed). Neither is an audit certification, so do not treat it as production infrastructure." },
  ];
  return (
    <Wrap id="faq">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <h2 id="faq-title" className="lp-head" style={{ fontSize: "clamp(32px, 4.6vw, 56px)", lineHeight: 1.05 }}>Questions</h2>
          <p className="mt-4" style={{ fontSize: 16, lineHeight: 1.6, color: "var(--text-2)", maxWidth: 340 }}>
            The rest is in the README, with every number traced to the harness that produced it.
          </p>
        </div>
        <div className="flex flex-col">
          {qs.map((x) => (
            <details key={x.q} className="faq" style={{ borderTop: "1px solid var(--border-strong)" }}>
              <summary className="flex items-center justify-between gap-6 py-6" style={{ cursor: "pointer", fontSize: 18, fontWeight: 700, color: "var(--lp-head)", listStyle: "none" }}>
                {x.q}
                <span className="faq-icon shrink-0 inline-flex items-center justify-center" aria-hidden="true"
                  style={{ width: 32, height: 32, borderRadius: 99, border: "1px solid var(--border-strong)", color: "var(--text-2)" }}><Icon name="plus" size={16} /></span>
              </summary>
              <p className="pb-7" style={{ fontSize: 16, lineHeight: 1.65, color: "var(--text-2)", maxWidth: "68ch", marginTop: -4 }}>{x.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Wrap>
  );
}

function Closing() {
  const paths = [
    { who: "For liquidity providers", d: "One constant-product position. The spread from with-trend flow accrues to your shares.", label: "Provide liquidity", search: "?tab=pool" },
    { who: "For traders", d: "Swap against the trend at the plain price. Every quote shows which side is charged.", label: "Open the terminal", search: "?tab=trade" },
  ];
  return (
    <section aria-labelledby="closing-title">
      <div className="mx-auto px-4 sm:px-6 pb-20 md:pb-28" style={{ maxWidth: WIDTH + 48 }}>
        <div className="lp-stage px-6 sm:px-12 py-14 sm:py-20 text-center">
          <h2 id="closing-title" className="lp-head mx-auto" style={{ fontSize: "clamp(34px, 5vw, 64px)", lineHeight: 1.02, maxWidth: "14ch" }}>
            Try it on the live pool.
          </h2>
          <p className="mx-auto mt-5" style={{ fontSize: 18, lineHeight: 1.6, color: "var(--text-2)", maxWidth: 520 }}>
            Connect a wallet on Unichain Sepolia and mint free test tokens to start.
          </p>
          <div className="mx-auto mt-12 grid gap-4 md:grid-cols-2 text-left" style={{ maxWidth: 860 }}>
            {paths.map((p, i) => (
              <div key={p.who} className="rounded-3xl p-6 sm:p-7 flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <h3 className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "var(--lp-head)" }}>{p.who}</h3>
                <p className="mt-2" style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-2)" }}>{p.d}</p>
                <Link to={{ pathname: "/app", search: p.search }} {...warmApp} className={`btn ${i === 0 ? "btn-primary" : "lp-btn-ghost"} mt-6 self-start`} style={{ padding: "0 22px" }}>
                  {p.label}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const col = (title: string, links: { label: string; to?: string; href?: string; mono?: boolean }[]) => (
    <div>
      <h2 style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{title}</h2>
      <ul className="mt-3 flex flex-col" style={{ gap: 8 }}>
        {links.map((l) => (
          <li key={l.label}>
            {l.to ? (
              <Link to={l.to} {...warmApp} className="link-quiet" style={{ fontSize: 14 }}>{l.label}</Link>
            ) : (
              <a href={l.href} target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1" style={{ fontSize: 14, fontFamily: l.mono ? "var(--font-mono)" : undefined }} translate={l.mono ? "no" : undefined}>
                {l.label} <Icon name="external" size={12} aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <footer className="mx-auto px-4 sm:px-6 pt-14 pb-10" style={{ maxWidth: WIDTH + 48 }}>
      {/* the developer way in: one clear call to the docs above the link columns */}
      <div className="card flex flex-col md:flex-row md:items-center gap-5 mb-12" style={{ padding: "clamp(20px, 3vw, 28px)" }}>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--lav-ink)", letterSpacing: "0.04em", textTransform: "uppercase" }}>For developers</p>
          <h2 className="font-display mt-1.5" style={{ fontSize: "clamp(22px, 2.4vw, 28px)", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>Build on the trend detector.</h2>
          <p className="mt-1.5" style={{ fontSize: 15, lineHeight: 1.55, color: "var(--text-3)", maxWidth: "42rem" }}>
            A TypeScript SDK, an MCP server for AI agents and an HTTP API: read the regime, quote swaps and run spread-aware DCA. No API keys.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Link to="/developers" className="btn lp-btn-ink">Read the docs <Icon name="arrowRight" size={15} aria-hidden="true" /></Link>
          <Link to="/developers/quickstart" className="btn btn-secondary">Quickstart</Link>
        </div>
      </div>
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Mark size={28} decorative />
            <span className="font-display" style={{ fontWeight: 700, fontSize: 17, color: "var(--text)" }}>Poincaré</span>
          </div>
          <p className="mt-3" style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-3)", maxWidth: 320 }}>
            An adaptive Uniswap v4 pool that prices the trend, not the trader.
          </p>
        </div>
        {col("Product", [
          { label: "Dashboard", to: "/app" },
          { label: "Trade", to: "/app?tab=trade" },
          { label: "Pool", to: "/app?tab=pool" },
          { label: "Analytics", to: "/app?tab=analytics" },
        ])}
        {col("Research", [
          { label: "README & backtests", href: README },
          { label: "Developer docs", to: "/developers" },
          { label: "Source code", href: REPO },
        ])}
        {col("Network", [
          { label: `Hook ${shorten(CONTRACTS.hook)}`, href: `${EXPLORER}/address/${CONTRACTS.hook}`, mono: true },
          { label: "@Poincare_AMM", href: "https://x.com/Poincare_AMM" },
        ])}
      </div>
      <div className="mt-12 pt-6 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-3)" }}>
        <span>Unichain Sepolia testnet · research preview · test tokens carry no value.</span>
        <span>Not investment advice. Backtest results do not guarantee future performance.</span>
      </div>
    </footer>
  );
}
