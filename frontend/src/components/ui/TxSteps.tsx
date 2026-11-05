import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import type { Stepper } from "@/hooks/useStepper";

/** Uniswap-style sequential transaction overlay: steps run top-to-bottom, each with
 *  a spinner while active, a check when done, and a clear error state. */
export function TxSteps({ stepper, title }: { stepper: Stepper; title: string }) {
  const { open, steps, error, successHref, close } = stepper;
  const allDone = steps.length > 0 && steps.every((s) => s.state === "done");
  const closable = Boolean(error) || allDone;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Move focus into the dialog when it opens and hand it back to whatever opened it on close.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      returnFocus.current?.focus?.();
    };
  }, [open]);

  // Esc closes exactly when clicking outside would: once the flow has finished or failed.
  useEffect(() => {
    if (!open || !closable) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closable, close]);

  const heading = error ? "Transaction failed" : allDone ? "Confirmed" : title;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center px-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: "var(--scrim)", backdropFilter: "blur(4px)", overscrollBehavior: "contain" }}
          onClick={() => closable && close()}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 400, maxWidth: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 22, boxShadow: "var(--shadow-lg)", overflow: "hidden", outline: "none" }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--divider)" }}>
              <h2 id={titleId} className="font-display" style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
                {heading}
              </h2>
              {closable && (
                <button type="button" onClick={close} className="icon-btn icon-btn-plain" aria-label="Close">
                  <Icon name="close" size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="px-5 py-5 flex flex-col gap-1">
              <ol aria-live="polite" className="flex flex-col gap-1">
                {steps.map((s, i) => (
                  <li key={s.key}>
                    <div className="flex items-center gap-3">
                      <StepIcon state={s.state} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: s.state === "pending" ? "var(--muted)" : "var(--text)" }}>
                          {s.label}
                          <span className="sr-only">
                            {s.state === "done" ? " — done" : s.state === "active" ? " — in progress" : s.state === "error" ? " — failed" : " — waiting"}
                          </span>
                        </div>
                        {s.state === "active" && <div style={{ fontSize: 13, color: "var(--text-3)" }}>Confirm in your wallet…</div>}
                        {s.state === "error" && <div style={{ fontSize: 13, color: "var(--down-ink)" }}>Failed</div>}
                      </div>
                    </div>
                    {i < steps.length - 1 && (
                      <div aria-hidden="true" style={{ marginLeft: 13, height: 14, width: 2, background: s.state === "done" ? "var(--up)" : "var(--divider)", borderRadius: 2 }} />
                    )}
                  </li>
                ))}
              </ol>

              {error && (
                <div role="alert" className="mt-3" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-border)", borderRadius: 12, padding: "12px 14px", fontSize: 13, lineHeight: 1.5, color: "var(--warn-label)" }}>
                  {error}
                </div>
              )}

              {allDone && successHref ? (
                <a href={successHref} target="_blank" rel="noreferrer" className="btn btn-positive btn-block mt-3">
                  View on explorer <Icon name="external" size={14} aria-hidden="true" />
                </a>
              ) : (error ? (
                <button type="button" onClick={close} className="btn btn-secondary btn-block mt-3">
                  Close
                </button>
              ) : null)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepIcon({ state }: { state: "pending" | "active" | "done" | "error" }) {
  const base = { width: 28, height: 28, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as const;
  if (state === "done") return <span aria-hidden="true" style={{ ...base, background: "var(--green-bg)", color: "var(--green-label)", border: "1px solid var(--green-border)" }}><Icon name="check" size={15} /></span>;
  if (state === "error") return <span aria-hidden="true" style={{ ...base, background: "var(--warn-bg)", color: "var(--down-ink)", border: "1px solid var(--warn-border)" }}><Icon name="close" size={15} /></span>;
  if (state === "active")
    return (
      <span aria-hidden="true" style={{ ...base, background: "var(--lav-soft)", color: "var(--lav-ink)" }}>
        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: "linear", duration: 0.9 }} style={{ lineHeight: 0 }}>
          <Icon name="spinner" size={16} />
        </motion.span>
      </span>
    );
  return <span aria-hidden="true" style={{ ...base, background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }}><span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--faint)" }} /></span>;
}
