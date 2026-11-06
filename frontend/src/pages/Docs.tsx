import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { Mark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useModal } from "@/hooks/useModal";
import { MOD, scrollBehavior } from "@/lib/platform";
import { GROUPS, PAGES, REPO, API_BASE, pageBySlug, type DocPage } from "./devdocs/pages";
import { CodeTabs } from "./devdocs/ui";

/**
 * The docs, at /docs (home) and /docs/<page>. Built after the two docs sites our users already
 * read: Uniswap's docs home (a title with a quick-start card beside it, tinted guide cards, use-case
 * columns, integration methods, resources) and Aave's page shell (a light frame with a DOCS badge,
 * quiet grouped navigation with a lavender active item, "On this page" with copy-for-LLMs beneath
 * it, previous / next cards). Type and colour are the landing page's (lx-*): one grotesque at
 * weight 550 for headings, grey copy, lavender as the only accent. Pages live in ./devdocs/pages.tsx.
 */

const WIDTH = 1440;
const SOURCE = `${REPO}/blob/main/frontend/src/pages/devdocs/pages.tsx`;
const NPM_SDK = "https://www.npmjs.com/package/@poincaretrade/sdk";
const NPM_MCP = "https://www.npmjs.com/package/@poincaretrade/mcp";
const SECURITY_DOC = `${REPO}/blob/main/SECURITY.md`;
const NewTab = () => <span className="sr-only"> (opens in a new tab)</span>;

