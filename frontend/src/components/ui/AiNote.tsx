import { Icon } from "@/components/ui/Icon";
import type { Explained } from "@/hooks/useExplain";

/**
 * A narrated read of the detector.
 *
 * The source is always labelled. When the model is unavailable — not configured,
 * cooling down, out of free-tier quota — the panel shows the deterministic
 * explanation computed locally rather than an error, and says so. Both are
 * truthful readings of the same on-chain numbers; only the prose differs, and a
 * reader deserves to know which one they are looking at.
 */
export function AiNote({
  explained,
  title = "What the detector is doing",
  skeletonLines = 0,
}: {
  explained: Explained;
  title?: string;
  /**
   * When set, show a shimmer of this many lines instead of a locally-computed substitute while
   * waiting for the model.
   *
   * The regime note is happy with a local line; the Analytics report is not, because the panel
   * exists to show the model's reading. There a substitute is worse than a wait - so the caller
   * asks for a skeleton, `useExplain` keeps retrying, and the reason is still surfaced quietly
   * underneath so an undeployed function does not look like an eternal loading state.
   */
  skeletonLines?: number;
}) {
  const { text, source, model, cached, loading, reason, attempts, stalled, ask } = explained;
  // Stalled is not waiting. A skeleton says "this is coming"; if the deployed function has no
  // answer for this question, that is a promise the panel cannot keep.
  const waiting = skeletonLines > 0 && source !== "model" && !stalled;

  // "Computed locally" covers both "no model configured" and "the model was tried
  // and failed", which look identical from the outside and are fixed very
  // differently. When there is a reason, say so on the badge.
  const localLabel = reason ? "computed locally · model unavailable" : "computed locally";
  const localTitle = reason
    ? `The model could not be reached (${reason}), so this reading is computed locally from the same on-chain numbers.`
    : "The model was unavailable; this reading is computed locally from the same numbers";

  return (
    <div
      className="rounded-2xl p-4"
      aria-live="polite"
      aria-busy={waiting || loading}
      style={{
        background: "var(--lav-soft)",
        border: "1px solid var(--lav-dim)",
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--lav-ink)" }}>
            <Icon name={loading ? "spinner" : "spark"} size={15} aria-hidden="true" />
          </span>
          <span className="font-display" style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: ".3px",
              color: source === "model" ? "var(--lav-ink)" : "var(--text-3)",
              background: "var(--surface)",
              border: "1px solid var(--lav-dim)",
            }}
            title={
              source === "model"
                ? "Generated from the pool's on-chain detector state"
                : stalled && reason
                  ? `Summary service error: ${reason}`
                  : localTitle
            }
          >
            {source === "model"
              ? `${model ?? "model"}${cached ? " · cached" : ""}`
              : waiting
                ? attempts > 0
                  ? `retrying · attempt ${attempts + 1}`
                  : "generating…"
                : stalled
                  ? "unavailable"
                  : localLabel}
          </span>

        </div>
      </div>

      {waiting ? (
        <>
          <div className="flex flex-col" style={{ gap: 8 }}>
            {Array.from({ length: skeletonLines }).map((_, i) => (
              <div
                key={i}
                className="shimmer"
                style={{
                  height: 10,
                  borderRadius: 5,
                  // ragged right edge, so it reads as prose rather than a progress bar
                  width: `${[97, 92, 99, 88, 95, 71][i % 6]}%`,
                }}
              />
            ))}
          </div>
          {reason && (
            <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--muted)", marginTop: 12 }} title={reason}>
              This is taking longer than usual. Retrying automatically.
            </p>
          )}
        </>
      ) : stalled ? (
        <div
          className="rounded-md p-3"
          style={{ background: "var(--surface)", border: "1px dashed var(--lav-dim)" }}
        >
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-2)", fontWeight: 600, margin: 0 }}>
            The written summary isn&rsquo;t available right now.
          </p>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--muted)", margin: "6px 0 0" }}>
            Every number and chart on this page is read live from the chain and isn&rsquo;t
            affected. We&rsquo;ll keep checking in the background.
          </p>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={ask} disabled={loading} aria-busy={loading}>
            <Icon name={loading ? "spinner" : "play"} size={14} aria-hidden="true" />
            {loading ? "Checking…" : "Try again"}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-2)", whiteSpace: "pre-wrap", maxWidth: "75ch", textWrap: "pretty" }}>{text}</p>
      )}
    </div>
  );
}
