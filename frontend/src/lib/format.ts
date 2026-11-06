export const fmtUsd = (n: number, opts: { compact?: boolean; dp?: number } = {}) => {
  const { compact = false, dp } = opts;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: dp ?? (compact ? 2 : 0),
  }).format(n);
};

export const fmtNum = (n: number, dp = 2) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: dp, minimumFractionDigits: 0 }).format(n);

const pctFmts = new Map<number, Intl.NumberFormat>();
export const fmtPct = (frac: number, dp = 2) => {
  let f = pctFmts.get(dp);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: dp, maximumFractionDigits: dp });
    pctFmts.set(dp, f);
  }
  return f.format(frac);
};

export const shorten = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");
