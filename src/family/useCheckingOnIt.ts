import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { shortName } from "./alerts";

// "I'm checking on it": loads who is checking on which alert in this care circle,
// listens live for new ones, and saves your own press. Needs the
// event_acknowledgements table from supabase/migrations/20261024020000_checking_on_it.sql.
// If that hasn't been run yet, the button shows a friendly message instead.

interface Ack {
  event_id: number;
  user_id: string;
}

const NOT_SET_UP =
  "Sorry, this button isn't switched on yet. Please phone or message the family instead. (Whoever set up CareNest needs to run the newest database update.)";

/** Postgres / Supabase codes for "that table doesn't exist (yet)". */
function isMissingTable(error: { code?: string } | null): boolean {
  return !!error && ["42P01", "PGRST205", "PGRST200"].includes(error.code ?? "");
}

export function useCheckingOnIt(circleId: string | undefined, userId: string) {
  const [acks, setAcks] = useState<Ack[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!circleId) return;
    const db = supabase!;
    let cancelled = false;

    const add = (incoming: Ack[]) =>
      setAcks((old) => {
        const seen = new Set(old.map((a) => `${a.event_id}/${a.user_id}`));
        return [...old, ...incoming.filter((a) => !seen.has(`${a.event_id}/${a.user_id}`))];
      });

    function load() {
      db.from("event_acknowledgements")
        .select("event_id, user_id")
        .eq("circle_id", circleId!)
        .order("created_at", { ascending: true })
        .limit(200)
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) return setAvailable(!isMissingTable(error));
          setAvailable(true);
          add((data ?? []) as Ack[]);
        });
    }

    // Names of people in the circle (you can see yourself and your circle mates).
    db.from("profiles")
      .select("id, display_name, email")
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNames(Object.fromEntries(data.map((p) => [p.id, shortName(p)])));
      });

    // Its own channel, so if the table is missing the main live news still works.
    const channel = db
      .channel(`checking-${circleId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "event_acknowledgements", filter: `circle_id=eq.${circleId}` },
        (payload) => add([payload.new as Ack]),
      )
      .subscribe((status) => {
        if (!cancelled && status === "SUBSCRIBED") load();
      });

    load();
    return () => {
      cancelled = true;
      db.removeChannel(channel);
    };
  }, [circleId]);

  /** Who is checking on this event, you first ("You", "Sam"). */
  function whoIsChecking(eventId: number): string[] {
    const users = acks.filter((a) => a.event_id === eventId).map((a) => a.user_id);
    const others = users.filter((u) => u !== userId).map((u) => names[u] ?? "Someone in the family");
    return users.includes(userId) ? ["You", ...others] : others;
  }

  async function check(eventId: number) {
    if (!circleId) return;
    if (!available) return setMessages((m) => ({ ...m, [eventId]: NOT_SET_UP }));
    setBusy(eventId);
    setMessages((m) => ({ ...m, [eventId]: "" }));
    const { error } = await supabase!
      .from("event_acknowledgements")
      .insert({ event_id: eventId, circle_id: circleId, user_id: userId });
    setBusy(null);
    // "23505" means you had already pressed it, which is fine.
    if (error && error.code !== "23505") {
      if (isMissingTable(error)) setAvailable(false);
      return setMessages((m) => ({
        ...m,
        [eventId]: isMissingTable(error) ? NOT_SET_UP : "Sorry, that didn't work. Please check your internet and try again.",
      }));
    }
    setAcks((old) =>
      old.some((a) => a.event_id === eventId && a.user_id === userId) ? old : [...old, { event_id: eventId, user_id: userId }],
    );
  }

  return {
    whoIsChecking,
    isMine: (eventId: number) => acks.some((a) => a.event_id === eventId && a.user_id === userId),
    isBusy: (eventId: number) => busy === eventId,
    messageFor: (eventId: number) => messages[eventId] ?? "",
    check,
  };
}
