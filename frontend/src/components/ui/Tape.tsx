import { AnimatePresence, motion } from "framer-motion";
import type { SwapRow } from "@/lib/db";
import { fmtNum, fmtUsd } from "@/lib/format";

function ago(ts?: string) {
  if (!ts) return "now";
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

export function Tape({ rows }: { rows: SwapRow[] }) {
  return (
    <div className="card-quiet overflow-hidden">
      <div className="flex justify-between items-center px-5 py-3.5" style={{ borderBottom: "1px solid var(--divider)" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--text-3)" }}>Trade tape</span>
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 700, color: "var(--green-label)" }}>
          <span className="anim-pulse-dot" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--up)" }} />
          live
        </span>
      </div>
      <div className="grid px-5 py-2" style={{ gridTemplateColumns: "52px 1fr 1fr 44px", fontSize: 10, fontWeight: 700, color: "var(--faint)", borderBottom: "1px solid var(--divider-2)" }}>
        <span>side</span>
        <span className="text-right">price</span>
        <span className="text-right">size</span>
        <span className="text-right">ago</span>
      </div>
      <div style={{ maxHeight: 250, overflowY: "auto" }}>
        {rows.length === 0 && (
          <div className="px-5 py-6 text-center" style={{ fontSize: 12, color: "var(--faint)" }}>
            No trades yet — be the first to swap.
          </div>
        )}
        <AnimatePresence initial={false}>
          {rows.map((t) => {
            const buy = t.side === "buy_weth";
            return (
              <motion.div
                key={t.tx_hash}
                initial={{ opacity: 0, backgroundColor: buy ? "rgba(107,184,154,.16)" : "rgba(229,140,160,.16)" }}
                animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }}
                transition={{ duration: 0.9 }}
                className="grid items-center px-5 py-2"
                style={{ gridTemplateColumns: "52px 1fr 1fr 44px", fontSize: 12, borderBottom: "1px solid var(--divider-2)" }}
              >
                <span style={{ color: buy ? "var(--up)" : "var(--down)", fontWeight: 800 }}>{buy ? "buy" : "sell"}</span>
                <span className="text-right" style={{ color: "var(--text-2)", fontWeight: 600 }}>{fmtUsd(t.price)}</span>
                <span className="text-right" style={{ color: "var(--text-3)" }}>{fmtNum(buy ? t.amount_out : t.amount_in, 3)} WETH</span>
                <span className="text-right" style={{ color: "var(--faint)", fontSize: 11 }}>{ago(t.ts)}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
