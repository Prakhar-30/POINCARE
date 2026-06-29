import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import { Mark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

/** Shown on /app until a wallet is connected — the dashboard only exists for a connected user. */
export function WalletGate() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "var(--app-bg)" }}>
      <div className="anim-floaty">
        <Mark size={64} />
      </div>
      <h1 className="font-display mt-7" style={{ fontWeight: 700, fontSize: 30, color: "var(--text)" }}>
        Connect to enter
      </h1>
      <p className="mt-3 max-w-md" style={{ color: "var(--text-3)", fontSize: 15, lineHeight: 1.65 }}>
        The Poincaré dashboard, your positions and the live detector unlock once your wallet is connected
        on <span style={{ color: "var(--text-2)", fontWeight: 700 }}>Unichain Sepolia</span>.
      </p>

      <div className="mt-8">
        <ConnectButton label="Connect wallet" showBalance={false} />
      </div>

      <div className="mt-7 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <Icon name="lock" size={14} />
        Non-custodial · we never see your keys · read-only until you sign
      </div>

      <Link to="/" className="mt-10 flex items-center gap-1.5 text-sm font-bold transition-colors hover:text-lav" style={{ color: "var(--text-3)" }}>
        <Icon name="arrowRight" size={15} className="rotate-180" />
        Back to home
      </Link>
    </div>
  );
}
