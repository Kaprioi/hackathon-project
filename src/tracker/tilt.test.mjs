// Tests for following someone up and down (the tilt motor), with the iPhone on the stand so
// the camera tilts with the motor: standing up, sitting or crouching down, and coming
// closer. The stand must tilt the right way, keep the head in the picture, and settle
// without rocking up and down. No camera or stand needed.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { Brain, TiltHold, aimPointY, limitTilt, predictAim, towardLevel, towardTilt } from "./brain.ts";
import { CAMERA_STEERS_IN, DEFAULT_SETTINGS, LIMITS, TILT, TUNING, cameraTurnsWithStand } from "./config.ts";
import { ServoModel } from "./servoModel.ts";

const W = 320;
const H = 180;
const FRAME_MS = 66; // the camera: about 15 frames a second
const SCREEN_MS = 16; // the page: about 60 screen refreshes a second
const PERSON_W = 0.15;

/**
 * A tired real motor carrying the phone: 10% of the way per 20 ms and at most 90°/s, while
 * the page thinks it does what the firmware says (25% and 200°/s for tilt).
 */
function slowMotor() {
  const now = { pan: LIMITS.center, tilt: LIMITS.center };
  let target = { ...now };
  const history = [{ t: 0, ...now }];
  return {
    setTarget(a) {
      target = { ...a };
    },
    step(t) {
      for (let k = history.at(-1).t + 5; k <= t; k += 5) {
        for (const axis of ["pan", "tilt"]) {
          const eased = target[axis] + (now[axis] - target[axis]) * Math.pow(0.9, 5 / 20);
          now[axis] += Math.max(-0.45, Math.min(0.45, eased - now[axis]));
        }
        history.push({ t: k, ...now });
      }
    },
    at(t) {
      for (let i = history.length - 1; i >= 0; i--) if (history[i].t <= t) return history[i];
      return history[0];
    },
    get current() {
      return now;
    },
  };
}

/**
 * The iPhone on the stand, 60 times a second, like TrackerPage: the camera picture is a
 * frame late; the brain looks at it 15 times a second; in between the page moves a moving
 * aim on by its speed. You are at `pan`, from the top of your head (`head`) down to your
 * feet or seat (`feet`), all in motor degrees (bigger tilt = lower down). The picture shows
 * what's in front of the real motor, cut off at its edges like the real detector's boxes.
 * `motorSign` -1: the tilt motor is mounted the other way round (bigger tilt = look up).
 * `portrait`: the iPhone stands upright, so the picture is tall (the page swaps the angles).
 */
function iphoneOnStand({ head, feet, pan = 90, settings = {}, motorSign = 1, portrait = false, motor = null }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const fovH = portrait ? s.fovV : s.fovH;
  const fovV = portrait ? s.fovH : s.fovV;
  let brainSettings = { ...s, fovH, fovV };
  const real = motor ?? new ServoModel();
  const guess = new ServoModel();
  real.step(0);
  guess.step(0);
  const brain = new Brain(brainSettings);
  const you = { pan, head, feet };
  const timeline = [{ t: 0, ...you }];
  const youAt = (t) => [...timeline].reverse().find((p) => p.t <= t) ?? timeline[0];
  let t = 0;
  let last = null;
  let flips = 0;
  const log = [];

  /** Where your body shows in a picture taken with the camera at `cam` (null: out of view). */
  const picture = (p, cam) => {
    const yOf = (tilt) => 0.5 + (motorSign * (tilt - cam.tilt)) / fovV;
    const top = yOf(p.head);
    const bottom = yOf(p.feet);
    const x = 0.5 + (p.pan - cam.pan) / fovH - PERSON_W / 2;
    const y0 = Math.max(0, Math.min(top, bottom));
    const y1 = Math.min(1, Math.max(top, bottom));
    const x0 = Math.max(0, x);
    const x1 = Math.min(1, x + PERSON_W);
    return { top, y0, y1, x0, x1, visible: y1 - y0 > 0.05 && x1 - x0 > 0.03 };
  };

  const look = (tap = null) => {
    const p = youAt(t - TUNING.latencyMs);
    const seen = picture(p, real.at(t - TUNING.latencyMs));
    const image = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
    const people = [];
    if (seen.visible) {
      const waist = 0.5 + (motorSign * ((p.head + p.feet) / 2 - real.at(t - TUNING.latencyMs).tilt)) / fovV;
      for (let y = Math.floor(seen.y0 * H); y < Math.ceil(seen.y1 * H); y++) {
        for (let x = Math.floor(seen.x0 * W); x < Math.ceil(seen.x1 * W); x++) {
          const i = (y * W + x) * 4;
          const c = y / H < waist ? [200, 30, 30] : [30, 50, 180]; // red top, blue trousers
          image.data[i] = c[0];
          image.data[i + 1] = c[1];
          image.data[i + 2] = c[2];
        }
      }
      people.push({ x: seen.x0, y: seen.y0, w: seen.x1 - seen.x0, h: seen.y1 - seen.y0 });
    }
    brain.settings = brainSettings; // the page hands the brain its settings every frame
    const out = brain.update({ t, people, image, camera: guess.at(t - TUNING.latencyMs), radar: true, tap });
    if (out.flippedTilt) {
      // Like the page: save the flip in the settings.
      brainSettings = { ...brainSettings, tiltSign: brainSettings.tiltSign === 1 ? -1 : 1 };
      flips++;
    }
    if (out.aim && CAMERA_STEERS_IN.includes(out.mode)) {
      real.setTarget(out.aim);
      guess.setTarget(out.aim);
    }
    last = { out, t };
  };

  const first = picture(you, { pan: LIMITS.center, tilt: LIMITS.center });
  look({ x: (first.x0 + first.x1) / 2, y: (first.y0 + first.y1) / 2 });
  assert.equal(last.out.mode, "tracking", "the tap should lock on");

  return {
    log,
    /** Runs for `ms`, moving you by `change` (degrees per second for head and feet, and left/right) meanwhile. */
    run(ms, change = { head: 0, feet: 0 }) {
      for (let k = 0; k < ms; k += SCREEN_MS) {
        t += SCREEN_MS;
        const p = youAt(t);
        timeline.push({
          t,
          pan: p.pan + ((change.pan ?? 0) * SCREEN_MS) / 1000,
          head: p.head + (change.head * SCREEN_MS) / 1000,
          feet: p.feet + (change.feet * SCREEN_MS) / 1000,
        });
        real.step(t);
        guess.step(t);
        if (t - last.t >= FRAME_MS) look();
        else if (last.out.aim && last.out.aimVel && CAMERA_STEERS_IN.includes(last.out.mode))
          for (const m of [real, guess]) m.setTarget(predictAim(last.out.aim, last.out.aimVel, t - last.t));
        const view = picture(youAt(t), real.current);
        log.push({ t, tilt: real.current.tilt, pan: real.current.pan, mode: last.out.mode, headY: view.top });
      }
    },
    get t() {
      return t;
    },
    get tilt() {
      return real.current.tilt;
    },
    /** How many times the brain flipped up/down, and the up/down setting now. */
    get flips() {
      return flips;
    },
    get tiltSign() {
      return brainSettings.tiltSign;
    },
  };
}

