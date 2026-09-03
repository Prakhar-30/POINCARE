import { useAccount, useSwitchChain } from "wagmi";
import { ACTIVE_CHAIN_ID, CHAIN_NAME } from "@/config/contracts";
import { Icon } from "@/components/ui/Icon";

/**
 * Shown when the wallet is connected to a chain Poincaré is not deployed on.
 *
 * Reads go through wagmi's configured transport, so the dashboard renders live,
 * correct pool data no matter what the wallet is pointed at. Writes go through the
 * wallet, so they are the only thing that breaks — and they break late, after the
 * user has filled in an amount and hit Swap, with a chain-mismatch error from deep
 * inside viem. Say it up front instead, and offer the switch.
 */
export function WrongNetworkBanner() {
  const { isConnected, chain } = useAccount();
  const { switchChain, isPending } = useSwitchChain();

  // `chain` is undefined while the connector is still resolving; don't flash a warning.
  if (!isConnected || !chain || chain.id === ACTIVE_CHAIN_ID) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-center"
      style={{
        // No honey "soft" token exists; tint the honey accent so it reads in both themes.
        background: "color-mix(in srgb, var(--honey) 16%, var(--surface))",
        borderBottom: "1px solid var(--honey)",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text-2)",
      }}
    >
      <span className="inline-flex items-center gap-2">
        <Icon name="shield" size={15} />
        Your wallet is on <strong style={{ color: "var(--text)" }}>{chain.name}</strong>. Trading and
        liquidity need <strong style={{ color: "var(--text)" }}>{CHAIN_NAME}</strong>.
      </span>
      <button
        onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
        disabled={isPending}
        className="rounded-full px-3.5 py-1 font-bold transition-opacity"
        style={{
          background: "var(--lav)",
          color: "#fff",
          fontSize: 12.5,
          cursor: isPending ? "default" : "pointer",
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? "Switching…" : `Switch to ${CHAIN_NAME}`}
      </button>
    </div>
  );
}
