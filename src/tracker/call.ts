// The emergency call, page side. A web page can't dial a phone, so the alert asks the
// website's server (api/emergency-call.ts) to call the emergency contact through Twilio.
// The number and the Twilio keys stay on the server. If calling isn't set up there, the
// alert shows a pretend call instead.

export type CallKind = "fall" | "seizure" | "test";

const URL_PATH = "/api/emergency-call";

/** Whether the server can make real calls, and the last 4 digits of the number it calls. */
export interface CallSetup {
  ready: boolean;
  to: string | null;
  /** What's wrong with the server's settings, in plain words, if they're half done. */
  problem: string | null;
  /** How the server's last call attempt went (since it started), or null. */
  last: { secondsAgo: number; kind: CallKind; ok: boolean; error?: string } | null;
}

/** What happened: Twilio is making the call, calling isn't set up (pretend), or it failed. */
export type CallOutcome = { result: "sent" } | { result: "off" } | { result: "failed"; error: string };

/** Asks the server whether real calls are set up. Null if the server couldn't be reached. */
export async function callSetup(): Promise<CallSetup | null> {
  try {
    const res = await fetch(URL_PATH, { cache: "no-store" });
    if (res.status === 404) return { ready: false, to: null, problem: null, last: null }; // no calling on this server at all
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<CallSetup>;
    return { ready: body.ready === true, to: body.to ?? null, problem: body.problem ?? null, last: body.last ?? null };
  } catch {
    return null;
  }
}

/** Asks the server to make the call. Gives up after `timeoutMs`. */
export async function requestCall(kind: CallKind, timeoutMs = 15000): Promise<CallOutcome> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  try {
    const res = await fetch(URL_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
      signal: stop.signal,
    });
    if (res.status === 404) return { result: "off" }; // this server has no calling at all
    let body: { result?: unknown; error?: unknown } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // not JSON: a page from something in between (a proxy, the hosting)
    }
    if (res.ok && body.result === "sent") return { result: "sent" };
    if (res.ok && body.result === "off") return { result: "off" };
    return { result: "failed", error: String(body.error ?? "") || `The server said no (status ${res.status}).` };
  } catch {
    return { result: "failed", error: "Couldn't reach the server. No internet?" };
  } finally {
    clearTimeout(timer);
  }
}
