import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "../i18n/useLanguage";
import { systemPrefersLessMotion, THEMES, useDisplaySettings, type TextSize, type Theme } from "../lib/displaySettings";

// The "Display" button in the header and the small panel it opens: Zoom In and
// Zoom Out buttons for the text size (Normal, Large, Extra large), a colour theme, and "High contrast" and
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
  const { t } = useLanguage();
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
      <span className="sr-only lg:not-sr-only">{t("Display")}</span>
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
      <ColorChoices name={`${id}-theme`} value={settings.theme} onChange={(theme) => update({ theme })} />

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

/**
 * The "Color" picker: a named colour circle for each theme, the way startup sites
 * show theme colours (shadcn/ui, Radix Themes, Slack). Picking one changes the
 * whole site straight away, so the page itself is the preview.
 */
function ColorChoices({ name, value, onChange }: { name: string; value: Theme; onChange: (value: Theme) => void }) {
  const { t } = useLanguage();
  return (
    <fieldset className="mt-4">
      <legend className="text-xl font-extrabold">{t("Color")}</legend>
      <p className="text-base text-muted">{t("Pick the colors you like best.")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {THEMES.map((o) => (
          <label
            key={o.value}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-[3px] border-lilac px-3 py-2 font-bold has-[:checked]:border-brand has-[:checked]:bg-lilac has-[:focus-visible]:outline-4 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-ink"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {/* The circle wears its own theme: a brand-coloured half and a pale half,
                with a tick when chosen. */}
            <span
              aria-hidden="true"
              data-theme={o.value}
              className={`relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand ${value === o.value ? "ring-[3px] ring-ink" : "ring-2 ring-ink/20"}`}
            >
              <span className="swatch-half absolute inset-y-0 right-0 w-1/2 bg-lilac" />
              {value === o.value && (
                <svg viewBox="0 0 24 24" className="relative h-6 w-6">
                  <circle cx="12" cy="12" r="11" fill="#fff" />
                  <path d="m7 12.5 3.2 3.2L17 9" stroke="#1f2a37" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="text-lg leading-tight">{t(o.label)}</span>
          </label>
        ))}
      </div>
    </fieldset>
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
    <label className="mt-4 flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl border-[3px] border-lilac px-4 py-2 has-[:checked]:border-leaf">
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
        className="relative h-9 w-16 shrink-0 rounded-full border-[3px] border-ink bg-muted transition-colors peer-checked:bg-leaf peer-focus-visible:outline-4 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink peer-checked:[&>span]:translate-x-7"
      >
        <span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-surface transition-transform" />
      </span>
    </label>
  );
}