/** After `from`, the tilt approached once and then held still: no rocking up and down. */
function assertSettles(log, from, what) {
  const after = log.filter((l) => l.t > from);
  assert.ok(after.every((l) => l.mode === "tracking"), `${what}: lost you (${[...new Set(after.map((l) => l.mode))]})`);
  // The direction of travel may change at most once (overshoot and come back), by at most 1°.
  // (Wobbles under 0.2° can't be seen.)
  const tilts = after.map((l) => l.tilt);
  let turns = 0;
  let dir = 0;
  let extreme = tilts[0];
  for (const v of tilts) {
    const d = Math.sign(v - extreme);
    if (Math.abs(v - extreme) < 0.2) continue;
    if (dir !== 0 && d !== dir) {
      turns++;
      assert.ok(Math.abs(v - extreme) < 1.2, `${what}: swung back by ${Math.abs(v - extreme).toFixed(1)}°`);
    }
    dir = d;
    extreme = v;
  }
  assert.ok(turns <= 1, `${what}: rocked up and down (${turns} changes of direction)`);
  const late = after.filter((l) => l.t > after.at(-1).t - 1000).map((l) => l.tilt);
  assert.ok(Math.max(...late) - Math.min(...late) < 0.3, `${what}: still moving at the end`);
}

/** Your head is in the picture, with a little room above it, and not down at the bottom. */
function assertHeadInView(sim, what) {
  const headY = sim.log.at(-1).headY;
  assert.ok(headY > 0.02 && headY < 0.45, `${what}: the top of your head is at ${headY.toFixed(2)} of the picture height`);
}

// ---------- standing up, sitting down, coming closer ----------

for (const portrait of [false, true]) {
  const phone = portrait ? "iPhone upright" : "iPhone sideways";

  test(`you stand up: the stand tilts up with you and keeps your head in the picture (${phone})`, () => {
    // Sitting on a chair 2 m away (head 85°, seat 112°), then standing up in one second.
    const sim = iphoneOnStand({ head: 85, feet: 112, portrait });
    sim.run(2500);
    assertHeadInView(sim, "sitting");
    const sitting = sim.tilt;
    sim.run(1000, { head: -18, feet: 4 }); // head up to 67°, feet down to 116°: taller than the picture
    const stood = sim.t;
    sim.run(3000);
    assert.ok(sim.tilt < sitting - 8, `should tilt up (smaller angle): ${sitting.toFixed(1)}° -> ${sim.tilt.toFixed(1)}°`);
    assertHeadInView(sim, "standing");
    assertSettles(sim.log, stood, "after standing up");
    assert.equal(sim.flips, 0, "the right way round: never flipped");
  });

  test(`you sit or crouch down: the stand tilts down with you (${phone})`, () => {
    // Standing (head 70°, feet 112°), then crouching down to the floor in a second and a half.
    const sim = iphoneOnStand({ head: 70, feet: 112, portrait });
    sim.run(2500);
    assertHeadInView(sim, "standing");
    const standing = sim.tilt;
    sim.run(1500, { head: 18, feet: 0 }); // head down to 97°
    const crouched = sim.t;
    sim.run(3000);
    assert.ok(sim.tilt > standing + 8, `should tilt down (bigger angle): ${standing.toFixed(1)}° -> ${sim.tilt.toFixed(1)}°`);
    assertHeadInView(sim, "crouching");
    assertSettles(sim.log, crouched, "after crouching");
    assert.equal(sim.flips, 0, "the right way round: never flipped");
  });

  test(`you walk up close: it tilts up so your head doesn't leave the top of the picture (${phone})`, () => {
    // 4 m away you look small (head 82°, feet 100°); 1.5 m away you fill more than the picture.
    const sim = iphoneOnStand({ head: 82, feet: 100, portrait });
    sim.run(2500);
    sim.run(2000, { head: -8, feet: 7 }); // head up to 66°, feet down to 114°
    const close = sim.t;
    sim.run(3000);
    assertHeadInView(sim, "close up");
    assertSettles(sim.log, close, "after walking up close");
    assert.equal(sim.flips, 0, "the right way round: never flipped");
  });
}

