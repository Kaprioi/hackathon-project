// The language helpers behind the language picker. No React here, so it can be
// tested with `npm test`.
//
// How translating works: the English wording is written in the pages as normal,
// wrapped in t("..."). The English text itself is the key into the Spanish (es.ts)
// and Chinese (zh.ts) word lists. Anything missing from a list just shows in
// English, so changing English wording never breaks a page - it only shows in
// English until someone adds the new translation.

export type Lang = "en" | "es" | "zh";

/** The languages in the picker, each named in its own language (`short` for the small header picker). */
export const LANGUAGES: { code: Lang; name: string; short: string; htmlLang: string }[] = [
  { code: "en", name: "English", short: "EN", htmlLang: "en" },
  { code: "es", name: "Español", short: "ES", htmlLang: "es" },
  { code: "zh", name: "中文（简体）", short: "中文", htmlLang: "zh-Hans" },
];

/** Words to fill in, like { email: "ann@example.com" } for "Sent to {email}". */
export type Vars = Record<string, string | number>;

/** t("English text", vars?) -> the text in the chosen language. */
export type Translate = (english: string, vars?: Vars) => string;

/** Fills in "{name}" style gaps. Gaps with no value are left as they are. */
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (gap, name: string) => (name in vars ? String(vars[name]) : gap));
}

/** Looks up the English text in a word list, falling back to the English. */
export function translate(words: Record<string, string> | undefined, english: string, vars?: Vars): string {
  return fill(words?.[english] || english, vars);
}

/** English, untranslated: the default for the plain-logic helpers. */
export const english: Translate = (text, vars) => fill(text, vars);

export function isLang(value: unknown): value is Lang {
  return LANGUAGES.some((l) => l.code === value);
}

/**
 * Which language to start in: the one picked before in this browser, otherwise
 * the first of the browser's languages we offer (so "es-MX" gives Spanish),
 * otherwise English.
 */
export function pickLanguage(saved: string | null | undefined, browserLanguages: readonly string[]): Lang {
  if (isLang(saved)) return saved;
  for (const tag of browserLanguages) {
    const main = tag.toLowerCase().split("-")[0];
    if (isLang(main)) return main;
  }
  return "en";
}

/**
 * Headings colour one or two words, like "How it *works*". The stars mark the
 * coloured words, so each language can put them in its own word order.
 */
export function splitHighlight(text: string): { text: string; highlighted: boolean }[] {
  return text
    .split("*")
    .map((part, i) => ({ text: part, highlighted: i % 2 === 1 }))
    .filter((part) => part.text !== "");
}
