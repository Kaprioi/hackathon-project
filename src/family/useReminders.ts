import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { cleanLabel, cleanTime, dayKey, isKind, type Reminder, type ReminderCheck, type ReminderKind } from "./reminders";

// Daily reminders for one care circle: loads them and today's "I did it" presses,
// keeps them up to date live (and once a minute, in case a live update is missed),
// and adds, removes and marks them done. Used by both the family page and the phone
// on the table. Needs the tables from
// supabase/migrations/20261024030000_daily_reminders.sql; if they haven't been
// added yet, `available` is false and the page shows a friendly note instead.

/** Postgres / Supabase codes for "that table doesn't exist (yet)". */
function isMissingTable(error: { code?: string } | null): boolean {
  return !!error && ["42P01", "PGRST205", "PGRST200"].includes(error.code ?? "");
}

const TRY_AGAIN = "Sorry, that didn't work. Please check your internet and try again.";

export function useReminders(circleId: string | undefined) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [checks, setChecks] = useState<ReminderCheck[]>([]);
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    if (!circleId || !supabase) return;
    // Yesterday too, so a phone and a family page a few hours apart still agree.
    const since = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    Promise.all([
      supabase.from("reminders").select("id, kind, label, remind_at").eq("circle_id", circleId).limit(100),
      supabase
        .from("reminder_checks")
        .select("reminder_id, day, done_at")
        .eq("circle_id", circleId)
        .gte("day", since)
        .limit(500),
    ]).then(([r, c]) => {
      const error = r.error ?? c.error;
      if (error) {
        setAvailable(!isMissingTable(error));
        return;
      }
      setAvailable(true);
      setLoaded(true);
      setReminders(((r.data ?? []) as Reminder[]).filter((x) => isKind(x.kind)));
      setChecks((c.data ?? []) as ReminderCheck[]);
    });
  }, [circleId]);

  useEffect(() => {
    if (!circleId || !supabase) return;
    const db = supabase;
    load();
    const channel = db
      .channel(`reminders-${circleId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reminders", filter: `circle_id=eq.${circleId}` }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reminder_checks", filter: `circle_id=eq.${circleId}` }, load)
      .subscribe();
    const timer = setInterval(load, 60_000);
    return () => {
      clearInterval(timer);
      db.removeChannel(channel);
    };
  }, [circleId, load]);

  /** Adds a reminder. Returns an error message to show, or "" when it worked. */
  async function add(kind: ReminderKind, label: string, time: string): Promise<string> {
    if (!circleId || !supabase) return TRY_AGAIN;
    const words = cleanLabel(label);
    const at = cleanTime(time);
    if (!words) return "Please write what the reminder is for.";
    if (!at) return "Please choose a time.";
    const { error } = await supabase.from("reminders").insert({ circle_id: circleId, kind, label: words, remind_at: at });
    if (error) {
      if (isMissingTable(error)) setAvailable(false);
      return TRY_AGAIN;
    }
    load();
    return "";
  }

  async function remove(id: string): Promise<string> {
    if (!supabase) return TRY_AGAIN;
    const { error } = await supabase.from("reminders").delete().eq("id", id);
    if (error) return TRY_AGAIN;
    setReminders((old) => old.filter((r) => r.id !== id));
    return "";
  }

  /** "I did it": marks the reminder done for today on this device's clock. */
  async function markDone(id: string): Promise<string> {
    if (!circleId || !supabase) return TRY_AGAIN;
    const day = dayKey(new Date());
    // Show it straight away; the database catches up.
    setChecks((old) => [...old, { reminder_id: id, day, done_at: new Date().toISOString() }]);
    const { error } = await supabase.from("reminder_checks").insert({ reminder_id: id, circle_id: circleId, day });
    // "23505" means it was already marked done (maybe from another phone), which is fine.
    if (error && error.code !== "23505") {
      setChecks((old) => old.filter((c) => !(c.reminder_id === id && c.day === day)));
      return TRY_AGAIN;
    }
    return "";
  }

  return { reminders, checks, available, loaded, add, remove, markDone };
}
