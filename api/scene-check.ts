// Gemini's second opinion on an emergency alert, server side. When the tracker's "Are you OK?"
// countdown runs out (nobody pressed I'm OK), the page sends one still picture here; this asks
// Google Gemini what it sees ("A person is lying on the kitchen floor next to a chair."), and the
// emergency call reads that sentence out. It never cancels an alert or a call: it only adds words.
//
// The Gemini key is a server setting (GEMINI_API_KEY in .env.local on the PC running the dev
// server, or the hosting's environment variables), never in the page. Requests ask Google not to
// store them (store: false). On Gemini's free tier, Google may still use what it's sent to
// improve its products and people may review it, so real use needs the paid tier.
//
// Runs in two places: Vercel serves this file at /api/scene-check, and the dev server
// (vite.config.ts) answers the same address with handleSceneCheck below.
// Self-contained on purpose (no imports), so the hosting can run it as it is.
//
// Like the call, every answer to the page is 200 (or 400 for a bad request) with the outcome
// inside, because the phone test link goes through Cloudflare, which hides 502s. Only signed-in
// CareNest accounts can use it where the server has Supabase settings.

/** The server settings this needs. */
export interface SceneEnv {
  /** From Google AI Studio (aistudio.google.com -> Get API key). */
  GEMINI_API_KEY?: string;
  /** Optional: another Gemini model than the default. */
  GEMINI_MODEL?: string;
  /** The site's Supabase project (the same settings the page uses). When set, checks need a signed-in account. */
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export type SceneKind = "fall" | "seizure" | "test";

/** A request, reduced to what's needed. */
export interface SceneRequest {
  method: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface SceneReply {
  status: number;
  body: Record<string, unknown>;
}

/** Fast, and good at describing pictures (from Google's model list, Oct 2026). */
export const DEFAULT_MODEL = "gemini-3.8-flash";
export const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
/** At most one check this often, and this many a day, so a public page can't run up the bill. */
export const CHECK_GAP_MS = 10_000;
export const CHECKS_PER_DAY = 50;
/** A 640-pixel JPEG is about 60-150 kB as text; this leaves plenty of room. */
const MAX_IMAGE_CHARS = 2_000_000;
const recent: number[] = [];

/** Forgets the checks made so far (for tests). */
export function resetSceneLimits(): void {
  recent.length = 0;
}

function isKind(k: unknown): k is SceneKind {
  return k === "fall" || k === "seizure" || k === "test";
}

/** What Gemini must answer with (its "structured output"). */
export const SCENE_SCHEMA = {
  type: "object",
  properties: {
    person_visible: { type: "boolean", description: "Is a person visible in the picture?" },
    on_floor: { type: "boolean", description: "Is a person lying or sitting on the floor (not on a bed, sofa or chair)?" },
    looks_hurt: {
      type: "string",
      enum: ["yes", "no", "unsure"],
      description: "Does the person appear hurt, in distress or unresponsive?",
    },
    summary: {
      type: "string",
      description:
        "One calm, factual sentence of at most 20 words for a family member hearing it over the phone, e.g. 'A person is lying on the kitchen floor next to a chair.'",
    },
  },
  required: ["person_visible", "on_floor", "looks_hurt", "summary"],
} as const;

const SYSTEM_INSTRUCTION =
  "You look at one photo from a home safety camera, taken when its fall detector raised an alert. " +
  "Describe only what you can see: where the person is, their position, and anything nearby that matters. " +
  "Never name or identify anyone, never guess a medical condition, and never give medical advice. " +
  "If the picture is dark, blurry or shows nobody, say that plainly.";

function prompt(kind: SceneKind): string {
  if (kind === "test") return "This is a rehearsal of the alert. Describe what the camera sees.";
  const what = kind === "fall" ? "may have fallen" : "may be having a seizure (shaking while lying down)";
  return `The camera's detector thinks the person it watches ${what}. Describe what the camera sees.`;
}

/** Keeps a summary short and plain: one line, no markup, at most 160 characters. */
export function cleanSummary(s: unknown): string {
  let t = String(s ?? "")
    .replace(/[\p{Cc}<>]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > 160) t = t.slice(0, 157).replace(/\s+\S*$/, "") + "...";
  if (t && !/[.!?]$/.test(t)) t += ".";
  return t;
}

function header(req: SceneRequest, name: string): string {
  const v = req.headers?.[name];
  return (Array.isArray(v) ? v[0] : v)?.split(",")[0].trim() ?? "";
}

/** Is the page signed in to CareNest? "not needed" where the server has no Supabase (no accounts). */
async function signInState(req: SceneRequest, env: SceneEnv, fetchFn: typeof fetch): Promise<"yes" | "no" | "unreachable" | "not needed"> {
  const url = env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return "not needed";
  const token = header(req, "authorization").match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return "no";
  try {
    const res = await fetchFn(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    return res.ok ? "yes" : "no";
  } catch {
    return "unreachable";
  }
}

/** The JSON text out of Gemini's answer: the model_output steps' text parts. */
function outputText(answer: unknown): string {
  const steps = (answer as { steps?: unknown })?.steps;
  if (!Array.isArray(steps)) return "";
  return steps
    .filter((s) => (s as { type?: unknown })?.type === "model_output")
    .flatMap((s) => {
      const content = (s as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .filter((c) => (c as { type?: unknown })?.type === "text")
    .map((c) => String((c as { text?: unknown }).text ?? ""))
    .join("");
}

/**
 * GET: is Gemini set up (`ready`)? POST {kind, image}: `image` is a JPEG as base64 (no
 * "data:" prefix). The outcome is in `result`: "ok" (with `summary`, `onFloor`, `looksHurt`,
 * `personVisible`), "off" (no Gemini key on the server) or "failed" (with `error`, in words).
 */
export async function handleSceneCheck(
  req: SceneRequest,
  env: SceneEnv,
  opts: { now?: number; fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<SceneReply> {
  const key = env.GEMINI_API_KEY?.trim();
  const fetchFn = opts.fetch ?? fetch;
  if (req.method === "GET") {
    const signIn = await signInState(req, env, fetchFn);
    return { status: 200, body: { ready: !!key, needsSignIn: signIn === "no" || signIn === "unreachable" } };
  }
  if (req.method !== "POST") return { status: 405, body: { error: "Use GET or POST." } };

  const body = (req.body ?? {}) as { kind?: unknown; image?: unknown };
  if (!isKind(body.kind)) return { status: 400, body: { error: "Unknown alert kind." } };
  const image = typeof body.image === "string" ? body.image.replace(/^data:image\/jpeg;base64,/, "") : "";
  if (!image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/]+=*$/.test(image)) {
    return { status: 400, body: { error: "The picture is missing or isn't a JPEG." } };
  }
  if (!key) return { status: 200, body: { result: "off" } };

  const signIn = await signInState(req, env, fetchFn);
  if (signIn === "no") return { status: 200, body: { result: "failed", error: "Please sign in to CareNest on this phone first." } };
  if (signIn === "unreachable") {
    return { status: 200, body: { result: "failed", error: "Couldn't check the sign-in with the database. Is the internet on?" } };
  }

  const now = opts.now ?? Date.now();
  while (recent.length && now - recent[0] > 24 * 3600_000) recent.shift();
  if (recent.length && now - recent[recent.length - 1] < CHECK_GAP_MS) {
    return { status: 200, body: { result: "failed", error: "Gemini was asked a moment ago. Wait a few seconds." } };
  }
  if (recent.length >= CHECKS_PER_DAY) return { status: 200, body: { result: "failed", error: `Already ${CHECKS_PER_DAY} checks today: that's the limit.` } };
  recent.push(now);

  const request = {
    model: env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    store: false,
    system_instruction: SYSTEM_INSTRUCTION,
    input: [
      { type: "text", text: prompt(body.kind) },
      { type: "image", data: image, mime_type: "image/jpeg" },
    ],
    response_format: { type: "text", mime_type: "application/json", schema: SCENE_SCHEMA },
    generation_config: { thinking_level: "low", max_output_tokens: 400 },
  };

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), opts.timeoutMs ?? 12_000);
  try {
    const res = await fetchFn(GEMINI_URL, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: stop.signal,
    });
    let answer: unknown = null;
    try {
      answer = await res.json();
    } catch {
      // not JSON: handled below
    }
    if (!res.ok) {
      const message = String((answer as { error?: { message?: unknown } } | null)?.error?.message ?? "").slice(0, 200);
      console.log(`[scene-check] ${body.kind}: Gemini said no (${res.status})`);
      return { status: 200, body: { result: "failed", error: message || `Gemini said no (status ${res.status}).` } };
    }
    const text = outputText(answer).trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    let parsed: { person_visible?: unknown; on_floor?: unknown; looks_hurt?: unknown; summary?: unknown };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      return { status: 200, body: { result: "failed", error: "Gemini's answer wasn't in the expected form." } };
    }
    const summary = cleanSummary(parsed.summary);
    if (!summary) return { status: 200, body: { result: "failed", error: "Gemini didn't describe the picture." } };
    const looksHurt = parsed.looks_hurt === "yes" || parsed.looks_hurt === "no" ? parsed.looks_hurt : "unsure";
    console.log(`[scene-check] ${body.kind}: Gemini described the picture`);
    return {
      status: 200,
      body: { result: "ok", summary, personVisible: parsed.person_visible === true, onFloor: parsed.on_floor === true, looksHurt },
    };
  } catch {
    return { status: 200, body: { result: "failed", error: "Couldn't reach Gemini in time." } };
  } finally {
    clearTimeout(timer);
  }
}

// ---- Vercel ----

function serverEnv(): SceneEnv {
  return (globalThis as { process?: { env?: SceneEnv } }).process?.env ?? {};
}

function toResponse(r: SceneReply): Response {
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

function headersOf(request: Request): Record<string, string> {
  return Object.fromEntries(request.headers.entries());
}

export async function GET(request: Request): Promise<Response> {
  return toResponse(await handleSceneCheck({ method: "GET", headers: headersOf(request) }, serverEnv()));
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // not JSON: handleSceneCheck answers 400
  }
  return toResponse(await handleSceneCheck({ method: "POST", headers: headersOf(request), body }, serverEnv()));
}
