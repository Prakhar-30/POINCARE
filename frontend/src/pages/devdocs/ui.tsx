import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/ui/Icon";

/** Building blocks for the docs: the vocabulary of the big docs sites (callouts, tabbed code,
 *  reference tables, step lists, icon cards), drawn in the landing page's system (lx-*): Inter at
 *  weight 550 for headings, grey body copy, lavender as the one accent. */

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function H2({ children, id }: { children: string; id?: string }) {
  const anchor = id ?? slugify(children);
  return (
    <h2 id={anchor} tabIndex={-1} data-toc={children} className="lx-h"
      style={{ fontSize: 24, letterSpacing: "-0.03em", lineHeight: 1.2, marginTop: 44, scrollMarginTop: 88, outline: "none" }}>
      {children}
    </h2>
  );
}

export const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className="lx-h3" style={{ fontSize: 18, marginTop: 26 }}>{children}</h3>
);
export const P = ({ children }: { children: ReactNode }) => (
  <p className="lx-sub" style={{ fontSize: 16, lineHeight: 1.7, marginTop: 12 }}>{children}</p>
);
export const B = ({ children }: { children: ReactNode }) => <b style={{ color: "var(--lx-ink)", fontWeight: 600 }}>{children}</b>;
const linkStyle = { color: "var(--lx-accent-ink)", fontWeight: 550, textDecoration: "underline", textDecorationColor: "var(--lav)", textUnderlineOffset: 3 } as const;
export const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" style={linkStyle}>{children}<span className="sr-only"> (opens in a new tab)</span></a>
);
export const DocLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={`/docs/${to}`} style={linkStyle}>{children}</Link>
);
/** Inline code, lavender on a lavender tint, as Aave's docs set identifiers apart from prose. */
export const Code = ({ children }: { children: ReactNode }) => (
  <code translate="no" style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em", padding: "1px 6px", borderRadius: 6, background: "var(--lav-soft)", color: "var(--lx-accent-ink)", overflowWrap: "anywhere" }}>{children}</code>
);
export const Ul = ({ children }: { children: ReactNode }) => (
  <ul className="lx-sub" style={{ marginTop: 12, paddingLeft: 20, listStyle: "disc", display: "flex", flexDirection: "column", gap: 8, fontSize: 16, lineHeight: 1.65 }}>{children}</ul>
);

const CALLOUT = {
  note: { icon: "eye", label: "Note", ink: "var(--lx-accent-ink)", bg: "var(--lav-soft)" },
  tip: { icon: "spark", label: "Tip", ink: "var(--green-label)", bg: "var(--green-bg)" },
  warning: { icon: "shield", label: "Careful", ink: "var(--honey-ink)", bg: "var(--warn-bg)" },
} as const;

export function Callout({ kind = "note", title, children }: { kind?: keyof typeof CALLOUT; title?: string; children: ReactNode }) {
  const c = CALLOUT[kind];
  return (
    // a note, not an <aside>: a landmark per callout would crowd the page's landmark list
    <div role="note" className="flex gap-3" style={{ marginTop: 18, padding: "14px 16px", borderRadius: 14, background: c.bg }}>
      <Icon name={c.icon} size={16} aria-hidden="true" style={{ color: c.ink, flexShrink: 0, marginTop: 4 }} />
      <div style={{ fontSize: 15, lineHeight: 1.6, color: "var(--lx-ink)" }}>
        <b style={{ color: c.ink, fontWeight: 600 }}>{title ?? c.label}. </b>
        {children}
      </div>
    </div>
  );
}

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text stays selectable */
    }
  };
  return { copied, copy };
}

/** `panel` carries the code's role and label: a tab panel under CodeTabs, a labelled region
 *  otherwise. Either way the block takes keyboard focus, so long lines can be scrolled with the arrows. */
function CodeFrame({ head, code, panel }: { head: ReactNode; code: string; panel: { role: "tabpanel" | "region"; id?: string; "aria-labelledby"?: string; "aria-label"?: string } }) {
  const { copied, copy } = useCopy(code);
  return (
    <div className="overflow-hidden" style={{ marginTop: 16, borderRadius: 14, background: "var(--lx-card)", boxShadow: "inset 0 0 0 1px var(--lx-card-line)" }}>
      <div className="flex items-center justify-between gap-2 pl-2 pr-2" style={{ minHeight: 42, borderBottom: "1px solid var(--lx-line)", background: "var(--lx-tint-soft)" }}>
        {head}
        <button type="button" onClick={() => void copy()} className="lx-link inline-flex items-center gap-1.5 rounded-full px-2.5 shrink-0"
          style={{ minHeight: 30, fontSize: 12.5, fontWeight: 550, cursor: "pointer" }}>
          <Icon name={copied ? "check" : "copy"} size={13} aria-hidden="true" /> {copied ? "Copied" : "Copy"}<span className="sr-only"> code</span>
        </button>
        <span className="sr-only" aria-live="polite">{copied ? "Code copied to the clipboard" : ""}</span>
      </div>
      <pre className="overflow-x-auto" tabIndex={0} {...panel} style={{ margin: 0, padding: "16px 18px", fontSize: 13.5, lineHeight: 1.7 }}>
        <code translate="no" style={{ fontFamily: "var(--font-mono)", color: "var(--lx-ink)" }}>{code}</code>
      </pre>
    </div>
  );
}

