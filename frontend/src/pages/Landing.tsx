import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon, type IconName } from "@/components/ui/Icon";
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
import { scrollBehavior } from "@/lib/platform";

// start fetching the app chunk the moment a visitor shows intent, so the click lands instantly
const warmApp = { onPointerEnter: () => void loadAppRoute(), onFocus: () => void loadAppRoute(), onTouchStart: () => void loadAppRoute() };

/**
 * The public landing page. Layout after aave.com: a light page of large rounded chapters, each
 * easing from the page colour into lavender, so sections flow into one another rather than being
 * boxed off; the evidence sits in the one dark chapter. Type after about.uniswap.org: one grotesque
 * for everything, headings at weight 550 with tight tracking, grey body copy, monospace only for
 * small metadata. Every chapter opens the same way: an icon and label, the heading, one line of
 * copy, then its content. The hero has the only load animation.
 */

const REPO = "https://github.com/Prakhar-30/POINCARE";
const README = `${REPO}#readme`;
const SECURITY_DOC = `${REPO}/blob/main/SECURITY.md`;
const WIDTH = 1200;
const MOCKUP = `${import.meta.env.BASE_URL}landing/app-mockup`;
const MOCKUP_LQIP = "data:image/webp;base64,UklGRnoAAABXRUJQVlA4IG4AAACwAwCdASoYABAAPu1iqk2ppaQiMAgBMB2JZAAAW+ufTAnkJ0zIwAD+8QuZnTW2zNBzCvnDjM3613S2ODUsbqTE0kDiVLoKgRJEITiAO8Tml8uc/Z99eiMUAXz5OxM2QQFbslsvJJV4Ji0QoQAAAA==";

const enter = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const, delay },
});

// In-page scroll (HashRouter owns the URL hash, so these are buttons, not href="#id").
const scrollToId = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior() });
const scrollTop = () => window.scrollTo({ top: 0, behavior: scrollBehavior() });
/** Read by screen readers after a link that opens a new tab (the icon beside it is decorative). */
const NewTab = () => <span className="sr-only"> (opens in a new tab)</span>;

const NAV = [
  { id: "how", label: "How it works" },
  { id: "proof", label: "Proof" },
  { id: "security", label: "Security" },
  { id: "faq", label: "FAQ" },
];

export function Landing() {
  return (
    <div className="lx min-h-screen">
      <a href="#top" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("top")?.focus(); }}>
        Skip to content
      </a>
      <Nav />
      <main id="top" tabIndex={-1} className="flex flex-col" style={{ outline: "none", gap: "clamp(16px, 2vw, 24px)" }}>
        <Hero />
        <LiveFigures />
        <How />
        <Evidence />
        <Arbitrage />
        <Security />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// shared pieces

/** How every chapter opens: the heading (no closing full stop) and one line of copy. */
function ChapterHead({ id, title, lede }: { id: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div className="mx-auto text-center" style={{ maxWidth: 820 }}>
      <h2 id={id} className="lx-h" style={{ fontSize: "clamp(36px, 4.8vw, 64px)" }}>{title}</h2>
      {lede && <p className="lx-sub mx-auto mt-5" style={{ fontSize: "clamp(17px, 1.5vw, 20px)", lineHeight: 1.5, maxWidth: "40rem", textWrap: "pretty" }}>{lede}</p>}
    </div>
  );
}

function Chapter({ id, dark, children, labelledBy }: { id?: string; dark?: boolean; children: ReactNode; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`lx-chapter${dark ? " lx-chapter-dark" : ""}`} style={{ scrollMarginTop: 84 }}>
      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: WIDTH + 64, paddingTop: "clamp(72px, 9vw, 120px)", paddingBottom: "clamp(56px, 8vw, 104px)" }}>
        {children}
      </div>
    </section>
  );
}

function LaunchButton({ variant = "primary", label = "Launch app", small }: { variant?: "primary" | "ink" | "light"; label?: string; small?: boolean }) {
  return (
    <Link to="/app" {...warmApp} className={`lx-btn lx-btn-${variant}${small ? " lx-btn-sm" : ""}`}>{label}</Link>
  );
}

// ---------------------------------------------------------------------------------------------
// chrome

