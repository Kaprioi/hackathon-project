// "No movement for a while": a gentle heads-up when the phone camera is on but
// hasn't seen anyone move for a few hours during the day (for example "No movement
// for 3 hours - maybe give Mum a call"). Nights don't count, so a long sleep never
// sets it off. The family page works it out from movement_events, and the phone
// camera page sends a single "inactive" event of its own (see TrackerPage.tsx).
// No React here, so it can be tested with `npm test`.

import { english, type Translate } from "../i18n/translate.ts";
import type { EventKind } from "../tracker/events.ts";
import type { EventRow } from "./status.ts";

// ---------------------------------------------------------------------------
// Settings (saved in this browser, like the other alert settings)
// ---------------------------------------------------------------------------

/** The choices offered for "Tell me if there's no movement for ... hours". */
export const NO_MOVEMENT_HOURS = [1, 2, 3, 4, 6] as const;

/** Daytime when the Care profile has no wake-up / bed times. */
export const DEFAULT_DAY_FROM = "08:00";
export const DEFAULT_DAY_TO = "21:00";

/** The phone camera page has no settings for this, so it always uses 3 hours and 8:00 to 21:00. */
export const CAMERA_NO_MOVEMENT_HOURS = 3;

export interface NoMovementSettings {
  on: boolean;
  /** One of NO_MOVEMENT_HOURS. */
  hours: number;
  /** Daytime, "08:00" style. Only daytime counts. */
  dayFrom: string;
  dayTo: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// The Care profile can save "07:30" or "07:30:00".
const profileTime = (v: unknown) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v) ? v.slice(0, 5) : null);

/**
 * Tidies up saved settings (old, broken or missing) so they can't crash the page.
 * `wake` and `bed` are the Care profile's times, used for daytime until it is changed here.
 */
export function cleanNoMovementSettings(saved: unknown, wake?: unknown, bed?: unknown): NoMovementSettings {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const time = (v: unknown, fallback: string) => (typeof v === "string" && HHMM.test(v) ? v : fallback);
  return {
    on: typeof s.on === "boolean" ? s.on : true,
    hours: (NO_MOVEMENT_HOURS as readonly number[]).includes(s.hours as number) ? (s.hours as number) : 3,
    dayFrom: time(s.dayFrom, profileTime(wake) ?? DEFAULT_DAY_FROM),
    dayTo: time(s.dayTo, profileTime(bed) ?? DEFAULT_DAY_TO),
  };
}

// ---------------------------------------------------------------------------
// Daytime
// ---------------------------------------------------------------------------

/**
 * When today's daytime started, if `now` (in the viewer's own time) is inside it,
 * else null. Daytime can run past midnight (say 10:00 to 01:00); the same time
 * for both means all day.
 */
export function daytimeStart(now: number, dayFrom: string, dayTo: string): number | null {
  const [fh, fm] = dayFrom.split(":").map(Number);
  const from = fh * 60 + fm;
  const [th, tm] = dayTo.split(":").map(Number);
  const to = th * 60 + tm;
  const d = new Date(now);
  const minute = d.getHours() * 60 + d.getMinutes();
  const at = (daysBack: number, h: number, m: number) => {
    const start = new Date(now);
    start.setDate(start.getDate() - daysBack);
    start.setHours(h, m, 0, 0);
    return start.getTime();
  };
  if (from === to) return at(0, 0, 0);
  if (from < to) return minute >= from && minute < to ? at(0, fh, fm) : null;
  if (minute >= from) return at(0, fh, fm);
  if (minute < to) return at(1, fh, fm);
  return null;
}

/**
 * How long (ms) nobody has moved, counting daytime only. 0 at night or while
 * they are moving. `lastActive` is the last time they were seen moving (or the
 * camera started), null if not known.
 */
export function stillFor(now: number, settings: Pick<NoMovementSettings, "dayFrom" | "dayTo">, lastActive: number | null, movingNow: boolean): number {
  const start = daytimeStart(now, settings.dayFrom, settings.dayTo);
  if (start === null || movingNow) return 0;
  return Math.max(0, now - Math.max(start, lastActive ?? -Infinity));
}

