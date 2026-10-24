import { useEffect, useId, useRef, useState } from "react";
import { checkingLine, type AlertSettings } from "../family/alerts";
import { speak, stopVoice } from "../family/voice";
import { useLanguage } from "../i18n/useLanguage";
import { accessToken } from "../lib/supabase";

// Small extras for the family page: the "Read aloud" speaker button, the simple
// view switch, the spoken alerts switch, the alert settings panel and the
// "I'm checking on it" button.

function SpeakerIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      <path
        d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A speaker button that reads `text` out loud with our ElevenLabs voice for the
 * site language (fetched from /api/tts). Press again to stop.
 * If the ElevenLabs voice can't be reached, a short note says so.
 */
export function ReadAloudButton({
  text,
  label = "Read aloud",
  stopLabel = "Stop reading",
  big = false,
}: {
  text: string;
  /** Visible words on the button. Also tells screen readers what will be read. */
  label?: string;
  /** The words on the button while it is speaking. */
  stopLabel?: string;
  big?: boolean;
}) {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const { lang, t } = useLanguage();
  // This button's current reading, if any. Each press gets a new one.
  const mine = useRef<object | null>(null);

  // Stop talking if the button disappears (e.g. leaving the page) or the language changes.
  useEffect(
    () => () => {
      if (mine.current) stopVoice();
      mine.current = null;
      setSpeaking(false);
      setLoading(false);
      setNote("");
    },
    [lang],
  );

  async function toggle() {
    if (mine.current) {
      stopVoice();
      return;
    }
    const reading = {};
    mine.current = reading;
    setNote("");
    setSpeaking(true);
    setLoading(true);
    const outcome = await speak(text, lang, accessToken, () => {
      if (mine.current === reading) setLoading(false);
    });
    if (mine.current !== reading) return;
    mine.current = null;
    setSpeaking(false);
    setLoading(false);
    if (outcome === "failed") setNote("Read aloud isn't available right now. Please try again in a moment.");
  }

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={speaking}
        aria-busy={loading}
        className={`inline-flex items-center justify-center gap-2 rounded-2xl border-[3px] border-current bg-surface font-extrabold text-brand transition-colors hover:bg-lilac ${big ? "min-h-16 px-6 text-2xl" : "min-h-12 px-4 text-lg"}`}
      >
        <SpeakerIcon size={big ? 30 : 22} />
        {speaking ? t(stopLabel) : t(label)}
      </button>
      {note && (
        <span role="status" className="text-lg font-bold text-muted">
          {t(note)}
        </span>
      )}
    </span>
  );
}

/** The on/off switch for simple view. */
export function SimpleViewToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-surface px-5 text-lg font-extrabold text-brand transition-colors hover:bg-lilac"
    >
      {on ? t("Show everything") : t("Simple view")}
    </button>
  );
}

/**
 * The on/off switch for spoken alerts. Turning it on is the tap browsers need
 * before they allow sound, so it speaks straight away to show it works.
 * After a reload, `needsTap` shows a big "tap to turn back on" button.
 */
export function SpokenAlertsSwitch({
  on,
  needsTap,
  note,
  onChange,
  onWake,
}: {
  on: boolean;
  needsTap: boolean;
  /** A short message when the voice couldn't be reached or played, if any. */
  note: string;
  onChange: (on: boolean) => void;
  /** The "tap to turn back on" button was pressed. */
  onWake: () => void;
}) {
  const { t } = useLanguage();
  return (
    <section className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block text-2xl font-extrabold">{t("Spoken alerts")}</span>
          <span className="block text-lg text-muted">
            {t("Say new alerts out loud on this device.")}{" "}
            <strong className="text-ink">{on ? t("On") : t("Off")}</strong>
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
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
      {needsTap && (
        // Any tap on the page turns sound back on; this button also says so out loud.
        <button
          type="button"
          onClick={onWake}
          className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-[3px] border-brand bg-brand px-5 text-xl font-extrabold text-on-brand transition-colors hover:bg-brand-dark"
        >
          <SpeakerIcon size={24} />
          {t("Tap to turn spoken alerts back on")}
        </button>
      )}
      {on && note && (
        <p role="status" className="mt-3 text-lg font-bold text-muted">
          {t(note)}
        </p>
      )}
      {on && (
        <p className="mt-3 text-lg text-muted">
          {t(
            "A possible fall is always said out loud, even in quiet hours, and again after 30 seconds unless someone presses \"I'm checking on it\". Keep this page open and the volume up.",
          )}
        </p>
      )}
    </section>
  );
}

