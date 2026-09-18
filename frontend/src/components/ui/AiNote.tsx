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
}: {
  explained: Explained;
  title?: string;
}) {
  const { text, source, model, cached, loading, reason } = explained;

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
      style={{
        background: "var(--lav-soft)",
        border: "1px solid var(--lav-dim)",
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--lav-deep)" }}>
            <Icon name={loading ? "spinner" : "spark"} size={15} />
          </span>
          <span className="font-display" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: ".3px",
              color: source === "model" ? "var(--lav-deep)" : "var(--text-3)",
              background: "var(--surface)",
              border: "1px solid var(--lav-dim)",
            }}
            title={
              source === "model" ? "Generated from the pool's on-chain detector state" : localTitle
            }
          >
            {source === "model" ? `${model ?? "model"}${cached ? " · cached" : ""}` : localLabel}
          </span>

        </div>
      </div>

      <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text-2)" }}>{text}</p>
    </div>
  );
}
