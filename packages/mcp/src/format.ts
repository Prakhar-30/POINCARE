import type { Regime } from "@poincaretrade/sdk";

/** Deep-convert bigints to decimal strings so a value is JSON-safe for MCP clients. */
export function jsonSafe<T>(v: T): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]));
  return v;
}

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export function ok(data: Record<string, unknown>): ToolResult {
  const safe = jsonSafe(data) as Record<string, unknown>;
  return { content: [{ type: "text", text: JSON.stringify(safe, null, 2) }], structuredContent: safe };
}

export function fail(err: unknown): ToolResult {
  const message =
    err instanceof Error && err.name === "DcaNotDeployedError"
      ? "The DCA contract address is not configured: set POINCARE_DCA_ADDRESS in the MCP server's environment."
      : err instanceof Error
        ? err.message
        : String(err);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

const pct = (x: number, dp = 2) => `${(x * 100).toFixed(dp)}%`;

/** One plain-English line an agent can relay as-is. */
export function describeRegime(r: Regime): string {
  const trend =
    r.trend === "none"
      ? "No confirmed trend"
      : `Confirmed ${r.trend}-trend (${r.withTrendSide === "buy" ? "buyers" : "sellers"} push with it)`;
  const charge =
    r.chargedSide === null
      ? "no side pays a trend spread right now"
      : `${r.chargedSide === "buy" ? "buys" : "sells"} pay a ${pct(r.spread[r.chargedSide])} spread to LPs and ${r.chargedSide === "buy" ? "sells" : "buys"} trade free`;
  const ev = `evidence ${Math.round(r.evidence.progress * 100)}% of the threshold${r.gated ? " (gated: moves read as chop)" : ""}`;
  return `${trend}; ${charge}; ${ev}. Mid price ${r.price.toFixed(2)} USDC per WETH, base fee ${pct(r.fee)}.`;
}
