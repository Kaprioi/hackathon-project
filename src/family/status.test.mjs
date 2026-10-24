// Tests for the family page's plain-words status.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { describe, summarise, timeAgo } from "./status.ts";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const at = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();
let nextId = 1;
const ev = (kind, minutesAgo, zone = null, posture = null) => ({ id: nextId++, kind, zone, posture, created_at: at(minutesAgo) });

test("the status line reads like the example", () => {
  assert.equal(describe(ev("moving", 2, "left", "standing"), NOW), "Moving around - left side - 2 minutes ago");
  assert.equal(describe(ev("still", 0.2, "middle", "lying"), NOW), "Lying down, resting - middle of the room - just now");
  assert.equal(describe(ev("nobody", 1, "right"), NOW), "Nobody in view - 1 minute ago");
});

test("time ago uses plain words", () => {
  assert.equal(timeAgo(at(0), NOW), "just now");
  assert.equal(timeAgo(at(59), NOW), "59 minutes ago");
  assert.equal(timeAgo(at(60), NOW), "1 hour ago");
  assert.equal(timeAgo(at(60 * 49), NOW), "2 days ago");
  assert.equal(timeAgo(new Date(NOW + 5000).toISOString(), NOW), "just now"); // clocks slightly off
});

test("heartbeats keep the phone 'alive' but don't replace the latest status", () => {
  const s = summarise([ev("heartbeat", 0.5), ev("still", 10, "left", "sitting"), ev("heartbeat", 1.5)], NOW);
  assert.equal(s.latest.kind, "still");
  assert.equal(s.mood, "ok");
  assert.equal(s.phoneSilent, false);
  assert.equal(s.timeline.length, 1);
});

test("a phone that has gone silent is flagged", () => {
  const s = summarise([ev("moving", 20, "left"), ev("heartbeat", 5)], NOW);
  assert.equal(s.phoneSilent, true);
  assert.equal(s.mood, "quiet");
});

test("a phone that was stopped on purpose is not 'silent', just quiet", () => {
  const s = summarise([ev("stopped", 30)], NOW);
  assert.equal(s.phoneSilent, false);
  assert.equal(s.mood, "quiet");
});

test("a possible fall is an alert, and the timeline is newest first", () => {
  const s = summarise([ev("moving", 3, "left"), ev("fall", 1, "middle", "lying"), ev("started", 5)], NOW);
  assert.equal(s.mood, "alert");
  assert.deepEqual(s.timeline.map((e) => e.kind), ["fall", "moving", "started"]);
});

test("no events yet", () => {
  const s = summarise([], NOW);
  assert.equal(s.latest, null);
  assert.equal(s.mood, "quiet");
  assert.equal(s.phoneSilent, false);
});
