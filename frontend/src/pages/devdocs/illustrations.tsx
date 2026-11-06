import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Illustrations for the guides, drawn with the docs' own tokens (lx-*) so they follow light and
 * dark. Flows are HTML (they reflow to a column on phones); the timeline is an SVG with real text
 * that scrolls sideways on narrow screens rather than shrinking below legibility.
 */

function Figure({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <figure style={{ marginTop: 20, marginBottom: 0 }}>
      <div style={{ borderRadius: 16, padding: "clamp(14px, 2.4vw, 22px)", background: "var(--lx-tint-soft)", boxShadow: "inset 0 0 0 1px var(--lx-card-line)" }}>
        {children}
      </div>
      <figcaption className="lx-sub" style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 10 }}>{caption}</figcaption>
    </figure>
  );
}

type Node = { icon: IconName; title: string; body: string; tone?: "accent" | "green" | "honey" };
const TONE = {
  accent: { bg: "var(--lav-soft)", ink: "var(--lx-accent-ink)" },
  green: { bg: "var(--green-bg)", ink: "var(--green-label)" },
  honey: { bg: "var(--warn-bg)", ink: "var(--honey-ink)" },
} as const;

/** A left-to-right chain of steps (a column on phones), joined by arrows. */
function Chain({ nodes, label }: { nodes: Node[]; label: string }) {
  return (
    <ol className="flex flex-col md:flex-row md:items-stretch" style={{ gap: 6 }} aria-label={label}>
      {nodes.map((n, i) => {
        const t = TONE[n.tone ?? "accent"];
        return (
          <li key={n.title} className="flex flex-col md:flex-row md:items-stretch md:flex-1 min-w-0" style={{ gap: 6 }}>
            <div className="flex md:flex-col gap-3 md:gap-2 flex-1 min-w-0" style={{ padding: "12px 14px", borderRadius: 14, background: "var(--lx-card)", boxShadow: "inset 0 0 0 1px var(--lx-card-line)" }}>
              <span className="inline-flex items-center justify-center shrink-0" aria-hidden="true"
                style={{ width: 32, height: 32, borderRadius: 10, background: t.bg, color: t.ink }}><Icon name={n.icon} size={16} /></span>
              <span className="min-w-0">
                <span className="block" style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--lx-ink)" }}>{n.title}</span>
                <span className="lx-sub block" style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>{n.body}</span>
              </span>
            </div>
            {i < nodes.length - 1 && (
              <span className="self-center shrink-0 rotate-90 md:rotate-0" aria-hidden="true" style={{ color: "var(--lx-sub)" }}>
                <Icon name="arrowRight" size={16} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** What happens to a DCA order, from the wallet to the WETH it buys. */
export function DcaFlowIllustration() {
  return (
    <Figure caption="Your budget sits in PoincareDCA, not with the keeper. The keeper can only fill a slice the contract's rules allow, re-checked in the same transaction, and the output goes straight to your wallet.">
      <Chain label="How a DCA order fills" nodes={[
        { icon: "lock", title: "You create the order", body: "Approve the exact budget, then createOrder escrows it." },
        { icon: "layers", title: "PoincareDCA holds it", body: "Budget, schedule and protection, on chain." },
        { icon: "gauge", title: "A keeper calls each slot", body: "Every interval it asks: can the next slice fill?" },
        { icon: "shield", title: "The rules decide", body: "Spread cap, trend pause, limit price. Held, or filled.", tone: "honey" },
        { icon: "swap", title: "Filled at the pool", body: "Quoted and swapped atomically; WETH to you.", tone: "green" },
      ]} />
    </Figure>
  );
}

/**
 * Eight hourly buys of 100 USDC with the spread guard and catch-up on. An up-trend makes buys pay
 * during hours 3 and 4, so those slices are held; from hour 5 the 600 USDC left is spread over the
 * 4 slots left, 150 each. Total still 800, finished on time. (The contract's own rule:
 * remaining / slots left.)
 */
export function DcaTimelineIllustration() {
  const W = 720, H = 250, x0 = 56, colW = 80, base = 196, unit = 0.62;
  const slots = [
    { amt: 100, state: "filled" }, { amt: 100, state: "filled" },
    { amt: 100, state: "held" }, { amt: 100, state: "held" },
    { amt: 150, state: "catch" }, { amt: 150, state: "catch" }, { amt: 150, state: "catch" }, { amt: 150, state: "catch" },
  ] as const;
  return (
    <Figure caption="Spread guard with catch-up, on a plan of 8 hourly buys of 100 USDC. A trend makes buys pay the spread in hours 3 and 4, so those buys wait. The 600 USDC still to spend is then split over the 4 hours left, 150 each: the plan pays no spread and still finishes on time.">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="DCA timeline illustration, scrollable">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 600, width: "100%", display: "block" }} role="img"
          aria-label="Hours 1 and 2: 100 USDC filled each. Hours 3 and 4: held, because buys pay the trend spread. Hours 5 to 8: 150 USDC each, catching up. 800 USDC in total.">
          {/* regime band */}
          <rect x={x0} y={8} width={colW * 2} height={26} rx={8} fill="var(--lav-soft)" />
          <text x={x0 + colW} y={25} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--lx-sub)">Calm · no spread</text>
          <rect x={x0 + colW * 2} y={8} width={colW * 2} height={26} rx={8} fill="var(--honey)" fillOpacity={0.2} />
          <text x={x0 + colW * 3} y={25} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--honey-ink)">Up-trend · buys pay</text>
          <rect x={x0 + colW * 4} y={8} width={colW * 4} height={26} rx={8} fill="var(--lav-soft)" />
          <text x={x0 + colW * 6} y={25} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--lx-sub)">Trend over · no spread</text>

          {/* axis */}
          <line x1={x0 - 6} x2={x0 + colW * 8} y1={base} y2={base} stroke="var(--lx-line)" strokeWidth={1.5} />
          {[0, 100, 150].map((v) => (
            <g key={v}>
              <line x1={x0 - 6} x2={x0 + colW * 8} y1={base - v * unit} y2={base - v * unit} stroke="var(--lx-line)" strokeDasharray="3 5" />
              <text x={x0 - 12} y={base - v * unit + 4} textAnchor="end" fontSize="11" fill="var(--lx-sub)">{v}</text>
            </g>
          ))}

          {slots.map((s, i) => {
            const cx = x0 + colW * i + colW / 2;
            const h = s.amt * unit;
            const held = s.state === "held";
            return (
              <g key={i}>
                <rect x={cx - 22} y={base - h} width={44} height={h} rx={8}
                  fill={held ? "none" : s.state === "catch" ? "var(--up)" : "var(--green-label)"} opacity={held ? 1 : s.state === "catch" ? 0.75 : 0.9}
                  stroke={held ? "var(--honey)" : "none"} strokeWidth={2} strokeDasharray={held ? "5 4" : undefined} />
                <text x={cx} y={base - h - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill={held ? "var(--honey-ink)" : "var(--lx-ink)"}>
                  {held ? "held" : s.amt}
                </text>
                <text x={cx} y={base + 18} textAnchor="middle" fontSize="12" fill="var(--lx-sub)">{i + 1}h</text>
              </g>
            );
          })}
          <text x={x0 + colW * 6} y={base + 40} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--green-label)">catch-up: 600 left ÷ 4 slots = 150</text>
          <text x={x0 + colW * 3} y={base + 40} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--honey-ink)">spread guard holds</text>
        </svg>
      </div>
    </Figure>
  );
}

/** The LP strategy as a loop of four states. */
export function LpStrategyIllustration() {
  return (
    <Figure caption="One loop per trend. You stay in while the hook is charging with-trend flow, step partly out only when the spread has been pinned at its cap for a while (the cap is doing the work, not the detector), and step back in when the trend ends.">
      <Chain label="Regime-aware LP strategy" nodes={[
        { icon: "pool", title: "Calm", body: "Fully deposited. Both sides trade at the plain price." },
        { icon: "wave", title: "Trend confirmed", body: "Stay in: with-trend swaps pay the spread to you.", tone: "green" },
        { icon: "gauge", title: "Pinned at the cap", body: "Spread at its 5% cap for N blocks: withdraw part.", tone: "honey" },
        { icon: "check", title: "Trend ends", body: "Add the withdrawn part back at the new price." },
      ]} />
    </Figure>
  );
}