function Nav() {
  return (
    <nav aria-label="Main" className="sticky top-0 z-50" style={{ background: "var(--nav-bg)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
      <div className="mx-auto flex items-center gap-3 sm:gap-6 px-4 sm:px-8" style={{ maxWidth: WIDTH + 64, height: 72 }}>
        <button type="button" onClick={scrollTop} aria-label="Poincaré, back to top" className="flex items-center gap-2.5 shrink-0 rounded-xl" style={{ cursor: "pointer", minHeight: 44 }}>
          <Mark size={30} decorative />
          {/* the narrowest phones keep the mark alone, so the launch button never runs off the edge */}
          <span className="hidden min-[380px]:inline" style={{ fontWeight: 600, fontSize: 19, letterSpacing: "-0.03em", color: "var(--lx-ink)" }}>Poincaré</span>
        </button>
        <div className="hidden lg:flex flex-1 items-center justify-end gap-1">
          {NAV.map((n) => (
            <button key={n.id} type="button" onClick={scrollToId(n.id)} className="lx-link rounded-full px-4" style={{ cursor: "pointer", minHeight: 40, fontSize: 15, fontWeight: 500 }}>
              {n.label}
            </button>
          ))}
        </div>
        <div className="ml-auto lg:ml-0 flex items-center gap-2 sm:gap-3">
          <a href={REPO} target="_blank" rel="noreferrer" className="lx-link hidden sm:inline-flex items-center gap-1.5 rounded-full px-3" style={{ minHeight: 40, fontSize: 15, fontWeight: 500 }}>
            GitHub <Icon name="external" size={13} aria-hidden="true" /><NewTab />
          </a>
          <ThemeToggle />
          <LaunchButton variant="ink" small />
        </div>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------
// hero chapter: the claim, the two ways in, and the live product beneath

/** The book the hero shows: the live pool, or the "trend fires" preview at the spread cap. The
 *  chart and the three floating facts around it read this one value, so they always agree. */
function useHeroBook(mode: "live" | "trend") {
  const s = usePoolState();
  const cfg = useDetectorConfig();
  const buy = mode === "trend" ? cfg.kappaMax : s.spreadZeroForOne;
  const sell = mode === "trend" ? 0 : s.spreadOneForZero;
  return { s, buy, sell, ready: s.price > 0 };
}

function Hero() {
  const [mode, setMode] = useState<"live" | "trend">("live");
  const { buy, sell, ready } = useHeroBook(mode);
  const charged = buy > 0 || sell > 0;
  const chargedSide = buy >= sell ? "buys" : "sells";
  const preview = mode === "trend";
  // three facts, each a reading of the book in the middle: what is charged, what trades free, and
  // what a spread-aware DCA plan (the default "skip the spread" protection) does with it
  const spreadV = !ready ? <Skel w="8ch" /> : charged ? `+${fmtPct(Math.max(buy, sell))} on ${chargedSide}` : "None";
  const freeV = !ready ? <Skel w="7ch" /> : !charged ? "Every swap" : buy > 0 ? "Every sell" : "Every buy";
  const dcaV = !ready ? <Skel w="9ch" /> : !charged ? "Every slice fills" : buy > 0 ? "Buys wait, sells fill" : "Sells wait, buys fill";
  return (
    <header className="lx-chapter">
      <div className="mx-auto px-5 sm:px-8 text-center" style={{ maxWidth: WIDTH + 64, paddingTop: "clamp(64px, 9vw, 120px)", paddingBottom: "clamp(40px, 6vw, 72px)" }}>
        <motion.h1 {...enter(0.05)} className="lx-h mx-auto" style={{ fontSize: "clamp(42px, 6vw, 80px)", maxWidth: "20ch" }}>
          Liquidity that charges the trend, not the trader
        </motion.h1>
        <motion.p {...enter(0.1)} className="lx-sub mx-auto mt-6" style={{ fontSize: "clamp(17px, 1.5vw, 20px)", lineHeight: 1.5, maxWidth: "34rem", textWrap: "balance" }}>
          Swaps that push with a confirmed trend pay a spread. Liquidity providers keep it.
        </motion.p>
        <motion.div {...enter(0.15)} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <LaunchButton />
          <a href={README} target="_blank" rel="noreferrer" className="lx-btn lx-btn-secondary">
            Read the research<NewTab />
          </a>
        </motion.div>
        <motion.div {...enter(0.18)}>
          <Reviewers />
        </motion.div>

        <motion.div {...enter(0.22)} className="relative mx-auto mt-14 md:mt-16" style={{ maxWidth: 1080 }}>
          {/* three facts floating around the book, desktop only. They read the same book as the
              chart, so flipping "Live / Trend fires" changes them too; the panel itself carries the
              same figures for phones and screen readers, so the first two are hidden from them. */}
          <div className="hidden lg:block absolute lx-float" style={{ left: 0, top: 40, zIndex: 2 }} aria-hidden="true">
            <Fact tone={charged ? "honey" : "green"} k={preview ? "When a trend fires" : "Trend spread now"} v={spreadV} />
          </div>
          <div className="hidden lg:block absolute lx-float lx-float-2" style={{ right: 0, top: 150, zIndex: 2 }} aria-hidden="true">
            <Fact tone="green" k={preview ? "Still spread-free" : "Trading spread-free now"} v={freeV} />
          </div>
          <div className="hidden lg:block absolute lx-float lx-float-3" style={{ left: 24, top: 300, zIndex: 2 }}>
            <Link to={{ pathname: "/app", search: "?tab=trade&mode=dca" }} {...warmApp} className="lx-card lx-fact-link block px-4 py-3 text-left"
              style={{ boxShadow: "var(--lx-card-shadow)", minWidth: 188 }}>
              <span className="flex items-center gap-1.5" style={{ fontSize: 13, color: "var(--lx-sub)" }}>
                <Icon name="layers" size={13} aria-hidden="true" /> Spread-aware DCA
              </span>
              <span className="lx-num block" style={{ fontSize: 19, marginTop: 6, color: "var(--lx-accent-ink)" }}>{dcaV}</span>
              <span className="block" style={{ fontSize: 12, marginTop: 6, color: "var(--lx-sub)" }}>Start a plan <span aria-hidden="true">→</span></span>
            </Link>
          </div>
          <div className="relative mx-auto text-left" style={{ maxWidth: 640 }}>
            <LivePanel mode={mode} setMode={setMode} />
          </div>
        </motion.div>
      </div>
    </header>
  );
}

/** Who has looked at the contracts. Each keeps its real scope (Olympix ran a pre-audit scan,
 *  SFS-Labs a scoped review) and links to that review's own section of the security report, the
 *  evidence itself, rather than to the reviewer's social profile. */
const REVIEWERS = [
  { name: "Olympix", role: "Pre-audit scan", href: `${SECURITY_DOC}#prior-review-olympix-2026-07`, avatar: "olympix" },
  { name: "SFS-Labs", role: "Scoped review", href: `${SECURITY_DOC}#independent-scoped-review-by-sfs-labs-2026-10`, avatar: "sfs-labs" },
];

/**
 * One trust badge rather than a label and two loose names: a shield and "Reviewed by", then each
 * reviewer as logo, name and scope, the three parts joined by hairlines inside a single pill so the
 * eye reads them as one claim. On phones the pill becomes a rounded block with the parts stacked.
 */
function Reviewers() {
  return (
    <div className="mt-9 flex justify-center">
      <div className="lx-trust inline-flex flex-col sm:flex-row items-stretch sm:items-center" aria-label="Contracts reviewed by" role="group">
        <span className="lx-trust-head inline-flex items-center justify-center gap-2" style={{ fontSize: 14, fontWeight: 550, color: "var(--lx-ink)" }}>
          <span style={{ color: "var(--green-label)" }} aria-hidden="true"><Icon name="shield" size={16} /></span>
          Reviewed by
        </span>
        {REVIEWERS.map((r) => (
          <a key={r.name} href={r.href} target="_blank" rel="noreferrer" className="lx-trust-item inline-flex items-center gap-2.5"
            aria-label={`${r.name}, ${r.role.toLowerCase()}: read the review in the security report (opens in a new tab)`}>
            {/* the reviewer's own logo, kept locally rather than hot-linked */}
            <img src={`${import.meta.env.BASE_URL}landing/${r.avatar}.webp`} alt="" width={26} height={26}
              style={{ width: 26, height: 26, borderRadius: 99 }} />
            <span className="text-left leading-tight">
              <span className="block" style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--lx-ink)" }}>{r.name}</span>
              <span className="block" style={{ fontSize: 12.5, color: "var(--lx-sub)" }}>{r.role}</span>
            </span>
            <Icon name="external" size={12} aria-hidden="true" className="lx-trust-arrow" />
          </a>
        ))}
      </div>
    </div>
  );
}

function Fact({ k, v, tone }: { k: string; v: ReactNode; tone: "green" | "honey" }) {
  return (
    <div className="lx-card px-4 py-3 text-left" style={{ boxShadow: "var(--lx-card-shadow)", minWidth: 188 }}>
      <div style={{ fontSize: 13, color: "var(--lx-sub)" }}>{k}</div>
      <div className="lx-num" style={{ fontSize: 22, marginTop: 6, color: tone === "green" ? "var(--green-label)" : "var(--honey-ink)", transition: "color .2s ease-out" }}>{v}</div>
    </div>
  );
}

/** The product itself, live: the pool's real book, with a switch that shows what the hook does. */
function LivePanel({ mode, setMode }: { mode: "live" | "trend"; setMode: (m: "live" | "trend") => void }) {
  const { s, buy, sell } = useHeroBook(mode);
  const totals = usePoolTotals().data;
  const x = fromWei(s.r0, "USDC");
  const y = fromWei(s.r1, "WETH");
  const regime = s.trend === "up" ? "Up-trend" : s.trend === "down" ? "Down-trend" : "Calm";
  const sideV = (sp: number) => (sp > 0 ? `+${fmtPct(sp)}` : "Free");

  return (
    <section aria-label="Live pool preview" className="lx-card overflow-hidden" style={{ boxShadow: "var(--lx-card-shadow)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--lx-line)" }}>
        <div className="flex items-center gap-2.5">
          <span className="flex" aria-hidden="true">
            <TokenIcon sym="WETH" size={22} />
            <span style={{ marginLeft: -7 }}><TokenIcon sym="USDC" size={22} /></span>
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--lx-ink)" }}>WETH / USDC</span>
          <span className="lx-num" style={{ fontSize: 15, color: "var(--lx-sub)" }}>{s.loading ? <Skel w="7ch" /> : s.price > 0 ? fmtNum(s.price, 2) : "—"}</span>
        </div>
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: "var(--lx-sub)" }}>
          <span className="anim-pulse-dot" aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--up)" }} />
          Live · detector {regime.toLowerCase()}
        </span>
      </div>
      <div className="px-4 pt-3 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--lx-sub)" }}>Order book depth, read from the curve</span>
          <div className="flex items-center gap-2">
            {mode === "trend" && <SourceTag kind="preview" />}
            <Seg label="Market state" value={mode} onChange={setMode} options={[{ id: "live", label: "Live" }, { id: "trend", label: "Trend fires" }]} />
          </div>
        </div>
        <LiquidityDepth x={x} y={y} fee={s.fee} spreadBuy={buy} spreadSell={sell} range={0.1} height={230} />
      </div>
      <dl className="grid grid-cols-3" style={{ borderTop: "1px solid var(--lx-line)" }}>
        {[
          { l: "Buy side", v: sideV(buy), c: buy > 0 ? "var(--honey-ink)" : "var(--up-ink)" },
          { l: "Sell side", v: sideV(sell), c: sell > 0 ? "var(--honey-ink)" : "var(--up-ink)" },
          { l: "Kept for LPs", v: !totals ? <Skel /> : totals.swap_count > 0 ? fmtUsd(totals.lvr_avoided, { compact: true }) : "—", c: "var(--green-label)" },
        ].map((c, i) => (
          <div key={c.l} className="px-4 py-3" style={{ borderLeft: i ? "1px solid var(--lx-line)" : undefined }}>
            <dt style={{ fontSize: 12, fontWeight: 600, color: "var(--lx-sub)" }}>{c.l}</dt>
            <dd className="lx-num" style={{ fontSize: 18, marginTop: 4, color: c.c }}>{c.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// live figures: no box, one line of figures split by hairlines (Aave's band under its hero)

/**
 * The platform's headline result, given the page's focus by hierarchy rather than a box: one
 * figure (what LPs kept) at hero scale in the colour the page reserves for it, a sentence that
 * says what it is and where it comes from, and the three supporting figures quieter beneath it.
 * A soft green light sits behind the number; there is no container.
 */
function LiveFigures() {
  const s = usePoolState();
  const totals = usePoolTotals().data;
  const tvl = fromWei(s.r0, "USDC") + fromWei(s.r1, "WETH") * s.price;
  const kept = !totals ? <Skel w="6ch" h="0.8em" r={16} /> : totals.swap_count > 0 ? fmtUsd(totals.lvr_avoided, { dp: 0 }) : "—";
  const supporting = [
    { l: "Total value locked", v: s.loading ? <Skel /> : tvl > 0 ? fmtUsd(tvl, { compact: true }) : "—" },
    { l: "Volume traded", v: totals ? fmtUsd(totals.volume_usdc, { compact: true }) : <Skel /> },
    { l: "Swaps settled", v: totals ? fmtNum(totals.swap_count, 0) : <Skel /> },
  ];
  return (
    <section aria-labelledby="live-title" className="relative mx-auto w-full text-center"
      style={{ maxWidth: WIDTH + 64, padding: "clamp(72px, 9vw, 128px) 20px clamp(56px, 7vw, 96px)",
        background: "radial-gradient(38% 46% at 50% 34%, rgba(107, 184, 154, 0.16) 0%, transparent 72%)" }}>
      <a href={`${EXPLORER}/address/${CONTRACTS.hook}`} target="_blank" rel="noreferrer" className="lx-link lx-meta inline-flex items-center gap-2 rounded-full" translate="no"
        style={{ minHeight: 32 }} aria-label={`Live figures, read from the hook contract ${CONTRACTS.hook} on the block explorer (opens in a new tab)`}>
        <span className="anim-pulse-dot" aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--up)" }} />
        Live from the hook · {shorten(CONTRACTS.hook)} <Icon name="external" size={12} aria-hidden="true" />
      </a>
      <h2 id="live-title" className="sr-only">Trend spread kept by liquidity providers on the testnet pool</h2>
      <p className="lx-num mt-6" style={{ fontSize: "clamp(64px, 11vw, 148px)", letterSpacing: "-0.055em", color: "var(--green-label)" }} aria-describedby="live-kept-what">
        {kept}
      </p>
      <p className="lx-h3 mt-4" style={{ fontSize: "clamp(20px, 2.2vw, 28px)" }}>trend spread kept by LPs</p>
      <p id="live-kept-what" className="lx-sub mx-auto mt-3" style={{ fontSize: "clamp(16px, 1.4vw, 18px)", lineHeight: 1.55, maxWidth: "38rem", textWrap: "pretty" }}>
        Paid by swaps that pushed with a confirmed trend, and kept in the pool for liquidity providers. Unichain Sepolia testnet{totals && totals.swap_count > 0 ? `, ${fmtNum(totals.swap_count, 0)} swaps so far` : ""}.
      </p>
      <dl className="lx-stats mx-auto mt-14" style={{ ["--n" as string]: 3, maxWidth: 880 }}>
        {supporting.map((f) => (
          // dt first, as the markup requires; column-reverse puts the figure on top
          <div key={f.l} className="flex flex-col-reverse items-center">
            <dt className="lx-sub mt-2" style={{ fontSize: 15 }}>{f.l}</dt>
            <dd className="lx-num" style={{ fontSize: "clamp(28px, 3vw, 40px)", color: "var(--lx-ink)" }}>{f.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// how it works

/** One side of the book: free (green) or charged (honey). A line, not a box. */
function Side({ label, charge }: { label: string; charge: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: "1px solid var(--lx-line)" }}>
      <span style={{ fontSize: 14, color: "var(--lx-sub)" }}>{label}</span>
      <span className="rounded-full px-2.5 py-0.5" style={{ fontSize: 12, fontWeight: 700, background: charge ? "var(--warn-bg)" : "var(--change-up-bg)", color: charge ? "var(--honey-ink)" : "var(--up-ink)" }}>
        {charge ?? "Plain price"}
      </span>
    </div>
  );
}

function How() {
  const cfg = useDetectorConfig();
  const cap = cfg.kappaMax ? fmtPct(cfg.kappaMax, 0) : "5%";
  const states = [
    { tag: "Calm market", t: "Both sides pay the plain price", d: "With no confirmed trend the curve is symmetric, the same constant-product price any Uniswap pool would quote.", buy: null, sell: null },
    { tag: "Trend confirmed", t: "Only with-trend swaps pay", d: `A CUSUM test on the pool's own price fires once the evidence adds up. Swaps pushing with the trend pay a spread of up to ${cap}, ramped in gradually.`, buy: `Up to ${cap}`, sell: null },
    { tag: "Trend fades", t: "The spread returns to zero", d: "As the evidence decays the spread ramps back down and the pool is symmetric again. What it collected stays in the pool, credited to LP shares.", buy: null, sell: null, kept: true },
  ];
  return (
    <Chapter id="how" labelledBy="how-title">
      <ChapterHead id="how-title" title="One pool that knows when the market is trending"
        lede="Poincaré is a custom-curve Uniswap v4 hook. It reads only its own reserves, so there is no oracle to feed and no keeper to run." />
      <ol className="mt-14 grid gap-4 md:grid-cols-3">
        {states.map((s, i) => (
          <li key={s.tag} className="lx-card flex flex-col p-6 sm:p-7">
            <span className="lx-meta">0{i + 1} · {s.tag}</span>
            <h3 className="lx-h3 mt-4" style={{ fontSize: 24 }}>{s.t}</h3>
            <p className="lx-sub mt-3" style={{ fontSize: 15, lineHeight: 1.6 }}>{s.d}</p>
            <div className="mt-auto pt-6">
              {s.kept && (
                <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: "1px solid var(--lx-line)" }}>
                  <span style={{ fontSize: 14, color: "var(--lx-sub)" }}>Spread collected</span>
                  <span className="rounded-full px-2.5 py-0.5" style={{ fontSize: 12, fontWeight: 700, color: "var(--green-label)", background: "var(--green-bg)" }}>Kept by LPs</span>
                </div>
              )}
              <Side label="With-trend side" charge={s.buy} />
              <Side label="Against-trend side" charge={s.sell} />
            </div>
          </li>
        ))}
      </ol>
    </Chapter>
  );
}

// ---------------------------------------------------------------------------------------------
// the dark chapter: the evidence, then the app itself

function Evidence() {
  const figures = [
    { v: "+6.44%", l: "LP value against a 30 bps pool" },
    { v: "−32%", l: "Value taken by arbitrageurs" },
    { v: "+45%", l: "LP value against a vol-fee pool" },
    { v: "50.6%", l: "LVR cut on trend-heavy paths" },
  ];
  return (
    <section id="proof" aria-labelledby="proof-title" className="lx-chapter lx-chapter-dark" style={{ scrollMarginTop: 84 }}>
      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: WIDTH + 64, paddingTop: "clamp(72px, 9vw, 120px)" }}>
        <ChapterHead id="proof-title" title="Measured on four years of real prices"
          lede="The pool has been replayed through four years of real ETH prices and stress-tested on synthetic trends. Every spread it charged a with-trend swap stayed in the pool." />
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <LaunchButton variant="light" />
          <a href={README} target="_blank" rel="noreferrer" className="lx-btn" style={{ color: "#f6f3fb", background: "rgba(255,255,255,0.08)" }}>
            Full results in the README<NewTab />
          </a>
        </div>
        <dl className="lx-stats mt-16" style={{ ["--n" as string]: 4 }}>
          {figures.map((f) => (
            <div key={f.l} className="flex flex-col-reverse items-center">
              <dt className="lx-sub mt-2.5" style={{ fontSize: 15 }}>{f.l}</dt>
              <dd className="lx-num" style={{ fontSize: "clamp(32px, 3.6vw, 48px)" }}>{f.v}</dd>
            </div>
          ))}
        </dl>
        <p className="lx-meta mt-8 text-center">Backtests: real-data replays and synthetic stress paths, documented in the README. Not this pool&rsquo;s activity.</p>
      </div>
      {/* the app on a phone, rising out of the chapter's floor; a concept design, so labelled as one */}
      <figure className="relative mx-auto mt-12 px-5" style={{ maxWidth: 980, marginBottom: 0 }}>
        <div className="lp-showcase-img" style={{ backgroundImage: `url(${MOCKUP_LQIP})`, backgroundSize: "cover", aspectRatio: "3 / 2" }}>
          <img src={`${MOCKUP}.webp`} srcSet={`${MOCKUP}-768.webp 768w, ${MOCKUP}.webp 1536w`}
            sizes="(min-width: 1024px) 940px, 100vw" width={1536} height={1024} loading="lazy" decoding="async"
            alt="Three phone screens of the Poincaré app: a liquidity position, total value locked with a trend-detected alert, and market insights."
            className="block w-full h-auto" />
        </div>
        <figcaption className="lx-meta text-center" style={{ padding: "8px 0 28px" }}>Concept design. Figures shown on the phones are illustrative.</figcaption>
      </figure>
    </section>
  );
}

function Arbitrage() {
  // Four-year replay, $2,000,000 position, arbitrage extracted (README, "Four years of real data").
  const rows = [
    { l: "Normal pool, 5 bps fee", v: 473_696, c: "var(--faint)" },
    { l: "Normal pool, 30 bps fee", v: 387_110, c: "var(--faint)" },
    { l: "Poincaré", v: 264_835, c: "var(--action)" },
  ];
  const max = rows[0].v;
  return (
    <Chapter labelledBy="chart-title">
      <ChapterHead id="chart-title" title="Less for arbitrageurs, more for LPs"
        lede="Over four years Poincaré gave arbitrageurs $122,275 less than a 30&nbsp;bps pool and finished $185,167 ahead of it." />
      <figure className="lx-card mx-auto mt-14 p-6 sm:p-10" style={{ marginBottom: 0, maxWidth: 940, boxShadow: "var(--lx-card-shadow)" }} aria-labelledby="chart-title">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-2 mb-8">
          <span className="lx-h3" style={{ fontSize: 18 }}>Value taken by arbitrageurs</span>
          <span className="lx-meta">$2M position · ETH/USDC · 2022–2026</span>
        </figcaption>
        <ul className="flex flex-col" style={{ gap: 22 }}>
          {rows.map((r) => (
            <li key={r.l}>
              <div className="flex justify-between" style={{ fontSize: 15, marginBottom: 8 }}>
                <span style={{ fontWeight: r.l === "Poincaré" ? 600 : 400, color: r.l === "Poincaré" ? "var(--lx-ink)" : "var(--lx-sub)" }}>{r.l}</span>
                <span className="lx-num" style={{ fontSize: 15, color: r.l === "Poincaré" ? "var(--lx-accent-ink)" : "var(--lx-sub)" }}>{fmtUsd(r.v, { dp: 0 })}</span>
              </div>
              <div style={{ height: 12, borderRadius: 99, background: "var(--track)", overflow: "hidden" }} aria-hidden="true">
                <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: r.v / max }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                  style={{ height: "100%", width: "100%", background: r.c, transformOrigin: "left", borderRadius: 99 }} />
              </div>
            </li>
          ))}
        </ul>

        <details className="faq mt-10 pt-6" style={{ borderTop: "1px solid var(--lx-line)" }}>
          <summary className="flex items-center justify-between gap-4" style={{ cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--lx-ink)", listStyle: "none" }}>
            Methodology, caveat and sources
            <span className="faq-icon shrink-0" aria-hidden="true" style={{ color: "var(--lx-sub)" }}><Icon name="plus" size={18} /></span>
          </summary>
          <div className="lx-sub pt-4 flex flex-col gap-4" style={{ fontSize: 14, lineHeight: 1.65, maxWidth: "75ch" }}>
            <p>
              Every figure comes from the open-source backtest harness. LP value nets fees, spread, arbitrage and inventory, and
              comparisons run at a matched operating point, because an unmatched baseline flatters whichever pool it is compared with.
            </p>
            <p>
              <b style={{ color: "var(--lx-ink)", fontWeight: 600 }}>The caveat.</b> At a matched friction budget a symmetric vol-scaled fee removes slightly more
              raw LVR (5.66% against 4.67% on the 12-month replay). Poincaré wins on what an LP keeps, because it charges the side that
              causes the loss instead of taxing all flow.
            </p>
            <ul className="flex flex-col gap-1.5" style={{ fontSize: 13 }}>
              <li><b style={{ fontWeight: 600 }}>4-year replay:</b> 2022-09-19 to 2026-09-18, 7,776 four-hour closes, $2,000,000 position.</li>
              <li><b style={{ fontWeight: 600 }}>12-month calibration:</b> real data against a vol-fee pool, total friction matched to 0.13%.</li>
              <li><b style={{ fontWeight: 600 }}>Stress harness:</b> five seeded trend-dense paths (47.1% to 53.2%), fresh order book per run.</li>
            </ul>
          </div>
        </details>
      </figure>
    </Chapter>
  );
}

function Security() {
  const cfg = useDetectorConfig();
  const cards: { icon: IconName; who: string; what: string; v: string; l: string; href: string }[] = [
    { icon: "shield", who: "SFS-Labs", what: "Independent scoped review", v: "0", l: "Critical, High or Medium issues within the reviewed scope. Both Low findings fixed.", href: `${SECURITY_DOC}#independent-scoped-review-by-sfs-labs-2026-10` },
    { icon: "check", who: "Olympix", what: "Pre-audit scan", v: "100%", l: "Of findings fixed, each with its own regression test.", href: `${SECURITY_DOC}#prior-review-olympix-2026-07` },
    { icon: "layers", who: "Foundry", what: "Test suite", v: "243", l: "Passing tests, including invariant and adversarial-manipulation suites.", href: `${REPO}/tree/main/test` },
    { icon: "gauge", who: "In the contract", what: "Bounded by design", v: cfg.kappaMax ? fmtPct(cfg.kappaMax, 0) : "5%", l: "Maximum spread, changing gradually block by block, so a faked trend has a capped prize.", href: SECURITY_DOC },
  ];
  return (
    <Chapter id="security" labelledBy="security-title">
      <ChapterHead id="security-title" title="Built so that faking a trend doesn't pay"
        lede="Triggering the detector means really moving the price and paying impact the whole way, while arbitrageurs undo the move behind you." />
      <div className="mt-8 flex justify-center">
        <a href={SECURITY_DOC} target="_blank" rel="noreferrer" className="lx-btn lx-btn-secondary">Security model<NewTab /></a>
      </div>
      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <li key={c.who} className="flex">
            <a href={c.href} target="_blank" rel="noreferrer" className="lx-card flex flex-1 flex-col p-6"
              aria-label={`${c.who}, ${c.what}: ${c.v} ${c.l} (opens in a new tab)`}>
              <span style={{ color: "var(--lx-accent-ink)" }} aria-hidden="true"><Icon name={c.icon} size={22} /></span>
              <span className="lx-num mt-6 block" style={{ fontSize: 40 }}>{c.v}</span>
              <span className="mt-3 block" style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--lx-ink)" }}>{c.who} · {c.what}</span>
              <span className="lx-sub mt-1.5 block" style={{ fontSize: 14, lineHeight: 1.55 }}>{c.l}</span>
            </a>
          </li>
        ))}
      </ul>
    </Chapter>
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
    <section id="faq" aria-labelledby="faq-title" className="mx-auto w-full px-5 sm:px-8" style={{ maxWidth: 840, padding: "clamp(64px, 8vw, 112px) 20px", scrollMarginTop: 84 }}>
      <h2 id="faq-title" className="lx-h text-center" style={{ fontSize: "clamp(36px, 4.8vw, 64px)" }}>Questions</h2>
      <p className="lx-sub mx-auto mt-4 text-center" style={{ fontSize: 17, maxWidth: "32rem" }}>The rest is in the README, with every number traced to the harness that produced it.</p>
      <div className="mt-12 flex flex-col">
        {qs.map((x) => (
          <details key={x.q} className="faq" style={{ borderTop: "1px solid var(--lx-line)" }}>
            <summary className="flex items-center justify-between gap-6 py-6" style={{ cursor: "pointer", fontSize: 18, fontWeight: 550, letterSpacing: "-0.015em", color: "var(--lx-ink)", listStyle: "none" }}>
              {x.q}
              <span className="faq-icon shrink-0" aria-hidden="true" style={{ color: "var(--lx-accent-ink)" }}><Icon name="plus" size={20} /></span>
            </summary>
            <p className="lx-sub pb-7" style={{ fontSize: 16, lineHeight: 1.65, maxWidth: "68ch", marginTop: -4 }}>{x.a}</p>
          </details>
        ))}
        <div style={{ borderTop: "1px solid var(--lx-line)" }} />
      </div>
    </section>
  );
}

