// Tests for emergency.ts: spotting a fall or a seizure from the tracked person's box.
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { EmergencyWatch, uprightness } from "./emergency.ts";
import { pictureTurn, toUpright } from "./orientation.ts";

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
  // (Half a second later than the 3 s: the posture is the middle value of the last second.)
  assert.ok(alerts[0].t >= 6000 && alerts[0].t <= 6700, `about 3 s after lying down, got ${alerts[0].t}`);
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
  run(w, 2000, 1000, () => lying);
  run(w, 3000, 1000, () => null); // the detector loses them on the floor
  const alerts = run(w, 4000, 2000, () => lying);
  assert.equal(alerts.length, 1, "the fall still counts");
});

test("lying but moving across the floor (more than half its size in a few seconds): not a seizure", () => {
  // Shaking happens in one place; a box that travels while its shape changes is someone moving.
  const w = new EmergencyWatch();
  const across = (t) => ({ ...lying, w: 0.4 * (1 + 0.1 * Math.sin(t / 80)), x: 0.05 + (t / 4000) * 0.5 });
  assert.ok(!run(w, 0, 4000, across).some((x) => x.a === "seizure"));
});

// ---- Sitting down never raises the alert (Android phone test, Oct 24) ----

let seed = 11;
/** -1 to 1, the same every run. */
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
/** The detector's box jumping about: its size by up to ±`size`, its place by up to ±1%. */
const jitter = (b, size) => ({ x: b.x + 0.01 * rand(), y: b.y + 0.01 * rand(), w: b.w * (1 + size * rand()), h: b.h * (1 + size * rand()) });
const between = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k });
/** Feeds `ms` of frames going smoothly from box `a` to box `b`. */
const move = (w, t0, ms, a, b) => run(w, t0, ms, (t) => jitter(between(a, b, (t - t0) / ms), 0.04));
// Elbows out on a table, legs hidden under it: as wide as it is tall, flatter than the old lying line.
const atTable = { x: 0.3, y: 0.4, w: 0.36, h: 0.35 };

test("walking up and sitting straight down at a table (elbows out, a wide box): no alert, for minutes", () => {
  const w = new EmergencyWatch();
  assert.ok(uprightness(atTable, ASPECT) < 0.6, "the box looks as flat as the old lying line");
  run(w, 0, 3000, () => jitter(standing, 0.04));
  assert.deepEqual(move(w, 3000, 1000, standing, atTable), []);
  assert.deepEqual(run(w, 4000, 120000, () => jitter(atTable, 0.04)), []);
});

test("sitting down on a chair, in full view: no alert", () => {
  const w = new EmergencyWatch();
  const chair = { x: 0.38, y: 0.4, w: 0.26, h: 0.47 };
  run(w, 0, 3000, () => jitter(standing, 0.06));
  move(w, 3000, 1200, standing, chair);
  assert.deepEqual(run(w, 4200, 60000, () => jitter(chair, 0.06)), []);
  assert.equal(w.posture, "sitting");
});

test("eating at a table (the arms make the box wider and narrower all the time): not a seizure", () => {
  const w = new EmergencyWatch();
  run(w, 0, 3000, () => jitter(standing, 0.04));
  move(w, 3000, 1500, standing, atTable);
  const eating = (t) => jitter({ ...atTable, w: atTable.w * (1 + 0.15 * Math.sin(t / 110)) }, 0.04);
  assert.deepEqual(run(w, 4500, 120000, eating), []);
});

test("getting up and sitting back down at the table again and again: never an alert", () => {
  const w = new EmergencyWatch();
  let t = 0;
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(run(w, t, 4000, () => jitter(standing, 0.04)), []);
    assert.deepEqual(move(w, t + 4000, 1000, standing, atTable), []);
    assert.deepEqual(run(w, t + 5000, 15000, (t) => jitter({ ...atTable, w: atTable.w * (1 + 0.06 * Math.sin(t / 110)) }, 0.04)), []);
    t += 20000;
  }
});

test("resting the head on the arms at the table (really flat, but not on the floor): no alert", () => {
  const w = new EmergencyWatch();
  const headDown = { x: 0.3, y: 0.5, w: 0.38, h: 0.3 }; // the top of the box only came down part way
  run(w, 0, 3000, () => jitter(standing, 0.04));
  move(w, 3000, 1000, standing, headDown);
  assert.deepEqual(run(w, 4000, 60000, () => jitter(headDown, 0.04)), []);
});

test("sitting close to the stand, legs cut off by the bottom of the picture: no alert", () => {
  const w = new EmergencyWatch();
  run(w, 0, 3000, () => jitter(standing, 0.04));
  // Head and shoulders, as wide as they're tall, cut off at the bottom and bobbing.
  const close = (t) => {
    const b = jitter({ x: 0.28, y: 0.45 + 0.05 * Math.sin(t / 700), w: 0.44, h: 0.6 }, 0.08);
    return { ...b, h: 1 - b.y }; // the detector's box stops at the edge of the picture
  };
  assert.deepEqual(run(w, 3000, 60000, close), []);
  assert.equal(w.posture, "cut off");
});

