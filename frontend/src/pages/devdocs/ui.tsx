import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";

/** Building blocks for the developer docs: the same vocabulary the big docs sites use (callouts,
 *  tabbed code, reference tables, step lists), drawn only with the app's own tokens. */

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function H2({ children, id }: { children: string; id?: string }) {
  const anchor = id ?? slugify(children);
  return (
    <h2 id={anchor} tabIndex={-1} data-toc={children} className="font-display group"
      style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25, marginTop: 40, scrollMarginTop: 88, outline: "none", color: "var(--text)" }}>
      {children}
    </h2>
  );
}

export const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className="font-display" style={{ fontSize: 18, fontWeight: 700, marginTop: 24, color: "var(--text)" }}>{children}</h3>
);
export const P = ({ children }: { children: ReactNode }) => (
  <p style={{ fontSize: 15.5, lineHeight: 1.7, color: "var(--text-2)", marginTop: 12 }}>{children}</p>
);
export const B = ({ children }: { children: ReactNode }) => <b style={{ color: "var(--text)", fontWeight: 700 }}>{children}</b>;
export const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--lav-ink)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>{children}</a>
);
export const DocLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={`/developers/${to}`} style={{ color: "var(--lav-ink)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>{children}</Link>
);
export const Code = ({ children }: { children: ReactNode }) => (
  <code translate="no" style={{ fontFamily: "var(--font-mono)", fontSize: "0.86em", padding: "1px 6px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)", overflowWrap: "anywhere" }}>{children}</code>
);
export const Ul = ({ children }: { children: ReactNode }) => (
  <ul style={{ marginTop: 12, paddingLeft: 20, listStyle: "disc", display: "flex", flexDirection: "column", gap: 8, fontSize: 15.5, lineHeight: 1.65, color: "var(--text-2)" }}>{children}</ul>
);

const CALLOUT = {
  note: { icon: "eye", label: "Note", ink: "var(--lav-ink)", bg: "var(--lav-soft)", border: "var(--lav-dim)" },
  tip: { icon: "spark", label: "Tip", ink: "var(--up-ink)", bg: "var(--green-bg)", border: "var(--border)" },
  warning: { icon: "shield", label: "Careful", ink: "var(--honey-ink)", bg: "var(--warn-bg)", border: "var(--warn-border)" },
} as const;

export function Callout({ kind = "note", title, children }: { kind?: keyof typeof CALLOUT; title?: string; children: ReactNode }) {
  const c = CALLOUT[kind];
  return (
    // a note, not an <aside>: a landmark per callout would crowd the page's landmark list
    <div role="note" className="rounded-xl flex gap-3" style={{ marginTop: 16, padding: "12px 14px", background: c.bg, border: `1px solid ${c.border}` }}>
      <Icon name={c.icon} size={16} aria-hidden="true" style={{ color: c.ink, flexShrink: 0, marginTop: 3 }} />
      <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text-2)" }}>
        <b style={{ color: c.ink, fontWeight: 800 }}>{title ?? c.label}. </b>
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
    <div className="rounded-xl overflow-hidden" style={{ marginTop: 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2 pl-2 pr-2" style={{ minHeight: 40, borderBottom: "1px solid var(--divider)", background: "var(--surface-2)" }}>
        {head}
        <button type="button" onClick={() => void copy()} className="link-quiet inline-flex items-center gap-1 rounded-md px-2 shrink-0"
          style={{ minHeight: 32, fontSize: 12, fontWeight: 800 }}>
          <Icon name={copied ? "check" : "copy"} size={13} aria-hidden="true" /> {copied ? "Copied" : "Copy"}<span className="sr-only"> code</span>
        </button>
        <span className="sr-only" aria-live="polite">{copied ? "Code copied to the clipboard" : ""}</span>
      </div>
      <pre className="overflow-x-auto" tabIndex={0} {...panel} style={{ margin: 0, padding: "14px 16px", fontSize: 13, lineHeight: 1.65 }}>
        <code translate="no" style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{code}</code>
      </pre>
    </div>
  );
}

export function CodeBlock({ code, lang, title }: { code: string; lang: string; title?: string }) {
  return (
    <CodeFrame code={code} panel={{ role: "region", "aria-label": `${title ?? lang} code` }} head={
      <span className="px-2" style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{title ?? lang}</span>
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
            className="rounded-md px-2.5 shrink-0"
            style={{ minHeight: 30, fontSize: 12.5, fontWeight: 800, cursor: "pointer", color: j === i ? "var(--lav-ink)" : "var(--text-3)", background: j === i ? "var(--surface)" : "transparent", border: `1px solid ${j === i ? "var(--border)" : "transparent"}` }}>
            {x.label}
          </button>
        ))}
      </div>
    } />
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ marginTop: 14, border: "1px solid var(--border)", background: "var(--surface)" }}>
      <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            {head.map((h) => (
              <th key={h} scope="col" className="text-left" style={{ padding: "9px 14px", fontSize: 12, fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--divider)" }}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: "10px 14px", verticalAlign: "top", lineHeight: 1.55, color: j === 0 ? "var(--text)" : "var(--text-2)", fontWeight: j === 0 ? 700 : 400, minWidth: j === 0 ? 120 : undefined }}>{c}</td>
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
    <ol style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 4 }}>
      {children.map((c, i) => (
        <li key={i} className="flex gap-4">
          <div className="flex flex-col items-center shrink-0">
            <span className="font-display flex items-center justify-center rounded-full"
              style={{ width: 28, height: 28, fontSize: 13, fontWeight: 700, color: "var(--lav-ink)", background: "var(--lav-soft)", border: "1px solid var(--lav-dim)" }}>{i + 1}</span>
            {i < children.length - 1 && <span aria-hidden="true" style={{ flex: 1, width: 1, background: "var(--border)", marginTop: 4 }} />}
          </div>
          <div className="min-w-0 flex-1" style={{ paddingBottom: 20 }}>{c}</div>
        </li>
      ))}
    </ol>
  );
}

export function CardGrid({ items }: { items: { to: string; title: string; body: string; icon: "layers" | "spark" | "chart" | "shield" | "curve" | "gauge" }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" style={{ marginTop: 16 }}>
      {items.map((it) => (
        <Link key={it.to} to={`/developers/${it.to}`} className="card flex flex-col docs-card" style={{ padding: "16px 18px", gap: 6 }}>
          <span className="flex items-center gap-2 font-display" style={{ fontSize: 16.5, fontWeight: 700, color: "var(--text)" }}>
            <Icon name={it.icon} size={16} aria-hidden="true" style={{ color: "var(--lav-ink)" }} /> {it.title}
            <Icon name="arrowRight" size={14} aria-hidden="true" style={{ color: "var(--lav-ink)", marginLeft: "auto" }} />
          </span>
          <span style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text-3)" }}>{it.body}</span>
        </Link>
      ))}
    </div>
  );
}