function Closing() {
  return (
    <Chapter labelledBy="closing-title">
      <ChapterHead id="closing-title" title="Try it on the live pool"
        lede="Connect a wallet on Unichain Sepolia and mint free test tokens to start. Provide liquidity to earn the trend spread, or swap against the trend at the plain price." />
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Link to={{ pathname: "/app", search: "?tab=pool" }} {...warmApp} className="lx-btn lx-btn-primary">Provide liquidity</Link>
        <Link to={{ pathname: "/app", search: "?tab=trade" }} {...warmApp} className="lx-btn lx-btn-secondary">Open the terminal</Link>
      </div>
    </Chapter>
  );
}

function Footer() {
  const col = (title: string, links: { label: string; to?: string; href?: string; mono?: boolean }[]) => (
    <div>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--lx-ink)" }}>{title}</h2>
      <ul className="mt-4 flex flex-col" style={{ gap: 10 }}>
        {links.map((l) => (
          <li key={l.label}>
            {l.to ? (
              <Link to={l.to} {...warmApp} className="lx-link" style={{ fontSize: 14 }}>{l.label}</Link>
            ) : (
              <a href={l.href} target="_blank" rel="noreferrer" className="lx-link inline-flex items-center gap-1" style={{ fontSize: 14, fontFamily: l.mono ? "var(--font-mono)" : undefined }} translate={l.mono ? "no" : undefined}>
                {l.label} <Icon name="external" size={12} aria-hidden="true" /><NewTab />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <footer className="mx-auto px-5 sm:px-8 pt-20 pb-10" style={{ maxWidth: WIDTH + 64 }}>
      {/* the developer way in: one clear call to the docs above the link columns, open rather than boxed */}
      <div className="flex flex-col md:flex-row md:items-end gap-6 pb-12" style={{ borderBottom: "1px solid var(--lx-line)" }}>
        <div className="flex-1 min-w-0">
          <h2 className="lx-h" style={{ fontSize: "clamp(28px, 3vw, 40px)" }}>Build on the trend detector</h2>
          <p className="lx-sub mt-3" style={{ fontSize: 16, lineHeight: 1.55, maxWidth: "40rem" }}>
            A TypeScript SDK, an MCP server for AI agents and an HTTP API: read the regime, quote swaps and run spread-aware DCA. No API keys.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Link to="/docs" className="lx-btn lx-btn-primary">Read the docs <Icon name="arrowRight" size={15} aria-hidden="true" /></Link>
          <Link to="/docs/quickstart" className="lx-btn lx-btn-tonal">Quickstart</Link>
        </div>
      </div>
      <div className="grid gap-10 pt-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Mark size={28} decorative />
            <span style={{ fontWeight: 600, fontSize: 18, letterSpacing: "-0.03em", color: "var(--lx-ink)" }}>Poincaré</span>
          </div>
          <p className="lx-sub mt-3" style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 300 }}>
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
          { label: "Developer docs", to: "/docs" },
          { label: "Source code", href: REPO },
        ])}
        {col("Network", [
          { label: `Hook ${shorten(CONTRACTS.hook)}`, href: `${EXPLORER}/address/${CONTRACTS.hook}`, mono: true },
          { label: "@Poincare_AMM", href: "https://x.com/Poincare_AMM" },
        ])}
      </div>
    </footer>
  );
}
