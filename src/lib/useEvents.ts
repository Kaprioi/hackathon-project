import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// One row of the "events" table the SightLine stand writes (see hardware/supabase.sql).
export type CareEvent = {
  id: number;
  created_at: string;
  device: string;
  type: string; // 'out_of_sight' or 'back_in_view'
  message: string | null;
  pan_angle: number | null;
};

export type EventsState =
  | { status: "loading" }
  | { status: "not-set-up" } // the events table hasn't been created in Supabase yet
  | { status: "error"; message: string }
  | { status: "ready"; events: CareEvent[] };

const HOW_MANY = 20;

// The latest alerts, newest first. New alerts appear by themselves (Supabase Realtime).
export function useEvents(): EventsState {
  const [state, setState] = useState<EventsState>({ status: "loading" });

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let stopped = false;

    client
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(HOW_MANY)
      .then(({ data, error }) => {
        if (stopped) return;
        if (error) {
          // PGRST205 / 42P01 = the table doesn't exist yet.
          if (error.code === "PGRST205" || error.code === "42P01") setState({ status: "not-set-up" });
          else setState({ status: "error", message: error.message });
          return;
        }
        setState({ status: "ready", events: data as CareEvent[] });
      });

    const channel = client
      .channel("dashboard-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (payload) => {
        const added = payload.new as CareEvent;
        setState((current) =>
          current.status === "ready"
            ? { status: "ready", events: [added, ...current.events.filter((e) => e.id !== added.id)].slice(0, HOW_MANY) }
            : current,
        );
      })
      .subscribe();

    return () => {
      stopped = true;
      client.removeChannel(channel);
    };
  }, []);

  return state;
}
