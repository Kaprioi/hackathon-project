// Tests for the family page's picture of today (dayPicture.ts).
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_WINDOW_MS, dayPicture, durationWords } from "./dayPicture.ts";

// Local times today, so "today" works in any time zone.
const at = (h, m, s = 0) => new Date(2026, 9, 24, h, m, s).getTime();
let id = 0;
const ev = (kind, time, zone = null, posture = null) => ({ id: ++id, kind, zone, posture, created_at: new Date(time).toISOString() });
const MIN = 60_000;

test("nothing today: no picture yet, and the strip still shows the last half hour", () => {
  const now = at(15, 0);
  const p = dayPicture([], now, null);
  assert.equal(p.hasData, false);
  assert.deepEqual([p.from, p.to], [now - MIN_WINDOW_MS, now]);
});

test("an afternoon: walking, sitting, walking, a fall; time moving, last moved, and where they spent most time", () => {
  const now = at(15, 0);
  const events = [
    ev("started", at(14, 0)),
    ev("moving", at(14, 0, 5), "left", "standing"),
    ev("still", at(14, 10), "middle", "sitting"),
    ev("heartbeat", at(14, 20)),
    ev("moving", at(14, 30), "right", "standing"),
    ev("fall", at(14, 40), "right", "lying"),
    ev("heartbeat", at(14, 41)),
  ];
  const p = dayPicture(events.reverse(), now, null); // any order
  assert.deepEqual(
    p.segments.map((s) => [s.state, s.zone, (s.to - s.from) / 1000]),
    [
      ["nobody", null, 5],
      ["moving", "left", 595],
      ["still", "middle", 1200],
      ["moving", "right", 600],
      ["still", "right", 1200],
    ],
  );
  assert.equal(p.movingMs, (595 + 600) * 1000);
  assert.equal(p.lastMovedAt, at(14, 40));
  assert.equal(p.movingNow, false);
  assert.deepEqual(p.falls, [at(14, 40)]);
  assert.equal(p.mostlyZone, "right"); // 30 min on the right, 20 in the middle, 10 on the left
  assert.deepEqual([p.from, p.to], [at(14, 0), now]);
});

test("still moving right now", () => {
  const now = at(15, 0);
  const p = dayPicture([ev("moving", at(14, 50), "middle")], now, null);
  assert.equal(p.movingNow, true);
  assert.equal(p.lastMovedAt, now);
  assert.equal(p.movingMs, 10 * MIN);
});

test("the camera stopped (or went silent): the rest of the day is 'camera off', not more moving", () => {
  const now = at(15, 0);
  const events = [ev("moving", at(14, 0), "left"), ev("heartbeat", at(14, 19))];
  const p = dayPicture(events, now, new Date(at(14, 20)).toISOString());
  assert.deepEqual(
    p.segments.map((s) => [s.state, (s.to - s.from) / MIN]),
    [
      ["moving", 20],
      ["off", 40],
    ],
  );
  assert.equal(p.movingMs, 20 * MIN);
  assert.equal(p.movingNow, false);
  // A "stopped" message does the same.
  const q = dayPicture([ev("moving", at(14, 0), "left"), ev("stopped", at(14, 30))], now, new Date(at(14, 30)).toISOString());
  assert.deepEqual(q.segments.map((s) => s.state), ["moving", "off"]);
});

test("yesterday's news isn't counted, and a short demo still gets a readable strip", () => {
  const now = at(15, 0);
  const yesterday = new Date(2026, 9, 23, 23, 50).getTime();
  const p = dayPicture([ev("moving", yesterday, "left"), ev("moving", at(14, 55), "middle")], now, null);
  assert.equal(p.movingMs, 5 * MIN);
  assert.equal(p.from, now - MIN_WINDOW_MS); // 30 minutes shown, not a 5-minute sliver
  assert.equal(p.mostlyZone, "middle");
});

test("lengths of time in plain words", () => {
  const t = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
  assert.equal(durationWords(30_000, t), "under a minute");
  assert.equal(durationWords(25 * MIN, t), "25 min");
  assert.equal(durationWords(80 * MIN, t), "1 h 20 min");
});
