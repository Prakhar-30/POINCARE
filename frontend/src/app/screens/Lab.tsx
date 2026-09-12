import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useSearchParams } from "react-router-dom";

import { useDetectorConfig } from "@/hooks/useDetectorConfig";
import { useDetectorSeries } from "@/hooks/useDetectorSeries";
import { useLabReplay } from "@/hooks/useLabReplay";
import { useExplain } from "@/hooks/useExplain";
import { fetchLabConfig, saveLabConfig } from "@/lib/db";
import { fallbackLab, labFactsOf, type ConfigInput } from "@/lib/narrate";
import type { Parity } from "@/lib/replay";
import { Icon } from "@/components/ui/Icon";
import { AiNote } from "@/components/ui/AiNote";
import { ParamSlider } from "@/components/ui/ParamSlider";
import { ReplayChart } from "@/components/ui/ReplayChart";
import { useIsNarrow } from "@/hooks/useMediaQuery";

/** Significant-figure formatting; detector parameters span several orders of magnitude. */
const sig = (v: number, n = 3) => {
  if (v === 0) return "0";
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toPrecision(n).replace(/0+$/, "").replace(/\.$/, "");
};
const pct1 = (v: number) => `${(v * 100).toFixed(2)}%`;

/**
 * The σ-unit calibration derived from a year of real ETH/USDC returns
 * (analysis/CALIBRATION.md; README §9.1). Switching a pool deployed in absolute
 * mode over to the adaptive detector changes what `k` and `h` MEAN — multiples of
 * the live σ̂ rather than absolute log-returns — so the sliders snap to the
 * measured calibration rather than carrying meaningless absolute values across.
 */
const SIGMA_UNITS = { k: 0.25, h: 6.25, sMax: 12.5 };

