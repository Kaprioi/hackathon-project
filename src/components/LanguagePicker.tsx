import { useId } from "react";
import { LANGUAGES, isLang } from "../i18n/translate";
import { useLanguage } from "../i18n/useLanguage";

/**
 * A big, plain drop-down for choosing the language. Each language is written in
 * its own language, so people can find theirs even if they can't read the page.
 * `compact` shows short names ("EN", "ES", "中文"), for the crowded desktop header.
 */
export default function LanguagePicker({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const id = useId();
  const { lang, setLang, t } = useLanguage();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor={id} className="flex items-center gap-2 text-lg font-extrabold text-brand">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2.2" fill="none" />
          <path
            d="M2.5 12h19M12 2.5c2.6 2.6 3.9 5.8 3.9 9.5S14.6 18.9 12 21.5M12 2.5C9.4 5.1 8.1 8.3 8.1 12s1.3 6.9 3.9 9.5"
            stroke="currentColor"
            strokeWidth="2.2"
            fill="none"
          />
        </svg>
        <span className="sr-only">{t("Language")}</span>
      </label>
      <select
        id={id}
        value={lang}
        onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}
        className={`language-select min-h-12 cursor-pointer rounded-2xl border-[3px] border-lilac bg-surface ${compact ? "px-2" : "px-3"} text-lg font-extrabold text-ink transition-colors hover:border-brand focus:border-brand`}
      >
        {LANGUAGES.map((l) => (
          // The read-out name starts with the short name on screen ("EN, English"),
          // so people using voice control can say what they see.
          <option
            key={l.code}
            value={l.code}
            lang={l.htmlLang}
            aria-label={compact && !l.name.startsWith(l.short) ? `${l.short}, ${l.name}` : undefined}
          >
            {compact ? l.short : l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
