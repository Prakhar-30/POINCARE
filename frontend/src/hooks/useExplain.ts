import { useCallback, useEffect, useRef, useState } from "react";
import { isExplanation, requestExplanation, type ExplainKind } from "@/lib/db";

export type ExplainSource = "model" | "local" | "pending";

export type Explained = {
  text: string;
  source: ExplainSource;
  model: string | null;
  cached: boolean;
  loading: boolean;
  /** Why the model was not used, when it was tried and failed. */
  reason: string | null;
  /** Failed attempts so far, for surfaces that keep retrying rather than falling back. */
  attempts: number;
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
  /** Must match a key of TASK in the `explain` edge function. */
  kind: ExplainKind;
  cacheKey: string | null;
  facts: unknown;
  fallback: string;
  /** Fetch automatically when `cacheKey` changes. */
  auto?: boolean;
  /**
   * Keep retrying until the model answers, instead of settling for the fallback.
   *
   * For the short regime note a locally-computed line is a fine substitute. For the Analytics
   * report it is not: the whole point of that panel is the model's reading, so the caller would
   * rather show a skeleton and wait. Backoff is exponential and capped, because the two most
   * common failures - a per-hook cooldown and an exhausted free-tier budget - both resolve on
   * their own given time, and hammering the function helps neither.
   */
  retry?: boolean;
}): Explained {
  const { kind, cacheKey, facts, fallback, auto = false, retry = false } = opts;

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
  const attempts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      if (retry) {
        attempts.current += 1;
        const delay = Math.min(30_000, 2000 * 2 ** (attempts.current - 1));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          // Only chase the question still on screen; a newer cacheKey supersedes this one.
          if (cacheKeyRef.current === key) void run(key);
        }, delay);
      }
    },
    [kind, retry],
  );

  // `run` reads this rather than closing over cacheKey, so a scheduled retry can tell whether
  // the question it was asked about is still the current one.
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  useEffect(() => {
    if (!auto || !cacheKey || askedFor.current === cacheKey) return;
    void run(cacheKey);
  }, [auto, cacheKey, run]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // A new question invalidates the previous answer, so the stale text does not
  // sit under a changed set of numbers while the next request is in flight.
  useEffect(() => {
    setState({ text: "", model: null, cached: false, reason: null });
    attempts.current = 0;
    if (timer.current) clearTimeout(timer.current);
  }, [cacheKey]);

  const ask = useCallback(() => {
    if (cacheKey && askedFor.current !== cacheKey) void run(cacheKey);
  }, [cacheKey, run]);

  return {
    text: state.text || fallback,
    source: state.text ? "model" : loading || retry ? "pending" : "local",
    attempts: attempts.current,
    model: state.model,
    cached: state.cached,
    reason: state.reason,
    loading,
    ask,
  };
}
