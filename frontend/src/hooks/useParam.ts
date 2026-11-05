import { useSearchParams } from "react-router-dom";

/** A query-string backed option, validated, written with `replace` so it never floods history.
 *  The default is left out of the URL, so a plain link stays plain. */
export function useParam<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key) as T | null;
  const value = raw && allowed.includes(raw) ? raw : fallback;
  const set = (v: T) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v === fallback) next.delete(key);
        else next.set(key, v);
        return next;
      },
      { replace: true },
    );
  return [value, set];
}
