// Tests for the tracking brain, using made-up camera frames: coloured rectangles
// are "people" and a blotchy rectangle is a "blanket". No camera or stand needed.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { lookDistance, lookOf } from "./appearance.ts";
import { Brain } from "./brain.ts";
import { DEFAULT_SETTINGS, LIMITS, TUNING } from "./config.ts";
import { ServoModel } from "./servoModel.ts";

const W = 320;
const H = 180;
const FRAME_MS = 66; // about 15 frames a second
const RED = [200, 30, 30];
const BLUE = [30, 50, 180];
const GREEN = [30, 160, 60];
const BLACK = [15, 15, 15];
const WHITE = [235, 235, 235];
const GREY = [128, 128, 128]; // the same as the background
const CENTER = { pan: LIMITS.center, tilt: LIMITS.center };

/** A person standing at x (left edge), 15% of the frame wide and 60% tall. */
function person(x, top, bottom) {
  return { box: { x, y: 0.2, w: 0.15, h: 0.6 }, top, bottom };
}

/**
 * A person whose top is two colours: `top` on `share` of it and `top2` on the rest.
 * With RED/BLUE as the target: share 0.75 matches at about 0.22, share 0.45 at about 0.36.
 */
function twoTone(x, top, top2, share, bottom) {
  return { ...person(x, top, bottom), top2, share };
}

/** The part of a box that's inside the picture (a person half out of frame is cut off). */
function visible(b) {
  const x0 = Math.max(0, b.x);
  const x1 = Math.min(1, b.x + b.w);
  return x1 - x0 < 0.03 ? null : { x: x0, y: b.y, w: x1 - x0, h: b.h };
}

function fillRect(img, b, color) {
  for (let y = Math.max(0, Math.floor(b.y * H)); y < Math.min(H, Math.ceil((b.y + b.h) * H)); y++) {
    for (let x = Math.max(0, Math.floor(b.x * W)); x < Math.min(W, Math.ceil((b.x + b.w) * W)); x++) {
      const i = (y * W + x) * 4;
      img.data[i] = color[0];
      img.data[i + 1] = color[1];
      img.data[i + 2] = color[2];
    }
  }
}

/** A blotchy brown-and-cream pattern that moves with the blanket. */
function paintBlanket(img, b) {
  const x0 = Math.floor(b.x * W);
  const y0 = Math.floor(b.y * H);
  const bw = Math.floor(b.w * W);
  const bh = Math.floor(b.h * H);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const cell = Math.floor(x / 12) * 131 + Math.floor(y / 12) * 977;
      const light = ((cell * 2654435761) >>> 0) % 3 === 0;
      const px = x0 + x;
      const py = y0 + y;
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      const i = (py * W + px) * 4;
      img.data[i] = light ? 235 : 110;
      img.data[i + 1] = light ? 220 : 70;
      img.data[i + 2] = light ? 190 : 40;
    }
  }
}

/**
 * Builds one frame for the brain from a list of people (and maybe a blanket).
 * `front` people are drawn on top of the blanket (walking in front of it).
 */
function frame(t, people, { radar = null, tap = null, blanket = null, camera = CENTER, front = [], weak = [], faces = [], behind = [] } = {}) {
  const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
  const draw = (p) => {
    const v = visible(p.box);
    if (!v) return null;
    fillRect(img, { x: v.x, y: v.y, w: v.w, h: v.h / 2 }, p.top);
    if (p.top2) {
      // The colour sampler looks at the middle half of the box, so split within that.
      const split = p.box.x + p.box.w * (0.25 + 0.5 * p.share);
      fillRect(img, { x: split, y: v.y, w: v.x + v.w - split, h: v.h / 2 }, p.top2);
    }
    fillRect(img, { x: v.x, y: v.y + v.h / 2, w: v.w, h: v.h / 2 }, p.bottom);
    return v;
  };
  behind.forEach(draw); // drawn first (partly covered) and not detected
  const boxes = people.map(draw).filter(Boolean);
  if (blanket) paintBlanket(img, blanket);
  boxes.push(...front.map(draw).filter(Boolean));
  // `weak` people are drawn, but the detector is unsure about them (covering their face, say).
  const weakBoxes = weak.map(draw).filter(Boolean);
  return { t, people: boxes, weak: weakBoxes, image: img, radar, camera, tap, faces };
}

const newBrain = () => new Brain({ ...DEFAULT_SETTINGS });

