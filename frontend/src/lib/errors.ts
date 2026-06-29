/** Turn a raw viem/wallet error into a short, human sentence for a toast. */
export function humanizeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "Transaction failed");
  const m = raw.toLowerCase();

  if (m.includes("user rejected") || m.includes("user denied") || m.includes("rejected the request"))
    return "You rejected the request in your wallet.";
  if (m.includes("insufficient funds"))
    return "Not enough ETH to cover gas for this transaction.";
  if (m.includes("transfer amount exceeds balance") || m.includes("exceeds balance"))
    return "Your token balance is too low for this amount.";
  if (m.includes("exceeds allowance") || m.includes("insufficient allowance"))
    return "Token approval is too low. Approve again and retry.";
  if (m.includes("slippage") || m.includes("too little received") || m.includes("amountoutmin"))
    return "Price moved past your slippage limit. Try again.";
  if (m.includes("deadline"))
    return "The transaction deadline passed before it confirmed. Try again.";
  if (m.includes("nonce"))
    return "Wallet nonce is out of sync. Reset the account in your wallet and retry.";
  if (m.includes("intrinsic gas") || m.includes("gas required exceeds") || m.includes("out of gas"))
    return "Gas estimation failed. We set a manual limit — please retry.";
  if (m.includes("chain") && m.includes("mismatch"))
    return "Wrong network. Switch your wallet to Unichain Sepolia.";

  // first line, trimmed — viem stuffs the useful bit up front
  const first = raw.split("\n")[0].replace(/^Error:\s*/i, "").trim();
  return first.length > 140 ? first.slice(0, 140) + "…" : first || "Transaction failed.";
}