// ---------------------------------------------------------------------------
// The family page: worked out from movement_events
// ---------------------------------------------------------------------------

/** News about what the person is doing (not the phone itself). */
const PERSON: readonly EventKind[] = ["moving", "still", "nobody", "fall"];

export interface NoMovement {
  /** True when the heads-up should show. */
  show: boolean;
  /** When the quiet spell (counting daytime only) began, while it shows. */
  since: number | null;
}

/**
 * Should the family page show "No movement for a while"? Only while the camera
 * is on (`cameraOn`: heartbeats arriving) - a camera that is off is "Camera off"
 * instead. `events` is recent news in any order; heartbeats are ignored.
 * Movement counts until the news after it (moving, then still at 10:20 = last
 * moved at 10:20), and the camera starting counts as a fresh start.
 */
export function checkNoMovement(events: EventRow[], now: number, cameraOn: boolean, settings: NoMovementSettings): NoMovement {
  const none = { show: false, since: null };
  if (!settings.on || !cameraOn) return none;
  const oldestFirst = events
    .map((e) => ({ kind: e.kind, at: Date.parse(e.created_at), id: e.id }))
    .filter((e) => e.at <= now + 60_000)
    .sort((a, b) => a.at - b.at || a.id - b.id);
  let lastActive: number | null = null;
  let state: EventKind | null = null;
  for (const e of oldestFirst) {
    if (e.kind === "started") {
      lastActive = e.at;
      state = null;
    } else if (PERSON.includes(e.kind)) {
      if (e.kind === "moving" || state === "moving") lastActive = e.at;
      state = e.kind;
    }
  }
  // A possible fall already has its own (bigger) alert.
  if (state === "fall") return none;
  const quiet = stillFor(now, settings, lastActive, state === "moving");
  if (quiet < settings.hours * 3_600_000) return none;
  return { show: true, since: now - quiet };
}

/** "No movement for 3 hours - maybe give Mum a call." */
export function noMovementLine(since: number, now: number, who: string, t: Translate = english): string {
  const hours = Math.max(1, Math.floor((now - since) / 3_600_000));
  return hours === 1
    ? t("No movement for 1 hour - maybe give {who} a call.", { who })
    : t("No movement for {n} hours - maybe give {who} a call.", { n: hours, who });
}

/** What spoken alerts say, e.g. "CareNest heads-up. No movement for 3 hours - maybe give Mum a call." */
export function spokenNoMovement(since: number, now: number, who: string, t: Translate = english): string {
  return `${t("CareNest heads-up.")} ${noMovementLine(since, now, who, t)}`;
}

// ---------------------------------------------------------------------------
// The phone camera page: send one "inactive" event per quiet spell
// ---------------------------------------------------------------------------

export interface CameraWatch {
  /** Last time someone was seen moving (or the camera started). */
  lastActive: number;
  moving: boolean;
  /** True once "inactive" has been sent for this quiet spell. */
  told: boolean;
}

/** Call when the camera starts watching. */
export function startWatch(now: number): CameraWatch {
  return { lastActive: now, moving: false, told: false };
}

/** Call with each event the camera sends. Any movement starts a new quiet spell. */
export function watchSaw(w: CameraWatch, kind: EventKind, now: number): CameraWatch {
  if (kind === "started") return startWatch(now);
  if (!PERSON.includes(kind)) return w;
  if (kind === "moving") return { lastActive: now, moving: true, told: false };
  return { ...w, lastActive: w.moving ? now : w.lastActive, moving: false };
}

/** True when the camera should send its one "inactive" event now. */
export function shouldSendInactive(
  w: CameraWatch,
  now: number,
  hours = CAMERA_NO_MOVEMENT_HOURS,
  day: Pick<NoMovementSettings, "dayFrom" | "dayTo"> = { dayFrom: DEFAULT_DAY_FROM, dayTo: DEFAULT_DAY_TO },
): boolean {
  return !w.told && stillFor(now, day, w.lastActive, w.moving) >= hours * 3_600_000;
}
