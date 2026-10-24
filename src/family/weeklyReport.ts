// The "This week" report (/report): the last 7 days of movement_events turned into
// numbers for simple charts (moving around per day, when in the day they are up and
// about) and a few plain-words lines comparing with the week before, like
// "A bit less active than last week." and "2 more night-time trips than last week."
// Also makes a pretend week, so the page can be shown before a phone has been watching.
// No React here, so it can be tested with `npm test`.

import { english, type Translate } from "../i18n/translate.ts";
import { startOfLocalDay } from "./dailySummary.ts";
import { PHONE_SILENT_MS, type EventRow } from "./status.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** One "moving" news counts as this much time moving around at most (the phone only says when it starts). */
export const MOVING_SPAN_MS = 30 * MINUTE;
/** Night-time movement closer together than this is one trip (up to the bathroom and back). */
export const TRIP_GAP_MS = 30 * MINUTE;
/** Night hours when the Care profile doesn't say when they go to bed and get up. */
export const DEFAULT_NIGHT = { from: 22 * 60, to: 7 * 60 };

/** Night time as minutes after midnight, e.g. 22:00 to 07:00 is { from: 1320, to: 420 }. */
export interface Night {
  from: number;
  to: number;
}

export interface DayReport {
  /** Midnight at the start of this day. */
  start: number;
  /** Rough minutes spent moving around. */
  activeMinutes: number;
  /** Minutes moving around in each hour of the day (24 numbers), for the heat strip. */
  hours: number[];
  falls: number;
  nightTrips: number;
  /** Minutes the camera wasn't watching (only counted up to now for today). */
  cameraOffMinutes: number;
  /** False when the phone said nothing about the person this day. */
  hasNews: boolean;
}

export interface WeekTotals {
  activeMinutes: number;
  falls: number;
  nightTrips: number;
  /** How many days had any news about the person. */
  daysWithNews: number;
}

export interface WeekReport {
  /** The last 7 days, oldest first; the last one is today. */
  days: DayReport[];
  thisWeek: WeekTotals & { cameraOffMinutes: number };
  lastWeek: WeekTotals;
  /** False when there is too little news for a report (the page shows a friendly note instead). */
  hasEnough: boolean;
  /** Plain-words summary, most useful first. */
  lines: string[];
  /** The line about possible falls, when there were any (shown in red on the page). */
  fallLine: string | null;
  night: Night;
}