test("clothes colours: the same outfit matches, a different one doesn't", () => {
  const a = frame(0, [person(0.2, RED, BLUE), person(0.6, GREEN, BLACK)]);
  const b = frame(0, [person(0.4, RED, BLUE)]);
  const redBlue1 = lookOf(a.image, a.people[0]);
  const greenBlack = lookOf(a.image, a.people[1]);
  const redBlue2 = lookOf(b.image, b.people[0]);
  assert.ok(lookDistance(redBlue1, redBlue2) < 0.1, "same outfit should look alike");
  assert.ok(lookDistance(redBlue1, greenBlack) > 0.5, "different outfits should look different");
});

test("tapping a person locks on, and the stand turns toward them as they walk", () => {
  const brain = newBrain();
  let out = brain.update(frame(0, [person(0.4, RED, BLUE), person(0.7, GREEN, BLACK)], { tap: { x: 0.47, y: 0.5 } }));
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.4) < 0.01, "should pick the person under the finger");

  for (let i = 1; i <= 10; i++) {
    out = brain.update(frame(i * FRAME_MS, [person(0.4 + i * 0.01, RED, BLUE), person(0.7, GREEN, BLACK)]));
  }
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.5) < 0.01, "should still be on the red person");
  assert.ok(out.aim.pan > LIMITS.center, "red is right of centre, so the stand should turn right");
});

test("two people cross paths: it stays on the one you picked", () => {
  const brain = newBrain();
  let out = brain.update(frame(0, [person(0.2, RED, BLUE), person(0.65, GREEN, BLACK)], { tap: { x: 0.27, y: 0.5 } }));
  for (let i = 1; i <= 30; i++) {
    const red = person(0.2 + i * 0.015, RED, BLUE); // walks right
    const green = person(0.65 - i * 0.015, GREEN, BLACK); // walks left, passing in front
    out = brain.update(frame(i * FRAME_MS, [green, red]));
  }
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.65) < 0.02, `should end on red at x=0.65, got ${out.target.x}`);
});

test("walking out of the picture: it keeps turning that way, searches, then re-finds you", () => {
  const brain = newBrain();
  const green = person(0.05, GREEN, BLACK); // a bystander who stays put
  let t = 0;
  let out = brain.update(frame(t, [person(0.5, RED, BLUE), green], { tap: { x: 0.57, y: 0.5 } }));

  // Walk right and off the edge of the picture.
  for (let x = 0.5; x < 1.05; x += 0.02) {
    t += FRAME_MS;
    out = brain.update(frame(t, [person(x, RED, BLUE), green]));
  }
  const seen = new Set();
  let firstAim = null;
  let lastFollowAim = null;
  for (let i = 0; i < 400; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [green]));
    seen.add(out.mode);
    if (out.mode === "following") {
      assert.equal(out.exitSide, 1, "they left on the right");
      firstAim ??= out.aim.pan;
      lastFollowAim = out.aim.pan;
    }
    if (out.mode === "lost") break;
  }
  assert.ok(seen.has("following"), "should follow after you leave the picture");
  assert.ok(lastFollowAim > firstAim, "should keep turning right while following");
  assert.ok(seen.has("searching"), "should sweep the room when you're not found");
  assert.equal(out.mode, "lost", "the bystander must not be mistaken for you");

  // Walk back in somewhere else.
  t += FRAME_MS;
  out = brain.update(frame(t, [person(0.45, RED, BLUE), green]));
  assert.equal(out.mode, "tracking", "should recognise you by your clothes");
  assert.ok(Math.abs(out.target.x - 0.45) < 0.01);
});

test("hiding under a blanket: HIDDEN while the radar senses you, LOST once it's empty", () => {
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.42, RED, BLUE)], { tap: { x: 0.5, y: 0.5 }, radar: true }));
  for (let i = 0; i < 5; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [person(0.42, RED, BLUE)], { radar: true }));
  }
  const blanket = { x: 0.4, y: 0.35, w: 0.2, h: 0.45 };

  // Under the blanket: the detector sees nobody, the radar still feels someone.
  for (let i = 0; i < 150; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { blanket, radar: true }));
  }
  assert.equal(out.mode, "hidden", "10 seconds under a blanket with the radar on: still hidden");
  assert.ok(out.target, "should keep showing where the cover is");

  // They sneak away; the radar goes empty.
  for (let i = 0; i < 40; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { blanket, radar: false }));
  }
  assert.equal(out.mode, "hidden", "under 4 seconds of an empty radar: not lost yet");
  for (let i = 0; i < 40; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { blanket, radar: false }));
  }
  assert.equal(out.mode, "lost", "an empty cover for over 4 seconds is lost");
});