/** Which alerts to highlight, and quiet hours. Saved on this device by the family page. */
export function AlertSettingsPanel({
  settings,
  onChange,
}: {
  settings: AlertSettings;
  onChange: (settings: AlertSettings) => void;
}) {
  const id = useId();
  const { t } = useLanguage();
  const set = (patch: Partial<AlertSettings>) => onChange({ ...settings, ...patch });
  const box = "h-7 w-7 shrink-0 accent-brand";
  const row = "flex min-h-12 cursor-pointer items-center gap-4 text-xl font-bold";
  const timeInput =
    "min-h-14 rounded-2xl border-[3px] border-muted bg-surface px-4 text-xl text-ink hover:border-brand focus:border-brand disabled:opacity-60";

  return (
    <details className="group rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-2xl font-extrabold">
        {t("Alert settings")}
        <span aria-hidden="true" className="text-brand transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <p className="mt-2 text-lg text-muted">
        {t("Choose which news stands out in Recent news. Saved on this device only.")}
      </p>
      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="text-xl font-extrabold">{t("Highlight these")}</legend>
        <label className={row}>
          <input type="checkbox" className={box} checked={settings.falls} onChange={(e) => set({ falls: e.target.checked })} />
          {t("Possible falls")}
        </label>
        <label className={row}>
          <input
            type="checkbox"
            className={box}
            checked={settings.outOfSight}
            onChange={(e) => set({ outOfSight: e.target.checked })}
          />
          {t("Out of sight (nobody in view of the phone)")}
        </label>
        <label className={row}>
          <input
            type="checkbox"
            className={box}
            checked={settings.cameraOff}
            onChange={(e) => set({ cameraOff: e.target.checked })}
          />
          {t("The phone camera stopped watching")}
        </label>
      </fieldset>
      <fieldset className="mt-6 flex flex-col gap-3">
        <legend className="text-xl font-extrabold">{t("Quiet hours")}</legend>
        <label className={row}>
          <input
            type="checkbox"
            className={box}
            checked={settings.quietHours}
            onChange={(e) => set({ quietHours: e.target.checked })}
          />
          {t("Tone down highlights at night")}
        </label>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-from`} className="text-lg font-bold">
              {t("From")}
            </label>
            <input
              id={`${id}-from`}
              type="time"
              required
              disabled={!settings.quietHours}
              value={settings.quietFrom}
              onChange={(e) => e.target.value && set({ quietFrom: e.target.value })}
              className={timeInput}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-to`} className="text-lg font-bold">
              {t("Until")}
            </label>
            <input
              id={`${id}-to`}
              type="time"
              required
              disabled={!settings.quietHours}
              value={settings.quietTo}
              onChange={(e) => e.target.value && set({ quietTo: e.target.value })}
              className={timeInput}
            />
          </div>
        </div>
        <p className="text-lg text-muted">
          {t('A possible fall always shows in "Right now", even in quiet hours.')}
        </p>
      </fieldset>
      <p className="mt-6 text-lg text-muted">{t("Alerts by phone message or email are coming later.")}</p>
    </details>
  );
}

/**
 * "I'm checking on it" for one alert, plus the live line saying who is.
 * `names` lists who has pressed it already ("You" for yourself).
 */
export function CheckingOnIt({
  names,
  mine,
  busy,
  message,
  onCheck,
}: {
  names: string[];
  /** True when you have already pressed it. */
  mine: boolean;
  busy: boolean;
  /** A friendly problem message to show, if any. */
  message: string;
  onCheck: () => void;
}) {
  const { t } = useLanguage();
  const line = checkingLine(names, t);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!mine && (
        <button
          type="button"
          onClick={onCheck}
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-brand px-5 text-lg font-extrabold text-on-brand transition-colors hover:bg-brand-dark disabled:opacity-70"
        >
          {busy ? t("Telling the family…") : t("I'm checking on it")}
        </button>
      )}
      <p role="status" className="text-lg font-extrabold">
        {line && <span className="rounded-full bg-surface px-3 py-1 text-ink">✓ {line}</span>}
        {message && <span className="mt-2 block rounded-xl bg-surface px-3 py-1 text-error">{t(message)}</span>}
      </p>
    </div>
  );
}