test("up and down, then still: it settles on you once, without rocking, even with a slow tired motor", () => {
  const sim = iphoneOnStand({ head: 85, feet: 112, motor: slowMotor() });
  sim.run(2500);
  sim.run(1000, { head: -18, feet: 4 }); // stand up
  const stood = sim.t;
  sim.run(4000);
  assertHeadInView(sim, "standing (slow motor)");
  assertSettles(sim.log, stood, "slow motor, after standing up");
  sim.run(1500, { head: 16, feet: -2 }); // sit back down
  const sat = sim.t;
  sim.run(4000);
  assertHeadInView(sim, "sitting again (slow motor)");
  assertSettles(sim.log, sat, "slow motor, after sitting down");
  assert.equal(sim.flips, 0, "the right way round: never flipped");
});

test("Flip up/down: a tilt motor mounted the other way round still follows you up", () => {
  // Here a bigger angle looks UP. With "Flip up/down" on (tiltSign -1) it follows the right way.
  const sim = iphoneOnStand({ head: 95, feet: 68, motorSign: -1, settings: { tiltSign: -1 } });
  sim.run(2500);
  const sitting = sim.tilt;
  sim.run(1000, { head: 18, feet: -4 }); // stand up: the head goes up, which is a bigger angle here
  const stood = sim.t;
  sim.run(3000);
  assert.ok(sim.tilt > sitting + 8, `should tilt up (bigger angle here): ${sitting.toFixed(1)}° -> ${sim.tilt.toFixed(1)}°`);
  assertSettles(sim.log, stood, "flipped motor");
  assert.equal(sim.flips, 0, "already set the right way: never flipped back");
});

test("a person in the middle who doesn't move: the tilt motor holds still", () => {
  const sim = iphoneOnStand({ head: 78, feet: 110 });
  sim.run(2500);
  const from = sim.t;
  sim.run(3000);
  const tilts = sim.log.filter((l) => l.t > from).map((l) => l.tilt);
  assert.ok(Math.max(...tilts) - Math.min(...tilts) < 0.3, "no twitching up and down");
  assert.ok(sim.tilt >= LIMITS.tiltMin && sim.tilt <= LIMITS.tiltMax);
});

test("tilt motor mounted the other way round, nobody told the page: it notices, flips up/down, and follows you", () => {
  // Bigger angle = look UP on this stand, but the setting says the opposite. Before the check,
  // the stand tilted away from you faster and faster until it hit its end stop.
  const sim = iphoneOnStand({ head: 95, feet: 68, motorSign: -1 });
  sim.run(3000);
  assert.equal(sim.flips, 1, "flipped up/down once");
  assert.equal(sim.tiltSign, -1);
  const flipAt = sim.log.find((l) => l.tilt <= LIMITS.tiltMin + 1 || l.tilt >= LIMITS.tiltMax - 1);
  assert.equal(flipAt, undefined, "never ran into an end stop");
  assert.equal(sim.log.at(-1).mode, "tracking");
  assertHeadInView(sim, "after the flip");
  const sitting = sim.tilt;
  sim.run(1000, { head: 18, feet: -4 }); // stand up
  const stood = sim.t;
  sim.run(3000);
  assert.ok(sim.tilt > sitting + 8, `then tilts up with you: ${sitting.toFixed(1)}° -> ${sim.tilt.toFixed(1)}°`);
  assertHeadInView(sim, "standing, after the flip");
  assertSettles(sim.log, stood, "after the flip");
  assert.equal(sim.flips, 1, "and doesn't flip back");
});

test("quick moves the right way round (sitting down hard, a fall, jumping up) never flip up/down", () => {
  for (const motor of [null, slowMotor()]) {
    const sim = iphoneOnStand({ head: 72, feet: 112, motor });
    sim.run(2000);
    sim.run(400, { head: 45, feet: 0 }); // drop onto a chair in under half a second
    sim.run(2000);
    sim.run(300, { head: -50, feet: 0 }); // jump back up
    sim.run(2000);
    sim.run(500, { head: 70, feet: 20 }); // fall to the floor
    sim.run(3000);
    assert.equal(sim.flips, 0, `flipped up/down by mistake (${motor ? "slow" : "normal"} motor)`);
  }
});

// ---------- only small looks up and down, and back to level ----------