test("crawling under the blanket: the stand follows the moving lump", () => {
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.32, RED, BLUE)], { tap: { x: 0.4, y: 0.5 }, radar: true }));
  let blanket = { x: 0.3, y: 0.35, w: 0.2, h: 0.45 };
  for (let i = 0; i < 12; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { blanket, radar: true }));
  }
  assert.equal(out.mode, "hidden");
  const startX = out.target.x;
  const startPan = out.aim.pan;

  for (let i = 0; i < 20; i++) {
    blanket = { ...blanket, x: blanket.x + 2 / W }; // 2 pixels a frame to the right
    t += FRAME_MS;
    out = brain.update(frame(t, [], { blanket, radar: true }));
  }
  assert.equal(out.mode, "hidden");
  const moved = out.target.x - startX;
  assert.ok(Math.abs(moved - 40 / W) < 0.03, `the cover box should move ~0.125 right, moved ${moved.toFixed(3)}`);
  assert.ok(out.aim.pan > startPan, "the stand should turn to follow the lump");
});

test("coming out from under the blanket locks straight back on", () => {
  const brain = newBrain();
  let t = 0;
  brain.update(frame(t, [person(0.42, RED, BLUE)], { tap: { x: 0.5, y: 0.5 }, radar: true }));
  const blanket = { x: 0.4, y: 0.35, w: 0.2, h: 0.45 };
  let out;
  for (let i = 0; i < 30; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { blanket, radar: true }));
  }
  assert.equal(out.mode, "hidden");
  t += FRAME_MS;
  out = brain.update(frame(t, [person(0.44, RED, BLUE)], { radar: true }));
  assert.equal(out.mode, "tracking");
});

/** Taps the red-and-blue person at x, then they pull a blanket over themselves and vanish. */
function hideUnderBlanket(brain, x, blanket, radar = true) {
  let t = 0;
  brain.update(frame(t, [person(x, RED, BLUE)], { tap: { x: x + 0.07, y: 0.5 }, radar }));
  let out;
  for (let i = 0; i < 12; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { blanket, radar }));
  }
  assert.equal(out.mode, "hidden");
  return t;
}

test("walking around under a blanket: a person shape moving with the cover is still you", () => {
  const brain = newBrain();
  let blanket = { x: 0.28, y: 0.25, w: 0.19, h: 0.55 };
  let t = hideUnderBlanket(brain, 0.3, blanket);
  const startPan = brain.update(frame(t, [], { blanket, radar: true })).aim.pan;

  // They walk right under it. The detector now sees a person shape there (legs below
  // the blanket), coloured like the blanket, not like their clothes.
  const shapeOn = (b) => ({ box: { x: b.x, y: 0.2, w: b.w, h: 0.62 }, top: GREY, bottom: GREY });
  let out;
  for (let i = 0; i < 25; i++) {
    blanket = { ...blanket, x: blanket.x + 3 / W };
    t += FRAME_MS;
    out = brain.update(frame(t, [shapeOn(blanket)], { blanket, radar: true }));
  }
  assert.equal(out.mode, "tracking", `should follow the walking shape, but is ${out.mode}: ${out.note}`);
  assert.ok(Math.abs(out.target.x - blanket.x) < 0.02, "the box should be on the walking blanket");

  for (let i = 0; i < 15; i++) {
    blanket = { ...blanket, x: blanket.x + 3 / W };
    t += FRAME_MS;
    out = brain.update(frame(t, [shapeOn(blanket)], { blanket, radar: true }));
  }
  assert.equal(out.mode, "tracking", "should keep following while they walk");
  assert.ok(out.aim.pan > startPan + 5, "the stand should turn with them");
});

test("someone strolling past the blanket isn't taken for the person under it", () => {
  const brain = newBrain();
  const blanket = { x: 0.4, y: 0.25, w: 0.19, h: 0.55 };
  let t = hideUnderBlanket(brain, 0.42, blanket);
  let out;
  for (let i = 0; i < 70; i++) {
    const stranger = person(0.1 + i * 0.01, GREEN, WHITE); // slowly, right in front of the blanket
    t += FRAME_MS;
    out = brain.update(frame(t, [], { blanket, radar: true, front: [stranger] }));
    assert.notEqual(out.mode, "tracking", `locked onto the stranger at x=${stranger.box.x.toFixed(2)}`);
  }
  assert.equal(out.mode, "hidden");
});

test("losing track of the blanket lets the radar steer, until the cover is found again", () => {
  const brain = newBrain();
  const blanket = { x: 0.28, y: 0.25, w: 0.19, h: 0.55 };
  let t = hideUnderBlanket(brain, 0.3, blanket);

  // They hurry off under it, faster than the cover tracker can follow.
  const far = { ...blanket, x: blanket.x + 0.4 };
  let out;
  for (let i = 0; i < 20; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { blanket: far, radar: true }));
  }
  assert.equal(out.mode, "hidden");
  assert.equal(out.aim, null, "the camera should stop steering, so the stand's radars can");
  assert.match(out.note, /radar/i);

  // The cover turns up where the tracker last had it: the camera steers again.
  for (let i = 0; i < 3; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { blanket, radar: true }));
  }
  assert.ok(out.aim, "found the cover again: the camera should steer again");

  // With no radar connected there's nothing to hand over to: keep pointing where they were.
  const pcBrain = newBrain();
  t = hideUnderBlanket(pcBrain, 0.3, blanket, null);
  for (let i = 0; i < 20; i++) {
    t += FRAME_MS;
    out = pcBrain.update(frame(t, [], { blanket: far, radar: null }));
  }
  assert.ok(out.aim, "no radar: hold the aim");
});

