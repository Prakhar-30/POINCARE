/**
 * Real token glyphs for the WETH / USDC chips — the Ethereum diamond and the
 * USDC dollar disc, rendered inline so they theme with the rest of the UI.
 */
export function TokenIcon({ sym, size = 20 }: { sym: string; size?: number }) {
  const s = sym.toUpperCase();
  if (s === "WETH" || s === "ETH") {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-label="WETH" role="img">
        <circle cx="16" cy="16" r="16" fill="#627EEA" />
        <g fill="#fff" fillRule="nonzero">
          <path fillOpacity="0.6" d="M16.498 4v8.87l7.497 3.35z" />
          <path d="M16.498 4 9 16.22l7.498-3.35z" />
          <path fillOpacity="0.6" d="M16.498 21.968v6.027L24 17.616z" />
          <path d="M16.498 27.995v-6.028L9 17.616z" />
          <path fillOpacity="0.2" d="m16.498 20.573 7.497-4.353-7.497-3.348z" />
          <path fillOpacity="0.6" d="m9 16.22 7.498 4.353v-7.701z" />
        </g>
      </svg>
    );
  }
  // USDC
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="USDC" role="img">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        fill="#fff"
        d="M20.5 18.5c0-2.2-1.3-3-4-3.3-1.9-.25-2.3-.75-2.3-1.6 0-.85.6-1.4 1.8-1.4 1.1 0 1.7.37 2 1.3.06.18.23.3.42.3h1c.26 0 .46-.2.46-.45v-.06a3.2 3.2 0 0 0-2.9-2.6V9.4c0-.26-.2-.46-.5-.52h-.95c-.26 0-.46.2-.52.5v1.05c-1.9.25-3.1 1.5-3.1 3.07 0 2.08 1.26 2.92 3.96 3.22 1.78.3 2.34.7 2.34 1.67 0 .97-.85 1.63-2 1.63-1.57 0-2.1-.66-2.3-1.56-.05-.24-.24-.36-.42-.36h-1.06c-.25 0-.45.2-.45.45v.06c.25 1.5 1.2 2.57 3.3 2.87v1.06c0 .26.2.46.5.52h.95c.26 0 .46-.2.52-.5v-1.06c1.9-.3 3.16-1.6 3.16-3.27z"
      />
      <path
        fill="#fff"
        d="M13 25.05c-4.9-1.78-7.43-7.27-5.6-12.13a9.45 9.45 0 0 1 5.6-5.6c.25-.12.37-.3.37-.6v-.9c0-.25-.12-.43-.37-.5-.06 0-.18 0-.24.06A11.32 11.32 0 0 0 16 26.7c.25.12.5 0 .56-.25.06-.06.06-.12.06-.24v-.9c0-.18-.18-.42-.37-.55-.06.05-.18.05-.25-.05zM18.93 4.94c-.25-.12-.5 0-.56.25-.06.06-.06.12-.06.24v.9c0 .18.18.42.37.55a9.3 9.3 0 0 1 5.6 12.13 9.45 9.45 0 0 1-5.6 5.6c-.25.12-.37.3-.37.6v.9c0 .25.12.43.37.5.06 0 .18 0 .25-.06A11.32 11.32 0 0 0 18.93 4.94z"
      />
    </svg>
  );
}