/** "HH:MM" -> minutes after midnight, or null. */
function minutesOf(hhmm: unknown): number | null {
  if (typeof hhmm !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Night hours from the Care profile's "goes to bed" and "wakes up" answers, else 10 pm to 7 am. */
export function nightFrom(bed: unknown, wake: unknown): Night {
  const from = minutesOf(bed);
  const to = minutesOf(wake);
  if (from === null || to === null || from === to) return DEFAULT_NIGHT;
  return { from, to };
}

export function isNight(minuteOfDay: number, night: Night): boolean {
  return night.from > night.to
    ? minuteOfDay >= night.from || minuteOfDay < night.to
    : minuteOfDay >= night.from && minuteOfDay < night.to;
}

const PERSON_KINDS = new Set(["moving", "still", "fall", "nobody"]);

export interface ReportOptions {
  t?: Translate;
  night?: Night;
  /** Midnight at the start of the day `ms` is in (the viewer's own by default; tests pass UTC). */
  startOfDay?: (ms: number) => number;
}

/** Midnights of the `count` days ending today, oldest first (safe across clock changes). */
export function dayStarts(now: number, count: number, startOfDay: (ms: number) => number = startOfLocalDay): number[] {
  const today = startOfDay(now);
  // Noon k days ago is always on the right day, even when a day is 23 or 25 hours long.
  return Array.from({ length: count }, (_, i) => startOfDay(today - (count - 1 - i) * DAY + 12 * HOUR));
}

/**
 * Builds the report. `events` can be in any order and should cover the last 14 days
 * (heartbeats are only needed for this week, for the camera-off time).
 */
export function weeklyReport(
  events: EventRow[],
  now: number,
  { t = english, night = DEFAULT_NIGHT, startOfDay = startOfLocalDay }: ReportOptions = {},
): WeekReport {
  // starts[0..6] are last week, starts[7..13] this week (ending today).
  const starts = dayStarts(now, 14, startOfDay);
  const lastWeekStart = starts[0];
  const thisWeekStart = starts[7];
  const ends = [...starts.slice(1), startOfDay(starts[13] + DAY + 12 * HOUR)];

  const sorted = events
    .map((e) => ({ e, at: Date.parse(e.created_at) }))
    .filter(({ at }) => Number.isFinite(at) && at >= lastWeekStart && at <= now + MINUTE)
    .sort((a, b) => a.at - b.at || a.e.id - b.e.id);
  const real = sorted.filter(({ e }) => e.kind !== "heartbeat");

  const blank = (start: number): DayReport => ({
    start,
    activeMinutes: 0,
    hours: Array(24).fill(0),
    falls: 0,
    nightTrips: 0,
    cameraOffMinutes: 0,
    hasNews: false,
  });
  const all = starts.map(blank);
  const dayIndex = (ms: number) => {
    for (let i = 13; i >= 0; i--) if (ms >= all[i].start) return i;
    return -1;
  };
  const minuteOfDay = (ms: number) => Math.floor((ms - startOfDay(ms)) / MINUTE);

  // Moving around: from each "moving" news until the next news (heartbeats aside), at most MOVING_SPAN_MS.
  let lastNightMove = -Infinity;
  real.forEach(({ e, at }, i) => {
    const day = dayIndex(at);
    if (day < 0) return;
    if (PERSON_KINDS.has(e.kind)) all[day].hasNews = true;
    if (e.kind === "fall") all[day].falls++;
    if (e.kind !== "moving") return;
    const next = real[i + 1]?.at ?? Infinity;
    const end = Math.min(next, at + MOVING_SPAN_MS, now);
    addMoving(at, end);
    if (isNight(minuteOfDay(at), night)) {
      if (at - lastNightMove > TRIP_GAP_MS) all[day].nightTrips++;
      lastNightMove = at;
    }
  });

  function addMoving(from: number, to: number) {
    let at = from;
    while (at < to) {
      const day = dayIndex(at);
      const hour = Math.min(23, Math.floor(minuteOfDay(at) / 60));
      // To the end of this hour (or the end of the moving), whichever comes first.
      const hourEnd = Math.min(to, startOfDay(at) + (hour + 1) * HOUR, ends[day]);
      const minutes = (hourEnd - at) / MINUTE;
      all[day].activeMinutes += minutes;
      all[day].hours[hour] += minutes;
      at = hourEnd > at ? hourEnd : to;
    }
  }

  // Camera on: after each message the phone is watching until its next one, or for
  // PHONE_SILENT_MS if nothing follows (a heartbeat comes every 30 seconds). "stopped" ends it.
  const watching: [number, number][] = [];
  const thisWeekAll = sorted.filter(({ at }) => at >= thisWeekStart);
  thisWeekAll.forEach(({ e, at }, i) => {
    if (e.kind === "stopped") return;
    const next = thisWeekAll[i + 1]?.at ?? Infinity;
    const end = Math.min(next, at + PHONE_SILENT_MS, now);
    if (end > at) watching.push([at, end]);
  });
  for (let d = 7; d < 14; d++) {
    const from = all[d].start;
    const to = Math.min(ends[d], now);
    if (to <= from) continue;
    let on = 0;
    for (const [a, b] of watching) on += Math.max(0, Math.min(b, to) - Math.max(a, from));
    all[d].cameraOffMinutes = Math.max(0, (to - from - on) / MINUTE);
  }

  const round = (d: DayReport): DayReport => ({
    ...d,
    activeMinutes: Math.round(d.activeMinutes),
    hours: d.hours.map((m) => Math.round(m)),
    cameraOffMinutes: Math.round(d.cameraOffMinutes),
  });
  const days = all.slice(7).map(round);
  const previous = all.slice(0, 7).map(round);
  const totals = (list: DayReport[]): WeekTotals => ({
    activeMinutes: list.reduce((s, d) => s + d.activeMinutes, 0),
    falls: list.reduce((s, d) => s + d.falls, 0),
    nightTrips: list.reduce((s, d) => s + d.nightTrips, 0),
    daysWithNews: list.filter((d) => d.hasNews).length,
  });
  const thisWeek = { ...totals(days), cameraOffMinutes: days.reduce((s, d) => s + d.cameraOffMinutes, 0) };
  const lastWeek = totals(previous);
  const hasEnough = thisWeek.daysWithNews > 0;
  const { lines, fallLine } = hasEnough
    ? summaryLines(days, thisWeek, lastWeek, t)
    : { lines: [], fallLine: null };
  return { days, thisWeek, lastWeek, hasEnough, lines, fallLine, night };
}

const PART_WORDS: Record<string, string> = {
  morning: "in the morning",
  afternoon: "in the afternoon",
  evening: "in the evening",
  night: "at night",
};

function partOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function summaryLines(
  days: DayReport[],
  thisWeek: WeekReport["thisWeek"],
  lastWeek: WeekTotals,
  t: Translate,
): { lines: string[]; fallLine: string | null } {
  const lines: string[] = [];
  const canCompare = lastWeek.daysWithNews > 0;

  // How active, compared with last week: per day with news, so days with the camera off
  // don't count as "less active". Today isn't over yet, so it is left out of this.
  const fullDays = days.slice(0, -1).filter((d) => d.hasNews);
  if (!canCompare) lines.push(t("This is the first week with news, so there is nothing to compare with yet."));
  else if (fullDays.length > 0) {
    const now = fullDays.reduce((s, d) => s + d.activeMinutes, 0) / fullDays.length;
    const before = lastWeek.activeMinutes / lastWeek.daysWithNews;
    const ratio = before > 0 ? now / before : now > 0 ? Infinity : 1;
    if (ratio < 0.6) lines.push(t("Much less active than last week."));
    else if (ratio < 0.85) lines.push(t("A bit less active than last week."));
    else if (ratio > 1.4) lines.push(t("Much more active than last week."));
    else if (ratio > 1.15) lines.push(t("A bit more active than last week."));
    else lines.push(t("About as active as last week."));
  }

  // Busiest part of the day, over the whole week.
  if (thisWeek.activeMinutes > 0) {
    const tally = new Map<string, number>();
    for (const d of days) d.hours.forEach((m, h) => tally.set(partOfDay(h), (tally.get(partOfDay(h)) ?? 0) + m));
    const [busiest] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    lines.push(t("Usually most active {when}.", { when: t(PART_WORDS[busiest[0]]) }));
  }

  lines.push(nightLine(thisWeek.nightTrips, canCompare ? lastWeek.nightTrips : null, t));

  let fallLine: string | null = null;
  if (thisWeek.falls === 0) lines.push(t("No possible falls this week."));
  else {
    fallLine =
      thisWeek.falls === 1
        ? t("One possible fall this week.")
        : t("{n} possible falls this week.", { n: thisWeek.falls });
    lines.push(fallLine);
  }

  const offHours = Math.round(thisWeek.cameraOffMinutes / 60);
  if (thisWeek.cameraOffMinutes < 30) lines.push(t("The camera was watching all week."));
  else if (offHours <= 1) lines.push(t("The camera was off for about an hour this week."));
  else lines.push(t("The camera was off for about {n} hours this week.", { n: offHours }));

  return { lines, fallLine };
}

function nightLine(now: number, before: number | null, t: Translate): string {
  if (before === null || (now === 0 && before === 0)) {
    if (now === 0) return t("No night-time trips this week.");
    return now === 1 ? t("One night-time trip this week.") : t("{n} night-time trips this week.", { n: now });
  }
  const diff = now - before;
  if (diff === 0)
    return now === 1
      ? t("One night-time trip, the same as last week.")
      : t("{n} night-time trips, the same as last week.", { n: now });
  if (now === 0) return t("No night-time trips this week (last week: {n}).", { n: before });
  const n = Math.abs(diff);
  if (diff > 0)
    return n === 1
      ? t("One more night-time trip than last week ({total} in all).", { total: now })
      : t("{n} more night-time trips than last week ({total} in all).", { n, total: now });
  return n === 1
    ? t("One fewer night-time trip than last week ({total} in all).", { total: now })
    : t("{n} fewer night-time trips than last week ({total} in all).", { n, total: now });
}

/** "45 min", "2 h", "2 h 15 min". */
export function duration(minutes: number, t: Translate = english): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return t("{n} min", { n: m });
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? t("{h} h", { h }) : t("{h} h {m} min", { h, m: m % 60 });
}

/** "10 pm to 7 am" style night hours, from minutes after midnight. */
export function nightWords(night: Night, t: Translate = english): string {
  const time = (mins: number) => {
    const h = Math.floor(mins / 60);
    const vars = { h: h % 12 === 0 ? 12 : h % 12, m: String(mins % 60).padStart(2, "0"), h24: h };
    return h < 12 ? t("{h}:{m} am", vars) : t("{h}:{m} pm", vars);
  };
  return t("{from} to {to}", { from: time(night.from), to: time(night.to) });
}

/** The whole report as one short spoken update for "Read aloud". */
export function spokenWeek(report: WeekReport, who: string, t: Translate = english): string {
  if (!report.hasEnough) return t("There isn't enough news from the phone camera yet for a weekly report.");
  return [t("Here is the past week for {who}.", { who }), ...report.lines].join(" ");
}

/**
 * A pretend fortnight of news for "Show example week": up and about by day, a little
 * less active than the week before, 2 more night-time trips, one possible fall, and
 * the camera off for 3 hours one afternoon. The same every time.
 */
export function exampleEvents(now: number, startOfDay: (ms: number) => number = startOfLocalDay): EventRow[] {
  const out: EventRow[] = [];
  let id = -1;
  const starts = dayStarts(now, 14, startOfDay);
  // One afternoon this week the camera was switched off for 3 hours.
  const offFrom = starts[10] + 13 * HOUR;
  const offTo = starts[10] + 16 * HOUR;
  const add = (kind: EventRow["kind"], at: number, posture: EventRow["posture"] = null, zone: EventRow["zone"] = "middle") => {
    // While the camera is off it sends nothing.
    if (at > offFrom && at < offTo) return;
    if (at <= now) out.push({ id: id--, kind, zone, posture, created_at: new Date(at).toISOString() });
  };
  // Times (hours) they get up and move about during the day.
  const busy = [7.5, 8.2, 9, 10.5, 11.3, 12.2, 13.1, 14.5, 15.4, 16.6, 18, 19.2, 20.3, 21.4];
  // Night-time trips at 2:30 am: two last week, four this week.
  const nightTrips = new Set([2, 5, 8, 10, 11, 13]);
  starts.forEach((start, day) => {
    const thisWeek = day >= 7;
    const at = (hours: number) => start + Math.round(hours * 60) * MINUTE;
    if (nightTrips.has(day)) {
      add("moving", at(2.5), "standing", "left");
      add("still", at(2.65), "lying", "left");
    }
    busy.forEach((h, i) => {
      // This week, they skip a few of the usual times (a bit less active).
      if (thisWeek && (i + day) % 4 === 0) return;
      const minutes = 12 + ((day * 7 + i * 5) % 14);
      add("moving", at(h), "standing", i % 3 === 0 ? "left" : i % 3 === 1 ? "middle" : "right");
      add("still", at(h) + minutes * MINUTE, "sitting");
      if (i === 9 && day % 3 === 0) add("nobody", at(h) + (minutes + 20) * MINUTE, null, null);
    });
    add("still", at(22.4), "lying");
    if (day === 9) {
      add("fall", at(15.7), "lying", "right");
      add("moving", at(15.75), "standing", "right");
    }
  });
  // Heartbeats this week, so the camera counts as watching.
  add("started", starts[7], null, null);
  add("stopped", offFrom, null, null);
  add("started", offTo, null, null);
  for (let at = starts[7]; at <= now; at += 30_000) add("heartbeat", at, null, null);
  return out;
}
