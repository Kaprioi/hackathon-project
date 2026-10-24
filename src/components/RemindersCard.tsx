import { useId, useState } from "react";
import { buttonVariants } from "./ButtonLink";
import Highlight from "./Highlight";
import { useLanguage } from "../i18n/useLanguage";
import { localTime } from "../family/dailySummary";
import { iconFor, KINDS, MAX_LABEL, minutesOf, remindersToday, type ReminderKind, type ReminderToday } from "../family/reminders";
import { useReminders } from "../family/useReminders";

// "Daily reminders" on the family page. Empty until someone adds one they need,
// like "Heart pills" at 8:00. At that time the phone on the table shows it and says
// it out loud; here family see whether it was done, is due now, or was missed.

const smallButton =
  "inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-surface px-5 text-lg font-extrabold text-brand no-underline transition-all duration-200 hover:-translate-y-0.5 hover:bg-lilac disabled:cursor-not-allowed disabled:opacity-70";

const input =
  "min-h-14 w-full rounded-2xl border-[3px] border-muted bg-surface px-5 text-xl text-ink transition-colors hover:border-brand focus:border-brand";

/** "08:00" -> "8:00 am", in the viewer's language. */
function niceTime(time: string, t: ReturnType<typeof useLanguage>["t"]): string {
  const mins = minutesOf(time) ?? 0;
  const d = new Date();
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return localTime(d.getTime(), t);
}

const stateLook: Record<ReminderToday["state"], string> = {
  done: "bg-mint text-ink",
  now: "bg-sun text-ink",
  missed: "border-[3px] border-alert bg-peach text-ink",
  later: "bg-cream text-ink",
};

export default function RemindersCard({ circleId, now }: { circleId: string; now: number }) {
  const id = useId();
  const { t } = useLanguage();
  const { reminders, checks, available, loaded, add, remove } = useReminders(circleId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const today = remindersToday(reminders, checks, new Date(now));

  function stateText(r: ReminderToday): string {
    if (r.state === "done") return t("Done at {time}", { time: localTime(Date.parse(r.doneAt!), t) });
    if (r.state === "now") return t("Showing on the phone now");
    if (r.state === "missed") return t("Missed");
    return t("Coming up");
  }

  async function confirmRemove(reminderId: string) {
    setError(await remove(reminderId));
    setRemoving(null);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-2xl font-extrabold">
          <Highlight text={t("Daily *reminders*")} />
        </h2>
        {available && today.length > 0 && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={smallButton}>
            {t("Add a reminder")}
          </button>
        )}
      </div>

      {!available ? (
        <p className="mt-3 text-xl text-muted">
          {t("Reminders aren't switched on yet. (Whoever set up CareNest needs to run the newest database update.)")}
        </p>
      ) : (
        <>
          {today.length > 0 && (
            <ul className="mt-4 flex flex-col gap-3">
              {today.map((r) => (
                <li
                  key={r.reminder.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-5 py-4 ${stateLook[r.state]}`}
                >
                  {/* Wide enough that on a phone the Remove button goes on its own line. */}
                  <span className="flex min-w-[14rem] flex-1 items-center gap-4">
                    <span aria-hidden="true" className="text-3xl">
                      {iconFor(r.reminder.kind)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xl font-extrabold break-words">{r.reminder.label}</span>
                      <span className="block text-lg font-bold">
                        {niceTime(r.reminder.remind_at, t)} · {stateText(r)}
                      </span>
                    </span>
                  </span>
                  {removing === r.reminder.id ? (
                    <span className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => confirmRemove(r.reminder.id)} className={smallButton}>
                        {t("Yes, remove")}
                      </button>
                      <button type="button" onClick={() => setRemoving(null)} className={smallButton}>
                        {t("Keep it")}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRemoving(r.reminder.id)}
                      className={smallButton}
                      aria-label={t("Remove reminder: {name}", { name: r.reminder.label })}
                    >
                      {t("Remove")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && <p role="alert" className="mt-3 text-lg font-bold text-error">{t(error)}</p>}

          {adding ? (
            <ReminderForm
              onSave={async (kind, label, time) => {
                const problem = await add(kind, label, time);
                if (!problem) setAdding(false);
                return problem;
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            today.length === 0 &&
            loaded && (
              <div className="mt-2">
                <p className="text-xl text-muted">
                  {t(
                    "Only if they need them: add reminders like medicine, meals or a drink of water. At that time the phone on the table shows the reminder and says it out loud, and you'll see here if it was done.",
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className={`${buttonVariants.primary} mt-4 w-full text-xl sm:w-auto`}
                >
                  {t("Add a reminder")}
                </button>
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}

function ReminderForm({
  onSave,
  onCancel,
}: {
  /** Returns an error to show, or "" when it was saved. */
  onSave: (kind: ReminderKind, label: string, time: string) => Promise<string>;
  onCancel: () => void;
}) {
  const id = useId();
  const { t } = useLanguage();
  const [kind, setKind] = useState<ReminderKind>("medicine");
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("08:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(await onSave(kind, label || t(KINDS.find((k) => k.kind === kind)!.name), time));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-5" noValidate>
      <fieldset>
        <legend className="text-xl font-extrabold">{t("What is it for?")}</legend>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {KINDS.map((k) => (
            <label
              key={k.kind}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-[3px] px-4 text-lg font-extrabold transition-colors has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${kind === k.kind ? "border-brand bg-lilac text-brand" : "border-muted bg-surface text-ink hover:border-brand"}`}
            >
              <input
                type="radio"
                name={`${id}-kind`}
                value={k.kind}
                checked={kind === k.kind}
                onChange={() => setKind(k.kind)}
                className="sr-only"
              />
              <span aria-hidden="true" className="text-2xl">
                {k.icon}
              </span>
              {t(k.name)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-label`} className="text-xl font-extrabold">
          {t("Words on the phone")}
        </label>
        <input
          id={`${id}-label`}
          value={label}
          maxLength={MAX_LABEL}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("For example: Heart pills with water")}
          className={input}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-time`} className="text-xl font-extrabold">
          {t("Time, every day")}
        </label>
        <input
          id={`${id}-time`}
          type="time"
          required
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={`${input} sm:w-60`}
        />
      </div>
      {error && (
        <p role="alert" className="text-lg font-bold text-error">
          {t(error)}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={busy} className={`${buttonVariants.primary} text-xl disabled:opacity-70`}>
          {busy ? t("Saving…") : t("Save reminder")}
        </button>
        <button type="button" onClick={onCancel} className={`${buttonVariants.outline} text-xl`}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
