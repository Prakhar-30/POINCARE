import { useConnectModal } from "@rainbow-me/rainbowkit";

/**
 * The button a signed-out visitor sees where an action would be.
 *
 * The app is open to browse without a wallet: prices, charts, quotes and the detector all read
 * from public RPC. Only signing needs a wallet, so the request to connect sits exactly where the
 * action is (the swap button, the deposit button), in the same size and place as the button it
 * stands in for, and names what connecting unlocks. Nothing is blurred or locked behind it.
 */
export function ConnectCta({ label = "Connect wallet", size = "lg", block = true }: { label?: string; size?: "lg" | "sm"; block?: boolean }) {
  const { openConnectModal } = useConnectModal();
  return (
    <button type="button" onClick={() => openConnectModal?.()} className={`btn btn-primary btn-${size}${block ? " btn-block" : ""}`}>
      {label}
    </button>
  );
}
