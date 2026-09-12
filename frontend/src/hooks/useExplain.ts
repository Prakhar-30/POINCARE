import { useCallback, useEffect, useRef, useState } from "react";
import { isExplanation, requestExplanation } from "@/lib/db";

export type ExplainSource = "model" | "local" | "pending";

export type Explained = {
  text: string;
  source: ExplainSource;
  model: string | null;
  cached: boolean;
  loading: boolean;
  /** Why the model was not used, when it was tried and failed. */
  reason: string | null;
  /** Ask the model now. Used by the manual (`auto: false`) surfaces. */
  ask: () => void;
};

/**
 * Narrate a set of facts, preferring the model and falling back to the caller's
 * deterministic text.
 *
 * `fallback` is rendered immediately and stays on screen while the request is in
 * flight, so the panel is never empty and never shows a spinner where an
 * explanation should be. If the request fails for any reason the fallback simply
 * remains — the UI marks the source rather than reporting an error, because a
 * locally-computed explanation is a perfectly good answer, just a blunter one.
 *
 * `cacheKey` decides when to re-ask: pass something that changes exactly when the
 * answer would (a block number, a configuration digest), since it is also the key
 * the server caches under.
 */
export function useExplain(opts: {
  kind: "regime" | "lab";
  cacheKey: string | null;
  facts: unknown;
  fallback: string;
  /** Fetch automatically when `cacheKey` changes. False = only on `ask()`. */
  auto?: boolean;
}): Explained {
  const { kind, cacheKey, facts, fallback, auto = false } = opts;

  const [state, setState] = useState<{
    text: string;
    model: string | null;
    cached: boolean;
    reason: string | null;
  }>({ text: "", model: null, cached: false, reason: null });
  const [loading, setLoading] = useState(false);

  // The facts travel by ref so a re-render with a fresh object identity does not
  // re-trigger a request; only `cacheKey` decides that.
  const factsRef = useRef(facts);
  factsRef.current = facts;

  const askedFor = useRef<string | null>(null);

  const run = useCallback(
    async (key: string) => {
      askedFor.current = key;
      setLoading(true);
      const res = await requestExplanation(kind, key, factsRef.current);
      // A later key won the race; its result is the one that should land.
      if (askedFor.current !== key) return;
      setLoading(false);
      if (isExplanation(res)) {
        setState({ text: res.body, model: res.model, cached: res.cached, reason: null });
        return;
      }
      // Failed — most often a cooldown or an exhausted free-tier budget, both of
      // which pass. Keep the reason so the badge can say which, and release the
      // guard so the button can retry; the automatic path does not re-fire on its
      // own, since only a cacheKey change triggers it.
      setState((s) => ({ ...s, reason: res.reason }));
      askedFor.current = null;
    },
    [kind],
  );

  useEffect(() => {
    if (!auto || !cacheKey || askedFor.current === cacheKey) return;
    void run(cacheKey);
  }, [auto, cacheKey, run]);

  // A new question invalidates the previous answer, so the stale text does not
  // sit under a changed set of numbers while the next request is in flight.
  useEffect(() => {
    setState({ text: "", model: null, cached: false, reason: null });
  }, [cacheKey]);

  const ask = useCallback(() => {
    if (cacheKey && askedFor.current !== cacheKey) void run(cacheKey);
  }, [cacheKey, run]);

  return {
    text: state.text || fallback,
    source: state.text ? "model" : loading ? "pending" : "local",
    model: state.model,
    cached: state.cached,
    reason: state.reason,
    loading,
    ask,
  };
}
