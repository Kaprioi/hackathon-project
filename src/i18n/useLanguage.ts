import { useCallback, useSyncExternalStore } from "react";
import es from "./es";
import { LANGUAGES, pickLanguage, translate, type Lang, type Translate } from "./translate";
import zh from "./zh";

// The chosen language, shared by every page and remembered in this browser.
// Any component can call useLanguage() - no wrapper around the app needed.

const STORAGE_KEY = "carenest-language";
const WORDS: Record<Lang, Record<string, string> | undefined> = { en: undefined, es, zh };

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing can block this. We just start from the browser's language.
    return null;
  }
}

let current: Lang = pickLanguage(readSaved(), typeof navigator === "undefined" ? [] : navigator.languages ?? []);
const listeners = new Set<() => void>();

/** Tells screen readers and the browser which language the page is in. */
function markPage(lang: Lang) {
  document.documentElement.lang = LANGUAGES.find((l) => l.code === lang)?.htmlLang ?? "en";
}
markPage(current);

export function setLanguage(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Can't remember it here, but it still changes for this visit.
  }
  markPage(lang);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The chosen language, a way to change it, and t("English text") to translate. */
export function useLanguage(): { lang: Lang; setLang: (lang: Lang) => void; t: Translate } {
  const lang = useSyncExternalStore(subscribe, () => current);
  const t = useCallback<Translate>((text, vars) => translate(WORDS[lang], text, vars), [lang]);
  return { lang, setLang: setLanguage, t };
}
