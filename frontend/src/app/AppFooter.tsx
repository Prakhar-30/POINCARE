import { Mark } from "@/components/brand/Logo";
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
      className="inline-flex items-center gap-1.5 transition-colors hover:text-lav"
      style={{ fontSize: 12, color: "var(--text-3)" }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span className="num" style={{ color: "var(--text-2)" }}>{shorten(address)}</span>
      <Icon name="external" size={12} />
    </a>
  );
}

/** Fund the connected wallet with the demo tokens straight from the footer. Testnet only. */
function FaucetButton() {
  const faucet = useFaucet();
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={() => faucet.mint()}
        disabled={faucet.minting}
        className="btn btn-ghost"
        style={{ height: 36, padding: "0 14px", fontSize: 13, fontWeight: 500, color: "var(--lav-deep)", cursor: faucet.minting ? "default" : "pointer" }}
      >
        <span className="flex items-center" style={{ marginRight: 1 }}>
          <TokenIcon sym="USDC" size={16} />
          <span style={{ marginLeft: -5 }}><TokenIcon sym="WETH" size={16} /></span>
        </span>
        {faucet.minting ? "Sending…" : "Get test tokens · 50k USDC + 20 WETH"}
      </button>
      <span className="num" style={{ fontSize: 11, letterSpacing: ".04em", color: "var(--muted)", textTransform: "uppercase" }}>
        Testnet only · test tokens, no value
      </span>
    </div>
  );
}

/** Footer for the wallet-gated app. Links contract addresses out to the explorer. */
export function AppFooter() {
  return (
    <footer className="px-4 sm:px-7 py-6 mt-4" style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
      <div className="mx-auto flex flex-col gap-5" style={{ maxWidth: 1320 }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-2.5" style={{ fontSize: 13, color: "var(--text-3)" }}>
            <Mark size={22} />
            <span style={{ fontWeight: 600, color: "var(--text)" }}>Poincaré</span>
            <span className="num hidden sm:inline" style={{ fontSize: 12 }}>{CHAIN_NAME} · testnet · research preview</span>
          </span>
          <FaucetButton />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <ExplorerLink label="Hook" address={CONTRACTS.hook} />
          <ExplorerLink label="Pool manager" address={CONTRACTS.poolManager} />
          <ExplorerLink label="Router" address={CONTRACTS.router} />
          <a
            href="https://x.com/Poincare_AMM"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-lav"
            style={{ fontSize: 12, color: "var(--text-2)" }}
          >
            <Icon name="xSocial" size={13} />
            @Poincare_AMM
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4" style={{ borderTop: "1px solid var(--divider)", fontSize: 12, color: "var(--muted)" }}>
          <span>Poincaré is a Uniswap v4 custom-curve hook. Not investment advice. Test tokens carry no value.</span>
          <span>Prices off the pool's own reserves · no oracle, no keeper.</span>
        </div>
      </div>
    </footer>
  );
}