export function Lab() {
  const cfg = useDetectorConfig();
  const series = useDetectorSeries();
  const { address } = useAccount();
  const narrow = useIsNarrow();
  const [searchParams, setSearchParams] = useSearchParams();

  const [candidate, setCandidate] = useState<ConfigInput | null>(null);
  const [fresh, setFresh] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "saving" | "copied">("idle");
  /** Absolute-mode values parked while the adaptive toggle is on, so it round-trips. */
  const [parked, setParked] = useState<Pick<ConfigInput, "k" | "h" | "sMax"> | null>(null);

  const liveInput: ConfigInput | null = useMemo(
    () =>
      cfg.loading || cfg.h === 0
        ? null
        : {
            k: cfg.k,
            h: cfg.h,
            sMax: cfg.sMax,
            lambda: cfg.lambda,
            dFloor: cfg.dFloor,
            kappaMax: cfg.kappaMax,
            dMax: cfg.dMax,
            adaptive: cfg.adaptive,
          },
    [cfg],
  );

  // Seed the sliders from the deployed configuration, or from a shared link.
  const shared = searchParams.get("lab");
  useEffect(() => {
    if (!liveInput || candidate) return;
    if (!shared) {
      setCandidate(liveInput);
      return;
    }
    let alive = true;
    void fetchLabConfig(shared).then((row) => {
      if (!alive) return;
      setCandidate(row ? ({ ...liveInput, ...row.params } as ConfigInput) : liveInput);
    });
    return () => {
      alive = false;
    };
  }, [liveInput, candidate, shared]);

  const active = candidate ?? liveInput;
  const replay = useLabReplay(series.points, cfg.params, active ?? ({} as ConfigInput), fresh);

  const set = <K extends keyof ConfigInput>(key: K, value: ConfigInput[K]) => {
    setCandidate((c) => (c ? { ...c, [key]: value } : c));
    setShareState("idle");
  };

  /** Toggling the detector mode rescales k/h/sMax; park the old values to return to. */
  const setAdaptive = (on: boolean) => {
    setCandidate((c) => {
      if (!c) return c;
      if (on) {
        setParked({ k: c.k, h: c.h, sMax: c.sMax });
        return { ...c, adaptive: true, ...SIGMA_UNITS };
      }
      const back = parked ?? { k: liveInput!.k, h: liveInput!.h, sMax: liveInput!.sMax };
      return { ...c, adaptive: false, ...back };
    });
    setShareState("idle");
  };

  const share = async () => {
    if (!active) return;
    setShareState("saving");
    const slug = await saveLabConfig(active as unknown as Record<string, number | boolean>, undefined, address);
    if (!slug) {
      setShareState("idle");
      return;
    }
    setSearchParams({ lab: slug }, { replace: true });
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareState("copied");
    } catch {
      setShareState("idle"); // clipboard denied; the URL is still updated and shareable
    }
  };

  // The comparison narration is manual: a slider drag would otherwise fire a
  // request per frame, and the free-tier budget is a real constraint.
  const facts = useMemo(
    () =>
      active && liveInput
        ? labFactsOf(
            { metrics: replay.liveMetrics, cfg: liveInput },
            { metrics: replay.candidateMetrics, cfg: active },
            series.points,
          )
        : null,
    [active, liveInput, replay.liveMetrics, replay.candidateMetrics, series.points],
  );

  const cacheKey = useMemo(() => {
    if (!active || !replay.ready) return null;
    const p = [active.k, active.h, active.sMax, active.lambda, active.dFloor, active.kappaMax, active.dMax]
      .map((v) => sig(v, 4))
      .join(",");
    return `${p}|${active.adaptive ? "adaptive" : "absolute"}|${series.points.length}`;
  }, [active, replay.ready, series.points.length]);

  const explained = useExplain({
    kind: "lab",
    cacheKey,
    facts,
    fallback: facts ? fallbackLab(facts) : "Adjust a parameter to compare it against the deployed detector.",
  });

  if (!active) {
    return (
      <div className="px-4 sm:px-6 py-16 text-center" style={{ fontSize: 12, color: "var(--faint)" }}>
        Reading the deployed detector configuration…
      </div>
    );
  }

  const changed =
    liveInput &&
    (Object.keys(active) as (keyof ConfigInput)[]).some((key) => active[key] !== liveInput[key]);

  return (
    <div className="px-4 sm:px-6 pb-10 pt-5 flex flex-col" style={{ gap: 18 }}>
      <div className="card grain overflow-hidden">
        <div
          className="flex items-center justify-between gap-2 flex-wrap px-6 py-4"
          style={{ borderBottom: "1px solid var(--divider)" }}
        >
          <div className="flex items-center gap-2.5">
            <span style={{ color: "var(--honey-deep)" }}>
              <Icon name="target" size={18} />
            </span>
            <span className="font-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              Detector Lab
            </span>
            <span className="hidden md:inline" style={{ fontSize: 12, fontWeight: 600, color: "var(--faint)" }}>
              · retune the detector against this pool's real history
            </span>
          </div>
          <ParityBadge parity={replay.parity} fresh={fresh} />
        </div>

        <div
          className="grid gap-6 p-4 sm:p-6"
          style={{ gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,320px) minmax(0,1fr)" }}
        >
          {/* ---- controls ---- */}
          <div className="flex flex-col" style={{ gap: 14, minWidth: 0 }}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Preset label="Deployed" onClick={() => liveInput && setCandidate(liveInput)} />
              <Preset label="Twitchy" onClick={() => set("h", Math.max(active.h / 2.5, 1e-9))} />
              <Preset label="Patient" onClick={() => set("h", active.h * 2.5)} />
              <Preset label="No D-gate" onClick={() => set("dFloor", 0)} />
            </div>

            <ParamSlider
              symbol="k"
              label="slack"
              hint={`Drift ignored as noise, per sampled block${active.adaptive ? " (σ-units)" : ""}.`}
              value={active.k}
              liveValue={liveInput?.k ?? 0}
              min={0}
              max={Math.max((liveInput?.k ?? 0) * 4, active.adaptive ? 2 : 0.004)}
              step={Math.max((liveInput?.k ?? 0) * 4, active.adaptive ? 2 : 0.004) / 200}
              format={(v) => (active.adaptive ? `${sig(v)}σ` : sig(v))}
              onChange={(v) => set("k", v)}
            />

            <ParamSlider
              symbol="h"
              label="firing threshold"
              hint="Evidence needed to declare a trend. Higher fires less often but later."
              value={active.h}
              liveValue={liveInput?.h ?? 0}
              min={0}
              max={Math.max((liveInput?.h ?? 0) * 4, active.adaptive ? 15 : 0.05)}
              step={Math.max((liveInput?.h ?? 0) * 4, active.adaptive ? 15 : 0.05) / 200}
              format={(v) => (active.adaptive ? `${sig(v)}σ` : sig(v))}
              onChange={(v) => set("h", Math.min(v, active.sMax))}
            />

            <ParamSlider
              symbol="S_max"
              label="saturation"
              hint="Evidence level where the lean reaches its cap. Must stay above h."
              value={active.sMax}
              liveValue={liveInput?.sMax ?? 0}
              min={0}
              max={Math.max((liveInput?.sMax ?? 0) * 3, active.adaptive ? 30 : 0.1)}
              step={Math.max((liveInput?.sMax ?? 0) * 3, active.adaptive ? 30 : 0.1) / 200}
              format={(v) => (active.adaptive ? `${sig(v)}σ` : sig(v))}
              onChange={(v) => set("sMax", Math.max(v, active.h * 1.001))}
            />

            <ParamSlider
              symbol="λ"
              label="EWMA decay"
              hint={`Effective window ≈ ${active.lambda < 1 ? (1 / (1 - active.lambda)).toFixed(0) : "∞"} sampled blocks.`}
              value={active.lambda}
              liveValue={liveInput?.lambda ?? 0}
              min={0.5}
              max={0.995}
              step={0.005}
              format={(v) => v.toFixed(3)}
              onChange={(v) => set("lambda", v)}
            />

            <ParamSlider
              symbol="D_floor"
              label="directional gate"
              hint="Minimum directional efficiency before any evidence counts. This is what rejects chop."
              value={active.dFloor}
              liveValue={liveInput?.dFloor ?? 0}
              min={0}
              max={1}
              step={0.01}
              format={pct1}
              onChange={(v) => set("dFloor", v)}
            />

            <ParamSlider
              symbol="κ_max"
              label="max spread"
              hint="Hard cap on what with-trend flow can be charged. A security parameter on-chain."
              value={active.kappaMax}
              liveValue={liveInput?.kappaMax ?? 0}
              min={0}
              max={Math.max((liveInput?.kappaMax ?? 0) * 3, 0.02)}
              step={Math.max((liveInput?.kappaMax ?? 0) * 3, 0.02) / 200}
              format={pct1}
              onChange={(v) => set("kappaMax", v)}
            />

            <ParamSlider
              symbol="Δκ_max"
              label="rate limit"
              hint="Most κ can move in one block. Bounds the bid-ask seam."
              value={active.dMax}
              liveValue={liveInput?.dMax ?? 0}
              min={0}
              max={Math.max((liveInput?.dMax ?? 0) * 4, 0.004)}
              step={Math.max((liveInput?.dMax ?? 0) * 4, 0.004) / 200}
              format={pct1}
              onChange={(v) => set("dMax", v)}
            />

            <div className="flex flex-col gap-2 pt-1" style={{ borderTop: "1px solid var(--divider)" }}>
              <Toggle
                label="Adaptive (σ-normalized) detector"
                hint="v2 mode: thresholds in units of live volatility, so they breathe with the market."
                on={active.adaptive}
                onChange={setAdaptive}
              />
              <Toggle
                label="Replay from a cold start"
                hint="Ignore the chain's starting state and warm up from zero. Disables the parity check."
                on={fresh}
                onChange={setFresh}
              />
            </div>

            <button
              onClick={share}
              disabled={shareState === "saving"}
              className="rounded-xl px-3 py-2 flex items-center justify-center gap-2"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--surface)",
                background: shareState === "copied" ? "var(--up-deep)" : "var(--lav-deep)",
                opacity: shareState === "saving" ? 0.6 : 1,
              }}
            >
              <Icon name={shareState === "copied" ? "check" : "external"} size={14} />
              {shareState === "copied" ? "Link copied" : shareState === "saving" ? "Saving…" : "Share this calibration"}
            </button>
          </div>

          {/* ---- results ---- */}
          <div className="flex flex-col" style={{ gap: 14, minWidth: 0 }}>
            <ReplayChart
              live={replay.live}
              candidate={replay.candidate}
              liveH={cfg.h}
              candidateH={active.h}
              loading={series.loading}
            />

            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))" }}>
              <Compare
                label="firings"
                live={replay.liveMetrics.firings}
                cand={replay.candidateMetrics.firings}
                fmt={(v) => String(v)}
                lowerIsCalmer
              />
              <Compare
                label="blocks per firing"
                live={replay.liveMetrics.blocksPerFiring}
                cand={replay.candidateMetrics.blocksPerFiring}
                fmt={(v) => (v === null ? "never" : v.toFixed(0))}
              />
              <Compare
                label="time leaning"
                live={replay.liveMetrics.dutyCycle}
                cand={replay.candidateMetrics.dutyCycle}
                fmt={(v) => `${(v * 100).toFixed(0)}%`}
                lowerIsCalmer
              />
              <Compare
                label="peak spread"
                live={replay.liveMetrics.peakKappa}
                cand={replay.candidateMetrics.peakKappa}
                fmt={pct1}
              />
              <Compare
                label="chop rejected"
                live={replay.liveMetrics.gateSaves}
                cand={replay.candidateMetrics.gateSaves}
                fmt={(v) => `${v} blk`}
              />
              <Compare
                label="lean episodes"
                live={replay.liveMetrics.episodes.length}
                cand={replay.candidateMetrics.episodes.length}
                fmt={(v) => String(v)}
                lowerIsCalmer
              />
            </div>

            <AiNote
              explained={explained}
              title={changed ? "What this calibration changes" : "The deployed calibration"}
              onAsk={explained.ask}
            />

            <p style={{ fontSize: 10.5, lineHeight: 1.6, color: "var(--faint)" }}>
              Both series are replayed from the same recorded blocks using an exact port of{" "}
              <code>Cusum.sol</code>, <code>DirectionalSignal.sol</code> and <code>ControlLaw.sol</code>, so the only
              difference between them is the parameters. Counts are specific to this window and are not a forecast.
              The Huber clip is held at the deployed value: recorded returns are already clipped, and a wider clip
              cannot recover what the live hook discarded.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The correctness claim: replaying the deployed parameters lands on the real trace.
 *
 * Against samples carrying the verbatim event integers the replay is bit-exact
 * and this reads zero wei. Against older rows it falls back to the charting
 * floats, where a little round-trip error is expected — so the badge distinguishes
 * the two rather than calling both "matching".
 */
