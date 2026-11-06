import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CONTRACTS, EXPLORER } from "@/config/contracts";
import { useTheme } from "@/providers/ThemeProvider";
import { useToast } from "@/components/ui/Toast";
import { Icon, type IconName } from "@/components/ui/Icon";
import { TABS, type Tab } from "./TopNav";

const README = "https://github.com/Prakhar-30/POINCARE#readme";

export { MOD } from "@/lib/platform";

type Command = { id: string; label: string; icon: IconName; hint?: string; run: () => void };

/** A focused element that takes text: single-key shortcuts must not fire while someone types. */
const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/**
 * Command menu (⌘K / Ctrl+K). Jumps between screens, flips the theme and reaches the hook's
 * address and the research from the keyboard. Screens also answer to 1–4 when nothing that
 * takes text has focus. A modal listbox: focus stays in the search field, arrows move the
 * selection, Enter runs it, Esc closes and returns focus to where it was.
 */
export function CommandMenu({ setTab, open, setOpen }: { setTab: (t: Tab) => void; open: boolean; setOpen: (o: boolean) => void }) {
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const commands = useMemo<Command[]>(() => [
    ...TABS.map((t, i) => ({ id: `go-${t.id}`, label: `Go to ${t.label}`, icon: t.icon, hint: String(i + 1), run: () => setTab(t.id) })),
    {
      id: "dca", label: "Start a spread-aware DCA plan", icon: "layers",
      run: () => { navigate({ pathname: "/app", search: "?tab=trade&mode=dca" }); window.scrollTo({ top: 0 }); },
    },
    { id: "developers", label: "Developer docs: SDK, MCP, API", icon: "spark", run: () => navigate("/docs") },
    { id: "theme", label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`, icon: theme === "dark" ? "sun" : "moon", run: toggle },
    {
      id: "copy-hook", label: "Copy hook address", icon: "copy",
      run: () => {
        navigator.clipboard?.writeText(CONTRACTS.hook).then(
          () => toast.info("Hook address copied", CONTRACTS.hook),
          () => toast.error("Couldn't copy", "Your browser blocked clipboard access; select the address in the footer instead."),
        );
      },
    },
    { id: "explorer", label: "Open the hook on the block explorer", icon: "external", run: () => window.open(`${EXPLORER}/address/${CONTRACTS.hook}`, "_blank", "noopener") },
    { id: "research", label: "Read the research", icon: "external", run: () => window.open(README, "_blank", "noopener") },
    { id: "home", label: "Back to the home page", icon: "arrowRight", run: () => navigate("/") },
  ], [theme, toggle, toast, navigate, setTab]);

  const q = query.trim().toLowerCase();
  const shown = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;

  // global keys: ⌘K / Ctrl+K toggles the menu; 1-4 switch screens while not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
        return;
      }
      if (open || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length) setTab(TABS[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen, setTab]);

  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setSel(0);
      requestAnimationFrame(() => input.current?.focus());
    } else {
      returnTo.current?.focus?.();
    }
  }, [open]);

  if (!open) return null;

  const run = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => (i + 1) % Math.max(shown.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => (i - 1 + shown.length) % Math.max(shown.length, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(shown[sel]); }
    else if (e.key === "Tab") e.preventDefault(); // focus stays in the field: the list is driven by the arrows
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center px-4" style={{ background: "var(--scrim)", paddingTop: "max(12vh, env(safe-area-inset-top))", overscrollBehavior: "contain" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-label="Command menu" className="w-full overflow-hidden"
        style={{ maxWidth: 560, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", boxShadow: "var(--shadow-lg)" }}>
        <div className="flex items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--divider)" }}>
          <Icon name="target" size={17} aria-hidden="true" style={{ color: "var(--text-3)" }} />
          <input ref={input} value={query} onChange={(e) => { setQuery(e.target.value); setSel(0); }} onKeyDown={onKeyDown}
            role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={shown[sel] ? `cmd-${shown[sel].id}` : undefined}
            aria-label="Search commands" placeholder="Type a command or screen…" autoComplete="off" spellCheck={false}
            className="flex-1 bg-transparent py-4" style={{ fontSize: 16, color: "var(--text)", outline: "none" }} />
          <kbd className="kbd">Esc</kbd>
        </div>
        <ul id="cmd-list" role="listbox" aria-label="Commands" className="sb-on py-2" style={{ maxHeight: 360, overflowY: "auto" }}>
          {shown.length === 0 && <li className="px-4 py-3" style={{ fontSize: 14, color: "var(--text-3)" }}>No command matches &ldquo;{query}&rdquo;.</li>}
          {shown.map((c, i) => (
            <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === sel}
              onMouseMove={() => setSel(i)} onClick={() => run(c)}
              className="mx-2 flex items-center gap-3 rounded-xl px-3 cursor-pointer"
              style={{ minHeight: 44, fontSize: 14, fontWeight: 600, color: i === sel ? "var(--lav-ink)" : "var(--text-2)", background: i === sel ? "var(--lav-soft)" : undefined }}>
              <Icon name={c.icon} size={16} aria-hidden="true" />
              <span className="flex-1">{c.label}</span>
              {c.hint && <kbd className="kbd">{c.hint}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