test("a slow, jumpy detector (4 frames a second, the box jumping ±12%) at a table: no alert", () => {
  const w = new EmergencyWatch();
  const slow = (t0, ms, box) => {
    const alerts = [];
    for (let t = t0; t < t0 + ms; t += 250) if (w.update(t, box(t), ASPECT)) alerts.push(t);
    return alerts;
  };
  const table = { x: 0.33, y: 0.38, w: 0.3, h: 0.34 }; // right on the lying line
  slow(0, 3000, () => jitter(standing, 0.12));
  assert.deepEqual(slow(3000, 1500, (t) => jitter(between(standing, table, (t - 3000) / 1500), 0.12)), []);
  assert.deepEqual(slow(4500, 120000, () => jitter(table, 0.12)), []);
});

test("leaning forward and back again and again, sitting: no alert", () => {
  const w = new EmergencyWatch();
  const upright = { x: 0.36, y: 0.38, w: 0.28, h: 0.45 };
  const leaning = { x: 0.32, y: 0.5, w: 0.36, h: 0.3 };
  run(w, 0, 3000, () => jitter(standing, 0.04));
  move(w, 3000, 1200, standing, upright);
  const rocking = (t) => jitter(between(upright, leaning, (Math.sin(t / 1500) + 1) / 2), 0.06);
  assert.deepEqual(run(w, 4200, 120000, rocking), []);
});

test("Android auto-turn: a sitting person in a sideways picture, turned upright, still looks like sitting", () => {
  // Phone on its side, auto-rotate off: the camera's picture (9:16) shows the room on its side,
  // so the page turns it 90 degrees. The box shape must be measured in the turned picture.
  assert.equal(pictureTurn(90, 0), 90);
  const chair = { x: 0.38, y: 0.4, w: 0.26, h: 0.47 }; // in the upright 16:9 picture
  const a = toUpright(0.4 + 0.47, 1 - 0.38 - 0.26, 90); // the same box's corners in the camera's own picture...
  const b = toUpright(0.4, 1 - 0.38, 90);
  const turned = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  assert.ok(Math.abs(uprightness(turned, 16 / 9) - uprightness(chair, 16 / 9)) < 1e-9, "...turned back is the same box");
  // Auto-rotate on: the screen turned too, so the picture isn't turned again (whichever way the sensor reports).
  assert.equal(pictureTurn(90, 90), 0);
  assert.equal(pictureTurn(270, 90), 0);
});

test("turning the phone: the picture is on its side for a moment until the screen turns: no alert", () => {
  const w = new EmergencyWatch();
  const chair = { x: 0.38, y: 0.4, w: 0.26, h: 0.47 };
  run(w, 0, 3000, () => jitter(standing, 0.04));
  move(w, 3000, 1000, standing, chair);
  run(w, 4000, 5000, () => jitter(chair, 0.04));
  // For a second the picture is turned the wrong way: the sitting person looks like lying.
  const sideways = { x: 0.25, y: 0.42, w: 0.47 * (9 / 16) * 1.8, h: 0.26 * (16 / 9) * 0.5 };
  assert.ok(uprightness(sideways, ASPECT) < 0.6);
  assert.deepEqual(run(w, 9000, 1000, () => jitter(sideways, 0.08)), []);
  assert.deepEqual(run(w, 10000, 30000, () => jitter(chair, 0.04)), []);
});

test("after an alert, sitting up isn't enough to watch again: they must stand up (or 2 minutes pass)", () => {
  const w = new EmergencyWatch();
  run(w, 0, 3000, () => standing);
  assert.equal(run(w, 3000, 4000, () => lying).length, 1, "a real fall");
  // "I'm OK": they sit up for a while, then lie back down shaking. No second alert.
  const sittingUp = { x: 0.35, y: 0.5, w: 0.3, h: 0.4 };
  run(w, 7000, 10000, () => jitter(sittingUp, 0.04));
  const shake = (t) => ({ ...lying, w: lying.w * (1 + 0.08 * Math.sin((2 * Math.PI * 2.5 * t) / 1000)) });
  assert.deepEqual(run(w, 17000, 6000, shake), [], "only sat up: still quiet");
  // 2 minutes after the alert it watches again, even without standing up.
  run(w, 23000, 110000, () => jitter(sittingUp, 0.04));
  assert.deepEqual(run(w, 133000, 6000, shake).map((x) => x.a), ["seizure"]);
});

test("after an alert, standing up for a few seconds watches again", () => {
  const w = new EmergencyWatch();
  run(w, 0, 3000, () => standing);
  assert.equal(run(w, 3000, 4000, () => lying).length, 1);
  run(w, 7000, 1500, () => standing); // only a moment: not yet
  run(w, 8500, 1000, () => jitter(atTable, 0.04));
  run(w, 9500, 4000, () => standing); // up for 4 s
  assert.deepEqual(run(w, 13500, 5000, () => lying).map((x) => x.a), ["fall"]);
});

test("a real fall still counts while the stand looks down to follow them", () => {
  const w = new EmergencyWatch();
  run(w, 0, 3000, () => standing);
  // The stand tilts down as they go down: in the picture the box slides back up by 0.3 of its
  // height. Told the camera's tilt, the watch still sees how far they dropped.
  const alerts = [];
  for (let t = 3000; t < 10000; t += FRAME) {
    const shift = Math.min(1, (t - 3000) / 800) * 0.3;
    const a = w.update(t, { ...lying, y: lying.y - shift }, ASPECT, shift);
    if (a) alerts.push(a);
  }
  assert.deepEqual(alerts, ["fall"]);
});
