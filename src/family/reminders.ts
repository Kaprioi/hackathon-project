// The plain logic behind daily reminders ("Heart pills at 8:00", "Lunch at 12:30"):
// tidying what people type, when a reminder is due on the phone, and how each one
// is doing today on the family page. No React here, so it can be tested with `npm test`.
// The tables are in supabase/migrations/20261024030000_daily_reminders.sql.

import { english, type Translate } from "../i18n/translate.ts";

export type ReminderKind = "medicine" | "meal" | "drink" | "other";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  label: string;
  /** "08:00" (the database may add seconds: "08:00:00"). */
  remind_at: string;
}

export interface ReminderCheck {
  reminder_id: string;
  /** The phone's date, like "2026-10-24". */
  day: string;
  done_at: string;
}

/** The choices on the "Add a reminder" form, with a picture for each. */
export const KINDS: { kind: ReminderKind; name: string; icon: string }[] = [
  { kind: "medicine", name: "Medicine", icon: "💊" },
  { kind: "meal", name: "Meal", icon: "🍽️" },
  { kind: "drink", name: "Drink water", icon: "💧" },
  { kind: "other", name: "Something else", icon: "⏰" },
];

export const MAX_LABEL = 60;
/** How long a reminder stays on the phone before it counts as missed. */
export const DUE_FOR_MINUTES = 60;
/** "Later" hides it on the phone for this long, then it comes back. */
export const SNOOZE_MINUTES = 10;

export function iconFor(kind: ReminderKind): string {
  return KINDS.find((k) => k.kind === kind)?.icon ?? "⏰";
}

export function isKind(value: unknown): value is ReminderKind {
  return KINDS.some((k) => k.kind === value);
}

/** Tidies typed words: single spaces, no hidden control characters, not too long. "" if empty. */
export function cleanLabel(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL);
}

/** "8:05", "08:05" or "08:05:00" -> minutes after midnight (485). null if it isn't a time. */
export function minutesOf(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** "08:00:00" -> "08:00", ready for the database and the time box. "" if it isn't a time. */
export function cleanTime(time: string): string {
  const mins = minutesOf(time);
  return mins === null ? "" : `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** The local date, like "2026-10-24" (not toISOString, which uses London time). */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function minutesNow(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Earliest first, so the list reads like the day. Broken rows are left out. */
export function sortReminders(list: Reminder[]): Reminder[] {
  return list.filter((r) => minutesOf(r.remind_at) !== null).sort((a, b) => minutesOf(a.remind_at)! - minutesOf(b.remind_at)!);
}

/**
 * What the phone on the table should show right now: reminders whose time has come
 * in the last hour, not done today and not put off with "Later". Earliest first.
 * `snoozed` maps a reminder id to when "Later" runs out (ms).
 */
export function dueNow(list: Reminder[], checks: ReminderCheck[], snoozed: Record<string, number>, now: Date): Reminder[] {
  const today = dayKey(now);
  const mins = minutesNow(now);
  const done = new Set(checks.filter((c) => c.day === today).map((c) => c.reminder_id));
  return sortReminders(list).filter((r) => {
    const at = minutesOf(r.remind_at)!;
    return mins >= at && mins < at + DUE_FOR_MINUTES && !done.has(r.id) && !((snoozed[r.id] ?? 0) > now.getTime());
  });
}

export type ReminderState = "done" | "now" | "missed" | "later";

export interface ReminderToday {
  reminder: Reminder;
  state: ReminderState;
  /** When "I did it" was pressed, if it was. */
  doneAt?: string;
}

/** How each reminder is doing today, for the family page. */
export function remindersToday(list: Reminder[], checks: ReminderCheck[], now: Date): ReminderToday[] {
  const today = dayKey(now);
  const mins = minutesNow(now);
  return sortReminders(list).map((reminder) => {
    const check = checks.find((c) => c.reminder_id === reminder.id && c.day === today);
    if (check) return { reminder, state: "done", doneAt: check.done_at };
    const at = minutesOf(reminder.remind_at)!;
    const state: ReminderState = mins < at ? "later" : mins < at + DUE_FOR_MINUTES ? "now" : "missed";
    return { reminder, state };
  });
}

/** What the phone says out loud, like "Reminder: it's time for your medicine. Heart pills." */
export function spokenReminder(r: Reminder, t: Translate = english): string {
  const intro =
    r.kind === "medicine"
      ? t("Reminder: it's time for your medicine.")
      : r.kind === "meal"
        ? t("Reminder: it's time to eat.")
        : r.kind === "drink"
          ? t("Reminder: it's time for a drink of water.")
          : t("Reminder:");
  return `${intro} ${r.label}.`.replace(/\.\.$/, ".");
}