/** The tilt stays within TILT.range of level for the whole run. */
function assertWithinRange(sim, what) {
  for (const l of sim.log) {
    assert.ok(
      Math.abs(l.tilt - TILT.level) <= TILT.range + 0.01,
      `${what}: tilted to ${l.tilt.toFixed(1)}° at ${l.t} ms (level ${TILT.level}, at most ±${TILT.range})`,
    );
  }
}

test("someone very tall, close up, or down on the floor: the stand only looks a little up or down", () => {
  // Walking right up to the stand (the box fills the picture): before, it tilted up until the end stop.
  const close = iphoneOnStand({ head: 82, feet: 100 });
  close.run(2000);
  close.run(2000, { head: -15, feet: 10 }); // head up to 52°, feet down to 120°
  close.run(3000);
  assertWithinRange(close, "close up");
  assert.ok(close.tilt < TILT.level - TILT.range + 1, `looks up as far as allowed: ${close.tilt.toFixed(1)}°`);
  // Lying on the floor in front of it.
  const floor = iphoneOnStand({ head: 70, feet: 112 });
  floor.run(2000);
  floor.run(1500, { head: 30, feet: 6 }); // head down to 115°
  floor.run(3000);
  assertWithinRange(floor, "on the floor");
  assert.ok(floor.tilt > TILT.level + TILT.range - 1, `looks down as far as allowed: ${floor.tilt.toFixed(1)}°`);
});

test("small moves up and down: the stand follows them, and settles back to level when you're level again", () => {
  // Chest at about 90° (level): the stand stays level.
  const sim = iphoneOnStand({ head: 80, feet: 110 });
  sim.run(2500);
  assert.ok(Math.abs(sim.tilt - TILT.level) < 0.5, `level while you're level: ${sim.tilt.toFixed(1)}°`);
  sim.run(1000, { head: -8, feet: -8 }); // you go up a little (onto a step)
  sim.run(2500);
  assert.ok(sim.tilt < TILT.level - 5, `looks up a little: ${sim.tilt.toFixed(1)}°`);
  sim.run(1000, { head: 8, feet: 8 }); // and back down
  sim.run(2500);
  assert.ok(Math.abs(sim.tilt - TILT.level) < 0.5, `back to level: ${sim.tilt.toFixed(1)}°`);
  assertWithinRange(sim, "small moves");
});

/** A red-and-blue person in a fixed camera's picture (`box` in 0-1 picture coordinates). */
function still(box) {
  const image = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
  for (let y = Math.floor(box.y * H); y < Math.ceil((box.y + box.h) * H); y++) {
    for (let x = Math.floor(box.x * W); x < Math.ceil((box.x + box.w) * W); x++) {
      const i = (y * W + x) * 4;
      const c = y < (box.y + box.h / 2) * H ? [200, 30, 30] : [30, 50, 180];
      image.data.set(c, i);
    }
  }
  return { image, people: [box] };
}

/**
 * Locks onto someone high up in the picture (so the stand looks up), then runs `frames` with
 * nobody in view. Returns each frame's answer.
 */
function lookUpThenLose(box, frames) {
  const brain = new Brain({ ...DEFAULT_SETTINGS });
  const camera = { pan: LIMITS.center, tilt: LIMITS.center };
  let t = 1000;
  const seen = still(box);
  let out = brain.update({ t, ...seen, camera, radar: null, tap: { x: box.x + box.w / 2, y: box.y + box.h / 2 } });
  assert.equal(out.mode, "tracking");
  for (let k = 0; k < 10; k++) {
    t += FRAME_MS;
    out = brain.update({ t, ...seen, camera, radar: null });
  }
  assert.ok(out.aim.tilt < TILT.level - 5, `looks up at you first: ${out.aim.tilt.toFixed(1)}°`);
  const outs = [];
  for (let k = 0; k < frames; k++) {
    t += FRAME_MS;
    outs.push({ t, ...brain.update({ t, people: [], image: still({ x: 0, y: 0, w: 0, h: 0 }).image, camera, radar: null }) });
  }
  return outs;
}

test("you vanish in the middle of the picture (HIDDEN): the tilt eases back to level", () => {
  const outs = lookUpThenLose({ x: 0.45, y: 0.02, w: 0.12, h: 0.5 }, 40);
  const gone = outs.find((o) => o.mode !== "tracking");
  assert.equal(gone?.mode, "hidden");
  const level = outs.find((o) => o.aim && o.aim.tilt === TILT.level);
  assert.ok(level, "back to level");
  assert.ok(level.t - gone.t <= 1000, `within a second: ${level.t - gone.t} ms`);
  // Smoothly: never more than a returnSpeed step at a time, always toward level, and it stays level.
  const after = outs.filter((o) => o.t >= gone.t);
  for (let i = 1; i < after.length; i++) {
    const a = after[i - 1].aim.tilt;
    const b = after[i].aim.tilt;
    assert.ok(b >= a - 0.01 && b - a <= (TILT.returnSpeed * FRAME_MS) / 1000 + TILT.levelBand + 0.01, `jumped ${a} -> ${b}`);
  }
  assert.ok(outs.at(-1).aim.tilt === TILT.level);
});