function ParityBadge({ parity, fresh }: { parity: Parity; fresh: boolean }) {
  const quiet = (label: string) => (
    <span
      className="rounded-full px-3 py-1.5"
      style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", background: "var(--surface-3)" }}
    >
      {label}
    </span>
  );

  if (fresh) return quiet("cold start · parity check off");
  if (parity.compared === 0) return quiet("awaiting samples");

  const exact = parity.maxEvidenceDriftWei === 0n && parity.trendsMatch;
  const detail = exact
    ? `Replaying the deployed parameters reproduces the on-chain trace exactly across ${parity.compared} blocks — zero wei of deviation on either CUSUM statistic.`
    : `Replayed across ${parity.compared} blocks; largest deviation ${parity.maxEvidenceDriftWei.toString()} wei` +
      (parity.exactInputs ? "." : ", from samples recorded before the exact-integer column existed.");

  return (
    <span
      className="flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: exact ? "var(--green-label)" : "var(--warn-label)",
        background: exact ? "var(--change-up-bg)" : "var(--warn-inner-bg)",
      }}
      title={detail}
    >
      <Icon name={exact ? "check" : "shield"} size={13} />
      {exact ? `matches chain to the wei · ${parity.compared} blocks` : `≈ matches chain · ${parity.compared} blocks`}
    </span>
  );
}