export function CodeBlock({ code, lang, title }: { code: string; lang: string; title?: string }) {
  return (
    <CodeFrame code={code} panel={{ role: "region", "aria-label": `${title ?? lang} code` }} head={
      <span className="px-2 lx-meta">{title ?? lang}</span>
    } />
  );
}

/** The same task in several languages (SDK / HTTP / MCP), like Stripe's code tabs. The chosen tab
 *  is remembered for the visit, so every block on every page follows it. Full tabs pattern: one
 *  tab in the Tab order, the arrow keys (and Home / End) move between them, the code is its panel. */
let preferred: string | null = null;
export function CodeTabs({ tabs }: { tabs: { label: string; lang: string; code: string }[] }) {
  const initial = Math.max(0, tabs.findIndex((t) => t.label === preferred));
  const [i, setI] = useState(initial);
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const t = tabs[i];
  const pick = (j: number, focus = false) => {
    setI(j);
    preferred = tabs[j].label;
    if (focus) refs.current[j]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = tabs.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    pick(to, true);
  };
  return (
    <CodeFrame code={t.code} panel={{ role: "tabpanel", id: `${uid}-panel`, "aria-labelledby": `${uid}-tab-${i}` }} head={
      <div role="tablist" aria-label="Language" className="flex items-center gap-1 overflow-x-auto" onKeyDown={onKeyDown}>
        {tabs.map((x, j) => (
          <button key={x.label} ref={(el) => { refs.current[j] = el; }} type="button" role="tab" id={`${uid}-tab-${j}`}
            aria-selected={j === i} aria-controls={`${uid}-panel`} tabIndex={j === i ? 0 : -1} onClick={() => pick(j)}
            className="rounded-full px-3 shrink-0"
            style={{ minHeight: 30, fontSize: 13, fontWeight: 550, cursor: "pointer", color: j === i ? "var(--lx-ink)" : "var(--lx-sub)", background: j === i ? "var(--lx-card)" : "transparent", boxShadow: j === i ? "inset 0 0 0 1px var(--lx-card-line)" : undefined }}>
            {x.label}
          </button>
        ))}
      </div>
    } />
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${head.join(", ")} table`}
      style={{ marginTop: 16, borderRadius: 14, background: "var(--lx-card)", boxShadow: "inset 0 0 0 1px var(--lx-card-line)" }}>
      <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 14.5 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="text-left" style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600, color: "var(--lx-sub)", whiteSpace: "nowrap", borderBottom: "1px solid var(--lx-line)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: i ? "1px solid var(--lx-line)" : undefined }}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: "11px 16px", verticalAlign: "top", lineHeight: 1.55, color: j === 0 ? "var(--lx-ink)" : "var(--lx-sub)", fontWeight: j === 0 ? 550 : 400, minWidth: j === 0 ? 120 : undefined }}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Numbered steps with a rail, as in quickstarts. */
export function Steps({ children }: { children: ReactNode[] }) {
  return (
    <ol style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 4 }}>
      {children.map((c, i) => (
        <li key={i} className="flex gap-4">
          <div className="flex flex-col items-center shrink-0">
            <span className="flex items-center justify-center rounded-full"
              style={{ width: 28, height: 28, fontSize: 13, fontWeight: 600, color: "var(--lx-accent-ink)", background: "var(--lav-soft)" }}>{i + 1}</span>
            {i < children.length - 1 && <span aria-hidden="true" style={{ flex: 1, width: 1, background: "var(--lx-line)", marginTop: 6 }} />}
          </div>
          <div className="min-w-0 flex-1" style={{ paddingBottom: 22, paddingTop: 3, fontSize: 16, lineHeight: 1.6, color: "var(--lx-sub)" }}>{c}</div>
        </li>
      ))}
    </ol>
  );
}

/** Aave-style link cards: an icon tile, a title and one line, two to a row. */
export function CardGrid({ items }: { items: { to: string; title: string; body: string; icon: IconName }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" style={{ marginTop: 18 }}>
      {items.map((it) => (
        <Link key={it.to} to={`/docs/${it.to}`} className="lx-card flex items-center gap-4" style={{ padding: "16px 18px" }}>
          <span className="inline-flex items-center justify-center shrink-0" aria-hidden="true"
            style={{ width: 38, height: 38, borderRadius: 11, background: "var(--lav-soft)", color: "var(--lx-accent-ink)" }}><Icon name={it.icon} size={18} /></span>
          <span className="min-w-0">
            <span className="block" style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.015em", color: "var(--lx-ink)" }}>{it.title}</span>
            <span className="lx-sub block" style={{ fontSize: 14, lineHeight: 1.45, marginTop: 1 }}>{it.body}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
