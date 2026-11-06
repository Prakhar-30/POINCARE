import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import { CHAIN_NAME } from "@/config/contracts";
import { Mark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

/**
 * Shown on /app until a wallet is connected. Built as the landing page's hero chapter: an inset,
 * rounded panel easing from the page colour into lavender, the same headline type (weight 550,
 * tight tracking), grey copy and a flat primary pill, so stepping from the landing page into the
 * app does not change visual language.
 */
export function WalletGate() {
  return (
    <div className="lx min-h-screen flex flex-col" style={{ padding: "clamp(8px, 1.7vw, 24px)" }}>
      <main className="lx-chapter flex-1 flex flex-col items-center justify-center text-center" style={{ margin: 0, padding: "56px 24px" }}>
        <Link to="/" aria-label="Poincaré home" className="rounded-xl"><Mark size={48} decorative /></Link>
        <h1 className="lx-h mt-8" style={{ fontSize: "clamp(40px, 5.4vw, 68px)", maxWidth: "14ch" }}>
          Connect to enter
        </h1>
        <p className="lx-sub mt-5 max-w-md" style={{ fontSize: "clamp(16px, 1.4vw, 19px)", lineHeight: 1.55, textWrap: "pretty" }}>
          Your positions, your DCA plans and the live detector unlock once your wallet is connected on {CHAIN_NAME}.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => (
              <button type="button" className="lx-btn lx-btn-primary" onClick={openConnectModal} disabled={!mounted} style={{ minHeight: 52, padding: "0 28px" }}>
                Connect wallet
              </button>
            )}
          </ConnectButton.Custom>
          <Link to="/" className="lx-btn lx-btn-secondary" style={{ minHeight: 52 }}>
            <Icon name="arrowRight" size={15} className="rotate-180" aria-hidden="true" /> Back to home
          </Link>
        </div>

        <p className="lx-sub mt-8 inline-flex items-center gap-2" style={{ fontSize: 14 }}>
          <span style={{ color: "var(--green-label)" }} aria-hidden="true"><Icon name="lock" size={15} /></span>
          Non-custodial · your keys never leave your wallet · read-only until you sign
        </p>
      </main>
    </div>
  );
}