test("covering your face: the AI is less sure it's a person, but it keeps tracking you", () => {
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.42, RED, BLUE)], { tap: { x: 0.5, y: 0.5 } }));
  for (let i = 0; i < 5; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [person(0.42, RED, BLUE)]));
  }
  // Hands over the face: only a weak detection, right where they stand.
  for (let i = 0; i < 40; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { weak: [person(0.42, RED, BLUE)] }));
  }
  assert.equal(out.mode, "tracking", `2.6 s of weak detections where you stand: still tracking, but ${out.mode}`);
  assert.ok(out.target && Math.abs(out.target.x - 0.42) < 0.01);

  // Weak detections only count for a while: after that it treats you as hidden.
  for (let i = 0; i < 60; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { weak: [person(0.42, RED, BLUE)] }));
  }
  assert.equal(out.mode, "hidden");

  // A proper detection again: tracking.
  t += FRAME_MS;
  out = brain.update(frame(t, [person(0.42, RED, BLUE)]));
  assert.equal(out.mode, "tracking");
});

test("a weak detection somewhere else, or of someone who looks different, isn't taken for you", () => {
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.42, RED, BLUE)], { tap: { x: 0.5, y: 0.5 } }));
  for (let i = 0; i < 20; i++) {
    t += FRAME_MS;
    // Where they stood there's only a weak green-and-black shape; far away, a weak red-and-blue one.
    out = brain.update(frame(t, [], { weak: [person(0.42, GREEN, BLACK), person(0.05, RED, BLUE)] }));
  }
  assert.equal(out.mode, "hidden");
});

test("after locking onto a look-alike, it switches back once you're clearly the better match", () => {
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.42, RED, BLUE)], { tap: { x: 0.5, y: 0.5 } }));
  // You crouch out of sight.
  for (let i = 0; i < 12; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, []));
  }
  assert.equal(out.mode, "hidden");
  // Someone who sort of looks like you (match ~0.36) steps into the spot: it takes them.
  const lookAlike = (x) => twoTone(x, RED, GREEN, 0.45, BLUE);
  for (let i = 0; i < 10; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [lookAlike(0.4)]));
  }
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.4) < 0.01, "on the look-alike for now");

  // You stand up further right, in slightly different light (match ~0.22, not 0.15 better).
  const you = twoTone(0.75, RED, WHITE, 0.75, BLUE);
  for (let i = 0; i < 15; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [lookAlike(0.4), you]));
  }
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.75) < 0.01, `should have switched back to you, but is on x=${out.target.x.toFixed(2)}`);
});

test("one lucky frame of a better match doesn't make it switch", () => {
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.3, RED, BLUE)], { tap: { x: 0.37, y: 0.5 } }));
  // You, in odd light (match ~0.36) - and now and then someone else matching ~0.22 for a single frame.
  const youOdd = twoTone(0.3, RED, GREEN, 0.45, BLUE);
  const other = twoTone(0.75, RED, WHITE, 0.75, BLUE);
  for (let i = 0; i < 30; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, i % 5 === 0 ? [youOdd, other] : [youOdd]));
  }
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.3) < 0.01, `should still be on you, but is on x=${out.target.x.toFixed(2)}`);
});

test("hiding behind a pillar next to someone: it doesn't switch to them, and finds you when you come out", () => {
  const brain = newBrain();
  let t = 0;
  // Someone who sort of looks like you (match ~0.41) stands near the pillar the whole time.
  const nearby = twoTone(0.52, RED, GREEN, 0.3, BLUE);
  let out = brain.update(frame(t, [person(0.25, RED, BLUE), nearby], { tap: { x: 0.32, y: 0.5 } }));
  for (let x = 0.25; x <= 0.33; x += 0.01) {
    t += FRAME_MS;
    out = brain.update(frame(t, [person(x, RED, BLUE), nearby]));
  }
  assert.ok(Math.abs(out.target.x - 0.33) < 0.02, "tracking you before the pillar");
  // Behind the pillar for 3 seconds: only the other person is in view.
  for (let i = 0; i < 45; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [nearby]));
    assert.ok(!(out.mode === "tracking" && out.target && Math.abs(out.target.x - 0.52) < 0.02), `frame ${i}: switched to the person next to the pillar (${out.mode})`);
  }
  // You step out from behind the pillar.
  for (let i = 0; i < 5; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [nearby, person(0.36, RED, BLUE)]));
  }
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.36) < 0.02, `should be on you again, but is on x=${out.target.x.toFixed(2)}`);
});

