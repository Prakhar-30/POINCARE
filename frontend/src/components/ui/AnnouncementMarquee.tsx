import { Icon } from "@/components/ui/Icon";

const ITEMS = [
  "Pre-audit scanned by Olympix BugPoCer",
  "0 high-severity findings",
  "every reported finding fixed and regression-tested",
  "126 passing Foundry tests",
];

function Group({ hidden }: { hidden?: boolean }) {
  return (
    <span className="marquee-group" aria-hidden={hidden}>
      {ITEMS.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-2.5" style={{ paddingRight: 44 }}>
          <span style={{ color: "var(--up)", display: "inline-flex" }}>
            <Icon name="shield" size={14} />
          </span>
          <span>{t}</span>
        </span>
      ))}
    </span>
  );
}

/** Scrolling announcement strip: the Olympix pre-audit scan result. Pauses on hover. */
export function AnnouncementMarquee() {
  return (
    <div
      className="marquee"
      role="status"
      style={{
        background: "var(--lav-soft)",
        borderBottom: "1px solid var(--border)",
        fontSize: 12,
        fontWeight: 700,
        color: "var(--lav-deep)",
        padding: "7px 0",
        letterSpacing: ".2px",
      }}
    >
      <div className="marquee-track">
        <Group />
        <Group hidden />
      </div>
    </div>
  );
}
