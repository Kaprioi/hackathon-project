// The emergency call, server side. When the tracker page's alert goes off, it asks this to
// phone the emergency contact; this asks Twilio to make the call. When the contact answers,
// Twilio fetches what to say from this same address (?say=fall), which trial accounts allow
// (they refuse the words sent inside the call request). The Twilio keys and the contact's
// number are server settings (.env.local on the PC running the dev server, or the hosting's
// environment variables), never in the page.
//
// Runs in two places: Vercel serves this file at /api/emergency-call, and the dev server
// (vite.config.ts) answers the same address with handleEmergencyCall below.
// Self-contained on purpose (no imports), so the hosting can run it as it is.
//
// Every answer to the page is 200 (or 400 for a bad request), with the outcome inside: the
// phone test link goes through Cloudflare, which swaps 502 and 504 answers for its own page.

/** The server settings this needs. */
export interface CallEnv {
  /** From the Twilio console: the account's ID (starts with AC) and its secret key. */
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  /** The Twilio phone number that makes the call, like +15551234567. */
  TWILIO_FROM?: string;
  /** Who to call (the emergency contact), like +15557654321. On a trial, it must be verified in Twilio. */
  ALERT_CALL_TO?: string;
  /** Who's being watched, for the message ("Grandma"). */
  ALERT_PERSON_NAME?: string;
  /** This site's public address, if it can't be worked out from the request (rarely needed). */
  PUBLIC_URL?: string;
}

export type CallKind = "fall" | "seizure" | "test";

