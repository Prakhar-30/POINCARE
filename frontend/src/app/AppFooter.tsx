import { Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { CONTRACTS, EXPLORER } from "@/config/contracts";
import { shorten } from "@/lib/format";

function ExplorerLink({ label, address }: { label: string; address: string }) {
  return (
    <a
      href={`${EXPLORER}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 transition-colors"
      style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "var(--text-2)" }}>{shorten(address)}</span>
      <Icon name="external" size={12} />
    </a>
  );
}

/** Footer for the wallet-gated app. Links contract addresses out to the explorer. */
export function AppFooter() {
  return (
    <footer className="px-6 py-7 mt-2" style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
      <div className="mx-auto flex flex-wrap items-center justify-between gap-5" style={{ maxWidth: 1180 }}>
        <div className="flex items-center gap-4 flex-wrap">
          <Wordmark size={26} />
          <span className="flex items-center gap-1.5" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-3)" }}>
            <span className="anim-pulse-dot" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--lav)" }} />
            Unichain Sepolia · testnet · research preview
          </span>
        </div>

        <div className="flex items-center gap-5 flex-wrap">
          <ExplorerLink label="Hook" address={CONTRACTS.hook} />
          <ExplorerLink label="Pool manager" address={CONTRACTS.poolManager} />
          <ExplorerLink label="Router" address={CONTRACTS.router} />
        </div>
      </div>

      <div className="mx-auto mt-5 pt-4 flex flex-wrap items-center justify-between gap-3" style={{ maxWidth: 1180, borderTop: "1px solid var(--divider)" }}>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>
          Poincaré is a Uniswap v4 custom-curve hook. Not investment advice. Test tokens carry no value.
        </span>
        <span style={{ fontSize: 11, color: "var(--faint)" }}>Prices off the pool's own reserves · no oracle, no keeper.</span>
      </div>
    </footer>
  );
}
