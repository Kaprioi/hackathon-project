// Turns today's movement_events into a few calm sentences for the family page,
// like "Up and moving at 7:40 am. Busiest in the morning. Quiet since 9:05 pm."
// No React here, so it can be tested with `npm test`.

import { whatHappened, type EventRow } from "./status.ts";

/** After this long with no movement, the summary says "Quiet since ...". */
export const QUIET_AFTER_MS = 60 * 60_000;

export interface DaySummary {
  /** False when the phone has said nothing about the person today. */
  hasNews: boolean;
  /** Short plain-words sentences, most useful first. */
  lines: string[];
  /** How many possible falls today (shown in red on the page). */
  falls: number;
}

/** "07:40" in the viewer's own time -> "7:40 am". */
export function localTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
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
 * viewer's own clock, and tests pass fixed ones).
 */
export function summariseDay(
  events: EventRow[],
  now: number,
  {
    dayStart = startOfLocalDay(now),
    timeOf = localTime,
    hourOf = (ms: number) => new Date(ms).getHours(),
  }: { dayStart?: number; timeOf?: (ms: number) => string; hourOf?: (ms: number) => number } = {},
): DaySummary {
  const today = events
    .map((e) => ({ e, t: Date.parse(e.created_at) }))
    .filter(({ t }) => t >= dayStart && t <= now + 60_000)
    .sort((a, b) => a.t - b.t || a.e.id - b.e.id);

  // Events about the person (not the phone itself).
  const seen = today.filter(({ e }) => e.kind === "moving" || e.kind === "still" || e.kind === "fall");
  const falls = today.filter(({ e }) => e.kind === "fall");
  const outOfSight = today.filter(({ e }) => e.kind === "nobody");

  if (seen.length === 0 && outOfSight.length === 0) return { hasNews: false, lines: [], falls: 0 };

  const lines: string[] = [];

  const firstMove = seen.find(({ e }) => e.kind === "moving") ?? seen[0];
  if (firstMove) lines.push(`Up and ${firstMove.e.kind === "moving" ? "moving" : "about"} at ${timeOf(firstMove.t)}.`);

  // Busiest part of the day: where most of the "moving around" news came from.
  const moving = seen.filter(({ e }) => e.kind === "moving");
  if (moving.length >= 2) {
    const tally = new Map<string, number>();
    for (const { t } of moving) {
      const part = partOfDay(hourOf(t));
      tally.set(part, (tally.get(part) ?? 0) + 1);
    }
    const [busiest] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    lines.push(`Most active ${PART_WORDS[busiest[0]]}.`);
  }

  if (falls.length > 0) {
    const times = falls.map(({ t }) => timeOf(t)).join(", ");
    lines.push(
      falls.length === 1
        ? `One possible fall, at ${times}. Please check they are okay.`
        : `${falls.length} possible falls, at ${times}. Please check they are okay.`,
    );
  } else {
    lines.push("No possible falls today.");
  }

  if (outOfSight.length > 0)
    lines.push(`Out of the camera's view ${outOfSight.length === 1 ? "once" : `${outOfSight.length} times`}.`);

  const last = seen[seen.length - 1];
  if (last) {
    if (now - last.t >= QUIET_AFTER_MS) lines.push(`Quiet since ${timeOf(last.t)}.`);
    else lines.push(`Last news: ${whatHappened(last.e).toLowerCase()} at ${timeOf(last.t)}.`);
  }

  return { hasNews: true, lines, falls: falls.length };
}
