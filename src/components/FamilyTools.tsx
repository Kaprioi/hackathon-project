import { useEffect, useId, useRef, useState } from "react";
import { checkingLine, type AlertSettings } from "../family/alerts";

// Small extras for the family page: the "Read aloud" speaker button, the simple
// view switch, the alert settings panel and the "I'm checking on it" button.

/** True when this browser can read text out loud (most can; some older ones can't). */
export const canSpeak =
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

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
 * A speaker button that reads `text` out loud with the browser's own voice.
 * Shows nothing at all in browsers that can't speak. Press again to stop.
 */
export function ReadAloudButton({
  text,
  label = "Read aloud",
  big = false,
}: {
  text: string;
  /** Visible words on the button. Also tells screen readers what will be read. */
  label?: string;
  big?: boolean;
}) {
  const [speaking, setSpeaking] = useState(false);
  const mine = useRef<SpeechSynthesisUtterance | null>(null);

  // Stop talking if the button disappears (e.g. leaving the page).
  useEffect(
    () => () => {
      if (mine.current) window.speechSynthesis.cancel();
    },
    [],
  );

  if (!canSpeak) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = document.documentElement.lang || "en";
    u.rate = 0.9; // a little slower than normal, easier to follow
    u.onend = u.onerror = () => {
      if (mine.current === u) mine.current = null;
      setSpeaking(false);
    };
    mine.current = u;
    setSpeaking(true);
    synth.speak(u);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl border-[3px] border-current bg-surface font-extrabold text-brand transition-colors hover:bg-lilac ${big ? "min-h-16 px-6 text-2xl" : "min-h-12 px-4 text-lg"}`}
    >
      <SpeakerIcon size={big ? 30 : 22} />
      {speaking ? "Stop reading" : label}
    </button>
  );
}

/** The on/off switch for simple view. */
export function SimpleViewToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-surface px-5 text-lg font-extrabold text-brand transition-colors hover:bg-lilac"
    >
      {on ? "Show everything" : "Simple view"}
    </button>
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
  const set = (patch: Partial<AlertSettings>) => onChange({ ...settings, ...patch });
  const box = "h-7 w-7 shrink-0 accent-brand";
  const row = "flex min-h-12 cursor-pointer items-center gap-4 text-xl font-bold";
  const timeInput =
    "min-h-14 rounded-2xl border-[3px] border-muted bg-surface px-4 text-xl text-ink hover:border-brand focus:border-brand disabled:opacity-60";

  return (
    <details className="group rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-2xl font-extrabold">
        Alert settings
        <span aria-hidden="true" className="text-brand transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <p className="mt-2 text-lg text-muted">
        Choose which news stands out in Recent news. Saved on this device only.
      </p>
      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="text-xl font-extrabold">Highlight these</legend>
        <label className={row}>
          <input type="checkbox" className={box} checked={settings.falls} onChange={(e) => set({ falls: e.target.checked })} />
          Possible falls
        </label>
        <label className={row}>
          <input
            type="checkbox"
            className={box}
            checked={settings.outOfSight}
            onChange={(e) => set({ outOfSight: e.target.checked })}
          />
          Out of sight (nobody in view of the phone)
        </label>
      </fieldset>
      <fieldset className="mt-6 flex flex-col gap-3">
        <legend className="text-xl font-extrabold">Quiet hours</legend>
        <label className={row}>
          <input
            type="checkbox"
            className={box}
            checked={settings.quietHours}
            onChange={(e) => set({ quietHours: e.target.checked })}
          />
          Tone down highlights at night
        </label>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-from`} className="text-lg font-bold">
              From
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
              Until
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
          A possible fall always shows in "Right now", even in quiet hours.
        </p>
      </fieldset>
      <p className="mt-6 text-lg text-muted">Alerts by phone message or email are coming later.</p>
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
  const line = checkingLine(names);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {!mine && (
        <button
          type="button"
          onClick={onCheck}
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-brand px-5 text-lg font-extrabold text-on-brand transition-colors hover:bg-brand-dark disabled:opacity-70"
        >
          {busy ? "Telling the family…" : "I'm checking on it"}
        </button>
      )}
      <p role="status" className="text-lg font-extrabold">
        {line && <span className="rounded-full bg-surface px-3 py-1 text-ink">✓ {line}</span>}
        {message && <span className="mt-2 block rounded-xl bg-surface px-3 py-1 text-error">{message}</span>}
      </p>
    </div>
  );
}
