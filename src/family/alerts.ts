// Extra helpers for the family page: the sentence "Read aloud" speaks, each
// person's alert settings (which alerts to highlight, quiet hours), and the
// "Sam is checking on it" line. No React here, so it can be tested with `npm test`.

import { whatHappened, whereInRoom, type EventRow, type Summary } from "./status.ts";

// ---------------------------------------------------------------------------
// Read aloud
// ---------------------------------------------------------------------------

/** How "Read aloud" says what is happening, a bit friendlier than the screen. */
function spokenActivity(e: Pick<EventRow, "kind" | "posture">): string {
  switch (e.kind) {
    case "moving":
      return "moving about";
    case "still":
      if (e.posture === "lying") return "lying down, resting";
      if (e.posture === "standing") return "standing still";
      return "sitting still";
    default:
      return whatHappened(e).toLowerCase();
  }
}

/**
 * The sentence spoken for the "Right now" card, e.g.
 * "Mum is okay, moving about. Last update at 10:38."
 * `clock` turns a time into words like "10:38".
 */
export function spokenStatus(summary: Summary, who: string, clock: (iso: string) => string): string {
  const { latest } = summary;
  if (!latest) return "There is no news from the phone yet.";
  const at = clock(latest.created_at);
  if (latest.kind === "fall")
    return `The phone thinks ${who} may have fallen, at ${at}. Please call or visit to check they are okay.`;
  if (summary.phoneSilent && summary.lastHeard)
    return `The phone has not checked in since ${clock(summary.lastHeard.created_at)}. Please check it is switched on and charging.`;
  if (latest.kind === "stopped") return `The phone stopped watching at ${at}.`;
  if (latest.kind === "started") return `The phone started watching at ${at}.`;
  if (latest.kind === "nobody") return `Nobody is in view of the phone. Last update at ${at}.`;
  return `${who} is okay, ${spokenActivity(latest)}. Last update at ${at}.`;
}

/** The sentence spoken for one line of Recent news, e.g. "Possible fall, left side, at 10:38." */
export function spokenEvent(e: EventRow, clock: (iso: string) => string): string {
  const where = e.kind === "nobody" ? null : whereInRoom(e.zone);
  return `${[whatHappened(e), where].filter(Boolean).join(", ")}, at ${clock(e.created_at)}.`;
}

/** The name to use when speaking: what the Care profile calls them, else "Your loved one". */
export function whoToSpeakOf(savedName: unknown): string {
  const name = typeof savedName === "string" ? savedName.trim() : "";
  return name || "Your loved one";
}

// ---------------------------------------------------------------------------
// Alert settings (saved in this browser for now)
// ---------------------------------------------------------------------------

/** The kinds of worrying news a person can choose to have highlighted. */
export type AlertType = "fall" | "outOfSight";

export interface AlertSettings {
  /** Highlight possible falls. */
  falls: boolean;
  /** Highlight "Nobody in view" (out of sight / no movement seen). */
  outOfSight: boolean;
  /** Quiet hours: highlights are toned down between `quietFrom` and `quietTo`. */
  quietHours: boolean;
  /** "22:00" style times. */
  quietFrom: string;
  quietTo: string;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  falls: true,
  outOfSight: true,
  quietHours: false,
  quietFrom: "22:00",
  quietTo: "07:00",
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Tidies up saved settings (old, broken or missing) so they can't crash the page. */
export function cleanAlertSettings(saved: unknown): AlertSettings {
  const s = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const bool = (key: keyof AlertSettings) =>
    typeof s[key] === "boolean" ? (s[key] as boolean) : (DEFAULT_ALERT_SETTINGS[key] as boolean);
  const time = (key: "quietFrom" | "quietTo") =>
    typeof s[key] === "string" && HHMM.test(s[key] as string) ? (s[key] as string) : DEFAULT_ALERT_SETTINGS[key];
  return {
    falls: bool("falls"),
    outOfSight: bool("outOfSight"),
    quietHours: bool("quietHours"),
    quietFrom: time("quietFrom"),
    quietTo: time("quietTo"),
  };
}

/** Which kind of worrying news an event is, or null if it is ordinary news. */
export function alertType(e: Pick<EventRow, "kind">): AlertType | null {
  if (e.kind === "fall") return "fall";
  if (e.kind === "nobody") return "outOfSight";
  return null;
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** True when `when` (in the viewer's own time) falls inside quiet hours. Overnight ranges work. */
export function isQuietTime(settings: AlertSettings, when: Date): boolean {
  if (!settings.quietHours) return false;
  const from = minutesOf(settings.quietFrom);
  const to = minutesOf(settings.quietTo);
  const now = when.getHours() * 60 + when.getMinutes();
  if (from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** How an event should look in Recent news: highlighted, toned down (quiet hours), or ordinary. */
export function highlightFor(e: EventRow, settings: AlertSettings): "highlight" | "quiet" | "none" {
  const type = alertType(e);
  if (!type) return "none";
  const wanted = type === "fall" ? settings.falls : settings.outOfSight;
  if (!wanted) return "none";
  return isQuietTime(settings, new Date(e.created_at)) ? "quiet" : "highlight";
}

// ---------------------------------------------------------------------------
// "I'm checking on it"
// ---------------------------------------------------------------------------

/** Events that get an "I'm checking on it" button: possible falls only. */
export function canCheckOn(e: Pick<EventRow, "kind">): boolean {
  return e.kind === "fall";
}

/** A short name for a person: their display name, else the start of their email. */
export function shortName(profile: { display_name?: string | null; email?: string | null } | undefined): string {
  const name = profile?.display_name?.trim();
  if (name) return name;
  const email = profile?.email?.trim();
  if (email) return email.split("@")[0];
  return "Someone";
}

/** "Sam is checking on it", "You and Sam are checking on it", "Sam, Ali and Jo are checking on it". */
export function checkingLine(names: string[]): string {
  if (names.length === 0) return "";
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const verb = names.length === 1 && names[0] !== "You" ? "is" : "are";
  return `${list} ${verb} checking on it`;
}
