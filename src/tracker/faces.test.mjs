// Tests for faces.ts: whose face to read and what the readings mean, with made-up
// fingerprints instead of the camera. Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { FACE } from "./config.ts";
import { FaceWatcher, faceDistance } from "./faces.ts";

/** A made-up 128-number fingerprint; `who` picks the person, `wobble` a small change (another moment). */
function print(who, wobble = 0) {
  const p = new Float32Array(128);
  for (let i = 0; i < 128; i++) {
    const r = Math.sin(who * 7919.3 + i * 104.729) * 43758.5453;
    p[i] = (r - Math.floor(r) - 0.5) * 0.18 + wobble * Math.cos(i) * 0.01; // scrambled, about ±0.09
  }
  return p;
}

const box = (x) => ({ x, y: 0.2, w: 0.15, h: 0.6 });
/** What the brain might say: tracking person `ti` (or -1), with these colour matches. */
function brainSays(people, { mode = "tracking", ti = 0, matches, faces } = {}) {
  return {
    mode,
    target: ti >= 0 ? people[ti] : null,
    aim: null,
    note: "",
    match: null,
    matches: matches ?? people.map(() => 0.1),
    faces: faces ?? people.map(() => null),
    exitSide: 0,
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test("made-up fingerprints: the same person is close, different people are far", () => {
  assert.ok(faceDistance(print(1), print(1, 2)) < FACE.same);
  assert.ok(faceDistance(print(1), print(2)) > FACE.different);
});

test("it saves the face of the person it's sure about, then knows them and tells others apart", async () => {
  const faceAt = new Map([[0.2, print(1)], [0.6, print(2)]]);
  const watcher = new FaceWatcher(async (b) => faceAt.get(b.x) ?? null);
  const you = box(0.2);
  const other = box(0.6);
  let t = 0;

  // Tracking you, sure by your clothes: your face gets saved.
  watcher.step(t, [you, other].slice(0, 1), brainSays([you]), 0.38);
  await settle();
  assert.equal(watcher.saved, 1);

  // Later it loses you; someone else is in view: their face is read and ruled out.
  t += 1000;
  watcher.step(t, [other], brainSays([other], { mode: "lost", ti: -1, matches: [0.36] }), 0.38);
  await settle();
  assert.deepEqual(watcher.takeVerdicts(), [{ box: other, same: false }]);

  // You come back with different clothes (a poor colour match): your face says it's you.
  faceAt.set(0.2, print(1, 3));
  t += 1000;
  watcher.step(t, [you], brainSays([you], { mode: "lost", ti: -1, matches: [0.6] }), 0.38);
  await settle();
  assert.deepEqual(watcher.takeVerdicts(), [{ box: you, same: true }]);
});

test("it doesn't save a face while unsure who it's following", async () => {
  const watcher = new FaceWatcher(async () => print(1));
  watcher.step(0, [box(0.2)], brainSays([box(0.2)], { matches: [0.36] }), 0.38);
  await settle();
  assert.equal(watcher.saved, 0);
});

test("it reads one face at a time, and not too often", async () => {
  let reads = 0;
  const watcher = new FaceWatcher(async () => {
    reads++;
    return print(1);
  });
  const people = [box(0.2)];
  watcher.step(0, people, brainSays(people), 0.38);
  watcher.step(10, people, brainSays(people), 0.38); // still reading: nothing new
  await settle();
  watcher.step(100, people, brainSays(people), 0.38); // too soon after the last one
  assert.equal(reads, 1);
});

test("a reading is dropped if it stops being clear whose face it was", async () => {
  const watcher = new FaceWatcher(async () => print(1));
  const you = box(0.2);
  watcher.step(0, [you], brainSays([you]), 0.38); // first fingerprint saved
  await settle();
  let finish;
  const slow = new FaceWatcher(() => new Promise((r) => (finish = r)));
  slow.step(0, [you], brainSays([you]), 0.38);
  finish(print(1));
  await settle();
  // Now a reading of someone else, and while it runs they leave and another person steps in.
  const other = box(0.6);
  slow.step(1000, [other], brainSays([other], { mode: "lost", ti: -1, matches: [0.36] }), 0.38);
  slow.step(1100, [], brainSays([], { mode: "lost", ti: -1 }), 0.38); // gone from view
  slow.step(1200, [box(0.61)], brainSays([box(0.61)], { mode: "lost", ti: -1 }), 0.38); // someone in their spot
  finish(print(1)); // the face read matches the target...
  await settle();
  assert.deepEqual(slow.takeVerdicts(), [], "...but it can't be pinned on whoever is there now");
  assert.equal(watcher.saved, 1);
});

test("someone marked as the target by face is checked again when their clothes don't back it up", async () => {
  let reads = 0;
  const watcher = new FaceWatcher(async () => {
    reads++;
    return print(1);
  });
  const you = box(0.2);
  watcher.step(0, [you], brainSays([you]), 0.38); // saved while sure
  await settle();
  const on = box(0.5);
  // Following someone whose colours don't match, though an earlier face check said "them".
  watcher.step(1000, [on], brainSays([on], { matches: [0.44], faces: [true] }), 0.38);
  await settle();
  watcher.step(4000, [on], brainSays([on], { matches: [0.44], faces: [true] }), 0.38);
  await settle();
  assert.equal(reads, 3, "their face should be read again, not trusted forever");
});

test("it saves a face even with someone standing close (but not right on top of them)", async () => {
  // Apple's phone test: in a group, boxes touch, and the first version needed no overlap at all.
  const watcher = new FaceWatcher(async () => print(1));
  const you = { x: 0.3, y: 0.2, w: 0.15, h: 0.6 };
  const close = { x: 0.42, y: 0.2, w: 0.15, h: 0.6 }; // overlapping a little (IoU ~0.1)
  watcher.step(0, [you, close], brainSays([you, close], { matches: [0.05, 0.6] }), 0.38);
  await settle();
  assert.equal(watcher.saved, 1);
  // Right on top of each other: too risky, nothing is read.
  const reads = [];
  const w2 = new FaceWatcher(async (b) => (reads.push(b), print(1)));
  const onTop = { x: 0.33, y: 0.2, w: 0.15, h: 0.6 };
  w2.step(0, [you, onTop], brainSays([you, onTop], { matches: [0.05, 0.6] }), 0.38);
  await settle();
  assert.equal(reads.length, 0);
});

test("it says why no face could be read, and shows each reading's number", async () => {
  let next = "small";
  const watcher = new FaceWatcher(async () => next);
  const you = box(0.2);
  watcher.step(0, [you], brainSays([you]), 0.38);
  await settle();
  assert.equal(watcher.miss, "small", "too far away");
  next = print(1);
  watcher.step(3000, [you], brainSays([you]), 0.38);
  await settle();
  assert.equal(watcher.miss, null, "a good reading clears it");
  assert.equal(watcher.labels.at(-1).distance, null, "the first one saved");
  next = print(1, 2);
  watcher.step(6500, [you], brainSays([you]), 0.38);
  await settle();
  assert.ok(watcher.labels.at(-1).distance < 0.5, "the next reading's number is shown");
});

test("forgetting (a new tap, Release, Stop) drops the saved face, even mid-reading", async () => {
  let finish;
  const watcher = new FaceWatcher(() => new Promise((r) => (finish = r)));
  watcher.step(0, [box(0.2)], brainSays([box(0.2)]), 0.38);
  watcher.forget(); // a new person tapped while the old one's face was being read
  finish(print(1));
  await settle();
  assert.equal(watcher.saved, 0, "the old person's face must not be saved for the new target");
});
