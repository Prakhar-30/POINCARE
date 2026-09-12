/**
 * `explain` — the Detector Lab's narration endpoint.
 *
 * Turns the detector's numbers into a plain-English read. It exists as an edge
 * function for two reasons, both structural rather than incidental:
 *
 *  1. The Gemini key must never reach the browser. Anything a Vite app can read
 *     at runtime is in the bundle, so the call has to happen server-side.
 *  2. Generation is metered by a free tier. The same question has the same
 *     answer — a given block's regime, a given configuration's comparison — so
 *     every note is written to `ai_notes` once and served from cache after. The
 *     cache IS the rate-limit strategy; the cooldown below is only the backstop
 *     for a burst of genuine cache misses.
 *
 * The model is never asked to predict a price or advise a trade. It is given
 * numbers this pool already computed on-chain and asked to say what they mean —
 * which is a summarising job, and the only one it is allowed to fail at, because
 * the client carries a deterministic fallback narrator for when it does.
 *
 * Deploy:
 *   supabase functions deploy explain --no-verify-jwt
 *   supabase secrets set GEMINI_API_KEY=...   # optionally GEMINI_MODEL=...
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Overridable by the GEMINI_MODEL secret, which is the right lever when Google
// retires a model: the secret takes effect without redeploying the function.
// gemini-2.5-flash was retired for new projects and the API names this as its
// replacement, so it is the default rather than the newest available model.
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.6-flash";
const API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

/**
 * Namespace for every cached note this version of the function writes.
 *
 * The cache key is the question, so an answer written once is served forever and
 * there is otherwise no way to invalidate one short of deleting rows by hand.
 * Bumping this retires the whole previous generation at once. Bump it whenever
 * the output would change for the same question: a prompt edit, a length or
 * formatting change, a model family change.
 *
 * v2: raised the token ceiling after v1 answers were truncated mid-sentence by
 * Gemini 3.x thought tokens counting against it.
 */
const CACHE_VERSION = "v2";

/** Minimum seconds between live generations per (hook, kind). Cache hits ignore it. */
const COOLDOWN_S = 20;
/**
 * Token ceiling for a generation.
 *
 * Deliberately far above what three sentences need. Gemini 3.x reasons before it
 * answers and those thought tokens count against this same budget, so a limit
 * sized to the visible answer gets spent on reasoning and the reply is truncated
 * mid-sentence. The prompt constrains the length; this only stops a runaway.
 */
const MAX_OUTPUT_TOKENS = 2048;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

/**
 * Reduce the client's payload to plain scalars before it reaches the prompt.
 *
 * The facts are numbers computed by the client from on-chain data, but "computed
 * by the client" means "chosen by whoever is calling", so strings are truncated,
 * nesting is bounded, and anything else is dropped. A caller cannot smuggle
 * instructions in through a field the prompt then interpolates.
 */
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 3) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 120).replace(/[\r\n]+/g, " ");
  if (Array.isArray(value)) return value.slice(0, 24).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value).slice(0, 40)) {
      if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return null;
}

const SYSTEM = `You explain the internal state of Poincaré, a Uniswap v4 pool that runs a
two-sided CUSUM quickest-change detector on its own price and charges a directional spread
(kappa) on the side of a swap that pushes WITH a detected trend. Counter-trend and calm-market
flow pay no spread.

How to read the numbers you are given:
- s_pos / s_neg are the two one-sided CUSUM statistics: accumulated evidence of a sustained
  move. A trend is declared only when one crosses the threshold h.
- D is directional efficiency in [0,1]: net displacement over total variation. Near 1 the price
  marched one way; near 0 it moved a lot and went nowhere. If D is below dFloor, evidence is
  gated to zero no matter how high the statistic is.
- kappa is the spread currently charged to with-trend flow. Zero means the pool is quoting a
  symmetric constant-product curve.
- sigma is the pool's live volatility estimate; the base fee is derived from it.

Rules:
- Explain what the detector is doing and WHY, referring to the actual numbers.
- Never predict a price, never suggest a trade, never give financial advice.
- No preamble, no headings, no bullet points, no markdown. Plain prose.
- At most 3 sentences. Be specific and concrete over general.`;

const TASK: Record<string, string> = {
  regime:
    "Describe the pool's CURRENT regime: what the detector sees right now, whether it is " +
    "engaged or holding back, and which side (if any) is paying a spread.",
  lab:
    "Compare a candidate detector configuration against the pool's live one, replayed over " +
    "the same real block history. Say what the candidate changes in practice — how much more " +
    "or less often it fires, and whether that is picking up real trends or reacting to chop.",
};

async function generate(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
    },
  );

  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p: { text?: string }) => p?.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("gemini returned no text");

  // A truncated answer must never reach the cache. The cache key is the question,
  // so a half-sentence written once would be served as the answer forever, and the
  // local narration it falls back to is a better answer than a cut-off one.
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(`gemini stopped early: ${candidate.finishReason}`);
  }
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: { kind?: string; hook?: string; cacheKey?: string; facts?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const kind = String(body.kind ?? "");
  const hook = String(body.hook ?? "").toLowerCase();
  // Namespaced, so bumping CACHE_VERSION retires every previously cached answer
  // without touching the table.
  const cacheKey = `${CACHE_VERSION}:${String(body.cacheKey ?? "").slice(0, 120)}`;

  if (!TASK[kind]) return json({ error: "unknown kind" }, 400);
  if (!/^0x[0-9a-f]{40}$/.test(hook)) return json({ error: "bad hook" }, 400);
  if (!body.cacheKey) return json({ error: "missing cacheKey" }, 400);

  // 1. Cache: the same question always resolves here after the first asking.
  const cached = await admin
    .from("ai_notes")
    .select("body, model, created_at")
    .eq("hook", hook)
    .eq("kind", kind)
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cached.data) {
    return json({ body: cached.data.body, model: cached.data.model, cached: true });
  }

  if (!API_KEY) return json({ error: "not configured", fallback: true }, 503);

  // 2. Cooldown: a burst of genuine misses must not drain the daily free-tier
  //    budget. The client renders its own deterministic narration instead.
  const recent = await admin
    .from("ai_notes")
    .select("created_at")
    .eq("hook", hook)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent.data) {
    const age = (Date.now() - new Date(recent.data.created_at).getTime()) / 1000;
    if (age < COOLDOWN_S) return json({ error: "cooling down", fallback: true }, 429);
  }

  // 3. Generate, persist, return.
  const prompt = `${TASK[kind]}\n\nData:\n${JSON.stringify(sanitize(body.facts), null, 1)}`;

  let text: string;
  try {
    text = await generate(prompt);
  } catch (e) {
    console.error("generate failed", e);
    return json({ error: "generation failed", fallback: true }, 502);
  }

  const { error } = await admin
    .from("ai_notes")
    .insert({ hook, kind, cache_key: cacheKey, model: MODEL, body: text });
  // A duplicate means a concurrent request won the race; its note is equivalent.
  if (error && error.code !== "23505") console.warn("cache write failed", error.message);

  return json({ body: text, model: MODEL, cached: false });
});
