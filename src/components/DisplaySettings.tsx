import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "../i18n/useLanguage";
import { systemPrefersLessMotion, useDisplaySettings, type TextSize, type Theme } from "../lib/displaySettings";

// The "Display" button in the header and the small panel it opens: text size
// (Normal, Large, Extra large), light or dark colours, and "High contrast" and
// "Reduce motion" switches. Works on every page.

const sizes: { value: TextSize; label: string; className: string }[] = [
  { value: "normal", label: "Normal", className: "text-lg" },
  { value: "large", label: "Large", className: "text-xl" },
  { value: "extra", label: "Extra large", className: "text-2xl" },
];

const themes: { value: Theme; label: string; className?: string }[] = [
  { value: "system", label: "Same as my device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
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
    panel.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
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

      <Choices
        legend="Text size"
        name={`${id}-size`}
        options={sizes}
        value={settings.textSize}
        onChange={(textSize) => update({ textSize })}
      />
      <Choices
        legend="Colours"
        name={`${id}-theme`}
        options={themes}
        value={settings.theme}
        onChange={(theme) => update({ theme })}
      />

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

/** A group of big radio buttons. */
function Choices<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { value: T; label: string; className?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { t } = useLanguage();
  return (
    <fieldset className="mt-4">
      <legend className="text-xl font-extrabold">{t(legend)}</legend>
      <div className="mt-2 flex flex-col gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-[3px] border-lilac px-4 font-bold has-[:checked]:border-brand has-[:checked]:bg-lilac"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="h-6 w-6 shrink-0 accent-brand"
            />
            <span className={o.className ?? "text-lg"}>{t(o.label)}</span>
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
