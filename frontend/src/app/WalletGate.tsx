import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import { CHAIN_NAME } from "@/config/contracts";
import { Mark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

/** Shown on /app until a wallet is connected. */
export function WalletGate() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "var(--app-bg)" }}>
      <Mark size={64} decorative />
      <h1 className="font-display mt-7" style={{ fontWeight: 700, fontSize: 30, color: "var(--text)" }}>
        Connect to enter
      </h1>
      <p className="mt-3 max-w-md" style={{ color: "var(--text-2)", fontSize: 16, lineHeight: 1.65, textWrap: "pretty" }}>
        The Poincaré dashboard, your positions and the live detector unlock once your wallet is connected
        on <span style={{ color: "var(--text-2)", fontWeight: 700 }}>{CHAIN_NAME}</span>.
      </p>

      {/* not the nav action, so it uses the theme's primary button rather than the wallet kit's ink */}
      <div className="mt-8">
        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => (
            <button type="button" className="btn btn-primary btn-lg" onClick={openConnectModal} disabled={!mounted}>
              Connect wallet
            </button>
          )}
        </ConnectButton.Custom>
      </div>

      <div className="mt-7 flex items-center gap-2" style={{ color: "var(--muted)", fontSize: 13 }}>
        <Icon name="lock" size={14} aria-hidden="true" />
        Non-custodial · we never see your keys · read-only until you sign
      </div>

      <Link to="/" className="link-quiet mt-10 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold">
        <Icon name="arrowRight" size={15} className="rotate-180" aria-hidden="true" />
        Back to home
      </Link>
    </main>
  );
}
