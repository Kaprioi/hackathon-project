// The emergency call, page side. A web page can't dial a phone, so the alert asks the
// website's server (api/emergency-call.ts) to call the emergency contact through Twilio.
// The page sends the contact's number (typed in Settings, saved on this phone); the Twilio
// keys stay on the server. If calling isn't set up there, the alert shows a pretend call
// instead. The page sends its CareNest login token, because the server only lets signed-in
// accounts call.

export type CallKind = "fall" | "seizure" | "test";

const URL_PATH = "/api/emergency-call";

/**
 * A typed phone number in the form Twilio needs (+ country code, digits only), or null if it
 * doesn't look like one. Spaces, dashes, dots and brackets are fine. Without a "+", a 10-digit
 * number counts as US/Canada: "(347) 555-0123" → "+13475550123".
 */
export function phoneForCall(raw: string): string | null {
  const typed = raw.trim();
  if (!typed || /[^\d\s()+.-]/.test(typed) || typed.lastIndexOf("+") > 0) return null;
  let digits = typed.replace(/\D/g, "");
  if (!typed.startsWith("+")) {
    if (digits.length === 10) digits = "1" + digits;
    else if (!(digits.length === 11 && digits.startsWith("1"))) return null;
  }
  return /^[1-9]\d{6,14}$/.test(digits) ? "+" + digits : null;
}

/** A number from phoneForCall, easier to read: "+1 347 555 0123" for US/Canada, else as it is. */
export function showPhone(e164: string): string {
  const us = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return us ? `+1 ${us[1]} ${us[2]} ${us[3]}` : e164;
}

/** Whether the server can make real calls, and the last 4 digits of its fallback number. */
export interface CallSetup {
  ready: boolean;
  /** The last 4 digits of the server's own number (ALERT_CALL_TO), used when Settings has none. */
  to: string | null;
  /** What's wrong with the server's settings, in plain words, if they're half done. */
  problem: string | null;
  /** How the server's last call attempt went (since it started), or null. */
  last: { secondsAgo: number; kind: CallKind; ok: boolean; error?: string } | null;
  /** The server only tells a signed-in page the details (and only lets it call). */
  needsSignIn: boolean;
}

/** What happened: Twilio is making the call, calling isn't set up (pretend), or it failed. */
export type CallOutcome = { result: "sent" } | { result: "off" } | { result: "failed"; error: string };

/** The login token as a request header, if signed in. */
function signedIn(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Asks the server whether real calls are set up. Null if the server couldn't be reached. */
export async function callSetup(token?: string | null): Promise<CallSetup | null> {
  try {
    const res = await fetch(URL_PATH, { cache: "no-store", headers: signedIn(token) });
    if (res.status === 404) return { ready: false, to: null, problem: null, last: null, needsSignIn: false }; // no calling on this server at all
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<CallSetup>;
    return {
      ready: body.ready === true,
      to: body.to ?? null,
      problem: body.problem ?? null,
      last: body.last ?? null,
      needsSignIn: body.needsSignIn === true,
    };
  } catch {
    return null;
  }
}

/**
 * Asks the server to make the call, with the login token (if signed in). `note` is what Gemini
 * saw in the picture (sceneCheck.ts), read out in the call. `to` is the number typed in
 * Settings (any form phoneForCall takes); without it, the server uses its own number, if it
 * has one. Gives up after `timeoutMs`.
 */
export async function requestCall(
  kind: CallKind,
  token?: string | null,
  timeoutMs = 15000,
  note?: string,
  to?: string,
): Promise<CallOutcome> {
  const number = to?.trim() ? phoneForCall(to) : null;
  if (to?.trim() && !number) {
    return { result: "failed", error: "The emergency contact's number doesn't look right. Check it in Settings." };
  }
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  try {
    const res = await fetch(URL_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...signedIn(token) },
      body: JSON.stringify({ kind, ...(note ? { note } : {}), ...(number ? { to: number } : {}) }),
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