test("you leave the picture at the side (FOLLOWING, SEARCHING): left and right turn as before, the tilt goes back to level", () => {
  const outs = lookUpThenLose({ x: 0.9, y: 0.02, w: 0.1, h: 0.5 }, 60);
  const modes = new Set(outs.map((o) => o.mode));
  assert.ok(modes.has("following"), `follows (${[...modes]})`);
  const following = outs.filter((o) => o.mode === "following");
  // Still turning the way you went, steadily, as before.
  assert.ok(following.at(-1).aim.pan > following[0].aim.pan + 10, "keeps turning toward where you went");
  assert.ok(following.every((o) => o.aimVel === null || (o.aimVel.pan > 0 && o.aimVel.tilt === 0)));
  // ...while the tilt returns to level within a second and stays there.
  const startT = outs.find((o) => o.mode !== "tracking").t;
  for (const o of outs.filter((o) => o.mode !== "tracking" && o.t - startT >= 1000)) {
    assert.equal(o.aim?.tilt ?? TILT.level, TILT.level, `${o.mode} at ${o.t - startT} ms: tilt ${o.aim?.tilt}`);
  }
});

test("tilt pieces: limited to a small look around level, and easing back to level within a second", () => {
  assert.equal(limitTilt(TILT.level + 40), TILT.level + TILT.range);
  assert.equal(limitTilt(TILT.level - 40), TILT.level - TILT.range);
  assert.equal(limitTilt(TILT.level + TILT.levelBand / 2), TILT.level, "roughly level counts as level");
  assert.equal(limitTilt(TILT.level - 8), TILT.level - 8, "a small look is kept as it is");
  assert.equal(predictAim({ pan: 90, tilt: TILT.level + 14 }, { pan: 0, tilt: 100 }, 100).tilt, TILT.level + TILT.range);
  for (const from of [TILT.level - TILT.range, TILT.level + TILT.range, LIMITS.tiltMin, LIMITS.tiltMax]) {
    let tilt = from;
    let ms = 0;
    while (tilt !== TILT.level) {
      const next = towardLevel(tilt, 16);
      assert.ok(Math.abs(next - TILT.level) <= Math.abs(limitTilt(tilt) - TILT.level), "only ever toward level");
      tilt = next;
      ms += 16;
      assert.ok(ms <= 1000, `from ${from}°: still at ${tilt.toFixed(1)}° after a second`);
    }
    assert.ok(ms >= 500, `from ${from}°: eases back (took ${ms} ms), doesn't snap`);
  }
});

// ---------- neutral: looking straight at you, and never looking away from it for long ----------

const UP = { x: 0.45, y: 0.02, w: 0.12, h: 0.5 }; // high in the picture: the stand looks up 15°
const UP_A_LITTLE = { x: 0.45, y: 0.2, w: 0.12, h: 0.3 }; // about 8° up
const HIGHER = { x: 0.45, y: 0.1, w: 0.12, h: 0.3 }; // about 12° up: 4° above UP_A_LITTLE
const LEVEL = { x: 0.45, y: 0.35, w: 0.12, h: 0.4 }; // about level
const DOWN = { x: 0.45, y: 0.7, w: 0.12, h: 0.3 }; // low in the picture: the stand looks down 12°

/**
 * Runs `fn` without the "back to neutral after looking away from it for TILT.holdMs" timer,
 * to compare with it on.
 */
function withoutHold(fn) {
  const holdMs = TILT.holdMs;
  TILT.holdMs = Infinity;
  try {
    return fn();
  } finally {
    TILT.holdMs = holdMs;
  }
}

/**
 * A brain locked onto someone in a fixed camera's picture, 15 frames a second. `show(box, ms)`
 * shows them at `box` (null: nobody in view) for `ms`; `glide(from, to, ms)` moves them
 * smoothly from one box to another. `outs` holds each frame's answer, with its time.
 */
function fixedCamera(first, settings = {}) {
  const brain = new Brain({ ...DEFAULT_SETTINGS, ...settings });
  const camera = { pan: LIMITS.center, tilt: LIMITS.center };
  let t = 1000;
  const outs = [];
  const frame = (box, tap = null) => {
    const seen = box ? still(box) : { people: [], image: still({ x: 0, y: 0, w: 0, h: 0 }).image };
    outs.push({ t, ...brain.update({ t, ...seen, camera, radar: null, tap }) });
  };
  frame(first, { x: first.x + first.w / 2, y: first.y + first.h / 2 });
  assert.equal(outs[0].mode, "tracking", "the tap should lock on");
  return {
    outs,
    show(box, ms) {
      for (let k = 0; k < ms; k += FRAME_MS) {
        t += FRAME_MS;
        frame(box);
      }
    },
    glide(from, to, ms) {
      for (let k = FRAME_MS; k <= ms; k += FRAME_MS) {
        t += FRAME_MS;
        const f = k / ms;
        const mix = (key) => from[key] + (to[key] - from[key]) * f;
        frame({ x: mix("x"), y: mix("y"), w: mix("w"), h: mix("h") });
      }
    },
  };
}

/** The same story told twice, with and without the hold timer: each frame's answers. */
function withAndWithoutHold(story) {
  return { withHold: story(), without: withoutHold(story) };
}

