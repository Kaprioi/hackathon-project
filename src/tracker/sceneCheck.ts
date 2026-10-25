// Gemini's second opinion on an emergency alert, page side. The page takes one still picture
// (the upright copy the person detector just used) and asks the server (api/scene-check.ts)
// what Gemini sees in it:
//   - A possible fall: BEFORE the alert. If Gemini clearly sees the person isn't on the floor
//     (geminiClears), there's no alert. Otherwise the alert goes off, and the call reads
//     Gemini's sentence out. No answer (no internet, too slow, setting off) = alert as usual.
//   - A possible seizure: when the countdown runs out (a still picture can't show shaking, so
//     Gemini never decides a seizure), and the call reads its sentence out.
// Nothing is sent if the setting is off.

export type SceneKind = "fall" | "seizure" | "test";

const URL_PATH = "/api/scene-check";

/** Whether the server has a Gemini key, and whether it wants this page signed in first. */
export interface SceneSetup {
  ready: boolean;
  needsSignIn: boolean;
}

/** What Gemini said about the picture, or why there's nothing ("off" = no Gemini key on the server). */
export type SceneOutcome =
  | { result: "ok"; summary: string; personVisible: boolean; onFloor: boolean; looksHurt: "yes" | "no" | "unsure" }
  | { result: "off" }
  | { result: "failed"; error: string };

function signedIn(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Asks the server whether Gemini is set up. Null if the server couldn't be reached. */
export async function sceneSetup(token?: string | null): Promise<SceneSetup | null> {
  try {
    const res = await fetch(URL_PATH, { cache: "no-store", headers: signedIn(token) });
    if (res.status === 404) return { ready: false, needsSignIn: false }; // this server has no Gemini check at all
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<SceneSetup>;
    return { ready: body.ready === true, needsSignIn: body.needsSignIn === true };
  } catch {
    return null;
  }
}

/**
 * One still picture as a JPEG in base64 (no "data:" prefix), at most `maxSide` pixels on its
 * long side. Null if there's no picture yet.
 */
export function snapshot(canvas: HTMLCanvasElement | null, maxSide = 640, quality = 0.8): string | null {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  let source = canvas;
  if (scale < 1) {
    source = document.createElement("canvas");
    source.width = Math.round(canvas.width * scale);
    source.height = Math.round(canvas.height * scale);
    source.getContext("2d")?.drawImage(canvas, 0, 0, source.width, source.height);
  }
  try {
    const url = source.toDataURL("image/jpeg", quality);
    const data = url.slice(url.indexOf(",") + 1);
    return url.startsWith("data:image/jpeg") && data ? data : null;
  } catch {
    return null;
  }
}

/**
 * Before a possible fall's alert: does Gemini's look clearly show it isn't one? Only when it
 * answered, sees the person, they're not on the floor (a bed, sofa or chair doesn't count as
 * the floor) and they don't look hurt. Anything else, including no answer, means the alert goes
 * off: a false alarm costs one tap on I'm OK, a missed fall is far worse. Seizures are never
 * cleared, because one still picture can't show shaking.
 */
export function geminiClears(kind: SceneKind, scene: SceneOutcome): boolean {
  return kind === "fall" && scene.result === "ok" && scene.personVisible && !scene.onFloor && scene.looksHurt !== "yes";
}

/** Asks Gemini (through the server) what it sees. Gives up after `timeoutMs`, so the call is never held up long. */
export async function checkScene(kind: SceneKind, image: string, token?: string | null, timeoutMs = 6000): Promise<SceneOutcome> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  try {
    const res = await fetch(URL_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...signedIn(token) },
      body: JSON.stringify({ kind, image }),
      signal: stop.signal,
    });
    if (res.status === 404) return { result: "off" };
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      // not JSON: a page from something in between (a proxy, the hosting)
    }
    if (res.ok && body.result === "off") return { result: "off" };
    if (res.ok && body.result === "ok" && typeof body.summary === "string") {
      const hurt = body.looksHurt === "yes" || body.looksHurt === "no" ? body.looksHurt : "unsure";
      return { result: "ok", summary: body.summary, personVisible: body.personVisible === true, onFloor: body.onFloor === true, looksHurt: hurt };
    }
    return { result: "failed", error: String(body.error ?? "") || `The server said no (status ${res.status}).` };
  } catch {
    return { result: "failed", error: "Gemini took too long, so the call went ahead without it." };
  } finally {
    clearTimeout(timer);
  }
}
