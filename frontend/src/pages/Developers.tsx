import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { Mark } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Icon } from "@/components/ui/Icon";
import { GROUPS, PAGES, REPO, pageBySlug, type DocPage } from "./devdocs/pages";

/**
 * Developer docs, laid out like the big docs sites (Stripe, Supabase, Vercel, Uniswap): a top bar
 * with search, a grouped sidebar (a drawer on phones), the page with breadcrumbs and a lede, an
 * "On this page" rail, and previous / next links. Pages live in ./docs/pages.tsx.
 */

const WIDTH = 1320;
const EDIT_URL = `${REPO}/blob/main/frontend/src/pages/devdocs/pages.tsx`;

export function Developers() {
  const { slug } = useParams();
  const page = pageBySlug(slug);
  const i = PAGES.indexOf(page);
  const prev = PAGES[i - 1];
  const next = PAGES[i + 1];
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const toc = useToc(page.slug);

  useEffect(() => {
    document.title = `${page.title} · Poincaré docs`;
    window.scrollTo({ top: 0 });
    setMenu(false);
    if (slug) title.current?.focus({ preventScroll: true });
  }, [page.slug, page.title, slug]);
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
    <div className="min-h-screen" style={{ background: "var(--page)", color: "var(--text)" }}>
      <a href="#doc" className="skip-link" onClick={(e) => { e.preventDefault(); title.current?.focus(); }}>Skip to content</a>
      <TopBar onSearch={() => setSearch(true)} onMenu={() => setMenu(true)} />

      <div className="mx-auto px-4 sm:px-6 lg:grid" style={{ maxWidth: WIDTH, gridTemplateColumns: "232px minmax(0, 1fr)", gap: 40 }}>
        <aside className="hidden lg:block" aria-label="Documentation">
          <div className="sticky overflow-y-auto" style={{ top: 68, maxHeight: "calc(100vh - 68px)", padding: "28px 0 40px" }}>
            <Sidebar current={page.slug} />
          </div>
        </aside>

        <div className="xl:grid min-w-0" style={{ gridTemplateColumns: "minmax(0, 1fr) 200px", gap: 48 }}>
          <main id="doc" className="min-w-0" style={{ padding: "28px 0 64px", maxWidth: 780 }}>
            <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: "var(--text-3)" }}>
              <ol className="flex flex-wrap items-center gap-1.5">
                <li><Link to="/developers" className="link-quiet">Docs</Link></li>
                <li aria-hidden="true">/</li>
                <li>{page.group}</li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" style={{ color: "var(--text-2)", fontWeight: 700 }}>{page.title}</li>
              </ol>
            </nav>
            <h1 ref={title} tabIndex={-1} className="font-display" style={{ marginTop: 12, fontSize: "clamp(30px, 4vw, 40px)", lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.02em", outline: "none" }}>
              {page.title}
            </h1>
            <p style={{ marginTop: 12, fontSize: 18, lineHeight: 1.6, color: "var(--text-2)" }}>{page.lede}</p>
            <div style={{ marginTop: 8 }}>{page.body()}</div>

            <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 13 }}>
              <a href={EDIT_URL} target="_blank" rel="noreferrer" className="link-quiet inline-flex items-center gap-1.5" style={{ fontWeight: 700 }}>
                Edit this page on GitHub <Icon name="external" size={12} aria-hidden="true" />
              </a>
              <span style={{ color: "var(--text-3)" }}>Unichain Sepolia · testnet</span>
            </div>
            <nav aria-label="Pagination" className="grid gap-3 sm:grid-cols-2" style={{ marginTop: 16 }}>
              {prev ? <Pager page={prev} dir="prev" /> : <span className="hidden sm:block" />}
              {next ? <Pager page={next} dir="next" /> : <span />}
            </nav>
          </main>

          <nav aria-label="On this page" className="hidden xl:block">
            {toc.items.length > 0 && (
              <div className="sticky" style={{ top: 68, padding: "36px 0" }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>On this page</p>
                <ul className="flex flex-col" style={{ gap: 2, borderLeft: "1px solid var(--border)" }}>
                  {toc.items.map((t) => (
                    <li key={t.id}>
                      <a href={`#${t.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          const el = document.getElementById(t.id);
                          el?.scrollIntoView({ behavior: "smooth" });
                          el?.focus({ preventScroll: true });
                        }}
                        aria-current={toc.active === t.id ? "location" : undefined}
                        className="block"
                        style={{ padding: "4px 12px", marginLeft: -1, fontSize: 13, lineHeight: 1.4, fontWeight: toc.active === t.id ? 800 : 500, color: toc.active === t.id ? "var(--lav-ink)" : "var(--text-3)", borderLeft: `2px solid ${toc.active === t.id ? "var(--action)" : "transparent"}` }}>
                        {t.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>
        </div>
      </div>

      {menu && <Drawer current={page.slug} onClose={() => setMenu(false)} />}
      {search && <Search onClose={() => setSearch(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function TopBar({ onSearch, onMenu }: { onSearch: () => void; onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-40" style={{ background: "var(--nav-bg)", backdropFilter: "blur(14px)", borderBottom: "1px solid var(--nav-border)" }}>
      <div className="mx-auto flex items-center gap-2 sm:gap-3 px-4 sm:px-6" style={{ maxWidth: WIDTH, height: 68 }}>
        <span className="lg:hidden inline-flex">
          <button type="button" onClick={onMenu} className="icon-btn icon-btn-plain" aria-label="Open the docs menu">
            <Icon name="menu" size={18} aria-hidden="true" />
          </button>
        </span>
        <Link to="/" aria-label="Poincaré home" className="flex items-center gap-2 shrink-0 rounded-xl" style={{ minHeight: 44 }}>
          <Mark size={28} decorative />
          <span className="font-display hidden min-[420px]:inline" style={{ fontWeight: 700, fontSize: 17, color: "var(--lp-head)" }}>Poincaré</span>
        </Link>
        <Link to="/developers" className="rounded-full px-2.5 shrink-0" style={{ fontSize: 12.5, fontWeight: 800, color: "var(--lav-ink)", background: "var(--lav-soft)", border: "1px solid var(--lav-dim)", lineHeight: "24px" }}>Docs</Link>

        <button type="button" onClick={onSearch} className="field docs-search hidden md:flex items-center gap-2 ml-4 flex-1 text-left" aria-label="Search the docs"
          style={{ maxWidth: 360, padding: "0 10px", minHeight: 38, borderRadius: 10, cursor: "pointer", color: "var(--text-3)", fontSize: 14 }}>
          <Icon name="search" size={15} aria-hidden="true" /> Search docs
          <kbd className="ml-auto" style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "1px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)" }}>Ctrl K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="md:hidden inline-flex"><button type="button" onClick={onSearch} className="icon-btn icon-btn-plain" aria-label="Search the docs"><Icon name="search" size={17} aria-hidden="true" /></button></span>
          <a href={REPO} target="_blank" rel="noreferrer" className="link-quiet hidden sm:inline-flex items-center gap-1.5 rounded-full px-3" style={{ minHeight: 40, fontSize: 14, fontWeight: 700 }}>
            GitHub <Icon name="external" size={12} aria-hidden="true" />
          </a>
          <ThemeToggle />
          <span className="hidden min-[480px]:inline-flex"><Link to="/app" className="btn btn-sm lp-btn-ink">Launch app</Link></span>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ current }: { current: string }) {
  return (
    <div className="flex flex-col" style={{ gap: 22 }}>
      {GROUPS.map((g) => (
        <div key={g}>
          <p style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", letterSpacing: "0.04em", textTransform: "uppercase", padding: "0 10px", marginBottom: 6 }}>{g}</p>
          <ul className="flex flex-col" style={{ gap: 1 }}>
            {PAGES.filter((p) => p.group === g).map((p) => {
              const on = p.slug === current;
              return (
                <li key={p.slug}>
                  <NavLink to={`/developers/${p.slug}`} aria-current={on ? "page" : undefined} className="block rounded-lg"
                    style={{ padding: "7px 10px", fontSize: 14, fontWeight: on ? 800 : 600, color: on ? "var(--lav-ink)" : "var(--text-2)", background: on ? "var(--lav-soft)" : "transparent" }}>
                    {p.title}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Drawer({ current, onClose }: { current: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Docs menu">
      <button type="button" tabIndex={-1} aria-label="Close the docs menu" className="absolute inset-0" style={{ background: "rgba(10, 8, 20, 0.35)" }} onClick={onClose} />
      <div ref={panel} className="absolute left-0 top-0 bottom-0 overflow-y-auto" style={{ width: "min(300px, 86vw)", background: "var(--page)", borderRight: "1px solid var(--border)", padding: "16px 12px 32px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
          <span className="font-display" style={{ fontWeight: 700, fontSize: 16, paddingLeft: 10 }}>Docs</span>
          <button type="button" onClick={onClose} className="icon-btn icon-btn-plain" aria-label="Close the docs menu"><Icon name="close" size={16} aria-hidden="true" /></button>
        </div>
        <Sidebar current={current} />
        <Link to="/app" className="btn btn-sm lp-btn-ink" style={{ marginTop: 24, marginLeft: 10 }}>Launch app</Link>
      </div>
    </div>
  );
}

function Search({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
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
  const go = (p: DocPage) => {
    onClose();
    navigate(`/developers/${p.slug}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4" role="dialog" aria-modal="true" aria-label="Search the docs" style={{ paddingTop: "12vh" }}>
      <button type="button" tabIndex={-1} aria-label="Close search" className="absolute inset-0" style={{ background: "rgba(10, 8, 20, 0.35)" }} onClick={onClose} />
      <div className="card relative w-full overflow-hidden" style={{ maxWidth: 560, padding: 0 }}>
        <div className="flex items-center gap-2 px-4" style={{ borderBottom: "1px solid var(--divider)", minHeight: 52 }}>
          <Icon name="search" size={16} aria-hidden="true" style={{ color: "var(--text-3)" }} />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Search: regime, pause, MCP, endpoints…"
            aria-label="Search the docs" aria-controls="docs-results" className="flex-1 min-w-0"
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 16, color: "var(--text)" }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter" && results[sel]) go(results[sel]);
            }} />
          <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "1px 6px", borderRadius: 6, border: "1px solid var(--border)", color: "var(--text-3)" }}>Esc</kbd>
        </div>
        <ul id="docs-results" role="listbox" aria-label="Results" className="overflow-y-auto" style={{ maxHeight: "50vh", padding: 6 }}>
          {results.length === 0 && <li style={{ padding: 16, fontSize: 14, color: "var(--text-3)" }}>Nothing matches “{q}”.</li>}
          {results.map((p, j) => (
            <li key={p.slug} role="option" aria-selected={j === sel}>
              <button type="button" onClick={() => go(p)} onMouseEnter={() => setSel(j)} className="w-full text-left rounded-lg"
                style={{ padding: "9px 12px", cursor: "pointer", background: j === sel ? "var(--lav-soft)" : "transparent" }}>
                <span className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 800, color: j === sel ? "var(--lav-ink)" : "var(--text)" }}>
                  {p.title} <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>{p.group}</span>
                </span>
                <span className="block truncate" style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>{p.lede}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Pager({ page, dir }: { page: DocPage; dir: "prev" | "next" }) {
  return (
    <Link to={`/developers/${page.slug}`} className="card flex flex-col docs-card"
      style={{ padding: "12px 16px", gap: 2, textAlign: dir === "next" ? "right" : "left" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{dir === "next" ? "Next" : "Previous"}</span>
      <span className="font-display" style={{ fontSize: 16, fontWeight: 700, color: "var(--lav-ink)" }}>{dir === "prev" ? "← " : ""}{page.title}{dir === "next" ? " →" : ""}</span>
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
