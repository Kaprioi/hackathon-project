// Turns the small text events from the phone (movement_events rows) into plain
// words for the family page, like "Moving around - left side - 2 minutes ago".
// No React here, so it can be tested with `npm test`.

import type { EventKind, Posture, Zone } from "../tracker/events.ts";

/** One movement_events row, as the family page reads it from Supabase. */
export interface EventRow {
  id: number;
  kind: EventKind;
  zone: Zone | null;
  posture: Posture | null;
  created_at: string;
}

/** If the phone has been silent this long, it is probably off (it sends a heartbeat every minute). */
export const PHONE_SILENT_MS = 3 * 60_000;

/** "What is happening" in a few words, e.g. "Moving around" or "Sitting still". */
export function whatHappened(e: Pick<EventRow, "kind" | "posture">): string {
  switch (e.kind) {
    case "moving":
      return "Moving around";
    case "still":
      if (e.posture === "lying") return "Lying down, resting";
      if (e.posture === "standing") return "Standing still";
      return "Sitting still";
    case "nobody":
      return "Nobody in view";
    case "fall":
      return "Possible fall";
    case "heartbeat":
      return "Phone is watching";
    case "started":
      return "Phone started watching";
    case "stopped":
      return "Phone stopped watching";
  }
}

/** Where in the room, as seen by the phone. Null when it doesn't apply. */
export function whereInRoom(zone: Zone | null): string | null {
  if (zone === "left") return "left side";
  if (zone === "middle") return "middle of the room";
  if (zone === "right") return "right side";
  return null;
}

/** "just now", "1 minute ago", "2 hours ago", "3 days ago". */
export function timeAgo(createdAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** The full status line: "Moving around - left side - 2 minutes ago". */
export function describe(e: EventRow, now: number): string {
  const where = e.kind === "nobody" ? null : whereInRoom(e.zone);
  return [whatHappened(e), where, timeAgo(e.created_at, now)].filter(Boolean).join(" - ");
}

export type Mood = "ok" | "alert" | "quiet";

export interface Summary {
  /** The newest real event (not a heartbeat), or null if there is none yet. */
  latest: EventRow | null;
  /** How worried to look: alert = possible fall, quiet = phone off or silent. */
  mood: Mood;
  /** The newest event of any kind (heartbeats too): when the phone was last heard from. */
  lastHeard: EventRow | null;
  /** True when the phone has said nothing (not even a heartbeat) for a while. */
  phoneSilent: boolean;
  /** Newest first, heartbeats left out. */
  timeline: EventRow[];
}

/** Sums up events (in any order) for the family page. */
export function summarise(events: EventRow[], now: number, timelineLength = 10): Summary {
  const newestFirst = [...events].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const real = newestFirst.filter((e) => e.kind !== "heartbeat");
  const latest = real[0] ?? null;
  const lastHeard = newestFirst[0] ?? null;
  const phoneSilent =
    !!lastHeard && latest?.kind !== "stopped" && now - Date.parse(lastHeard.created_at) > PHONE_SILENT_MS;
  let mood: Mood = "ok";
  if (latest?.kind === "fall") mood = "alert";
  else if (!latest || latest.kind === "stopped" || phoneSilent) mood = "quiet";
  return { latest, mood, lastHeard, phoneSilent, timeline: real.slice(0, timelineLength) };
}
