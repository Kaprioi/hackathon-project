import { useId } from "react";
import { NO_MOVEMENT_HOURS, type NoMovementSettings } from "../family/noMovement";
import { useLanguage } from "../i18n/useLanguage";

// The "No movement for a while" part of Alert settings on the family page.

export default function NoMovementSettingsFields({
  settings,
  onChange,
}: {
  settings: NoMovementSettings;
  onChange: (settings: NoMovementSettings) => void;
}) {
  const id = useId();
  const { t } = useLanguage();
  const set = (patch: Partial<NoMovementSettings>) => onChange({ ...settings, ...patch });
  const field =
    "min-h-14 rounded-2xl border-[3px] border-muted bg-surface px-4 text-xl text-ink hover:border-brand focus:border-brand disabled:opacity-60";

  return (
    <fieldset className="mt-6 flex flex-col gap-3">
      <legend className="text-xl font-extrabold">{t("No movement for a while")}</legend>
      <label className="flex min-h-12 cursor-pointer items-center gap-4 text-xl font-bold">
        <input
          type="checkbox"
          className="h-7 w-7 shrink-0 accent-brand"
          checked={settings.on}
          onChange={(e) => set({ on: e.target.checked })}
        />
        {t("Tell me if nobody has moved for a while during the day")}
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-hours`} className="text-lg font-bold">
          {t("After how long")}
        </label>
        <select
          id={`${id}-hours`}
          disabled={!settings.on}
          value={settings.hours}
          onChange={(e) => set({ hours: Number(e.target.value) })}
          className={`${field} w-full sm:w-auto`}
        >
          {NO_MOVEMENT_HOURS.map((h) => (
            <option key={h} value={h}>
              {h === 1 ? t("1 hour") : t("{n} hours", { n: h })}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-from`} className="text-lg font-bold">
            {t("Daytime starts")}
          </label>
          <input
            id={`${id}-from`}
            type="time"
            required
            disabled={!settings.on}
            value={settings.dayFrom}
            onChange={(e) => e.target.value && set({ dayFrom: e.target.value })}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-to`} className="text-lg font-bold">
            {t("Daytime ends")}
          </label>
          <input
            id={`${id}-to`}
            type="time"
            required
            disabled={!settings.on}
            value={settings.dayTo}
            onChange={(e) => e.target.value && set({ dayTo: e.target.value })}
            className={field}
          />
        </div>
      </div>
      <p className="text-lg text-muted">
        {t("Only daytime counts, so a good night's sleep never sets it off. Daytime comes from the wake-up and bed times on the Care profile, if they are filled in.")}
      </p>
    </fieldset>
  );
}
