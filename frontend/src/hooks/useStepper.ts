import { useState } from "react";

export type StepState = "pending" | "active" | "done" | "error";
export type Step = { key: string; label: string; sub?: string; state: StepState };

export type Stepper = ReturnType<typeof useStepper>;

/** Drives a Uniswap-style sequential transaction overlay (approve -> action). */
export function useStepper() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successHref, setSuccessHref] = useState<string | null>(null);

  const begin = (defs: { key: string; label: string; sub?: string }[]) => {
    setError(null);
    setSuccessHref(null);
    setSteps(defs.map((d) => ({ ...d, state: "pending" })));
    setOpen(true);
  };
  const activate = (key: string) => setSteps((p) => p.map((s) => (s.key === key ? { ...s, state: "active" } : s)));
  const complete = (key: string) => setSteps((p) => p.map((s) => (s.key === key ? { ...s, state: "done" } : s)));
  const fail = (key: string, msg: string) => {
    setSteps((p) => p.map((s) => (s.key === key ? { ...s, state: "error" } : s)));
    setError(msg);
  };
  const finish = (href?: string) => setSuccessHref(href ?? "");
  const close = () => setOpen(false);

  return { steps, open, error, successHref, begin, activate, complete, fail, finish, close };
}
