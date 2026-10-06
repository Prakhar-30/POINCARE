import { Fragment } from "react";

// Recognition and review, as a quiet ticker. Keep every claim literally true as things change:
// the review counts are what Olympix reported and what was fixed (README §11), and the test count
// is what `forge test` actually reports, not a round number.
const ITEMS: { tag: string; text: string }[] = [
  { tag: "UHI10", text: "Selected as a winner of the Uniswap Hook Incubator hookathon" },
  { tag: "Security Fund", text: "Selected by the Uniswap Foundation Security Fund" },
  { tag: "Olympix", text: "Sponsored security review · 9 of 9 findings fixed" },
  { tag: "Regression", text: "Every fix carries a test that fails on the pre-fix code" },
  { tag: "Tests", text: "228 passing Foundry tests · 384k-op invariant suite" },
  { tag: "Data", text: "Calibrated on 4 years of real ETH/USDC" },
];

function Group({ hidden }: { hidden?: boolean }) {
  return (
    <span className="marquee-group" aria-hidden={hidden}>
      {ITEMS.map((it, i) => (
        <Fragment key={i}>
          <span className="inline-flex items-center gap-2.5" style={{ paddingRight: 28 }}>
            <span className="num" style={{ fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "#c2bcf5" }}>
              {it.tag}
            </span>
            <span>{it.text}</span>
          </span>
          <span aria-hidden style={{ color: "var(--ink-border)", paddingRight: 28 }}>/</span>
        </Fragment>
      ))}
    </span>
  );
}

/** Slim scrolling band: recognition and the security review. Pauses on hover. */
export function AnnouncementMarquee() {
  return (
    <div
      className="marquee"
      role="status"
      aria-label="Recognition and security review"
      style={{
        background: "var(--ink)",
        borderBottom: "1px solid var(--ink-border)",
        fontSize: 12.5,
        fontWeight: 500,
        color: "var(--ink-text-2)",
        padding: "8px 0",
      }}
    >
      <div className="marquee-track">
        <Group />
        <Group hidden />
      </div>
    </div>
  );
}
