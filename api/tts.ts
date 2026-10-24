// The "Read aloud" voice. The family page sends the words and the site language
// here, and this asks ElevenLabs to say them in our chosen voice for that
// language, then sends the sound straight back.
//
// The ElevenLabs key stays on the server (a Vercel environment variable) and is
// never sent to the browser or written to the logs.
//
// Needs these Vercel environment variables:
//   ELEVENLABS_API_KEY   the secret key
//   ELEVENLABS_VOICE_EN  voice ID for English
//   ELEVENLABS_VOICE_ES  voice ID for Spanish
//   ELEVENLABS_VOICE_ZH  voice ID for Chinese (Mandarin)

// Vercel provides `process` on the server; this tells TypeScript about the part we use.
declare const process: { env: Record<string, string | undefined> };

/** Longest text we will read in one go. Keeps each request (and its cost) small. */
export const MAX_CHARS = 1000;

/** The site languages we have a voice for. */
export const LANGS = ["en", "es", "zh"] as const;
export type TtsLang = (typeof LANGS)[number];

/** The ElevenLabs voice model. "Multilingual" speaks Spanish and Chinese well, not just English. */
export const MODEL_ID = "eleven_multilingual_v2";

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

/** POST /api/tts with {text, lang}. Answers with the spoken words as an MP3. */
export async function POST(request: Request): Promise<Response> {
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
