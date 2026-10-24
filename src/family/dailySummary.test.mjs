// Tests for the family page's "Today so far" summary.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { summariseDay } from "./dailySummary.ts";

// Everything in UTC so the tests give the same answer on any computer.
const DAY = Date.parse("2026-10-24T00:00:00Z");
const at = (hhmm) => DAY + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000;
const timeOf = (ms) => {
  const d = new Date(ms);
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
const opts = { dayStart: DAY, timeOf, hourOf: (ms) => new Date(ms).getUTCHours() };
let nextId = 1;
const ev = (kind, hhmm, posture = null) => ({ id: nextId++, kind, zone: "left", posture, created_at: new Date(at(hhmm)).toISOString() });

test("a normal day reads like the example", () => {
  const events = [
    ev("started", "06:50"),
    ev("still", "07:10", "lying"),
    ev("moving", "07:40"),
    ev("moving", "08:15"),
    ev("still", "09:00", "sitting"),
    ev("moving", "10:30"),
    ev("moving", "15:00"),
    ev("still", "21:05", "sitting"),
  ];
  const s = summariseDay(events, at("23:00"), opts);
  assert.equal(s.hasNews, true);
  assert.deepEqual(s.lines, [
    "Up and moving at 7:40 am.",
    "Most active in the morning.",
    "No possible falls today.",
    "Quiet since 9:05 pm.",
  ]);
});

test("a possible fall and time out of view are mentioned", () => {
  const events = [ev("moving", "08:00"), ev("fall", "14:15", "lying"), ev("nobody", "16:00"), ev("nobody", "17:00")];
  const s = summariseDay(events, at("17:10"), opts);
  assert.equal(s.falls, 1);
  assert.ok(s.lines.includes("One possible fall, at 2:15 pm. Please check they are okay."));
  assert.ok(s.lines.includes("Out of the camera's view 2 times."));
  assert.equal(s.lines.at(-1), "Quiet since 2:15 pm.");
});

test("recent news is shown instead of 'quiet since'", () => {
  const s = summariseDay([ev("moving", "09:00"), ev("still", "09:50", "sitting")], at("10:00"), opts);
  assert.equal(s.lines.at(-1), "Last news: sitting still at 9:50 am.");
});

test("yesterday's news and heartbeats don't count", () => {
  const yesterday = { id: nextId++, kind: "moving", zone: "left", posture: null, created_at: new Date(DAY - 3600_000).toISOString() };
  const s = summariseDay([yesterday, ev("heartbeat", "08:00"), ev("started", "08:00")], at("09:00"), opts);
  assert.equal(s.hasNews, false);
  assert.deepEqual(s.lines, []);
});

test("events can arrive in any order", () => {
  const s = summariseDay([ev("moving", "19:00"), ev("moving", "18:30"), ev("moving", "06:10")], at("19:05"), opts);
  assert.equal(s.lines[0], "Up and moving at 6:10 am.");
  assert.equal(s.lines[1], "Most active in the evening.");
});
