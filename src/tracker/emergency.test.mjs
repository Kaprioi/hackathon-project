// Tests for emergency.ts: spotting a fall or a seizure from the tracked person's box.
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { EmergencyWatch } from "./emergency.ts";

const ASPECT = 16 / 9; // a sideways phone's picture
const FRAME = 100; // about 10 frames a second, like a phone
const standing = { x: 0.4, y: 0.2, w: 0.15, h: 0.6 };
const sitting = { x: 0.4, y: 0.35, w: 0.25, h: 0.45 };
const lying = { x: 0.3, y: 0.6, w: 0.5, h: 0.2 };

/** Feeds `ms` of frames with box(t), returns every alert raised and when. */
function run(watch, t0, ms, box) {
  const alerts = [];
  for (let t = t0; t < t0 + ms; t += FRAME) {
    const a = watch.update(t, box(t), ASPECT);
    if (a) alerts.push({ a, t });
  }
  return alerts;
}

test("standing, then on the floor and not getting up: a fall, once", () => {
  const w = new EmergencyWatch();
  assert.deepEqual(run(w, 0, 3000, () => standing), []);
  const alerts = run(w, 3000, 6000, () => lying);
  assert.equal(alerts.length, 1, JSON.stringify(alerts));
  assert.equal(alerts[0].a, "fall");
  assert.ok(alerts[0].t >= 6000 && alerts[0].t <= 6200, `about 3 s after lying down, got ${alerts[0].t}`);
});

test("sitting down and then lying down (going to bed) isn't a fall", () => {
  const w = new EmergencyWatch();
  run(w, 0, 2000, () => standing);
  run(w, 2000, 5000, () => sitting); // sat on the bed for a while
  assert.deepEqual(run(w, 7000, 6000, () => lying), []);
});

test("lying still, with the detector's usual small wobble, isn't a seizure", () => {
  const w = new EmergencyWatch();
  const wobble = (t) => ({ ...lying, x: lying.x + 0.003 * Math.sin(t / 37), w: lying.w + 0.004 * Math.cos(t / 53) });
  assert.deepEqual(run(w, 0, 8000, wobble), []);
});

test("someone sitting still at a table (a wide box, with the detector's real wobble) isn't a seizure or a fall", () => {
  // Apple's phone test: a friend sitting still set off a seizure alert.
  const w = new EmergencyWatch();
  const atTable = { x: 0.35, y: 0.3, w: 0.3, h: 0.38 }; // legs hidden by the table, arms out: wide-ish
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  // The box's edges jump by up to ±4% of its size every frame.
  const jitter = () => ({ ...atTable, x: atTable.x + 0.012 * rand(), w: atTable.w * (1 + 0.04 * rand()), h: atTable.h * (1 + 0.04 * rand()) });
  assert.deepEqual(run(w, 0, 20000, jitter), []);
});

test("a shaking hand-held camera (the box moves but keeps its size) isn't a seizure", () => {
  const w = new EmergencyWatch();
  run(w, 0, 2000, () => sitting);
  const shakyCamera = (t) => ({ ...lying, x: lying.x + 0.05 * Math.sin(t / 60), y: lying.y + 0.04 * Math.cos(t / 45) });
  assert.deepEqual(run(w, 2000, 8000, shakyCamera), []);
});

test("lying and shaking hard for a few seconds: a possible seizure", () => {
  const w = new EmergencyWatch();
  run(w, 0, 3000, () => sitting);
  // Arms and legs jerking: the box's width swings by about ±8% at 2.5 times a second.
  const shake = (t) => ({ ...lying, w: lying.w * (1 + 0.08 * Math.sin((2 * Math.PI * 2.5 * t) / 1000)) });
  const alerts = run(w, 3000, 6000, shake);
  assert.equal(alerts.length, 1, JSON.stringify(alerts));
  assert.equal(alerts[0].a, "seizure");
});

test("falling and then shaking on the floor is reported as a seizure", () => {
  const w = new EmergencyWatch();
  run(w, 0, 2000, () => standing);
  const shake = (t) => ({ ...lying, w: lying.w * (1 + 0.08 * Math.sin((2 * Math.PI * 2.5 * t) / 1000)) });
  const alerts = run(w, 2000, 5000, shake);
  assert.deepEqual(alerts.map((x) => x.a), ["seizure"]);
});

test("after an alert, it watches again once the person has been up for a while", () => {
  const w = new EmergencyWatch();
  run(w, 0, 2000, () => standing);
  assert.equal(run(w, 2000, 4000, () => lying).length, 1);
  assert.equal(run(w, 6000, 4000, () => lying).length, 0, "still on the floor: no second alert");
  run(w, 10000, 4000, () => standing); // back up
  const again = run(w, 14000, 4000, () => lying);
  assert.equal(again.length, 1, "falls again: a new alert");
});

test("not seen for a moment while lying: the lying time keeps counting", () => {
  const w = new EmergencyWatch();
  run(w, 0, 2000, () => standing);
  run(w, 2000, 500, () => lying);
  run(w, 2500, 1000, () => null); // the detector loses them on the floor
  const alerts = run(w, 3500, 2000, () => lying);
  assert.equal(alerts.length, 1, "the fall still counts");
});
