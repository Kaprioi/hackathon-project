// Live video's relay servers. The phone and the family member's browser try to send
// video straight to each other; some networks (venue Wi-Fi, some mobile data) block
// that, and then the video goes through a relay (TURN). Twilio runs relays for the
// Twilio account the emergency call already uses; this asks Twilio for a short-lived
// login to them. The video stays encrypted on the way through.
//
// GET -> {iceServers: [...], relay: true/false}. Without Twilio settings (or if Twilio
// refuses) it gives only the free public address finder, which works on most networks.
// Signed-in accounts only, where the server has Supabase settings (the live site),
// so strangers can't use up the relay. The Twilio key never leaves the server.
//
// Runs on Vercel (this file is /api/ice-servers) and in the dev server (vite.config.ts).
// Self-contained on purpose (no imports), like api/emergency-call.ts.

export interface IceEnv {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export interface IceRequest {
  method: string;
  headers?: Record<string, string | string[] | undefined>;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const PUBLIC_STUN: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
/** How long Twilio's relay login lasts, and how long this keeps reusing it (a little less). */
const TTL_S = 3600;
const REUSE_MS = 50 * 60_000;
let cached: { servers: IceServer[]; until: number } | null = null;

/** Forgets the saved relay login (for tests). */
export function resetIceCache(): void {
  cached = null;
}

function header(req: IceRequest, name: string): string {
  const v = req.headers?.[name];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** Is the page signed in? "not needed" where the server has no Supabase settings (no accounts). */
async function signInState(req: IceRequest, env: IceEnv, fetchFn: typeof fetch): Promise<"yes" | "no" | "not needed"> {
  const url = env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return "not needed";
  const token = header(req, "authorization").match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return "no";
  try {
    const res = await fetchFn(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    return res.ok ? "yes" : "no";
  } catch {
    return "no";
  }
}

export async function handleIceServers(
  req: IceRequest,
  env: IceEnv,
  opts: { now?: number; fetch?: typeof fetch } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (req.method !== "GET") return { status: 405, body: { error: "Use GET." } };
  const fetchFn = opts.fetch ?? fetch;
  if ((await signInState(req, env, fetchFn)) === "no") {
    return { status: 401, body: { error: "Please sign in to CareNest.", iceServers: PUBLIC_STUN, relay: false } };
  }
  const now = opts.now ?? Date.now();
  if (cached && now < cached.until) return { status: 200, body: { iceServers: cached.servers, relay: true } };

  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const secret = env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !secret || !/^AC\w{32}$/.test(sid)) return { status: 200, body: { iceServers: PUBLIC_STUN, relay: false } };
  try {
    const res = await fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Tokens.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${sid}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ Ttl: String(TTL_S) }).toString(),
    });
    if (!res.ok) throw new Error(`Twilio said ${res.status}`);
    const json = (await res.json()) as { ice_servers?: { urls?: string; url?: string; username?: string; credential?: string }[] };
    const servers: IceServer[] = (json.ice_servers ?? [])
      .map((s) => ({ urls: s.urls ?? s.url ?? "", username: s.username, credential: s.credential }))
      .filter((s) => typeof s.urls === "string" && /^(stun|turns?):/.test(s.urls));
    if (servers.length === 0) throw new Error("Twilio gave no relay servers");
    cached = { servers, until: now + REUSE_MS };
    return { status: 200, body: { iceServers: servers, relay: true } };
  } catch (e) {
    console.log(`[ice-servers] no relay: ${e instanceof Error ? e.message : String(e)}`);
    return { status: 200, body: { iceServers: PUBLIC_STUN, relay: false } };
  }
}

// ---- Vercel ----

export async function GET(request: Request): Promise<Response> {
  const env = ((globalThis as { process?: { env?: IceEnv } }).process?.env ?? {}) as IceEnv;
  const r = await handleIceServers({ method: "GET", headers: Object.fromEntries(request.headers.entries()) }, env);
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
