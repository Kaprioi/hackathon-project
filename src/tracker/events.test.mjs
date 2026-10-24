// Tests for the event reporter: made-up people boxes in, small text events out.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { postureOf, REPORT, Reporter, zoneOf } from "./events.ts";

const ASPECT = 16 / 9;
const FRAME_MS = 100;
const STANDING = (x) => ({ x, y: 0.1, w: 0.1, h: 0.8 });
const SITTING = (x) => ({ x, y: 0.4, w: 0.15, h: 0.4 });
const LYING = (x) => ({ x, y: 0.7, w: 0.4, h: 0.15 });

/** Feed `ms` of frames, with `people(t)` giving the boxes at each time. Returns all events sent. */
function run(r, from, ms, people) {
  const events = [];
  for (let t = from; t < from + ms; t += FRAME_MS) events.push(...r.update(t, people(t), ASPECT));
  return events;
}

test("zones are the left, middle and right thirds of the picture", () => {
  assert.equal(zoneOf(STANDING(0.05)), "left");
  assert.equal(zoneOf(STANDING(0.45)), "middle");
  assert.equal(zoneOf(STANDING(0.85)), "right");
});

test("posture is guessed from the box shape", () => {
  assert.equal(postureOf(STANDING(0.4), ASPECT), "standing");
  assert.equal(postureOf(SITTING(0.4), ASPECT), "sitting");
  assert.equal(postureOf(LYING(0.4), ASPECT), "lying");
});

test("a person sitting still is reported once, then only heartbeats", () => {
  const r = new Reporter();
  assert.equal(r.start(0).kind, "started");
  const events = run(r, 0, 130_000, () => [SITTING(0.1)]);
  assert.deepEqual(events[0], { kind: "still", zone: "left", posture: "sitting" });
  assert.deepEqual(
    events.slice(1).map((e) => e.kind),
    ["heartbeat", "heartbeat"],
  );
  assert.equal(events[1].zone, "left");
});

test("walking across the room is reported as moving, with the new side", () => {
  const r = new Reporter();
  r.start(0);
  run(r, 0, 5_000, () => [STANDING(0.1)]);
  // Walk from left to right over 6 seconds, then stop on the right.
  const walk = run(r, 5_000, 6_000, (t) => [STANDING(0.1 + ((t - 5_000) / 6_000) * 0.7)]);
  assert.ok(walk.some((e) => e.kind === "moving"), "should say moving");
  const after = run(r, 11_000, 5_000, () => [STANDING(0.8)]);
  assert.deepEqual(after.at(-1), { kind: "still", zone: "right", posture: "standing" });
});

test("a short flicker does not send anything", () => {
  const r = new Reporter();
  r.start(0);
  run(r, 0, 5_000, () => [SITTING(0.45)]);
  // The detector loses them for half a second.
  const events = run(r, 5_000, 3_000, (t) => (t < 5_500 ? [] : [SITTING(0.45)]));
  assert.deepEqual(events, []);
});

test("an empty room becomes 'nobody' after a few seconds", () => {
  const r = new Reporter();
  r.start(0);
  run(r, 0, 5_000, () => [SITTING(0.45)]);
  const events = run(r, 5_000, REPORT.nobodyMs + REPORT.settleMs + 1_000, () => []);
  assert.deepEqual(events, [{ kind: "nobody", zone: null, posture: null }]);
});

test("going from standing to lying quickly is a possible fall", () => {
  const r = new Reporter();
  r.start(0);
  run(r, 0, 5_000, () => [STANDING(0.45)]);
  const events = run(r, 5_000, 5_000, () => [LYING(0.35)]);
  assert.equal(events[0].kind, "fall");
  assert.equal(events[0].posture, "lying");
});

test("sitting down first and then lying down is not a fall", () => {
  const r = new Reporter();
  r.start(0);
  run(r, 0, 5_000, () => [STANDING(0.45)]);
  run(r, 5_000, 10_000, () => [SITTING(0.45)]);
  const events = run(r, 15_000, 5_000, () => [LYING(0.35)]);
  assert.equal(events[0].kind, "still");
  assert.equal(events[0].posture, "lying");
});