test("walking into the spot someone just left doesn't make it lose you", () => {
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.3, RED, BLUE), person(0.5, GREEN, BLACK)], { tap: { x: 0.37, y: 0.5 } }));
  for (let i = 0; i < 5; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [person(0.3, RED, BLUE), person(0.5, GREEN, BLACK)]));
  }
  // The other person ducks out of view; you walk into the spot they left, straight away.
  for (let i = 1; i <= 15; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [person(0.3 + i * 0.015, RED, BLUE)]));
  }
  assert.equal(out.mode, "tracking", `should still be tracking you, but is ${out.mode}`);
  assert.ok(Math.abs(out.target.x - 0.525) < 0.02, `should be on you at x≈0.53, got ${out.target.x.toFixed(2)}`);
});

test("turning the camera away and back: it doesn't hand your face over to the person who slides into your spot", () => {
  // Like Apple's video: the camera turns left, you leave the picture on the right, the person
  // who was on your left slides into the spot where you were, then the camera turns back.
  const brain = newBrain();
  const fov = DEFAULT_SETTINGS.fovH;
  const at = (worldPan, cameraPan, top, bottom, top2, share) => {
    const x = 0.5 + (worldPan - cameraPan) / fov - 0.075;
    return top2 ? twoTone(x, top, top2, share, bottom) : person(x, top, bottom);
  };
  const you = (cam) => at(95, cam, RED, BLUE);
  const other = (cam) => at(83, cam, RED, BLUE, GREEN, 0.3); // sort of like you (~0.41)
  const view = (cam) => [you(cam), other(cam)].filter((p) => visible(p.box));
  let t = 0;
  let cam = 90;
  let out = brain.update(frame(t, view(cam), { tap: { x: you(cam).box.x + 0.07, y: 0.5 }, camera: { pan: cam, tilt: 90 } }));
  const steps = [];
  for (let c = 90; c >= 50; c -= 2) steps.push(c); // turn left...
  for (let c = 50; c <= 90; c += 2) steps.push(c); // ...and back
  for (const c of steps) {
    cam = c;
    t += FRAME_MS;
    const people = view(cam);
    // A face check of you finishes just before you leave the picture.
    const faces = cam === 74 ? [{ box: you(cam).box, same: true }] : [];
    out = brain.update(frame(t, people, { camera: { pan: cam, tilt: 90 }, faces }));
    const onOther = out.mode === "tracking" && out.target && Math.abs(out.target.x - other(cam).box.x) < 0.02;
    assert.ok(!onOther, `camera at ${cam}°: took the other person (${out.note})`);
  }
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - you(cam).box.x) < 0.02, `should be back on you, but is on x=${out.target.x.toFixed(2)}`);
});

for (const withFace of [false, true]) {
  test(`someone walking behind you doesn't hand you their note${withFace ? " (their face was ruled out)" : ""}`, () => {
    // Found in review: when the person behind stopped being detected, their note slid onto you.
    const brain = newBrain();
    let t = 0;
    const you = person(0.3, RED, BLUE);
    let out = brain.update(frame(t, [you], { tap: { x: 0.37, y: 0.5 } }));
    for (let k = 0; k < 40; k++) {
      t += FRAME_MS;
      const bx = Math.max(-0.2, 0.6 - k * 0.015);
      const other = person(bx, GREEN, BLACK);
      const hidden = Math.abs(bx - 0.3) < 0.07; // mostly behind you: the detector misses them
      const faces = withFace && k === 5 ? [{ box: other.box, same: false }] : [];
      out = brain.update(frame(t, hidden ? [you] : [other, you], { behind: hidden ? [other] : [], faces }));
      assert.equal(out.mode, "tracking", `frame ${k}: ${out.mode} (${out.note})`);
      assert.equal(out.note, "Tracking you.", `frame ${k}: you're in plain view, but: ${out.note}`);
    }
  });
}

test("someone whose face was ruled out brushing past you doesn't make it lose you", () => {
  const brain = newBrain();
  let t = 0;
  const you = person(0.4, RED, BLUE);
  let out = brain.update(frame(t, [you], { tap: { x: 0.47, y: 0.5 } }));
  for (let k = 0; k < 30; k++) {
    t += FRAME_MS;
    const other = person(0.75 - k * 0.01, GREEN, BLACK); // walks up close beside you (overlapping)
    const faces = k === 2 ? [{ box: other.box, same: false }] : [];
    out = brain.update(frame(t, [you, other], { faces }));
    assert.equal(out.mode, "tracking", `frame ${k}: ${out.note}`);
    assert.ok(Math.abs(out.target.x - 0.4) < 0.01, `frame ${k}: should stay on you`);
  }
});

