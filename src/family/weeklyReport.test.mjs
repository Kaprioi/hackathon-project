// Tests for the "This week" report (/report).
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayStarts,
  duration,
  exampleEvents,
  isNight,
  nightFrom,
  nightWords,
  spokenWeek,
  weeklyReport,
} from "./weeklyReport.ts";
import { translate } from "../i18n/translate.ts";
import es from "../i18n/es.ts";
import zh from "../i18n/zh.ts";

// Everything in UTC so the tests give the same answer on any computer.
const startOfDay = (ms) => ms - (ms % 86_400_000);
const TODAY = Date.parse("2026-10-24T00:00:00Z");
const NOW = Date.parse("2026-10-24T23:00:00Z");
// `daysAgo` 0 is today, 7 is the same weekday last week.
const at = (daysAgo, hhmm) =>
  TODAY - daysAgo * 86_400_000 + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000;
let nextId = 1;
const ev = (kind, daysAgo, hhmm, posture = null) => ({
  id: nextId++,
  kind,
  zone: "middle",
  posture,
  created_at: new Date(at(daysAgo, hhmm)).toISOString(),
});
const opts = { startOfDay };

test("the 7 days end today, oldest first", () => {
  const starts = dayStarts(NOW, 7, startOfDay);
  assert.equal(starts.length, 7);
  assert.equal(starts[6], TODAY);
  assert.equal(starts[0], TODAY - 6 * 86_400_000);
});

test("no news gives the friendly empty report", () => {
  const r = weeklyReport([], NOW, opts);
  assert.equal(r.hasEnough, false);
  assert.deepEqual(r.lines, []);
  assert.equal(r.days.length, 7);
  assert.equal(spokenWeek(r, "Mum"), "There isn't enough news from the phone camera yet for a weekly report.");
});

test("moving around counts until the next news, at most 30 minutes, split by hour", () => {
  const events = [ev("moving", 1, "08:50"), ev("still", 1, "09:10", "sitting"), ev("moving", 1, "15:00"), ev("heartbeat", 1, "15:05")];
  const r = weeklyReport(events, NOW, opts);
  const day = r.days[5];
  assert.equal(day.activeMinutes, 20 + 30);
  assert.equal(day.hours[8], 10);
  assert.equal(day.hours[9], 10);
  assert.equal(day.hours[15], 30);
  assert.equal(day.hasNews, true);
  assert.equal(r.days[6].hasNews, false);
});

test("night-time trips: close-together movement at night is one trip", () => {
  const events = [
    ev("moving", 2, "02:30"),
    ev("still", 2, "02:35", "lying"),
    ev("moving", 2, "02:50"), // same trip
    ev("moving", 2, "05:00"), // a second trip
    ev("moving", 2, "12:00"), // daytime
    ev("moving", 1, "23:15"), // the night before today
  ];
  const r = weeklyReport(events, NOW, opts);
  assert.equal(r.days[4].nightTrips, 2);
  assert.equal(r.days[5].nightTrips, 1);
  assert.equal(r.thisWeek.nightTrips, 3);
});

test("night hours come from the Care profile, else 10 pm to 7 am", () => {
  assert.deepEqual(nightFrom("21:30", "06:15"), { from: 21 * 60 + 30, to: 6 * 60 + 15 });
  assert.deepEqual(nightFrom(undefined, "06:15"), { from: 22 * 60, to: 7 * 60 });
  assert.deepEqual(nightFrom("nonsense", 4), { from: 22 * 60, to: 7 * 60 });
  assert.equal(isNight(23 * 60, { from: 22 * 60, to: 7 * 60 }), true);
  assert.equal(isNight(6 * 60, { from: 22 * 60, to: 7 * 60 }), true);
  assert.equal(isNight(12 * 60, { from: 22 * 60, to: 7 * 60 }), false);
  // A night shift sleeper: in bed 08:00 to 16:00.
  assert.equal(isNight(9 * 60, { from: 8 * 60, to: 16 * 60 }), true);
  assert.equal(nightWords({ from: 22 * 60, to: 7 * 60 }), "10:00 pm to 7:00 am");
  const r = weeklyReport([ev("moving", 1, "21:45")], NOW, { ...opts, night: nightFrom("21:30", "06:00") });
  assert.equal(r.thisWeek.nightTrips, 1);
});

