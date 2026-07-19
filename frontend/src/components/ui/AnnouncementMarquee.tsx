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
        <span key={i} className="inline-flex items-center gap-2.5" style={{ paddingRight: 52 }}>
          <span style={{ color: "#ffe9a8", display: "inline-flex", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.25))" }}>
            <Icon name="shield" size={15} strokeWidth={2.2} />
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
        background: "linear-gradient(90deg, var(--lav-deep), var(--lav) 45%, var(--lav-deep))",
        borderBottom: "1px solid rgba(255,255,255,.18)",
        boxShadow: "inset 0 -6px 14px rgba(0,0,0,.08), 0 2px 10px rgba(20,18,45,.10)",
        fontSize: 12.5,
        fontWeight: 800,
        color: "#fff",
        padding: "9px 0",
        letterSpacing: ".4px",
        textShadow: "0 1px 2px rgba(0,0,0,.18)",
      }}
    >
      <div className="marquee-track">
        <Group />
        <Group hidden />
      </div>
    </div>
  );
}