test("after a pause (page hidden), an old face verdict doesn't land on whoever stands there now", () => {
  const brain = newBrain();
  let t = 0;
  const you = person(0.4, RED, BLUE);
  let out = brain.update(frame(t, [you], { tap: { x: 0.47, y: 0.5 } }));
  t += FRAME_MS;
  out = brain.update(frame(t, [you], { faces: [{ box: you.box, same: true }] }));
  assert.equal(out.faces[0], true);
  // The phone is locked for 5 seconds. Meanwhile you left, and a stranger stands in your spot.
  t += 5000;
  out = brain.update(frame(t, [person(0.41, GREEN, BLACK)]));
  assert.notEqual(out.faces[0], true, "the stranger must not inherit your face verdict");
  assert.ok(!(out.mode === "tracking" && /face/i.test(out.note)), `took the stranger by face: ${out.note}`);
});

test("a tap that hits nobody changes nothing: same target, same notes", () => {
  const brain = newBrain();
  let t = 0;
  const near = twoTone(0.52, RED, GREEN, 0.3, BLUE); // sort of like you, next to the pillar
  let out = brain.update(frame(t, [person(0.3, RED, BLUE), near], { tap: { x: 0.37, y: 0.5 } }));
  assert.equal(out.picked, true);
  for (let i = 0; i < 5; i++) {
    t += FRAME_MS;
    const faces = i === 2 ? [{ box: person(0.3, RED, BLUE).box, same: true }] : [];
    out = brain.update(frame(t, [person(0.3, RED, BLUE), near], { faces }));
  }
  assert.equal(out.faces[0], true, "your face was confirmed");
  // A tap on empty floor.
  t += FRAME_MS;
  out = brain.update(frame(t, [person(0.3, RED, BLUE), near], { tap: { x: 0.95, y: 0.95 } }));
  assert.equal(out.picked, false);
  assert.ok(Math.abs(out.target.x - 0.3) < 0.01, "still on you");
  assert.equal(out.faces[0], true, "a tap on nobody must not throw away what your face check said");
  // You hide behind the pillar: the person next to it is still known to be someone else.
  for (let i = 0; i < 30; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [near]));
    assert.ok(!(out.mode === "tracking" && Math.abs(out.target.x - 0.52) < 0.02), `frame ${i}: took the person by the pillar`);
  }
});

test("a face match re-finds you, even after a change of clothes", () => {
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.3, RED, BLUE)], { tap: { x: 0.37, y: 0.5 } }));
  // A wild camera turn: you're lost from view.
  for (let i = 0; i < 12; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, []));
  }
  assert.notEqual(out.mode, "tracking");
  // You're back, jacket off (different colours), next to a stranger in your old clothes.
  const you = person(0.7, GREEN, BLACK);
  const stranger = person(0.2, RED, BLUE);
  t += FRAME_MS;
  out = brain.update(frame(t, [stranger, you], { faces: [{ box: you.box, same: true }] }));
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.7) < 0.01, `should be on you, by your face, but is on x=${out.target.x.toFixed(2)}`);
  assert.match(out.note, /face/i);
  // And it stays with you over the next frames, though the stranger wears your old colours.
  for (let i = 0; i < 20; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [stranger, person(0.7 - i * 0.005, GREEN, BLACK)]));
  }
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.6) < 0.02, `should still be on you, but is on x=${out.target.x.toFixed(2)}`);
});

test("a face that isn't yours makes it drop a look-alike and go back to you", () => {
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.42, RED, BLUE)], { tap: { x: 0.5, y: 0.5 } }));
  for (let i = 0; i < 12; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, []));
  }
  // A look-alike (colours ~0.36) steps into your spot and gets taken.
  const lookAlike = (x) => twoTone(x, RED, GREEN, 0.45, BLUE);
  for (let i = 0; i < 10; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [lookAlike(0.4)]));
  }
  assert.ok(out.target && Math.abs(out.target.x - 0.4) < 0.01, "on the look-alike for now");
  // Their face is checked: not you. It lets go of them at once.
  t += FRAME_MS;
  out = brain.update(frame(t, [lookAlike(0.4)], { faces: [{ box: lookAlike(0.4).box, same: false }] }));
  assert.notEqual(out.mode, "tracking", "should stop following someone whose face isn't yours");
  // It doesn't fall for them again by their colours, even after a while...
  for (let i = 0; i < 20; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [lookAlike(0.4 + i * 0.003)]));
  }
  assert.notEqual(out.mode, "tracking", "the look-alike stays ruled out while in view");
  // ...and when you're back (colours ~0.22), it's on you straight away.
  const you = twoTone(0.75, RED, WHITE, 0.75, BLUE);
  t += FRAME_MS;
  out = brain.update(frame(t, [lookAlike(0.46), you]));
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.75) < 0.01, `should be on you, but is on x=${out.target?.x.toFixed(2)}`);
});

