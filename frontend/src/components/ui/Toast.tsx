import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon, type IconName } from "@/components/ui/Icon";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; title: string; message?: string; href?: string };

type ToastApi = {
  success: (title: string, message?: string, href?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const META: Record<ToastKind, { icon: IconName; color: string; bg: string; border: string }> = {
  success: { icon: "check", color: "var(--green-label)", bg: "var(--green-bg)", border: "var(--green-border)" },
  error: { icon: "shield", color: "var(--down-deep)", bg: "var(--warn-bg)", border: "var(--warn-border)" },
  info: { icon: "spark", color: "var(--lav-deep)", bg: "var(--lav-soft)", border: "var(--nav-border)" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string, href?: string) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, kind, title, message, href }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 8000 : 5500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, message, href) => push("success", title, message, href),
      error: (title, message) => push("error", title, message),
      info: (title, message) => push("info", title, message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed z-[100] flex flex-col gap-2.5"
        style={{ right: 20, bottom: 20, width: 340, maxWidth: "calc(100vw - 40px)", pointerEvents: "none" }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const m = META[t.kind];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 24, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                style={{
                  pointerEvents: "auto",
                  background: "var(--surface)",
                  border: `1px solid ${m.border}`,
                  borderRadius: 16,
                  boxShadow: "var(--shadow-lg)",
                  padding: "13px 14px",
                  display: "flex",
                  gap: 11,
                  alignItems: "flex-start",
                }}
              >
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 28, height: 28, borderRadius: 9, background: m.bg, color: m.color }}
                >
                  <Icon name={m.icon} size={16} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)" }}>{t.title}</div>
                  {t.message && (
                    <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, marginTop: 2 }}>{t.message}</div>
                  )}
                  {t.href && (
                    <a
                      href={t.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-2"
                      style={{ fontSize: 12, fontWeight: 700, color: m.color }}
                    >
                      View on explorer <Icon name="external" size={12} />
                    </a>
                  )}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="shrink-0"
                  style={{ color: "var(--faint)", background: "transparent", lineHeight: 0, padding: 2 }}
                  aria-label="Dismiss"
                >
                  <Icon name="close" size={15} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