/** Left and right (and everything but up/down) came out exactly the same, frame by frame. */
function assertPanUnchanged(a, b, what) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    const at = `${what}, frame ${i}`;
    assert.equal(a[i].mode, b[i].mode, `${at}: mode`);
    assert.deepEqual(a[i].target, b[i].target, `${at}: who it follows`);
    assert.equal(a[i].aim?.pan, b[i].aim?.pan, `${at}: left/right aim`);
    assert.equal(a[i].aimVel?.pan, b[i].aimVel?.pan, `${at}: left/right speed`);
    assert.equal(a[i].note, b[i].note, `${at}: note`);
  }
}

for (const [way, box, sign] of [
  ["up", UP, -1],
  ["down", DOWN, 1],
]) {
  test(`you stay ${way} in the picture: the stand keeps looking straight at you (that's neutral), not at level`, () => {
    const { withHold, without } = withAndWithoutHold(() => {
      const sim = fixedCamera(box);
      sim.show(box, 9000);
      return sim.outs;
    });
    assert.ok(withHold.every((o) => o.mode === "tracking"), "kept following you the whole time");
    const at = withHold[0].aim.tilt;
    assert.ok(sign * (at - TILT.level) > 10, `looks ${way} at you: ${at}°`);
    assert.ok(withHold.every((o) => o.aim.tilt === at), `kept looking ${way} at you for 9 s`);
    assertPanUnchanged(withHold, without, `staying ${way}`);
  });
}

/** Where in the picture (0 = top, 1 = bottom) a body point at `deg` shows, with the camera at `tilt`. */
const inPicture = (deg, tilt) => 0.5 + (deg - tilt) / DEFAULT_SETTINGS.fovV;

test("wherever you are, it settles looking straight at you (your upper body in the middle), and doesn't creep up and stay there", () => {
  // Head and feet in motor degrees (bigger = lower), from far away to too close to fit in the picture.
  for (const [what, head, feet] of [
    ["far away", 82, 100],
    ["sitting 2 m away", 85, 112],
    ["standing 2 m away", 70, 112],
    ["crouching", 95, 112],
    ["standing close", 60, 118],
    ["very close", 50, 125],
    ["close, sitting low", 70, 140],
    ["close, body low in the picture", 55, 135],
  ]) {
    const sim = iphoneOnStand({ head, feet });
    sim.run(12000);
    assert.ok(sim.log.every((l) => l.mode === "tracking"), `${what}: kept following you`);
    // Settled: holding still over the last 5 s (no creeping, no going back and forth).
    const late = sim.log.filter((l) => l.t > sim.t - 5000).map((l) => l.tilt);
    assert.ok(Math.max(...late) - Math.min(...late) < 0.3, `${what}: still moving (${Math.min(...late).toFixed(1)}-${Math.max(...late).toFixed(1)}°)`);
    // Looking at your upper body: the middle of the picture is between the top of your head and
    // your waist. Or, if that's out of reach, as far toward it as the stand may look.
    const tilt = sim.tilt;
    const waist = (head + feet) / 2;
    const onUpperBody = inPicture(head, tilt) <= 0.5 && inPicture(waist, tilt) >= 0.5;
    const atLimit = Math.abs(Math.abs(tilt - TILT.level) - TILT.range) < 0.5;
    assert.ok(onUpperBody || atLimit, `${what}: looking at ${tilt.toFixed(1)}° (head ${head}°, waist ${waist}°)`);
    if (atLimit) {
      const toward = Math.sign(tilt - TILT.level);
      assert.ok(toward * (head - tilt) > 0 || toward * (waist - tilt) > 0, `${what}: at the limit, but not toward you`);
    }
  }
});

test("after looking up at you close by: you sit down, step back or leave, and it comes back down (never stays up)", () => {
  const sim = iphoneOnStand({ head: 60, feet: 118 }); // standing close: it looks up at you
  sim.run(3000);
  assert.ok(sim.tilt < TILT.level - 10, `looks up at you: ${sim.tilt.toFixed(1)}°`);
  sim.run(2000, { head: 11, feet: -3 }); // step back to about 3 m (head 82°, feet 112°)
  sim.run(3000);
  assert.ok(sim.tilt > TILT.level - 5, `came back down: ${sim.tilt.toFixed(1)}°`);
  assertHeadInView(sim, "stepped back");
});