test("tapping someone new forgets what faces said before", () => {
  const brain = newBrain();
  let t = 0;
  const a = person(0.2, RED, BLUE);
  const b = person(0.65, GREEN, BLACK);
  let out = brain.update(frame(t, [a, b], { tap: { x: 0.27, y: 0.5 } }));
  t += FRAME_MS;
  out = brain.update(frame(t, [a, b], { faces: [{ box: b.box, same: false }] }));
  assert.equal(out.faces[1], false, "B's face isn't A's");
  // Now tap B: B is the target, and the old verdict about B no longer applies.
  t += FRAME_MS;
  out = brain.update(frame(t, [a, b], { tap: { x: 0.72, y: 0.5 } }));
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.65) < 0.01);
  for (let i = 0; i < 5; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [a, b]));
  }
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.65) < 0.01, "still on B");
  assert.equal(out.faces[1], null);
});

test("a different person walking in while LOST is ignored", () => {
  const brain = newBrain();
  let t = 0;
  brain.update(frame(t, [person(0.42, RED, BLUE)], { tap: { x: 0.5, y: 0.5 }, radar: false }));
  let out;
  for (let i = 0; i < 100; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [], { radar: false }));
  }
  assert.equal(out.mode, "lost");
  for (let i = 0; i < 10; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [person(0.42, GREEN, BLACK)], { radar: false }));
  }
  assert.equal(out.mode, "lost", "someone in different clothes isn't you");
  assert.ok(out.match > DEFAULT_SETTINGS.matchLimit, "and the on-screen match number says so");
});

test("with no radar connected (testing on a PC), Hidden gives up after 15 seconds", () => {
  const brain = newBrain();
  let t = 0;
  brain.update(frame(t, [person(0.42, RED, BLUE)], { tap: { x: 0.5, y: 0.5 } }));
  let out;
  for (let i = 0; i < 100; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, []));
  }
  assert.equal(out.mode, "hidden");
  for (let i = 0; i < 200; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, []));
  }
  assert.equal(out.mode, "lost");
});

test("simulated room: the stand turns to face you, keeps up as you walk, and finds you after you outrun it", () => {
  // The "real" motor is slower than the software's guess (10% per 20 ms instead of
  // 15%, and at most 90 degrees a second), like a tired servo carrying a phone.
  const real = {
    now: { pan: LIMITS.center, tilt: LIMITS.center },
    target: { pan: LIMITS.center, tilt: LIMITS.center },
    history: [{ t: 0, pan: LIMITS.center, tilt: LIMITS.center }],
    setTarget(a) {
      this.target = { ...a };
    },
    step(t, ms) {
      const keep = Math.pow(0.9, ms / 20);
      const max = (90 * ms) / 1000;
      for (const axis of ["pan", "tilt"]) {
        const eased = this.target[axis] + (this.now[axis] - this.target[axis]) * keep;
        this.now[axis] += Math.max(-max, Math.min(max, eased - this.now[axis]));
      }
      this.history.push({ t, ...this.now });
    },
    at(t) {
      for (let i = this.history.length - 1; i >= 0; i--) if (this.history[i].t <= t) return this.history[i];
      return this.history[0];
    },
    get current() {
      return this.now;
    },
  };
  const guess = new ServoModel();
  const brain = newBrain();
  const fov = DEFAULT_SETTINGS.fovH;
  let t = 0;
  let you = 110; // your direction in the room, in servo degrees
  const realStep = (ms) => {
    for (let k = 5; k <= ms; k += 5) real.step(t - ms + k, 5);
  };
  const modes = new Set();
  const shoot = (tap = null) => {
    const cam = real.at(t - TUNING.latencyMs); // the picture shows where the camera really was
    const x = 0.5 + (you - cam.pan) / fov - 0.075; // left edge of a 0.15-wide person
    const out = brain.update(frame(t, [person(x, RED, BLUE)], { tap, radar: true, camera: guess.at(t - TUNING.latencyMs) }));
    modes.add(out.mode);
    if (out.aim) {
      real.setTarget(out.aim);
      guess.setTarget(out.aim);
    }
    return out;
  };
  const run = (ms, walkSpeed) => {
    let out;
    for (let s = 0; s < ms; s += FRAME_MS) {
      t += FRAME_MS;
      you = Math.min(LIMITS.panMax, Math.max(LIMITS.panMin, you + (walkSpeed * FRAME_MS) / 1000));
      realStep(FRAME_MS);
      guess.step(t);
      out = shoot();
    }
    return out;
  };

  guess.step(0);
  let out = shoot({ x: 0.5 + (you - 90) / fov, y: 0.5 });
  assert.equal(out.mode, "tracking");

  out = run(3000, 0);
  assert.ok(Math.abs(real.current.pan - you) < 4, `should face you: camera ${real.current.pan.toFixed(1)}, you ${you}`);

  // Stand still for a second: the aim must not wobble.
  const aims = [];
  for (let i = 0; i < 15; i++) aims.push(run(FRAME_MS, 0).aim.pan);
  assert.ok(Math.max(...aims) - Math.min(...aims) < 1, "no wobbling while you stand still");

  out = run(1200, 40); // walk right at a steady pace
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(real.current.pan - you) < 12, `should keep up: camera ${real.current.pan.toFixed(1)}, you ${you.toFixed(1)}`);

  out = run(1000, -160); // run left, faster than the stand can turn
  out = run(6000, 0); // then stop
  assert.ok(modes.has("following"), "should have lost you off the edge of the picture and turned to follow");
  assert.equal(out.mode, "tracking", `should have found you again, ended in ${out.mode}`);
  assert.ok(Math.abs(real.current.pan - you) < 5, `should face you again: camera ${real.current.pan.toFixed(1)}, you ${you.toFixed(1)}`);
});

