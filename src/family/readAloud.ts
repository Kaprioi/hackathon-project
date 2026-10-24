// The plain logic behind the "Read aloud" button: how to say a time, and how
// to tidy and split the words so the voice reads them smoothly. No React
// here, so it can be tested with `npm test`.

import type { Lang } from "../i18n/translate.ts";

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

/** Splits text into tidy sentences (the button joins them back up before sending). */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Everything "Read aloud" does to the words before speaking: tidy, then split. */
export function speechParts(text: string, lang: Lang): string[] {
  return splitSentences(tidyForSpeech(text, lang));
}