test(`looking away from you for more than ${TILT.holdMs / 1000} s (a big dead zone): back to looking straight at you, not level`, () => {
  // "Ignore moves smaller than" 8°: when you go 4° higher, the aim alone wouldn't follow.
  const story = () => {
    const sim = fixedCamera(UP_A_LITTLE, { deadZoneDeg: 8 });
    sim.show(UP_A_LITTLE, 1000);
    sim.glide(UP_A_LITTLE, HIGHER, 300);
    sim.show(HIGHER, 6000);
    return sim.outs;
  };
  const { withHold, without } = withAndWithoutHold(story);
  // Straight at you up there: where a brain with no dead zone looks.
  const straight = fixedCamera(HIGHER);
  straight.show(HIGHER, 200);
  const you = straight.outs.at(-1).aim.tilt;
  const before = withHold[0].aim.tilt;
  assert.ok(before - you > TILT.levelBand, `you went clearly higher: ${before}° -> ${you}°`);
  assert.ok(without.every((o) => o.aim.tilt === before), "without the hold it would have stayed looking below you");
  assert.ok(withHold.every((o) => o.mode === "tracking"));
  const movedAt = withHold.find((o) => o.t >= withHold[0].t + 1300).t; // you're up there from here
  const back = withHold.find((o) => o.aim.tilt === you);
  assert.ok(back, "came back to looking straight at you");
  assert.ok(back.t - movedAt > TILT.holdMs - 2 * FRAME_MS, `not before the hold time: ${back.t - movedAt} ms`);
  assert.ok(back.t - movedAt <= TILT.holdMs + 1000, `within a second of it: ${back.t - movedAt} ms`);
  // On the way: smooth steps toward you, never past you or toward level.
  const easing = withHold.filter((o) => o.t > movedAt && o.t <= back.t && o.aim.tilt !== before);
  let prev = before;
  for (const o of easing) {
    assert.ok(o.aim.tilt <= prev && o.aim.tilt >= you, `eases toward you: ${prev} -> ${o.aim.tilt}`);
    assert.ok(prev - o.aim.tilt <= (TILT.returnSpeed * FRAME_MS) / 1000 + 0.01, `too big a step: ${prev} -> ${o.aim.tilt}`);
    prev = o.aim.tilt;
  }
  // Then stays on you for the cooldown.
  const cooling = withHold.filter((o) => o.t >= back.t && o.t - back.t < TILT.cooldownMs);
  assert.ok(cooling.length > 0 && cooling.every((o) => o.aim.tilt === you), "stays looking at you during the cooldown");
  assertPanUnchanged(withHold, without, "big dead zone");
});

test("short looks up or down are followed exactly as before (the hold never steps in)", () => {
  const { withHold, without } = withAndWithoutHold(() => {
    const sim = fixedCamera(LEVEL);
    sim.show(LEVEL, 1000);
    sim.glide(LEVEL, UP, 300);
    sim.show(UP, 2500);
    sim.glide(UP, LEVEL, 300);
    sim.show(LEVEL, 1000);
    sim.glide(LEVEL, UP, 300);
    sim.show(UP, 5000);
    sim.glide(UP, LEVEL, 300);
    sim.show(LEVEL, 1000);
    sim.glide(LEVEL, DOWN, 300);
    sim.show(DOWN, 5000);
    sim.glide(DOWN, LEVEL, 300);
    sim.show(LEVEL, 1000);
    return sim.outs;
  });
  assert.ok(withHold.every((o) => o.mode === "tracking"), "kept following you the whole time");
  assert.ok(Math.min(...withHold.map((o) => o.aim.tilt)) <= TILT.level - TILT.range, "looked up");
  assert.ok(Math.max(...withHold.map((o) => o.aim.tilt)) > TILT.level + 10, "looked down");
  for (let i = 0; i < withHold.length; i++) {
    assert.deepEqual(withHold[i].aim, without[i].aim, `frame ${i}`);
    assert.deepEqual(withHold[i].aimVel, without[i].aimVel, `frame ${i}`);
  }
});

test("while it eases back or waits out the cooldown, the page isn't told to move up or down between camera frames", () => {
  // A big dead zone, and you sway left and right while going a little higher (so the brain
  // has a speed for the page to move on with).
  const RIGHT = { ...HIGHER, x: 0.53 }; // about 5° to the right: inside the dead zone too
  const { withHold, without } = withAndWithoutHold(() => {
    const sim = fixedCamera(UP_A_LITTLE, { deadZoneDeg: 8 });
    sim.glide(UP_A_LITTLE, HIGHER, 1000);
    for (let k = 0; k < 4; k++) {
      sim.glide(HIGHER, RIGHT, 700);
      sim.glide(RIGHT, HIGHER, 700);
    }
    return sim.outs;
  });
  assert.ok(without.some((o) => o.aimVel && o.aimVel.tilt !== 0), "the brain did see you moving up");
  // The frames where the hold changed the tilt: no up/down speed there.
  const held = withHold.filter((o, i) => o.aim.tilt !== without[i].aim.tilt);
  assert.ok(held.length > 5, "eased back to you for a while");
  for (const o of held) {
    assert.ok(o.aimVel === null || o.aimVel.tilt === 0, `up/down speed while holding at ${o.t} ms`);
    for (const ms of [16, 33, 50]) assert.equal(predictAim(o.aim, o.aimVel ?? { pan: 0, tilt: 0 }, ms).tilt, o.aim.tilt);
  }
  assert.ok(held.some((o) => o.aimVel !== null), "the page still moves left/right on between frames");
  assertPanUnchanged(withHold, without, "swaying");
  assert.ok(withHold.every((o) => o.mode === "tracking"));
});

test("nobody in view: neutral is level, so the tilt goes back to level and stays there", () => {
  const sim = fixedCamera(UP);
  sim.show(UP, 5000);
  assert.ok(sim.outs.at(-1).aim.tilt < TILT.level - 10, "looked up at you");
  sim.show(null, 6000);
  const goneAt = sim.outs.find((o) => o.mode !== "tracking").t;
  const level = sim.outs.find((o) => o.t > goneAt && o.aim?.tilt === TILT.level);
  assert.ok(level && level.t - goneAt <= 1000, `back to level within a second (${level && level.t - goneAt} ms)`);
  assert.ok(sim.outs.filter((o) => o.t >= level.t).every((o) => o.aim === null || o.aim.tilt === TILT.level), "stays level");
});

