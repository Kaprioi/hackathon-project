// Tests for the family page's plain-words status.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { PHONE_SILENT_MS, describe, headline, summarise, timeAgo } from "./status.ts";

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
  assert.equal(s.cameraOn, false);
  assert.equal(s.stoppedAt, null);
  assert.equal(headline(s, NOW, clock), null);
});

// The camera on or off, for the "Right now" card and its Live badge.
const clock = (iso) => iso.slice(11, 16); // "11:42" (UTC, so the test doesn't depend on the time zone)

test("a camera that is sending news or heartbeats counts as on", () => {
  const s = summarise([ev("heartbeat", 1.5), ev("still", 10, "left", "sitting")], NOW);
  assert.equal(s.cameraOn, true);
  assert.equal(s.stoppedAt, null);
  assert.equal(headline(s, NOW, clock), "Sitting still - left side - 10 minutes ago");
});

test("pressing Stop (or a tab that said goodbye) turns the camera off straight away", () => {
  const stopped = ev("stopped", 0.1);
  const s = summarise([ev("moving", 1, "left"), stopped], NOW);
  assert.equal(s.cameraOn, false);
  assert.equal(s.stoppedAt, stopped.created_at);
  assert.equal(s.mood, "quiet");
  assert.equal(headline(s, NOW, clock), "The phone stopped watching at 11:59.");
});

test("a closed tab or flat battery (no goodbye) counts as off after 2 minutes of silence", () => {
  const last = ev("heartbeat", 1.9);
  const events = [ev("moving", 5, "left"), last];
  // Still within the window: on.
  assert.equal(summarise(events, NOW).cameraOn, true);
  // The page re-checks on a timer, so time passing alone turns it off.
  const later = NOW + 60_000;
  const s = summarise(events, later);
  assert.equal(s.phoneSilent, true);
  assert.equal(s.cameraOn, false);
  assert.equal(s.stoppedAt, last.created_at);
  assert.equal(s.mood, "quiet");
  assert.equal(headline(s, later, clock), "The phone stopped watching at 11:58.");
  assert.equal(PHONE_SILENT_MS, 2 * 60_000);
});

test("the camera coming back (started, then heartbeats) counts as on again", () => {
  const s = summarise([ev("moving", 30), ev("stopped", 20), ev("started", 1), ev("heartbeat", 0.5)], NOW);
  assert.equal(s.cameraOn, true);
  assert.equal(s.stoppedAt, null);
  assert.equal(s.mood, "ok");
});

test("a possible fall stays on screen even if the camera then goes quiet", () => {
  const s = summarise([ev("fall", 10, "middle", "lying")], NOW);
  assert.equal(s.cameraOn, false);
  assert.equal(s.mood, "alert");
  assert.equal(headline(s, NOW, clock), "Possible fall - middle of the room - 10 minutes ago");
});
