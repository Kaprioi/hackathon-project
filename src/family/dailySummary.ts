// Turns today's movement_events into a few calm sentences for the family page,
// like "Up and moving at 7:40 am. Busiest in the morning. Quiet since 9:05 pm."
// No React here, so it can be tested with `npm test`.

import { english, type Translate } from "../i18n/translate.ts";
import { whatHappened, type EventRow } from "./status.ts";

/** After this long with no movement, the summary says "Quiet since ...". */
export const QUIET_AFTER_MS = 60 * 60_000;

export interface DaySummary {
  /** False when the phone has said nothing about the person today. */
  hasNews: boolean;
  /** Short plain-words sentences, most useful first. */
  lines: string[];
  /** How many possible falls today. */
  falls: number;
  /** The line about possible falls, when there were any (shown in red on the page). */
  fallLine: string | null;
}

/** "07:40" in the viewer's own time -> "7:40 am". */
export function localTime(ms: number, t: Translate = english): string {
  const d = new Date(ms);
  const h = d.getHours();
  // h24 lets a language use the 24-hour clock instead (Chinese does).
  const time = { h: h % 12 === 0 ? 12 : h % 12, m: String(d.getMinutes()).padStart(2, "0"), h24: h };
  return h < 12 ? t("{h}:{m} am", time) : t("{h}:{m} pm", time);
}

/** Midnight at the start of the viewer's day. */
export function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Which part of the day an hour (0-23) falls in. */
function partOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

const PART_WORDS: Record<string, string> = {
  morning: "in the morning",
  afternoon: "in the afternoon",
  evening: "in the evening",
  night: "at night",
};

/**
 * Sums up one day. `dayStart` is midnight (defaults to the viewer's own midnight);
 * `timeOf` turns a time into words and `hourOf` gives its hour (both default to the
 * viewer's own clock, and tests pass fixed ones). `t` translates the words.
 */
export function summariseDay(
  events: EventRow[],
  now: number,
  {
    t = english,
    dayStart = startOfLocalDay(now),
    timeOf = (ms: number) => localTime(ms, t),
    hourOf = (ms: number) => new Date(ms).getHours(),
  }: { t?: Translate; dayStart?: number; timeOf?: (ms: number) => string; hourOf?: (ms: number) => number } = {},
): DaySummary {
  const today = events
    .map((e) => ({ e, t: Date.parse(e.created_at) }))
    .filter(({ t }) => t >= dayStart && t <= now + 60_000)
    .sort((a, b) => a.t - b.t || a.e.id - b.e.id);

  // Events about the person (not the phone itself).
  const seen = today.filter(({ e }) => e.kind === "moving" || e.kind === "still" || e.kind === "fall");
  const falls = today.filter(({ e }) => e.kind === "fall");
  const outOfSight = today.filter(({ e }) => e.kind === "nobody");

  if (seen.length === 0 && outOfSight.length === 0) return { hasNews: false, lines: [], falls: 0, fallLine: null };

  const lines: string[] = [];

  const firstMove = seen.find(({ e }) => e.kind === "moving") ?? seen[0];
  if (firstMove) {
    const time = { time: timeOf(firstMove.t) };
    lines.push(firstMove.e.kind === "moving" ? t("Up and moving at {time}.", time) : t("Up and about at {time}.", time));
  }

  // Busiest part of the day: where most of the "moving around" news came from.
  const moving = seen.filter(({ e }) => e.kind === "moving");
  if (moving.length >= 2) {
    const tally = new Map<string, number>();
    for (const { t } of moving) {
      const part = partOfDay(hourOf(t));
      tally.set(part, (tally.get(part) ?? 0) + 1);
    }
    const [busiest] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    lines.push(t("Most active {when}.", { when: t(PART_WORDS[busiest[0]]) }));
  }

  let fallLine: string | null = null;
  if (falls.length > 0) {
    const times = falls.map(({ t: at }) => timeOf(at)).join(", ");
    fallLine =
      falls.length === 1
        ? t("One possible fall, at {times}. Please check they are okay.", { times })
        : t("{n} possible falls, at {times}. Please check they are okay.", { n: falls.length, times });
    lines.push(fallLine);
  } else {
    lines.push(t("No possible falls today."));
  }

  if (outOfSight.length > 0)
    lines.push(
      outOfSight.length === 1
        ? t("Out of the camera's view once.")
        : t("Out of the camera's view {n} times.", { n: outOfSight.length }),
    );

  const last = seen[seen.length - 1];
  if (last) {
    if (now - last.t >= QUIET_AFTER_MS) lines.push(t("Quiet since {time}.", { time: timeOf(last.t) }));
    else
      lines.push(
        t("Last news: {what} at {time}.", { what: whatHappened(last.e, t).toLowerCase(), time: timeOf(last.t) }),
      );
  }

  return { hasNews: true, lines, falls: falls.length, fallLine };
}

/**
 * The whole "Today so far" card as one short spoken update, e.g.
 * "Here is today so far for Mum. Up and moving at 7:40 am. ..."
 */
export function spokenDay(day: DaySummary, who: string, t: Translate = english): string {
  if (!day.hasNews) return t("There is no news from the phone camera yet today.");
  return [t("Here is today so far for {who}.", { who }), ...day.lines].join(" ");
}
