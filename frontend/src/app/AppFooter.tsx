import { Link } from "react-router-dom";
import { Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { useFaucet } from "@/hooks/useSwap";
import { CONTRACTS, EXPLORER, CHAIN_NAME } from "@/config/contracts";
import { shorten } from "@/lib/format";

function ExplorerLink({ label, address }: { label: string; address: string }) {
  return (
    <a
      href={`${EXPLORER}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="link-quiet inline-flex items-center gap-1.5 rounded-md py-1"
      style={{ fontSize: 13, fontWeight: 600 }}
      aria-label={`${label} contract ${address} on the block explorer (opens in a new tab)`}
    >
      <span>{label}</span>
      <span translate="no" style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-2)" }}>{shorten(address)}</span>
      <Icon name="external" size={12} aria-hidden="true" />
    </a>
  );
}

/** Fund the connected wallet with the demo tokens straight from the footer. Testnet only. */
function FaucetButton() {
  const faucet = useFaucet();
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={() => faucet.mint()}
        disabled={faucet.minting}
        aria-busy={faucet.minting}
        className="btn btn-soft btn-sm"
      >
        <span className="flex items-center" style={{ marginRight: 1 }} aria-hidden="true">
          <TokenIcon sym="USDC" size={16} />
          <span style={{ marginLeft: -5 }}><TokenIcon sym="WETH" size={16} /></span>
        </span>
        {faucet.minting ? "Sending…" : (
          <span>Get test tokens<span className="hidden sm:inline"> · 50k USDC + 20 WETH</span></span>
        )}
      </button>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
        Testnet only · test tokens have no value
      </span>
    </div>
  );
}

/** Footer for the wallet-gated app. Links contract addresses out to the explorer. */
export function AppFooter() {
  return (
    <footer className="mt-2" style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
      <div className="mx-auto px-4 sm:px-6 py-8" style={{ maxWidth: 1600 }}>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4 flex-wrap">
            <Wordmark size={26} />
            <span className="flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 99, background: "var(--lav)" }} />
              {CHAIN_NAME} · testnet · research preview
            </span>
          </div>

          <nav aria-label="Contracts and links" className="flex items-center gap-x-5 gap-y-1 flex-wrap">
            <ExplorerLink label="Hook" address={CONTRACTS.hook} />
            <ExplorerLink label="Pool manager" address={CONTRACTS.poolManager} />
            <ExplorerLink label="Router" address={CONTRACTS.router} />
            <a
              href="https://x.com/Poincare_AMM"
              target="_blank"
              rel="noreferrer"
              className="link-quiet inline-flex items-center gap-1.5 rounded-md py-1"
              style={{ fontSize: 13, fontWeight: 700 }}
              aria-label="Poincaré on X (opens in a new tab)"
            >
              <Icon name="xSocial" size={13} aria-hidden="true" />
              @Poincare_AMM
            </a>
          </nav>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <FaucetButton />
          <Link to="/developers" className="btn btn-secondary btn-sm">
            <Icon name="layers" size={14} aria-hidden="true" /> Build on Poincaré · Docs
          </Link>
        </div>

        <div className="mt-5 pt-4 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: "1px solid var(--divider)", fontSize: 12, color: "var(--muted)" }}>
          <span>Poincaré is a Uniswap v4 custom-curve hook. Not investment advice. Test tokens carry no value.</span>
          <span>Prices off the pool's own reserves · no oracle; the pool itself needs no keeper.</span>
        </div>
      </div>
    </footer>
  );
}