test("with the iPhone on the stand, walking left and right: exactly the same as without the hold", () => {
  const story = () => {
    const sim = iphoneOnStand({ head: 60, feet: 118 }); // standing close: it looks up at you
    sim.run(2000);
    sim.run(3000, { head: 0, feet: 0, pan: 8 });
    sim.run(3000, { head: 0, feet: 0, pan: -12 });
    sim.run(3000);
    return sim.log;
  };
  const { withHold, without } = withAndWithoutHold(story);
  assert.ok(withHold.every((l) => l.mode === "tracking"), "kept following you the whole time");
  assert.ok(Math.max(...withHold.map((l) => l.pan)) > 100, "walked across");
  assert.deepEqual(withHold, without);
});

test("tilt hold piece: back to neutral (not level) after holdMs away from it, then a plain cooldown at neutral", () => {
  assert.ok(TILT.holdMs >= 3000 && TILT.holdMs <= 5000, `asked for 3 to 5 seconds: ${TILT.holdMs} ms`);
  const hold = new TiltHold();
  let told = TILT.level;
  let t = 0;
  const step = (want, neutral) => {
    t += FRAME_MS;
    told = hold.update(want, told, neutral, t, FRAME_MS);
    return told;
  };
  // At neutral, or within levelBand of it, never counts, however long.
  for (let k = 0; k < 200; k++) assert.equal(step(80 + (k % 2) * TILT.levelBand, 80), 80 + (k % 2) * TILT.levelBand);
  // Away just under the hold time, then back at neutral for one frame: the count starts over.
  for (let k = 0; k * FRAME_MS < TILT.holdMs - FRAME_MS; k++) assert.equal(step(75, 85), 75);
  assert.equal(step(85, 85), 85);
  const start = t + FRAME_MS;
  while (step(75, 85) === 75) assert.ok(t - start <= TILT.holdMs + FRAME_MS, `stayed away too long: ${t - start} ms`);
  assert.ok(t - start > TILT.holdMs, `went back after ${t - start} ms, not earlier`);
  assert.equal(hold.holding, true);
  // Eases toward neutral at returnSpeed, following it if it moves, and ends exactly on it.
  let prev = told;
  while (told !== 86) {
    step(75, 86);
    assert.ok(told > prev && told - prev <= (TILT.returnSpeed * FRAME_MS) / 1000 + 1e-9, `step ${prev} -> ${told}`);
    prev = told;
    assert.ok(t - start < TILT.holdMs + 2000, "took too long to get back");
  }
  // Plain cooldown: stays on neutral (even as it moves) for cooldownMs, whatever the brain wants.
  const backAt = t;
  while (t + FRAME_MS - backAt < TILT.cooldownMs) assert.equal(step(75, 87), 87, `cooldown at ${t - backAt} ms`);
  assert.equal(step(75, 87), 75, "then follows the brain again");
  assert.equal(hold.holding, false);
  hold.reset();
  assert.equal(step(70, 90), 70, "after reset it follows straight away");
  assert.equal(towardTilt(80, 90, 100), 82);
  assert.equal(towardTilt(80, 81, 100), 81);
});

// ---------- the pieces ----------

test("aim point: chest height normally, moving up to the top of the box as the head is cut off", () => {
  const a = DEFAULT_SETTINGS.aimHeight;
  // Whole person in view: aimHeight of the way down their box.
  assert.equal(aimPointY({ x: 0.4, y: 0.2, w: 0.2, h: 0.6 }, a), 0.2 + 0.6 * a);
  // Top of the box at the top of the picture: the head may be cut off, so aim at the very top.
  assert.equal(aimPointY({ x: 0.4, y: 0, w: 0.2, h: 1 }, a), 0);
  // In between it changes smoothly (no jump when the head comes back into view)...
  const at = (y) => aimPointY({ x: 0.4, y, w: 0.2, h: 1 - y }, a);
  for (let y = 0; y < 0.3; y += 0.005) {
    assert.ok(Math.abs(at(y + 0.005) - at(y)) < 0.03, `jumps at y = ${y.toFixed(3)}`);
    // ...and always lower in the picture as the person sits lower, so the stand can't rock.
    assert.ok(at(y + 0.005) > at(y), `goes backwards at y = ${y.toFixed(3)}`);
  }
  // Turned off (a webcam beside the stand, which can't tilt the head back in): just aimHeight.
  assert.equal(aimPointY({ x: 0.4, y: 0, w: 0.2, h: 1 }, a, 0), a);
});

test("the camera turns with the stand by default on every device (the iPhone on the stand)", () => {
  assert.equal(DEFAULT_SETTINGS.cameraOnStand, "yes");
  assert.equal(cameraTurnsWithStand(DEFAULT_SETTINGS), true);
  assert.equal(cameraTurnsWithStand({ cameraOnStand: "auto" }), true, "older saved settings count as yes");
  assert.equal(cameraTurnsWithStand({ cameraOnStand: "no" }), false, "a laptop webcam beside the stand");
});
