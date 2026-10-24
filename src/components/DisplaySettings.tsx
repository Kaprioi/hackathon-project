import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "../i18n/useLanguage";
import { systemPrefersLessMotion, useDisplaySettings, type TextSize } from "../lib/displaySettings";

// The "Display" button in the header and the small panel it opens: Zoom In and
// Zoom Out buttons for the text size (Normal, Large, Extra large), and "High contrast" and
// "Reduce motion" switches. Works on every page.

// Smallest to biggest. Zoom In moves one step down this list, Zoom Out one step up.
const sizes: { value: TextSize; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Large" },
  { value: "extra", label: "Extra large" },
];

/** The "Aa Display" button that opens and closes the panel. */
export function DisplayButton({ open, onToggle, buttonRef }: {
  open: boolean;
  onToggle: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t, lang } = useLanguage();
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      aria-controls="display-settings"
      onClick={onToggle}
      className="inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-2xl bg-lilac px-3 text-lg font-extrabold text-brand transition-colors hover:bg-mint aria-expanded:bg-brand aria-expanded:text-on-brand"
    >
      <span aria-hidden="true" className="text-xl font-black leading-none">
        Aa
      </span>
      {/* The word is only read out in Spanish ("Pantalla"), to leave room for its longer menu words. */}
      <span className={lang === "es" ? "sr-only" : "sr-only lg:not-sr-only"}>{t("Display")}</span>
      <span className="sr-only">{t("settings")}</span>
    </button>
  );
}

/** The panel itself, shown just under the header. */
export function DisplayPanel({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [settings, update] = useDisplaySettings();
  const panel = useRef<HTMLDivElement>(null);
  const [systemLessMotion] = useState(systemPrefersLessMotion);
  const reduceMotion = settings.reduceMotion ?? systemLessMotion;
  const { t } = useLanguage();

  // Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Move keyboard focus into the panel when it opens.
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);

  return (
    <div
      id="display-settings"
      ref={panel}
      role="region"
      aria-labelledby={`${id}-title`}
      className="absolute inset-x-4 top-full mt-2 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-[28px] border-[3px] border-lilac bg-surface p-5 text-ink shadow-lift sm:left-auto sm:w-[26rem]"
    >
      <h2 id={`${id}-title`} className="text-2xl font-extrabold">
        {t("Display settings")}
      </h2>

      <Zoom value={settings.textSize} onChange={(textSize) => update({ textSize })} />

      <Switch
        label="High contrast"
        hint="Black text on white, with strong edges."
        checked={settings.highContrast}
        onChange={(highContrast) => update({ highContrast })}
      />
      <Switch
        label="Reduce motion"
        hint="Turns off moving and sliding effects."
        checked={reduceMotion}
        onChange={(on) => update({ reduceMotion: on })}
      />

      <button
        type="button"
        onClick={onClose}
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-brand px-5 text-lg font-extrabold text-on-brand hover:bg-brand-dark"
      >
        {t("Done")}
      </button>
      <p className="mt-3 text-base text-muted">{t("Saved in this browser.")}</p>
    </div>
  );
}

/** Zoom Out and Zoom In buttons that step the text size down or up, and the size it is now. */
function Zoom({ value, onChange }: { value: TextSize; onChange: (value: TextSize) => void }) {
  const { t } = useLanguage();
  const index = Math.max(0, sizes.findIndex((s) => s.value === value));
  const zoomButton =
    "inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl border-[3px] border-brand bg-surface px-3 text-lg font-extrabold text-brand transition-colors hover:bg-lilac disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface";
  return (
    <div className="mt-4">
      <h3 className="text-xl font-extrabold">{t("Text size")}</h3>
      {/* Read out when the size changes. */}
      <p aria-live="polite" className="text-base font-bold text-muted">
        {t("Now: {size}", { size: t(sizes[index].label) })}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onChange(sizes[index - 1].value)}
          className={zoomButton}
        >
          <span aria-hidden="true" className="text-2xl leading-none">−</span>
          {t("Zoom Out")}
        </button>
        <button
          type="button"
          disabled={index === sizes.length - 1}
          onClick={() => onChange(sizes[index + 1].value)}
          className={zoomButton}
        >
          <span aria-hidden="true" className="text-2xl leading-none">+</span>
          {t("Zoom In")}
        </button>
      </div>
    </div>
  );
}

/** An on/off switch. The real (hidden) checkbox does the work; the rest is its look. */
function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <label className="mt-4 flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl border-[3px] border-lilac px-4 py-2 has-[:checked]:border-brand">
      <span>
        <span className="block text-xl font-extrabold">{t(label)}</span>
        <span className="block text-base text-muted">
          {t(hint)} <strong className="text-ink">{checked ? t("On") : t("Off")}</strong>
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-9 w-16 shrink-0 rounded-full border-[3px] border-brand bg-lilac transition-colors peer-checked:bg-brand peer-focus-visible:outline-4 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink peer-checked:[&>span]:translate-x-7 peer-checked:[&>span]:bg-surface"
      >
        <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-brand transition-transform" />
      </span>
    </label>
  );
}
