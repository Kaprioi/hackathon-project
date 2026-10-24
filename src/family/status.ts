// Turns the small text events from the phone (movement_events rows) into plain
// words for the family page, like "Moving around - left side - 2 minutes ago".
// No React here, so it can be tested with `npm test`.
// Each function takes an optional `t` to translate the words (English if left out).

import { english, type Translate } from "../i18n/translate.ts";
import type { EventKind, Posture, Zone } from "../tracker/events.ts";

/** One movement_events row, as the family page reads it from Supabase. */
export interface EventRow {
  id: number;
  kind: EventKind;
  zone: Zone | null;
  posture: Posture | null;
  created_at: string;
}

/**
 * If the phone has been silent this long, it has stopped watching (it sends a
 * heartbeat every 30 seconds while it watches). This catches a closed tab, a flat
 * battery or lost internet, which can't send a "stopped" message.
 */
export const PHONE_SILENT_MS = 2 * 60_000;

/** "What is happening" in a few words, e.g. "Moving around" or "Sitting still". */
export function whatHappened(e: Pick<EventRow, "kind" | "posture">, t: Translate = english): string {
  switch (e.kind) {
    case "moving":
      return t("Moving around");
    case "still":
      if (e.posture === "lying") return t("Lying down, resting");
      if (e.posture === "standing") return t("Standing still");
      return t("Sitting still");
    case "nobody":
      return t("Nobody in view");
    case "fall":
      return t("Possible fall");
    case "heartbeat":
      return t("Phone is watching");
    case "started":
      return t("Phone started watching");
    case "stopped":
      return t("Phone stopped watching");
  }
}

/** Where in the room, as seen by the phone. Null when it doesn't apply. */
export function whereInRoom(zone: Zone | null, t: Translate = english): string | null {
  if (zone === "left") return t("left side");
  if (zone === "middle") return t("middle of the room");
  if (zone === "right") return t("right side");
  return null;
}

/** "just now", "1 minute ago", "2 hours ago", "3 days ago". */
export function timeAgo(createdAt: string, now: number, t: Translate = english): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000));
  if (seconds < 60) return t("just now");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? t("1 minute ago") : t("{n} minutes ago", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? t("1 hour ago") : t("{n} hours ago", { n: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t("1 day ago") : t("{n} days ago", { n: days });
}

/** The full status line: "Moving around - left side - 2 minutes ago". */
export function describe(e: EventRow, now: number, t: Translate = english): string {
  const where = e.kind === "nobody" ? null : whereInRoom(e.zone, t);
  return [whatHappened(e, t), where, timeAgo(e.created_at, now, t)].filter(Boolean).join(" - ");
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
  /** True while the camera is watching: heard from lately, and not stopped. */
  cameraOn: boolean;
  /** When the camera stopped watching (its "stopped" news, or when it was last heard from), or null while it watches. */
  stoppedAt: string | null;
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
  const stoppedAt = latest?.kind === "stopped" ? latest.created_at : phoneSilent && lastHeard ? lastHeard.created_at : null;
  const cameraOn = !!lastHeard && !stoppedAt;
  let mood: Mood = "ok";
  if (latest?.kind === "fall") mood = "alert";
  else if (!latest || !cameraOn) mood = "quiet";
  return { latest, mood, lastHeard, phoneSilent, cameraOn, stoppedAt, timeline: real.slice(0, timelineLength) };
}

/**
 * The big "Right now" line. Once the camera has stopped, it says so ("The phone
 * stopped watching at 3:42 pm.") instead of showing its last news as if it were
 * live. A possible fall stays on screen even if the camera went quiet afterwards.
 * `clock` turns a time into words like "3:42 pm".
 */
export function headline(summary: Summary, now: number, clock: (iso: string) => string, t: Translate = english): string | null {
  const { latest, stoppedAt } = summary;
  if (!latest) return null;
  if (stoppedAt && latest.kind !== "fall") return t("The phone stopped watching at {at}.", { at: clock(stoppedAt) });
  return describe(latest, now, t);
}
