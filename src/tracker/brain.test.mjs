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
const CENTER = { pan: LIMITS.center, tilt: LIMITS.center };

/** A person standing at x (left edge), 15% of the frame wide and 60% tall. */
function person(x, top, bottom) {
  return { box: { x, y: 0.2, w: 0.15, h: 0.6 }, top, bottom };
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

/** Builds one frame for the brain from a list of people (and maybe a blanket). */
function frame(t, people, { radar = null, tap = null, blanket = null, camera = CENTER } = {}) {
  const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
  const boxes = [];
  for (const p of people) {
    const v = visible(p.box);
    if (!v) continue;
    fillRect(img, { x: v.x, y: v.y, w: v.w, h: v.h / 2 }, p.top);
    fillRect(img, { x: v.x, y: v.y + v.h / 2, w: v.w, h: v.h / 2 }, p.bottom);
    boxes.push(v);
  }
  if (blanket) paintBlanket(img, blanket);
  return { t, people: boxes, image: img, radar, camera, tap };
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

test("a coat that looks very like you holds the box while you're hidden, but you win when you come back", () => {
  const DARKRED = [120, 25, 25];
  const coat = person(0.42, DARKRED, BLUE);
  const brain = newBrain();
  let t = 0;
  let out = brain.update(frame(t, [person(0.3, RED, BLUE), coat], { tap: { x: 0.37, y: 0.5 } }));
  for (let i = 0; i < 45; i++) {
    t += FRAME_MS;
    out = brain.update(frame(t, [coat]));
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
