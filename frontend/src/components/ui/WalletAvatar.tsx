import Avatar from "boring-avatars";
import type { AvatarComponent } from "@rainbow-me/rainbowkit";

/**
 * A generated avatar per wallet (boring-avatars, MIT), drawn from the app's own palette so every
 * address gets a distinct face that still belongs to the theme. Same address, same face, everywhere:
 * the Dashboard and RainbowKit's account button and modal both use it.
 */
const PALETTE = ["#8e88d8", "#e6b25f", "#6bb89a", "#e58ca0", "#c5c1ed"];

export function WalletAvatar({ address, size = 40, square = false }: { address: string; size?: number; square?: boolean }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0" style={{ width: size, height: size, borderRadius: square ? Math.round(size * 0.3) : 999, overflow: "hidden" }}>
      <Avatar name={address.toLowerCase()} variant="beam" colors={PALETTE} size={size} square />
    </span>
  );
}

export const RainbowAvatar: AvatarComponent = ({ address, ensImage, size }) =>
  ensImage ? (
    <img src={ensImage} width={size} height={size} alt="" style={{ borderRadius: 999 }} />
  ) : (
    <WalletAvatar address={address} size={size} />
  );
