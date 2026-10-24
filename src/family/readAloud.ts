// The plain logic behind the "Read aloud" button: which voice to use, how to say
// a time, and how to tidy and split the words so the browser voice reads them
// smoothly. No React here, so it can be tested with `npm test`.

import type { Lang } from "../i18n/translate.ts";

/** The voice languages to look for, best first. Mandarin before Cantonese (zh-HK). */
const VOICE_LOCALES: Record<Lang, string[]> = {
  en: ["en"],
  es: ["es-ES", "es-US", "es-MX", "es"],
  zh: ["zh-CN", "cmn-CN", "zh-TW", "cmn-TW", "zh", "cmn"],
};

/** The full language code to give the voice, e.g. "zh-CN" rather than the page's "zh-Hans". */
export function speechLocale(lang: Lang): string {
  return VOICE_LOCALES[lang][0];
}

/** Voices name their language like "es-ES", "es_ES" or "ES-es". This makes them all "es-es". */
function tidyTag(tag: string): string {
  return tag.replace(/_/g, "-").toLowerCase();
}

/** The part of a voice that matters here (the browser's SpeechSynthesisVoice has these too). */
export interface VoiceInfo {
  name?: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

// Apple's playful character voices. They are listed first on Macs and iPhones
// but sound robotic, so they are only used when nothing else is there.
const ROBOTIC = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/;

/** Lower is better: proper voices first, then ones on the device, then the device's default. */
function rank(v: VoiceInfo): number {
  return (ROBOTIC.test(v.name ?? "") ? 4 : 0) + (v.localService ? 0 : 2) + (v.default ? 0 : 1);
}

/**
 * Picks the best voice for the language, or null if this device has none.
 * Prefers the closest accent first (Spain, then US Spanish; Mainland Mandarin),
 * then natural-sounding voices that live on the device (they don't stop when
 * the internet wobbles).
 */
export function pickVoice<V extends VoiceInfo>(voices: readonly V[], lang: Lang): V | null {
  for (const want of VOICE_LOCALES[lang].map(tidyTag)) {
    const matches = voices.filter((v) => {
      const tag = tidyTag(v.lang);
      return want.includes("-") ? tag === want : tag === want || tag.startsWith(`${want}-`);
    });
    if (matches.length > 0) {
      return [...matches].sort((a, b) => rank(a) - rank(b))[0];
    }
  }
  return null;
}

/**
 * How the time is said out loud, in the viewer's own time zone.
 * English keeps the page's own clock (`fallback`); Spanish says "10:38" in 24-hour
 * time; Chinese says "10点38分" (and just "10点" on the hour).
 */
export function spokenClock(lang: Lang, fallback: (iso: string) => string): (iso: string) => string {
  if (lang === "en") return fallback;
  return (iso) => {
    const d = new Date(iso);
    const h = d.getHours();
    const m = d.getMinutes();
    if (lang === "zh") return m === 0 ? `${h}点` : `${h}点${String(m).padStart(2, "0")}分`;
    return `${h}:${String(m).padStart(2, "0")}`;
  };
}

/**
 * Tidies a sentence so the voice reads it smoothly: drops emoji and symbols that
 * voices read out ("bullet", "slash") or stumble on, turns dashes into pauses,
 * and fixes small grammar points like Spanish "a la 1:05" (not "a las 1:05").
 */
export function tidyForSpeech(text: string, lang: Lang): string {
  let out = text
    .replace(/\s+[-–—]\s+/g, ", ")
    .replace(/…/g, ".")
    .replace(/[\uFE0E\uFE0F\u200D]/g, "") // the hidden joiners inside emoji
    .replace(/[^\p{L}\p{M}\p{N}\s.,;:!?¿¡'’。，、？！：；]/gu, " ")
    .replace(/\s+([.,;:!?。，、？！：；])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (lang === "es") out = out.replace(/\blas 1:(\d\d)\b/g, "la 1:$1");
  // Chinese has no spaces between words; a stray one can make the voice pause oddly.
  if (lang === "zh") out = out.replace(/,\s*/g, "，").replace(/(?<=[\p{Script=Han}\d，。：])\s+|\s+(?=[\p{Script=Han}，。：])/gu, "");
  return out;
}

/**
 * Splits text into sentences to speak one at a time. Chrome can go quiet partway
 * through a long piece of speech, so short pieces are more reliable.
 */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Everything "Read aloud" does to the words before speaking: tidy, then split. */
export function speechParts(text: string, lang: Lang): string[] {
  return splitSentences(tidyForSpeech(text, lang));
}