test("camera-off time: a 'stopped' or a silent phone counts as off", () => {
  const events = [];
  // Yesterday the phone watched 08:00 to 10:00 with heartbeats, then said "stopped".
  for (let m = 0; m <= 120; m += 0.5) {
    const ms = at(1, "08:00") + m * 60_000;
    events.push({ id: nextId++, kind: "heartbeat", zone: null, posture: null, created_at: new Date(ms).toISOString() });
  }
  events.push(ev("stopped", 1, "10:00"));
  const r = weeklyReport(events, NOW, opts);
  assert.equal(r.days[5].cameraOffMinutes, 24 * 60 - 120);
  // Today only counts up to now (23:00).
  assert.equal(r.days[6].cameraOffMinutes, 23 * 60);
  // A lone heartbeat keeps the camera "on" for 2 minutes only.
  const lone = weeklyReport([ev("heartbeat", 2, "12:00")], NOW, opts);
  assert.equal(lone.days[4].cameraOffMinutes, 24 * 60 - 2);
});

test("the summary compares with last week", () => {
  const events = [];
  // Last week: 4 times 30 minutes of moving each day, no night trips.
  for (let d = 7; d <= 13; d++) for (const h of ["09:00", "11:00", "14:00", "17:00"]) events.push(ev("moving", d, h));
  // This week: 2 times a day, 2 night-time trips and a possible fall.
  for (let d = 0; d <= 6; d++) for (const h of ["14:00", "16:00"]) events.push(ev("moving", d, h));
  events.push(ev("moving", 3, "03:00"), ev("moving", 4, "03:00"), ev("fall", 2, "15:40", "lying"));
  const r = weeklyReport(events, NOW, opts);
  assert.equal(r.hasEnough, true);
  assert.equal(r.lines[0], "Much less active than last week.");
  assert.equal(r.lines[1], "Usually most active in the afternoon.");
  assert.equal(r.lines[2], "2 more night-time trips than last week (2 in all).");
  assert.equal(r.lines[3], "One possible fall this week.");
  assert.equal(r.fallLine, "One possible fall this week.");
  assert.match(r.lines[4], /^The camera was off for about \d+ hours this week\.$/);
  assert.match(spokenWeek(r, "Mum"), /^Here is the past week for Mum\. Much less active/);
});

test("a first week has nothing to compare with", () => {
  const r = weeklyReport([ev("moving", 1, "09:00"), ev("still", 1, "09:20")], NOW, opts);
  assert.equal(r.lines[0], "This is the first week with news, so there is nothing to compare with yet.");
  assert.equal(r.lines[2], "No night-time trips this week.");
  assert.equal(r.lines[3], "No possible falls this week.");
});

test("news older than two weeks, or in the future, is ignored", () => {
  const r = weeklyReport([ev("fall", 20, "09:00"), ev("fall", -2, "09:00")], NOW, opts);
  assert.equal(r.hasEnough, false);
  assert.equal(r.thisWeek.falls, 0);
  assert.equal(r.lastWeek.falls, 0);
});

test("durations read simply", () => {
  assert.equal(duration(0), "0 min");
  assert.equal(duration(45.4), "45 min");
  assert.equal(duration(120), "2 h");
  assert.equal(duration(135), "2 h 15 min");
});

test("the example week tells the demo story", () => {
  const r = weeklyReport(exampleEvents(NOW, startOfDay), NOW, opts);
  assert.equal(r.hasEnough, true);
  assert.equal(r.lines[0], "A bit less active than last week.");
  assert.equal(r.lines[2], "2 more night-time trips than last week (4 in all).");
  assert.equal(r.thisWeek.falls, 1);
  assert.equal(r.lines.at(-1), "The camera was off for about 3 hours this week.");
  assert.equal(r.days.every((d) => d.hasNews), true);
});

test("the report reads in Spanish and Chinese", () => {
  const r = weeklyReport(exampleEvents(NOW, startOfDay), NOW, opts);
  for (const words of [es, zh]) {
    const t = (text, vars) => translate(words, text, vars);
    const translated = weeklyReport(exampleEvents(NOW, startOfDay), NOW, { ...opts, t });
    translated.lines.forEach((line, i) => assert.notEqual(line, r.lines[i], `untranslated: ${line}`));
    assert.notEqual(spokenWeek(translated, "Mum", t), spokenWeek(r, "Mum"));
  }
  assert.equal(duration(135, (text, vars) => translate(zh, text, vars)), "2 小时 15 分钟");
});