function Compare<T extends number | null>({
  label,
  live,
  cand,
  fmt,
  lowerIsCalmer = false,
}: {
  label: string;
  live: T;
  cand: T;
  fmt: (v: T) => string;
  lowerIsCalmer?: boolean;
}) {
  const same = live === cand;
  const more = live !== null && cand !== null && cand > live;
  // "Calmer" is not "better" — a quieter detector also protects less — so the
  // colour only encodes direction, never a verdict.
  const color = same ? "var(--text-2)" : lowerIsCalmer && more ? "var(--honey-deep)" : "var(--lav-deep)";

  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".4px", color: "var(--faint)", textTransform: "uppercase" }}>
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span style={{ fontSize: 16, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{fmt(cand)}</span>
        {!same && (
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--faint)" }}>from {fmt(live)}</span>
        )}
      </div>
    </div>
  );
}

function Preset({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2.5 py-1"
      style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-2)", background: "var(--surface-3)" }}
    >
      {label}
    </button>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-start gap-2.5 text-left">
      <span
        className="shrink-0 rounded-full"
        style={{
          width: 30,
          height: 17,
          marginTop: 1,
          background: on ? "var(--lav-deep)" : "var(--track)",
          position: "relative",
          transition: "background .18s ease",
        }}
      >
        <span
          className="absolute rounded-full"
          style={{
            width: 13,
            height: 13,
            top: 2,
            left: on ? 15 : 2,
            background: "var(--surface)",
            transition: "left .18s ease",
          }}
        />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="block" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-2)" }}>
          {label}
        </span>
        <span className="block" style={{ fontSize: 10.5, lineHeight: 1.5, color: "var(--faint)" }}>
          {hint}
        </span>
      </span>
    </button>
  );
}