test("stepping behind a wall next to a brown coat: it doesn't get stuck on the coat, and re-finds you", () => {
  const BROWN = [120, 70, 40];
  const coat = person(0.42, BROWN, BLUE); // a coat on a chair that the detector thinks is a person
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.25, RED, BLUE), coat], { tap: { x: 0.32, y: 0.5 } }));
  assert.equal(out.mode, "tracking");
  // Walk right, toward the wall.
  for (let x = 0.25; x <= 0.33; x += 0.01) {
    t += FRAME_MS;
    out = brain.update(frame(t, [person(x, RED, BLUE), coat]));
  }
  // Behind the wall for 3 seconds: only the coat is visible.
  for (let i = 0; i < 45; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [coat]));
  }
  // Come back out on the other side of the wall and keep walking.
  for (let x = 0.7; x <= 0.8; x += 0.01) {
    t += FRAME_MS;
    out = brain.update(frame(t, [coat, person(x, RED, BLUE)]));
  }
  assert.equal(out.mode, "tracking", `should be tracking you again, ended in ${out.mode}`);
  assert.ok(out.target && out.target.x > 0.65, `the box should be on you (x about 0.8), not the coat; got x=${out.target?.x}`);
});

test("a coat that looks very like you: it doesn't take the coat while you're hidden, and finds you when you're back", () => {
  const DARKRED = [120, 25, 25];
  const coat = person(0.42, DARKRED, BLUE);
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.3, RED, BLUE), coat], { tap: { x: 0.37, y: 0.5 } }));
  for (let i = 0; i < 45; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [coat]));
    // The coat was in view at the same time as you, so it can't be you.
    assert.ok(!(out.mode === "tracking" && Math.abs(out.target.x - 0.42) < 0.01), `frame ${i}: took the coat`);
  }
  for (let i = 0; i < 5; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [coat, person(0.75, RED, BLUE)]));
  }
  assert.equal(out.mode, "tracking");
  assert.ok(Math.abs(out.target.x - 0.75) < 0.01, `should be on you at x=0.75, got ${out.target.x}`);
  assert.ok(out.matches[1] < 0.1 && out.matches[0] > 0.3, "the on-screen numbers: you close to 0, the coat further");
});

test("walking into different light: your colours drift, but it keeps following you", () => {
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.2, RED, BLUE)], { tap: { x: 0.27, y: 0.5 } }));
  // Over 6 seconds the shirt slowly turns from bright red to a dim brownish red, and the trousers darken.
  for (let i = 1; i <= 90; i++) {
    const k = i / 90;
    const top = [200 - 90 * k, 30 + 40 * k, 30 + 10 * k];
    const bottom = [30 - 10 * k, 50 - 20 * k, 180 - 90 * k];
    t += FRAME_MS;
    out = brain.update(frame(t, [person(0.2 + i * 0.004, top, bottom)]));
  }
  assert.equal(out.mode, "tracking", `should still be tracking you, ended in ${out.mode}: ${out.note}`);
  assert.ok(Math.abs(out.target.x - 0.56) < 0.02, `box should be on you at x=0.56, got ${out.target.x}`);
});