export function Docs() {
  const { slug } = useParams();
  const home = !slug;
  const page = pageBySlug(slug);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = home ? "Poincaré docs" : `${page.title} · Poincaré docs`;
    window.scrollTo({ top: 0 });
    setMenu(false);
    if (slug) title.current?.focus({ preventScroll: true });
  }, [home, page.slug, page.title, slug]);
  useEffect(() => () => void (document.title = "Poincaré"), []);

  // Ctrl/⌘ K and "/" open search, as on most docs sites
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="lx min-h-screen">
      <a href="#doc" className="skip-link" onClick={(e) => { e.preventDefault(); title.current?.focus(); }}>Skip to content</a>
      <TopBar onSearch={() => setSearch(true)} onMenu={() => setMenu(true)} />

      <div className="mx-auto px-4 sm:px-6 lg:grid" style={{ maxWidth: WIDTH, gridTemplateColumns: "256px minmax(0, 1fr)", gap: 48 }}>
        <aside className="hidden lg:block" aria-label="Documentation">
          <div className="sticky overflow-y-auto" style={{ top: 64, maxHeight: "calc(100vh - 64px)", padding: "32px 4px 40px 0", overscrollBehavior: "contain" }}>
            <Sidebar current={home ? "" : page.slug} />
          </div>
        </aside>
        {home ? <DocsHome titleRef={title} /> : <Article page={page} titleRef={title} />}
      </div>

      {menu && <Drawer current={home ? "" : page.slug} onClose={() => setMenu(false)} />}
      {search && <Search onClose={() => setSearch(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// chrome

function TopBar({ onSearch, onMenu }: { onSearch: () => void; onMenu: () => void }) {
  const tabs = [
    { to: "/docs", label: "Guides", end: true },
    { to: "/docs/sdk", label: "SDK" },
    { to: "/docs/mcp", label: "MCP" },
    { to: "/docs/http-api", label: "API reference" },
  ];
  return (
    <header className="sticky top-0 z-40" style={{ background: "var(--nav-bg)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: "1px solid var(--lx-line)" }}>
      <div className="mx-auto flex items-center gap-2 sm:gap-4 px-4 sm:px-6" style={{ maxWidth: WIDTH, height: 64 }}>
        <span className="lg:hidden inline-flex">
          <button type="button" onClick={onMenu} className="icon-btn icon-btn-plain" aria-label="Open the docs menu">
            <Icon name="menu" size={18} aria-hidden="true" />
          </button>
        </span>
        <Link to="/" aria-label="Poincaré home" className="flex items-center gap-2 shrink-0 rounded-xl" style={{ minHeight: 44 }}>
          <Mark size={26} decorative />
          <span className="hidden min-[420px]:inline" style={{ fontWeight: 600, fontSize: 18, letterSpacing: "-0.03em", color: "var(--lx-ink)" }}>Poincaré</span>
        </Link>
        <Link to="/docs" className="rounded-md px-1.5 shrink-0" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--lx-accent-ink)", background: "var(--lav-soft)", lineHeight: "20px" }}>
          DOCS
        </Link>

        <nav aria-label="Docs sections" className="hidden lg:flex items-center gap-1 ml-6">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => `rounded-full px-3.5 inline-flex items-center ${isActive ? "" : "lx-link"}`}
              style={({ isActive }) => ({ minHeight: 36, fontSize: 14, fontWeight: 550, color: isActive ? "var(--lx-ink)" : undefined, background: isActive ? "var(--lav-soft)" : undefined })}>
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <button type="button" onClick={onSearch} className="hidden md:inline-flex items-center gap-2 rounded-full text-left"
            aria-keyshortcuts="Control+K Meta+K /"
            style={{ minWidth: 220, padding: "0 6px 0 12px", minHeight: 36, cursor: "pointer", color: "var(--lx-sub)", fontSize: 14, background: "var(--lx-card)", boxShadow: "inset 0 0 0 1px var(--lx-card-line)" }}>
            <Icon name="search" size={15} aria-hidden="true" /> Search docs
            <kbd className="ml-auto" aria-hidden="true" style={{ fontFamily: "var(--font-sans)", fontSize: 11, padding: "2px 7px", borderRadius: 999, background: "var(--lav-soft)", color: "var(--lx-sub)", whiteSpace: "nowrap" }}>{MOD}&nbsp;K</kbd>
          </button>
          <span className="md:hidden inline-flex"><button type="button" onClick={onSearch} className="icon-btn icon-btn-plain" aria-label="Search the docs"><Icon name="search" size={17} aria-hidden="true" /></button></span>
          <a href={REPO} target="_blank" rel="noreferrer" className="lx-link hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5" style={{ minHeight: 36, fontSize: 14, fontWeight: 500 }}>
            GitHub <Icon name="external" size={12} aria-hidden="true" /><NewTab />
          </a>
          <ThemeToggle />
          <span className="hidden min-[480px]:inline-flex"><Link to="/app" className="lx-btn lx-btn-ink lx-btn-sm">Launch app</Link></span>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ current }: { current: string }) {
  // rendered twice (desktop rail and phone drawer), so heading ids are made unique per instance
  const uid = useId();
  const id = (g: string) => `${uid}-${g.replace(/\W+/g, "-").toLowerCase()}`;
  const outside: { label: string; href: string; icon: IconName }[] = [
    { label: "Source on GitHub", href: REPO, icon: "github" as IconName },
    { label: "SDK on npm", href: NPM_SDK, icon: "layers" },
    { label: "MCP on npm", href: NPM_MCP, icon: "spark" },
    { label: "Security model", href: SECURITY_DOC, icon: "shield" },
  ];
  return (
    <div className="flex flex-col" style={{ gap: 26 }}>
      <NavLink to="/docs" end className="flex items-center gap-2.5 rounded-lg"
        style={({ isActive }) => ({ padding: "7px 10px", fontSize: 14, fontWeight: isActive ? 600 : 500, color: isActive ? "var(--lx-accent-ink)" : "var(--lx-ink)", background: isActive ? "var(--lav-soft)" : undefined })}>
        <Icon name="dashboard" size={15} aria-hidden="true" /> Docs home
      </NavLink>
      {GROUPS.map((g) => (
        <div key={g}>
          <h2 id={id(g)} style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--lx-ink)", padding: "0 10px", marginBottom: 6 }}>{g}</h2>
          <ul className="flex flex-col" style={{ gap: 1 }} aria-labelledby={id(g)}>
            {PAGES.filter((p) => p.group === g).map((p) => {
              const on = p.slug === current;
              return (
                <li key={p.slug}>
                  <NavLink to={`/docs/${p.slug}`} aria-current={on ? "page" : undefined} className={`block rounded-lg ${on ? "" : "lx-link"}`}
                    style={{ padding: "6px 10px", fontSize: 14, fontWeight: on ? 550 : 400, color: on ? "var(--lx-accent-ink)" : undefined, background: on ? "var(--lav-soft)" : undefined }}>
                    {p.title}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <ul className="flex flex-col pt-5" style={{ gap: 1, borderTop: "1px solid var(--lx-line)" }}>
        {outside.map((o) => (
          <li key={o.label}>
            <a href={o.href} target="_blank" rel="noreferrer" className="lx-link flex items-center gap-2.5 rounded-lg" style={{ padding: "6px 10px", fontSize: 14 }}>
              <Icon name={o.icon} size={14} aria-hidden="true" /> <span className="flex-1">{o.label}</span>
              <Icon name="external" size={12} aria-hidden="true" /><NewTab />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Drawer({ current, onClose }: { current: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  // Tab stays in the drawer, Escape closes, the page behind holds still, focus returns to the menu button
  useModal(panel, onClose);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Docs menu">
      <button type="button" tabIndex={-1} aria-label="Close the docs menu" className="absolute inset-0" style={{ background: "rgba(10, 8, 20, 0.35)" }} onClick={onClose} />
      <div ref={panel} className="lx absolute left-0 top-0 bottom-0 overflow-y-auto" style={{ width: "min(300px, 86vw)", borderRight: "1px solid var(--lx-line)", padding: "16px 12px 32px", overscrollBehavior: "contain" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 16, paddingLeft: 10, letterSpacing: "-0.02em" }}>Docs</span>
          <button type="button" onClick={onClose} className="icon-btn icon-btn-plain" aria-label="Close the docs menu"><Icon name="close" size={16} aria-hidden="true" /></button>
        </div>
        <Sidebar current={current} />
        <Link to="/app" className="lx-btn lx-btn-ink lx-btn-sm" style={{ marginTop: 24, marginLeft: 10 }}>Launch app</Link>
      </div>
    </div>
  );
}

function Search({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLDivElement>(null);
  useModal(card, onClose);
  useEffect(() => input.current?.focus(), []);
  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return PAGES;
    return PAGES
      .map((p) => {
        const hay = `${p.title} ${p.group} ${p.lede} ${p.keywords ?? ""}`.toLowerCase();
        const hit = terms.every((t) => hay.includes(t));
        return { p, score: hit ? terms.reduce((s, t) => s + (p.title.toLowerCase().includes(t) ? 3 : 1), 0) : 0 };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.p);
  }, [q]);
  // keep the highlighted result in view while the arrows move it
  useEffect(() => {
    if (results[sel]) document.getElementById(`doc-opt-${results[sel].slug}`)?.scrollIntoView({ block: "nearest" });
  }, [sel, results]);
  const go = (p: DocPage) => {
    onClose();
    navigate(`/docs/${p.slug}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4" role="dialog" aria-modal="true" aria-label="Search the docs" style={{ paddingTop: "12vh" }}>
      <button type="button" tabIndex={-1} aria-label="Close search" className="absolute inset-0" style={{ background: "rgba(10, 8, 20, 0.35)" }} onClick={onClose} />
      <div ref={card} className="lx lx-card relative w-full overflow-hidden" style={{ maxWidth: 580, boxShadow: "var(--lx-card-shadow)" }}>
        <div className="flex items-center gap-2 px-4" style={{ borderBottom: "1px solid var(--lx-line)", minHeight: 54 }}>
          <Icon name="search" size={16} aria-hidden="true" style={{ color: "var(--lx-sub)" }} />
          {/* combobox + listbox, as in the app's command menu: focus stays in the field, the arrows
              move the highlighted result (aria-activedescendant), Enter opens it */}
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Search: regime, pause, MCP, endpoints…"
            role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="docs-results"
            aria-activedescendant={results[sel] ? `doc-opt-${results[sel].slug}` : undefined}
            aria-label="Search the docs" name="docs-search" autoComplete="off" spellCheck={false} className="flex-1 min-w-0"
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 16, color: "var(--lx-ink)" }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && results[sel]) go(results[sel]);
            }} />
          <kbd style={{ fontFamily: "var(--font-sans)", fontSize: 11, padding: "2px 7px", borderRadius: 999, background: "var(--lav-soft)", color: "var(--lx-sub)" }}>Esc</kbd>
        </div>
        <ul id="docs-results" role="listbox" aria-label="Results" className="overflow-y-auto" style={{ maxHeight: "50vh", padding: 6, overscrollBehavior: "contain" }}>
          {results.length === 0 && <li role="presentation" style={{ padding: 16, fontSize: 14, color: "var(--lx-sub)" }}>Nothing matches “{q}”.</li>}
          {results.map((p, j) => (
            <li key={p.slug} id={`doc-opt-${p.slug}`} role="option" aria-selected={j === sel}
              onClick={() => go(p)} onMouseMove={() => setSel(j)} className="rounded-xl"
              style={{ padding: "9px 12px", cursor: "pointer", background: j === sel ? "var(--lav-soft)" : "transparent" }}>
              <span className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 600, color: j === sel ? "var(--lx-accent-ink)" : "var(--lx-ink)" }}>
                {p.title} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--lx-sub)" }}>{p.group}</span>
              </span>
              <span className="block truncate" style={{ fontSize: 13, color: "var(--lx-sub)", marginTop: 2 }}>{p.lede}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// a page: breadcrumbs, title and lede, the body, previous / next; "On this page" on the right

function Article({ page, titleRef }: { page: DocPage; titleRef: RefObject<HTMLHeadingElement> }) {
  const i = PAGES.indexOf(page);
  const prev = PAGES[i - 1];
  const next = PAGES[i + 1];
  const toc = useToc(page.slug);
  return (
    <div className="xl:grid min-w-0" style={{ gridTemplateColumns: "minmax(0, 1fr) 224px", gap: 56 }}>
      <main id="doc" className="min-w-0" style={{ padding: "36px 0 72px", maxWidth: 760 }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--lx-sub)" }}>
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link to="/docs" className="lx-link">Docs</Link></li>
            <li aria-hidden="true"><Icon name="arrowRight" size={11} /></li>
            <li>{page.group}</li>
          </ol>
        </nav>
        <h1 ref={titleRef} tabIndex={-1} className="lx-h" style={{ marginTop: 14, fontSize: "clamp(30px, 3.6vw, 40px)", lineHeight: 1.1, letterSpacing: "-0.035em", outline: "none" }}>
          {page.title}
        </h1>
        <p className="lx-sub" style={{ marginTop: 14, fontSize: 18, lineHeight: 1.6 }}>{page.lede}</p>
        {/* below the rail's breakpoint the page actions sit under the lede */}
        <div className="xl:hidden mt-5"><PageActions page={page} /></div>
        <div style={{ marginTop: 12, paddingTop: 4, borderTop: "1px solid var(--lx-line)" }}>{page.body()}</div>

        <nav aria-label="Pagination" className="grid gap-3 sm:grid-cols-2" style={{ marginTop: 56 }}>
          {prev ? <Pager page={prev} dir="prev" /> : <span className="hidden sm:block" />}
          {next ? <Pager page={next} dir="next" /> : <span />}
        </nav>
        <p className="lx-meta flex flex-wrap items-center justify-between gap-3" style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid var(--lx-line)" }}>
          <span>Unichain Sepolia · chain 1301 · testnet</span>
          <Link to="/app" className="lx-link">Launch app</Link>
        </p>
      </main>

      <aside aria-label="On this page" className="hidden xl:block">
        <div className="sticky" style={{ top: 64, padding: "40px 0" }}>
          {toc.items.length > 0 && (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--lx-ink)", marginBottom: 10 }}>On this page</p>
              <ul className="flex flex-col" style={{ gap: 2 }}>
                {toc.items.map((t) => {
                  const on = toc.active === t.id;
                  return (
                    <li key={t.id}>
                      <a href={`#${t.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          const el = document.getElementById(t.id);
                          el?.scrollIntoView({ behavior: scrollBehavior() });
                          el?.focus({ preventScroll: true });
                        }}
                        aria-current={on ? "location" : undefined}
                        className={`block ${on ? "" : "lx-link"}`}
                        style={{ padding: "4px 0", fontSize: 13.5, lineHeight: 1.4, fontWeight: on ? 550 : 400, color: on ? "var(--lx-accent-ink)" : undefined }}>
                        {t.text}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--lx-line)" }}>
            <PageActions page={page} stacked />
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Copy the page for an LLM (its title, lede and text, as plain Markdown-ish text) or open its
 *  source. Agents are a first-class audience here: the MCP server is half the product. */
function PageActions({ page, stacked }: { page: DocPage; stacked?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const body = document.getElementById("doc")?.querySelector(":scope > div:nth-of-type(2)") as HTMLElement | null;
    const text = `# ${page.title}\n\n${page.lede}\n\n${body?.innerText ?? ""}\n\nSource: https://www.poincaretrade.in/#/docs/${page.slug}\n`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked: the page stays selectable */ }
  };
  const item = "lx-link inline-flex items-center gap-2 rounded-full";
  const style = stacked ? { fontSize: 13.5, minHeight: 30 } : { fontSize: 13, minHeight: 32, padding: "0 12px", boxShadow: "inset 0 0 0 1px var(--lx-card-line)" };
  return (
    <div className={stacked ? "flex flex-col items-start" : "flex flex-wrap items-center gap-2"} style={{ gap: stacked ? 4 : undefined }}>
      <button type="button" onClick={() => void copy()} className={item} style={{ ...style, cursor: "pointer" }}>
        <Icon name={copied ? "check" : "copy"} size={14} aria-hidden="true" /> {copied ? "Copied" : "Copy for LLMs"}
      </button>
      <a href={SOURCE} target="_blank" rel="noreferrer" className={item} style={style}>
        <Icon name="github" size={14} aria-hidden="true" /> Edit on GitHub<NewTab />
      </a>
      <span className="sr-only" aria-live="polite">{copied ? "Page copied to the clipboard" : ""}</span>
    </div>
  );
}

function Pager({ page, dir }: { page: DocPage; dir: "prev" | "next" }) {
  return (
    <Link to={`/docs/${page.slug}`} className="lx-card flex flex-col"
      style={{ padding: "14px 18px", gap: 4, textAlign: dir === "next" ? "right" : "left" }}>
      <span className="inline-flex items-center gap-1" style={{ fontSize: 13, color: "var(--lx-sub)", justifyContent: dir === "next" ? "flex-end" : "flex-start" }}>
        {dir === "prev" && <Icon name="arrowRight" size={12} aria-hidden="true" style={{ transform: "rotate(180deg)" }} />}
        {dir === "next" ? "Next" : "Previous"}
        {dir === "next" && <Icon name="arrowRight" size={12} aria-hidden="true" />}
      </span>
      <span style={{ fontSize: 16, fontWeight: 550, letterSpacing: "-0.01em", color: "var(--lx-ink)" }}>{page.title}</span>
    </Link>
  );
}

/** The page's h2 headings, and the one nearest the top of the viewport. */
function useToc(key: string) {
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const hs = [...document.querySelectorAll<HTMLElement>("#doc h2[data-toc]")];
    setItems(hs.map((h) => ({ id: h.id, text: h.dataset.toc ?? h.textContent ?? "" })));
    setActive(hs[0]?.id ?? null);
    const io = new IntersectionObserver(
      (es) => {
        const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (v[0]) setActive(v[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    hs.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [key]);
  return { items, active };
}

// ---------------------------------------------------------------------------------------------
// the docs home

const TINTS = {
  lav: { bg: "var(--lav-soft)", ink: "var(--lx-accent-ink)" },
  green: { bg: "var(--green-bg)", ink: "var(--green-label)" },
  honey: { bg: "var(--warn-bg)", ink: "var(--honey-ink)" },
  plain: { bg: "var(--lx-card)", ink: "var(--lx-ink)" },
} as const;

function SectionTitle({ id, children, aside }: { id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4" style={{ marginBottom: 18 }}>
      <h2 id={id} className="lx-h" style={{ fontSize: 26, letterSpacing: "-0.03em" }}>{children}</h2>
      {aside}
    </div>
  );
}

function DocsHome({ titleRef }: { titleRef: RefObject<HTMLHeadingElement> }) {
  const guides: { to: string; title: string; body: string; icon: IconName; tint: keyof typeof TINTS; wide?: boolean }[] = [
    { to: "regime", title: "Read the regime", body: "Is there a confirmed trend, and which side pays", icon: "wave", tint: "lav", wide: true },
    { to: "dca-orders", title: "Run spread-aware DCA", body: "Recurring buys that never pay the trend spread", icon: "layers", tint: "honey", wide: true },
    { to: "quickstart", title: "Quote a swap", body: "To the wei of what the router executes", icon: "swap", tint: "green" },
    { to: "mcp", title: "Give an agent tools", body: "15 MCP tools for Claude and any client", icon: "spark", tint: "lav" },
    { to: "keeper", title: "Run a keeper", body: "Fill due slices and index every event", icon: "gauge", tint: "plain" },
  ];
  const useCases: { icon: IconName; title: string; body: string; links: { to: string; label: string }[] }[] = [
    { icon: "swap", title: "For trading apps and bots", body: "Trade with the regime in view", links: [
      { to: "regime", label: "Read the regime" }, { to: "sdk", label: "Quote a swap" }, { to: "order-lifecycle", label: "Manage an order" }] },
    { icon: "spark", title: "For AI agents", body: "Let an agent read and act", links: [
      { to: "mcp", label: "Install the MCP server" }, { to: "dca-orders", label: "Plan a DCA order" }, { to: "safety", label: "Delegate safely" }] },
    { icon: "chart", title: "For data and protocol builders", body: "Build on the detector's signal", links: [
      { to: "http-api", label: "Call the HTTP API" }, { to: "keeper", label: "Query indexed fills" }, { to: "contracts", label: "Contracts and events" }] },
  ];
  const methods: { to: string; icon: IconName; title: string; body: string }[] = [
    { to: "sdk", icon: "layers", title: "TypeScript SDK", body: "@poincaretrade/sdk, viem-based" },
    { to: "mcp", icon: "spark", title: "MCP server", body: "@poincaretrade/mcp, for agents" },
    { to: "http-api", icon: "chart", title: "HTTP API", body: "JSON over HTTPS, no keys" },
  ];
  const resources: { label: string; href: string; icon: IconName }[] = [
    { label: "GitHub", href: REPO, icon: "github" as IconName },
    { label: "SDK on npm", href: NPM_SDK, icon: "layers" },
    { label: "MCP on npm", href: NPM_MCP, icon: "spark" },
    { label: "Security model", href: SECURITY_DOC, icon: "shield" },
    { label: "@Poincare_AMM", href: "https://x.com/Poincare_AMM", icon: "xSocial" },
  ];

  return (
    <main id="doc" className="min-w-0" style={{ padding: "40px 0 80px", maxWidth: 1080 }}>
      {/* hero: the title and two ways in, with the quick start beside it */}
      <section className="grid items-center gap-8 lg:grid-cols-[1fr_1.05fr]" aria-labelledby="docs-title">
        <div>
          <h1 id="docs-title" ref={titleRef} tabIndex={-1} className="lx-h" style={{ fontSize: "clamp(40px, 5vw, 60px)", lineHeight: 1.02, outline: "none" }}>
            Poincaré documentation
          </h1>
          <p className="lx-sub mt-5" style={{ fontSize: 18, lineHeight: 1.55, maxWidth: "32rem" }}>
            Read the trend regime, quote swaps to the wei and run spread-aware DCA, from TypeScript, an AI agent or plain HTTP. No API keys, no oracle.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/docs/quickstart" className="lx-btn lx-btn-primary">Quickstart</Link>
            <Link to="/docs/mcp" className="lx-btn lx-btn-tonal">Agent tools</Link>
          </div>
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--lx-sub)", marginBottom: -4 }}>Quick start</p>
          <CodeTabs tabs={[
            { label: "SDK", lang: "sh", code: "npm i @poincaretrade/sdk viem" },
            { label: "MCP", lang: "sh", code: "claude mcp add poincare -- npx -y @poincaretrade/mcp" },
            { label: "HTTP", lang: "sh", code: `curl ${API_BASE}/regime` },
          ]} />
        </div>
      </section>

      <section style={{ marginTop: 72 }} aria-labelledby="guides-title">
        <SectionTitle id="guides-title">Guides</SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {guides.map((g) => {
            const t = TINTS[g.tint];
            return (
              <li key={g.title} className={g.wide ? "lg:col-span-3" : "lg:col-span-2"}>
                <Link to={`/docs/${g.to}`} className="docs-guide flex h-full items-center gap-4 rounded-[20px]"
                  style={{ padding: g.wide ? "24px 24px" : "20px 22px", background: t.bg, boxShadow: g.tint === "plain" ? "inset 0 0 0 1px var(--lx-card-line)" : undefined }}>
                  <span className="shrink-0" style={{ color: t.ink }} aria-hidden="true"><Icon name={g.icon} size={24} /></span>
                  <span className="min-w-0">
                    <span className="block" style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--lx-ink)" }}>{g.title}</span>
                    <span className="lx-sub block" style={{ fontSize: 14, marginTop: 2 }}>{g.body}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section style={{ marginTop: 64 }} aria-labelledby="usecases-title">
        <SectionTitle id="usecases-title">Use cases</SectionTitle>
        <ul className="grid gap-3 md:grid-cols-3">
          {useCases.map((u) => (
            <li key={u.title} className="lx-card flex flex-col p-6">
              <span className="inline-flex items-center justify-center" aria-hidden="true"
                style={{ width: 40, height: 40, borderRadius: 12, background: "var(--lav-soft)", color: "var(--lx-accent-ink)" }}><Icon name={u.icon} size={19} /></span>
              <h3 className="lx-h3 mt-5" style={{ fontSize: 20 }}>{u.title}</h3>
              <p className="lx-sub mt-1" style={{ fontSize: 14 }}>{u.body}</p>
              <ul className="mt-5 flex flex-col">
                {u.links.map((l, i) => (
                  <li key={l.to + l.label} style={{ borderTop: i ? "1px solid var(--lx-line)" : undefined }}>
                    <Link to={`/docs/${l.to}`} className="docs-row flex items-center justify-between gap-3" style={{ padding: "11px 0", fontSize: 15, fontWeight: 550, letterSpacing: "-0.01em" }}>
                      {l.label} <Icon name="arrowRight" size={14} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 64 }} aria-labelledby="methods-title">
        <SectionTitle id="methods-title">Integration methods</SectionTitle>
        <ul className="grid gap-3 md:grid-cols-3">
          {methods.map((m) => (
            <li key={m.title}>
              <Link to={`/docs/${m.to}`} className="lx-card flex items-center gap-4" style={{ padding: "16px 18px" }}>
                <span className="inline-flex items-center justify-center shrink-0" aria-hidden="true"
                  style={{ width: 40, height: 40, borderRadius: 12, background: "var(--lav-soft)", color: "var(--lx-accent-ink)" }}><Icon name={m.icon} size={19} /></span>
                <span className="min-w-0">
                  <span className="block" style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em" }}>{m.title}</span>
                  <span className="lx-sub block truncate" style={{ fontSize: 14 }}>{m.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 64 }} aria-labelledby="resources-title">
        <SectionTitle id="resources-title" aside={
          <ul className="flex flex-wrap gap-2">
            {resources.map((r) => (
              <li key={r.label}>
                <a href={r.href} target="_blank" rel="noreferrer" className="lx-btn lx-btn-tonal lx-btn-sm" style={{ gap: 7 }}>
                  <Icon name={r.icon} size={15} aria-hidden="true" /> {r.label}<NewTab />
                </a>
              </li>
            ))}
          </ul>
        }>Resources</SectionTitle>
      </section>

      <section className="lx-chapter lx-chapter-dark" style={{ margin: "56px 0 0", borderRadius: 28 }} aria-labelledby="try-title">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6" style={{ padding: "clamp(28px, 4vw, 44px)" }}>
          <div>
            <h2 id="try-title" className="lx-h" style={{ fontSize: "clamp(26px, 3vw, 34px)" }}>Try it on the live pool</h2>
            <p className="lx-sub mt-2" style={{ fontSize: 16, maxWidth: "34rem" }}>Mint free test tokens on Unichain Sepolia, then trade against the trend at the plain price or start a spread-aware DCA plan.</p>
          </div>
          <Link to="/app" className="lx-btn lx-btn-light shrink-0">Launch app</Link>
        </div>
      </section>
    </main>
  );
}
