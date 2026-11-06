import { Icon } from "@/components/ui/Icon";

// Both security reviews stay on the strip, in the reviewers' own scope language: the Olympix
// pre-audit scan (every finding fixed) and the SFS-Labs independent scoped review (its wording
// below is the public statement the reviewer asked for; it is not an audit certification).
// Every fix carries a regression test. Keep the claims literally true as the suite grows — the
// count below is the number `forge test` actually reports, not a round number.
const ITEMS = [
  "Independent scoped review by SFS-Labs: no Critical/High/Medium issues confirmed within the reviewed scope; two Low findings, both fixed",
  "Pre-audit scanned by Olympix BugPoCer: every finding fixed and regression-tested",
  "243 passing Foundry tests",
  "calibrated on 4 years of real ETH/USDC",
];

function Group() {
  return (
    <span className="marquee-group">
      {ITEMS.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-2" style={{ paddingRight: 48 }}>
          <span style={{ color: "var(--green-label)", display: "inline-flex" }}>
            <Icon name="shield" size={14} />
          </span>
          <span>{t}</span>
        </span>
      ))}
    </span>
  );
}

/** Scrolling announcement strip: the SFS-Labs independent scoped review and Olympix pre-audit scan
 *  results. Pauses while hovered, stops under reduced motion. Screen readers get the list once, not a loop.
 *  Styled like the landing page's "Reviewed by" badge: a quiet lavender-tint band with a hairline,
 *  ink text and green shields, rather than a saturated gradient with glow and text shadow. */
export function AnnouncementMarquee() {
  return (
    <div
      className="relative"
      style={{
        background: "var(--lav-soft)",
        borderBottom: "1px solid var(--lx-line)",
        fontSize: 13,
        fontWeight: 550,
        color: "var(--text-2)",
        letterSpacing: "-0.005em",
      }}
    >
      <p className="sr-only">Security: {ITEMS.join(" · ")}.</p>
      <div className="marquee" aria-hidden="true" style={{ padding: "9px 0" }}>
        <div className="marquee-track">
          <Group />
          <Group />
        </div>
      </div>
    </div>
  );
}
