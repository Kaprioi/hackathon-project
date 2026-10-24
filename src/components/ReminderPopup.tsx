import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n/useLanguage";
import { accessToken } from "../lib/supabase";
import { dayKey, dueNow, iconFor, SNOOZE_MINUTES, spokenReminder } from "../family/reminders";
import { useReminders } from "../family/useReminders";
import { playChime, speak } from "../family/voice";

// The big reminder card on the phone on the table, like "💊 Heart pills" at 8:00.
// It shows over the camera view and is said out loud once (and again after
// "Later"). "I did it" lets the family page know it was done.

export default function ReminderPopup({ circleId }: { circleId: string }) {
  const { t, lang } = useLanguage();
  const { reminders, checks, markDone } = useReminders(circleId);
  const [now, setNow] = useState(() => Date.now());
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  // Which reminders have been said out loud this time round ("id:day").
  const said = useRef(new Set<string>());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const showing = dueNow(reminders, checks, snoozed, new Date(now))[0];

  useEffect(() => {
    if (!showing) return;
    const key = `${showing.id}:${dayKey(new Date())}`;
    if (said.current.has(key)) return;
    said.current.add(key);
    void playChime().then(() => speak(spokenReminder(showing, t), lang, accessToken));
  }, [showing, t, lang]);

  if (!showing) return null;

  async function done() {
    setError(await markDone(showing.id));
  }

  function later() {
    said.current.delete(`${showing.id}:${dayKey(new Date())}`);
    setSnoozed((old) => ({ ...old, [showing.id]: Date.now() + SNOOZE_MINUTES * 60_000 }));
  }

  return (
    <div className="on-light absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-labelledby="reminder-title"
        className="w-full max-w-xl animate-pop rounded-[40px] bg-surface p-7 text-center text-ink shadow-lift sm:p-10"
      >
        <p aria-hidden="true" className="text-6xl">
          {iconFor(showing.kind)}
        </p>
        <p className="mt-2 text-xl font-extrabold uppercase tracking-wide text-brand">{t("Reminder")}</p>
        <h2 id="reminder-title" className="mt-2 text-4xl font-black break-words">
          {showing.label}
        </h2>
        {error && (
          <p role="alert" className="mt-4 text-lg font-bold text-error">
            {t(error)}
          </p>
        )}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={done}
            className="min-h-20 flex-[2] rounded-3xl border-[3px] border-leaf bg-leaf px-6 text-3xl font-black text-on-brand shadow-[0_6px_0_#0b5a3f] active:translate-y-1"
          >
            ✓ {t("I did it")}
          </button>
          <button
            type="button"
            onClick={later}
            className="min-h-20 flex-1 rounded-3xl border-[3px] border-brand bg-surface px-6 text-2xl font-extrabold text-brand"
          >
            {t("Later")}
          </button>
        </div>
      </div>
    </div>
  );
}
