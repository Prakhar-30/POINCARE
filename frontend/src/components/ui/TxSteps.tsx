import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import type { Stepper } from "@/hooks/useStepper";

/** Uniswap-style sequential transaction overlay: steps run top-to-bottom, each with
 *  a spinner while active, a check when done, and a clear error state. */
export function TxSteps({ stepper, title }: { stepper: Stepper; title: string }) {
  const { open, steps, error, successHref, close } = stepper;
  const allDone = steps.length > 0 && steps.every((s) => s.state === "done");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center px-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ background: "var(--scrim)", backdropFilter: "blur(4px)" }}
          onClick={() => (error || allDone) && close()}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 380, maxWidth: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 22, boxShadow: "var(--shadow-lg)", overflow: "hidden" }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--divider)" }}>
              <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                {error ? "Transaction failed" : allDone ? "Confirmed" : title}
              </span>
              {(error || allDone) && (
                <button onClick={close} style={{ color: "var(--faint)", lineHeight: 0, padding: 2 }} aria-label="Close">
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>

            <div className="px-5 py-5 flex flex-col gap-1">
              {steps.map((s, i) => (
                <div key={s.key}>
                  <div className="flex items-center gap-3">
                    <StepIcon state={s.state} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: s.state === "pending" ? "var(--muted)" : "var(--text)" }}>{s.label}</div>
                      {s.state === "active" && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Confirm in your wallet…</div>}
                      {s.state === "error" && <div style={{ fontSize: 11.5, color: "var(--down-deep)" }}>Failed</div>}
                    </div>
                  </div>
                  {i < steps.length - 1 && (
                    <div style={{ marginLeft: 13, height: 14, width: 2, background: s.state === "done" ? "var(--up)" : "var(--divider)", borderRadius: 2 }} />
                  )}
                </div>
              ))}

              {error && (
                <div className="mt-3" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-border)", borderRadius: 12, padding: "11px 13px", fontSize: 12.5, lineHeight: 1.5, color: "var(--warn-label)" }}>
                  {error}
                </div>
              )}

              {allDone && successHref ? (
                <a href={successHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center justify-center gap-1.5 font-bold"
                  style={{ color: "#fff", background: "var(--up-deep)", borderRadius: 13, padding: "11px", fontSize: 13.5 }}>
                  View on explorer <Icon name="external" size={14} />
                </a>
              ) : (error ? (
                <button onClick={close} className="mt-3 w-full font-bold" style={{ color: "var(--text)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 13, padding: "11px", fontSize: 13.5 }}>
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
  if (state === "done") return <span style={{ ...base, background: "var(--green-bg)", color: "var(--green-label)", border: "1px solid var(--green-border)" }}><Icon name="check" size={15} /></span>;
  if (state === "error") return <span style={{ ...base, background: "var(--warn-bg)", color: "var(--down-deep)", border: "1px solid var(--warn-border)" }}><Icon name="close" size={15} /></span>;
  if (state === "active")
    return (
      <span style={{ ...base, background: "var(--lav-soft)", color: "var(--lav-deep)" }}>
        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, ease: "linear", duration: 0.9 }} style={{ lineHeight: 0 }}>
          <Icon name="spinner" size={16} />
        </motion.span>
      </span>
    );
  return <span style={{ ...base, background: "var(--surface-2)", color: "var(--faint)", border: "1px solid var(--border)" }}><span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--faint)" }} /></span>;
}
