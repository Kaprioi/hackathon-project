// The "Read aloud" voice. The family page sends the words and the site language
// here, and this asks ElevenLabs to say them in our chosen voice for that
// language, then sends the sound straight back.
//
// The ElevenLabs key stays on the server (a Vercel environment variable) and is
// never sent to the browser or written to the logs.
//
// Only people logged in to CareNest can use it: the page sends the person's
// Supabase login token, and we check it with Supabase first. Each person can
// ask for at most 30 readings every 10 minutes, so nobody can use up the
// ElevenLabs credits.
//
// Needs these Vercel environment variables:
//   ELEVENLABS_API_KEY      the secret key
//   ELEVENLABS_VOICE_EN     voice ID for English
//   ELEVENLABS_VOICE_ES     voice ID for Spanish
//   ELEVENLABS_VOICE_ZH     voice ID for Chinese (Mandarin)
//   VITE_SUPABASE_URL       the Supabase project (the same one the site uses)
//   VITE_SUPABASE_ANON_KEY  the Supabase anon key (the same one the site uses)

import { createClient } from "@supabase/supabase-js";

// Vercel provides `process` on the server; this tells TypeScript about the part we use.
declare const process: { env: Record<string, string | undefined> };

/** Longest text we will read in one go. Keeps each request (and its cost) small. */
export const MAX_CHARS = 1000;

/** The site languages we have a voice for. */
export const LANGS = ["en", "es", "zh"] as const;
export type TtsLang = (typeof LANGS)[number];

/** The ElevenLabs voice model. "Multilingual" speaks Spanish and Chinese well, not just English. */
export const MODEL_ID = "eleven_multilingual_v2";

/** How many readings one person may ask for in each window of time. */
export const LIMIT = 30;
export const WINDOW_MS = 10 * 60 * 1000;

const VOICE_VARS: Record<TtsLang, string> = {
  en: "ELEVENLABS_VOICE_EN",
  es: "ELEVENLABS_VOICE_ES",
  zh: "ELEVENLABS_VOICE_ZH",
};

/** The voice ID for a language, from the environment variables, or null if it isn't set. */
export function voiceFor(lang: TtsLang, env: Record<string, string | undefined> = process.env): string | null {
  return env[VOICE_VARS[lang]]?.trim() || null;
}

/** Checks what the page sent. Gives the cleaned-up words and language, or a plain error. */
export function checkRequest(body: unknown): { text: string; lang: TtsLang } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Send JSON like {\"text\": \"...\", \"lang\": \"en\"}." };
  const { text, lang } = body as { text?: unknown; lang?: unknown };
  if (typeof text !== "string" || !text.trim()) return { error: "There is no text to read." };
  if (text.trim().length > MAX_CHARS) return { error: `The text is too long (at most ${MAX_CHARS} characters).` };
  if (typeof lang !== "string" || !(LANGS as readonly string[]).includes(lang)) {
    return { error: `The language must be one of: ${LANGS.join(", ")}.` };
  }
  return { text: text.trim(), lang: lang as TtsLang };
}

function problem(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** The logged-in person's ID for the token in the request, or null if there is no good token. */
async function whoIsAsking(request: Request, url: string, anonKey: string): Promise<string | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    return error ? null : (data.user?.id ?? null);
  } catch {
    return null;
  }
}

// When each person last asked for a reading. Kept in memory, so it starts again
// when the server restarts; that's fine for a simple cap.
const recent = new Map<string, number[]>();

/** True (and counts this one) if the person is still under the cap. */
function underLimit(userId: string, now = Date.now()): boolean {
  const times = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) {
    recent.set(userId, times);
    return false;
  }
  times.push(now);
  recent.set(userId, times);
  return true;
}

/** POST /api/tts with {text, lang}, logged in. Answers with the spoken words as an MP3. */
export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) return problem(503, "The reading voice isn't set up on the server.");
  const userId = await whoIsAsking(request, supabaseUrl, anonKey);
  if (!userId) return problem(401, "Please log in to use Read aloud.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "Send JSON like {\"text\": \"...\", \"lang\": \"en\"}.");
  }
  const checked = checkRequest(body);
  if ("error" in checked) return problem(400, checked.error);

  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const voice = voiceFor(checked.lang);
  if (!key || !voice) return problem(503, "The reading voice isn't set up on the server.");
  if (!underLimit(userId)) return problem(429, "Too many readings in a short time. Please wait a few minutes.");

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: checked.text, model_id: MODEL_ID }),
      },
    );
  } catch {
    return problem(502, "Couldn't reach the reading voice service.");
  }
  if (!upstream.ok || !upstream.body) {
    // Only the status code is logged: never the key, and never the family's words.
    console.error(`ElevenLabs text-to-speech failed with status ${upstream.status}`);
    return problem(502, "The reading voice service didn't answer properly.");
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
