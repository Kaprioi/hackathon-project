// Today as a picture, for the family page's tiles and day strip: stretches of time
// (moving, still, nobody in view, camera off) worked out from the phone's short
// events, plus when someone may have fallen. No React here, so `npm test` can check it.
//
// The phone only sends news when something changes (and a heartbeat every 30 s while it
// watches), so each event's state lasts until the next event.

import type { Translate } from "../i18n/translate.ts";
import type { Zone } from "../tracker/events.ts";
import { startOfLocalDay } from "./dailySummary.ts";
import type { EventRow } from "./status.ts";

export type DayState = "moving" | "still" | "nobody" | "off";

export interface Segment {
  from: number;
  to: number;
  state: DayState;
  zone: Zone | null;
}

export interface DayPicture {
  /** The stretch of time the strip shows (ms). */
  from: number;
  to: number;
  segments: Segment[];
  /** When the phone thought someone may have fallen (ms). */
  falls: number[];
  /** Time spent moving around today (ms). */
  movingMs: number;
  /** When they were last seen moving (ms), or null if not today. */
  lastMovedAt: number | null;
  movingNow: boolean;
  /** Where they spent the most time in view, or null if unknown. */
  mostlyZone: Zone | null;
  /** Anything from the phone today at all. */
  hasData: boolean;
}

/** The strip shows at least this much time, so a short demo isn't a sliver. */
export const MIN_WINDOW_MS = 30 * 60_000;

function stateAfter(kind: EventRow["kind"], current: DayState): DayState {
  switch (kind) {
    case "moving":
    case "still":
    case "nobody":
      return kind;
    case "fall":
      return "still"; // on the floor
    case "started":
      return "nobody"; // watching, nothing seen yet
    case "stopped":
      return "off";
    default:
      return current; // heartbeat: nothing changed
  }
}

/**
 * Today so far from the events (any order; heartbeats are fine). `stoppedAt` is when the
 * camera stopped watching (from summarise), or null while it watches.
 */
export function dayPicture(events: EventRow[], now: number, stoppedAt: string | null): DayPicture {
  const dayStart = startOfLocalDay(now);
  const today = events
    .map((e) => ({ e, t: Date.parse(e.created_at) }))
    .filter(({ t }) => t >= dayStart && t <= now)
    .sort((a, b) => a.t - b.t || a.e.id - b.e.id);
  const empty: DayPicture = {
    from: Math.max(dayStart, now - MIN_WINDOW_MS),
    to: now,
    segments: [],
    falls: [],
    movingMs: 0,
    lastMovedAt: null,
    movingNow: false,
    mostlyZone: null,
    hasData: false,
  };
  if (today.length === 0) return empty;

  // The camera's news stops at stoppedAt (a closed tab can't say "stopped" itself).
  const stopMs = stoppedAt ? Math.min(Date.parse(stoppedAt), now) : now;
  const segments: Segment[] = [];
  const falls: number[] = [];
  let state: DayState = "off";
  let zone: Zone | null = null;
  let since = today[0].t;
  const close = (until: number) => {
    if (until > since) segments.push({ from: since, to: until, state, zone });
  };
  for (const { e, t } of today) {
    if (e.kind === "fall") falls.push(t);
    const next = stateAfter(e.kind, state);
    const nextZone: Zone | null = e.kind === "heartbeat" ? zone : e.zone;
    if (next === state && nextZone === zone) continue;
    close(Math.min(t, stopMs));
    since = Math.min(t, stopMs);
    state = next;
    zone = nextZone;
  }
  close(stopMs);
  if (stopMs < now) {
    since = Math.max(since, stopMs);
    state = "off";
    zone = null;
    close(now);
  }

  // Join touching stretches of the same kind, so the strip has fewer, wider blocks.
  const joined: Segment[] = [];
  for (const s of segments) {
    const last = joined[joined.length - 1];
    if (last && last.state === s.state && last.zone === s.zone && last.to === s.from) last.to = s.to;
    else joined.push({ ...s });
  }

  const from = Math.max(dayStart, Math.min(today[0].t, now - MIN_WINDOW_MS));
  const moving = joined.filter((s) => s.state === "moving");
  const byZone = new Map<Zone, number>();
  for (const s of joined) {
    if (s.zone && (s.state === "moving" || s.state === "still")) byZone.set(s.zone, (byZone.get(s.zone) ?? 0) + s.to - s.from);
  }
  const mostlyZone = [...byZone.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const lastSeg = joined[joined.length - 1];
  return {
    from,
    to: now,
    segments: joined,
    falls,
    movingMs: moving.reduce((sum, s) => sum + s.to - s.from, 0),
    lastMovedAt: moving.length ? moving[moving.length - 1].to : null,
    movingNow: lastSeg?.state === "moving" && lastSeg.to === now,
    mostlyZone,
    hasData: true,
  };
}

/** A length of time in words: "under a minute", "25 min", "1 h 20 min". */
export function durationWords(ms: number, t: Translate): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t("under a minute");
  if (minutes < 60) return t("{m} min", { m: minutes });
  return t("{h} h {m} min", { h: Math.floor(minutes / 60), m: minutes % 60 });
}
