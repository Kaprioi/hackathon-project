import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { checkNoMovement, type NoMovement, type NoMovementSettings } from "./noMovement";
import type { EventRow } from "./status";

// "No movement for a while" on the family page. The page's own list of news only
// reaches back a few minutes (heartbeats fill it up), so this loads the last day's
// news about the person once, and adds the page's live news to it as it arrives.
// The sum itself is checkNoMovement() in noMovement.ts.

const COLUMNS = "id, kind, zone, posture, created_at";
const DAY_MS = 24 * 3_600_000;
const MAX_ROWS = 300;

export function useNoMovement({
  circleId,
  liveEvents,
  now,
  cameraOn,
  settings,
}: {
  circleId: string | undefined;
  /** The page's latest news, including what arrives live. */
  liveEvents: EventRow[];
  now: number;
  cameraOn: boolean;
  settings: NoMovementSettings;
}): NoMovement {
  const [history, setHistory] = useState<EventRow[]>([]);

  useEffect(() => {
    if (!circleId || !supabase) return;
    let cancelled = false;
    const load = () =>
      supabase!
        .from("movement_events")
        .select(COLUMNS)
        .eq("circle_id", circleId)
        .neq("kind", "heartbeat")
        .gte("created_at", new Date(Date.now() - DAY_MS).toISOString())
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS)
        .then(({ data, error }) => {
          // Without it the heads-up just waits for live news, so no error message here.
          if (!cancelled && !error) setHistory((data ?? []) as EventRow[]);
        });
    load();
    // Now and then, in case live news was missed while offline.
    const timer = setInterval(load, 10 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [circleId]);

  const byId = new Map(history.map((e) => [e.id, e]));
  for (const e of liveEvents) byId.set(e.id, e);
  return checkNoMovement([...byId.values()], now, cameraOn, settings);
}