/** A request, reduced to what's needed. `url` may be a full address or just the path and query. */
export interface CallRequest {
  method: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/** The answer: JSON for the page, or (with `xml`) what Twilio should say. */
export interface CallReply {
  status: number;
  body: Record<string, unknown>;
  xml?: string;
}

/** Phone numbers in the international form Twilio needs: + country code, then the number. */
const PHONE = /^\+[1-9]\d{6,14}$/;
/** At most one call this often, and this many a day, so a public page can't run up calls. */
export const CALL_GAP_MS = 30_000;
export const CALLS_PER_DAY = 30;
const recent: number[] = [];
/** The last call attempt, so Settings can show how it went: when, which kind, and Twilio's answer. */
let last: { at: number; kind: CallKind; ok: boolean; error?: string } | null = null;

/** Forgets the calls made so far (for tests). */
export function resetCallLimits(): void {
  recent.length = 0;
  last = null;
}

function isKind(k: unknown): k is CallKind {
  return k === "fall" || k === "seizure" || k === "test";
}

function isReady(env: CallEnv): boolean {
  return setupProblem(env) === null && !!env.TWILIO_ACCOUNT_SID;
}

/** What's wrong with the settings, in plain words, or null if nothing (or nothing set at all). */
function setupProblem(env: CallEnv): string | null {
  if (!env.TWILIO_ACCOUNT_SID && !env.TWILIO_AUTH_TOKEN && !env.TWILIO_FROM && !env.ALERT_CALL_TO) return null;
  if (!/^AC\w{32}$/.test(env.TWILIO_ACCOUNT_SID ?? "")) return "TWILIO_ACCOUNT_SID should start with AC and be 34 characters.";
  if (!env.TWILIO_AUTH_TOKEN) return "TWILIO_AUTH_TOKEN is missing.";
  if (!PHONE.test(env.TWILIO_FROM ?? "")) return "TWILIO_FROM should look like +15551234567 (no spaces).";
  if (!PHONE.test(env.ALERT_CALL_TO ?? "")) return "ALERT_CALL_TO should look like +15551234567 (no spaces).";
  return null;
}

/** What the call says. */
export function callMessage(kind: CallKind, name?: string): string {
  const who = name?.trim() || "Your family member";
  if (kind === "test") return "This is a test call from CareNest. Calls like this will tell you when someone may need help. No action is needed.";
  const what = kind === "fall" ? "may have fallen and isn't getting up" : "may be having a seizure";
  return `This is a CareNest alert. ${who} ${what}. Please check on them right away.`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

/** Twilio's instructions for the call: say the message, pause, say it again. */
export function callScript(text: string): string {
  const say = `<Say>${escapeXml(text)}</Say>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${say}<Pause length="1"/>${say}</Response>`;
}

/** Hides phone numbers in a message that goes back to the page. */
function hideNumbers(s: string): string {
  return s.replace(/\+?\d[\d\s().-]{5,}\d/g, "(number hidden)");
}

function header(req: CallRequest, name: string): string {
  const v = req.headers?.[name];
  return (Array.isArray(v) ? v[0] : v)?.split(",")[0].trim() ?? "";
}

/**
 * This site's public address, for Twilio to fetch the words from: PUBLIC_URL if set, else the
 * address the request came in on (through the tunnel or the hosting). Null for a local-only
 * address (Twilio can't reach localhost).
 */
export function publicBase(req: CallRequest, env: CallEnv): string | null {
  let base = env.PUBLIC_URL?.trim().replace(/\/+$/, "") ?? "";
  if (!base) {
    const host = header(req, "x-forwarded-host") || header(req, "host") || (req.url?.startsWith("http") ? new URL(req.url).host : "");
    const proto = header(req, "x-forwarded-proto") || (req.url?.startsWith("http") ? new URL(req.url).protocol.replace(":", "") : "https");
    if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
    base = `${proto}://${host}`;
  }
  try {
    const u = new URL(base);
    if (u.protocol !== "https:" || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * GET: is calling set up (the last 4 digits of who it calls, how the last call went)?
 * POST {kind}: make the call; the outcome is in `result`: "sent", "off" (not set up: the page
 * shows a pretend call) or "failed" (with `error`, in words).
 * GET or POST ?say=kind: the words for Twilio to say (it asks when the contact answers).
 */
export async function handleEmergencyCall(req: CallRequest, env: CallEnv, opts: { now?: number; fetch?: typeof fetch } = {}): Promise<CallReply> {
  const query = new URL(req.url ?? "/", "http://local").searchParams;
  const say = query.get("say");
  if (say !== null) {
    if (!isKind(say)) return { status: 400, body: { error: "Unknown alert kind." } };
    return { status: 200, body: {}, xml: callScript(callMessage(say, env.ALERT_PERSON_NAME)) };
  }

  const ready = isReady(env);
  const now = opts.now ?? Date.now();
  if (req.method === "GET") {
    const lastCall = last && { secondsAgo: Math.round((now - last.at) / 1000), kind: last.kind, ok: last.ok, error: last.error };
    return { status: 200, body: { ready, to: ready ? env.ALERT_CALL_TO!.slice(-4) : null, problem: setupProblem(env), last: lastCall } };
  }
  if (req.method !== "POST") return { status: 405, body: { error: "Use GET or POST." } };

  const kind = (req.body as { kind?: unknown } | null)?.kind;
  if (!isKind(kind)) return { status: 400, body: { error: "Unknown alert kind." } };
  if (!ready) return { status: 200, body: { result: "off", problem: setupProblem(env) } };

  const reply = await callTwilio(kind, env, publicBase(req, env), now, opts.fetch ?? fetch);
  const ok = reply.result === "sent";
  last = { at: now, kind, ok, error: reply.error };
  console.log(`[emergency-call] ${kind}: ${ok ? "Twilio is calling" : `didn't go through: ${reply.error}`}`);
  return { status: 200, body: reply };
}

/** Makes the call (if the limits allow). */
async function callTwilio(
  kind: CallKind,
  env: CallEnv,
  base: string | null,
  now: number,
  fetchFn: typeof fetch,
): Promise<{ result: "sent" | "failed"; error?: string }> {
  if (!base) {
    return { result: "failed", error: "Twilio can't reach this server's address. Open the page through its public link (not localhost)." };
  }
  while (recent.length && now - recent[0] > 24 * 3600_000) recent.shift();
  if (recent.length && now - recent[recent.length - 1] < CALL_GAP_MS) {
    return { result: "failed", error: "A call was made less than 30 seconds ago. Wait a moment and try again." };
  }
  if (recent.length >= CALLS_PER_DAY) return { result: "failed", error: `Already ${CALLS_PER_DAY} calls today: that's the limit.` };
  recent.push(now); // before waiting for Twilio, so two quick requests can't both call
  // A call that didn't go through doesn't count, so "Try again" works straight away.
  const unrecord = () => {
    const i = recent.lastIndexOf(now);
    if (i >= 0) recent.splice(i, 1);
  };

  const sid = env.TWILIO_ACCOUNT_SID!;
  try {
    const res = await fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${env.TWILIO_AUTH_TOKEN}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: env.ALERT_CALL_TO!,
        From: env.TWILIO_FROM!,
        Url: `${base}/api/emergency-call?say=${kind}`,
      }).toString(),
    });
    if (res.ok) return { result: "sent" };
    unrecord();
    let message = "";
    try {
      message = String(((await res.json()) as { message?: unknown }).message ?? "");
    } catch {
      // not JSON; use the status below
    }
    return { result: "failed", error: hideNumbers(message) || `Twilio said no (status ${res.status}).` };
  } catch {
    unrecord();
    return { result: "failed", error: "Couldn't reach Twilio. Is the server online?" };
  }
}

// ---- Vercel ----

function serverEnv(): CallEnv {
  return (globalThis as { process?: { env?: CallEnv } }).process?.env ?? {};
}

function toResponse(r: CallReply): Response {
  if (r.xml !== undefined) return new Response(r.xml, { status: r.status, headers: { "Content-Type": "text/xml" } });
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

function headersOf(request: Request): Record<string, string> {
  return Object.fromEntries(request.headers.entries());
}

export async function GET(request: Request): Promise<Response> {
  return toResponse(await handleEmergencyCall({ method: "GET", url: request.url, headers: headersOf(request) }, serverEnv()));
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // not JSON (Twilio asking for the words sends a form): fine
  }
  return toResponse(await handleEmergencyCall({ method: "POST", url: request.url, headers: headersOf(request), body }, serverEnv()));
}
