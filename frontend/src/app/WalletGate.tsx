import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router-dom";
import { CHAIN_NAME } from "@/config/contracts";
import { Mark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const INSIDE = [
  { n: "01", title: "Watch the detector live", body: "CUSUM evidence, regime and lean, every block." },
  { n: "02", title: "Swap WETH / USDC", body: "See what a normal pool would have charged you." },
  { n: "03", title: "Provide liquidity", body: "Earn the directional spread instead of leaking it." },
];

/** Shown on /app until a wallet is connected. The wallet list and connect flow are
 *  RainbowKit's own modal; this page only frames it and opens it. */
export function WalletGate() {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2" style={{ background: "var(--surface)" }}>
      {/* connect */}
      <div className="flex flex-col px-6 sm:px-12 py-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" style={{ color: "var(--text)" }}>
            <Mark size={28} />
            <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-.01em" }}>Poincaré</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex-1 flex flex-col justify-center w-full mx-auto py-12" style={{ maxWidth: 420, gap: 28 }}>
          <div className="flex flex-col gap-3">
            <h1 className="m-0" style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-.03em", color: "var(--text)" }}>
              Connect a wallet
            </h1>
            <p className="m-0" style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-2)" }}>
              The dashboard, your positions and the live detector unlock once you connect on{" "}
              <span style={{ fontWeight: 600, color: "var(--text)" }}>{CHAIN_NAME}</span>. Test tokens are free once you're in.
            </p>
          </div>

          <ConnectButton.Custom>
            {({ openConnectModal, connectModalOpen, mounted }) => (
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={openConnectModal}
                disabled={!mounted || connectModalOpen}
                style={{ height: 52, fontSize: 16 }}
              >
                {connectModalOpen ? "Choose a wallet…" : "Connect wallet"}
                <Icon name="arrowRight" size={17} />
              </button>
            )}
          </ConnectButton.Custom>

          <div className="flex gap-3" style={{ padding: "14px 16px", borderRadius: "var(--r-md)", background: "var(--page)", fontSize: 13, lineHeight: 1.55, color: "var(--text-2)" }}>
            <span style={{ color: "var(--lav-deep)", flexShrink: 0, marginTop: 1 }}><Icon name="lock" size={17} /></span>
            <span>Non-custodial. We never see your keys, and nothing is signed until you confirm it in your wallet.</span>
          </div>
        </div>

        <Link to="/" className="inline-flex items-center gap-1.5 self-start" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-3)" }}>
          <Icon name="arrowRight" size={14} className="rotate-180" /> Back to home
        </Link>
      </div>

      {/* context */}
      <div className="hidden lg:flex flex-col justify-center px-12" style={{ background: "var(--ink)", color: "var(--ink-text)", gap: 32 }}>
        <div className="eyebrow" style={{ color: "#c2bcf5" }}>What you can do inside</div>
        <div style={{ border: "1px solid var(--ink-border)", borderRadius: "var(--r-xl)", overflow: "hidden", maxWidth: 480 }}>
          {INSIDE.map((it, i) => (
            <div key={it.n} className="flex gap-4" style={{ padding: "22px 24px", borderTop: i ? "1px solid var(--ink-border)" : undefined }}>
              <span className="num" style={{ color: "var(--lav)" }}>{it.n}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{it.title}</div>
                <div style={{ fontSize: 14, color: "var(--ink-text-2)", marginTop: 4 }}>{it.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2" style={{ fontSize: 13, color: "var(--ink-text-2)", maxWidth: 480 }}>
          <span className="inline-flex items-center gap-2"><Icon name="check" size={14} /> UHI10 hookathon winner</span>
          <span className="inline-flex items-center gap-2"><Icon name="shield" size={14} /> Olympix review · 9/9 fixed</span>
        </div>
      </div>
    </div>
  );
}
