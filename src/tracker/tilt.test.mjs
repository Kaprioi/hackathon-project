// Tests for following someone up and down (the tilt motor), with the iPhone on the stand so
// the camera tilts with the motor: standing up, sitting or crouching down, and coming
// closer. The stand must tilt the right way, keep the head in the picture, and settle
// without rocking up and down. No camera or stand needed.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { Brain, TiltHold, aimPointY, limitTilt, predictAim, towardLevel } from "./brain.ts";
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

/**
 * Runs `fn` without the "back to level after looking up or down for TILT.holdMs" timer. For
 * the tests that check how well it follows and settles over longer than that; the timer has
 * its own tests below.
 */
function withoutHold(fn) {
  const holdMs = TILT.holdMs;
  TILT.holdMs = Infinity;
  try {
    fn();
  } finally {
    TILT.holdMs = holdMs;
  }
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

  test(`you walk up close: it tilts up so your head doesn't leave the top of the picture (${phone})`, () =>
    withoutHold(() => {
      // 4 m away you look small (head 82°, feet 100°); 1.5 m away you fill more than the picture.
      const sim = iphoneOnStand({ head: 82, feet: 100, portrait });
      sim.run(2500);
      sim.run(2000, { head: -8, feet: 7 }); // head up to 66°, feet down to 114°
      const close = sim.t;
      sim.run(3000);
      assertHeadInView(sim, "close up");
      assertSettles(sim.log, close, "after walking up close");
      assert.equal(sim.flips, 0, "the right way round: never flipped");
    }));
}

test("up and down, then still: it settles on you once, without rocking, even with a slow tired motor", () =>
  withoutHold(() => {
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
  }));

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
  const highest = Math.min(...close.log.map((l) => l.tilt));
  assert.ok(highest < TILT.level - TILT.range + 1, `looks up as far as allowed: ${highest.toFixed(1)}°`);
  // Lying on the floor in front of it.
  const floor = iphoneOnStand({ head: 70, feet: 112 });
  floor.run(2000);
  floor.run(1500, { head: 30, feet: 6 }); // head down to 115°
  floor.run(3000);
  assertWithinRange(floor, "on the floor");
  const lowest = Math.max(...floor.log.map((l) => l.tilt));
  assert.ok(lowest > TILT.level + TILT.range - 1, `looks down as far as allowed: ${lowest.toFixed(1)}°`);
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

// ---------- not looking up or down for long ----------

const UP = { x: 0.45, y: 0.02, w: 0.12, h: 0.5 }; // high in the picture: the stand looks up 15°
const UP_A_LITTLE = { x: 0.45, y: 0.2, w: 0.12, h: 0.3 }; // about 8° up
const LEVEL = { x: 0.45, y: 0.35, w: 0.12, h: 0.4 }; // about level
const DOWN = { x: 0.45, y: 0.7, w: 0.12, h: 0.3 }; // low in the picture: the stand looks down 12°

/**
 * A brain locked onto someone in a fixed camera's picture, 15 frames a second. `show(box, ms)`
 * shows them at `box` (null: nobody in view) for `ms`; `glide(from, to, ms)` moves them
 * smoothly from one box to another. `outs` holds each frame's answer, with its time.
 */
function fixedCamera(first) {
  const brain = new Brain({ ...DEFAULT_SETTINGS });
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
  const withHold = story();
  let without;
  withoutHold(() => {
    without = story();
  });
  return { withHold, without };
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
  test(`you stay ${way} for more than ${TILT.holdMs / 1000} s: the stand goes back to level, still following you, left/right unchanged`, () => {
    const { withHold, without } = withAndWithoutHold(() => {
      const sim = fixedCamera(box);
      sim.show(box, 7000);
      return sim.outs;
    });
    const outs = withHold;
    assert.ok(outs.every((o) => o.mode === "tracking"), "kept following you the whole time");
    const away = outs.find((o) => sign * (o.aim.tilt - TILT.level) > TILT.levelBand);
    assert.ok(away && away.t === outs[0].t, `looks ${way} at you straight away`);
    // Looks at you for the whole hold time...
    for (const o of outs.filter((o) => o.t - away.t <= TILT.holdMs)) {
      assert.equal(o.aim.tilt, away.aim.tilt, `still looking ${way} at ${o.t - away.t} ms`);
    }
    // ...then eases back to level, smoothly, within a second.
    const level = outs.find((o) => o.aim.tilt === TILT.level);
    assert.ok(level, "back to level");
    assert.ok(level.t - away.t > TILT.holdMs, `not before the hold time: ${level.t - away.t} ms`);
    assert.ok(level.t - away.t <= TILT.holdMs + 1000, `within a second of it: ${level.t - away.t} ms`);
    const easing = outs.filter((o) => o.t > away.t + TILT.holdMs && o.t <= level.t);
    let prev = away.aim.tilt;
    for (const o of easing) {
      const step = Math.abs(prev - TILT.level) - Math.abs(o.aim.tilt - TILT.level);
      assert.ok(step >= 0 && step <= (TILT.returnSpeed * FRAME_MS) / 1000 + TILT.levelBand + 0.01, `eases: ${prev} -> ${o.aim.tilt}`);
      assert.ok(o.aimVel === null || o.aimVel.tilt === 0, "no up/down speed for the page to move on with");
      prev = o.aim.tilt;
    }
    // Stays level for the cooldown (no bouncing straight back), then looks at you again.
    const cooling = outs.filter((o) => o.t >= level.t && o.t - level.t < TILT.cooldownMs);
    assert.ok(cooling.length > 0 && cooling.every((o) => o.aim.tilt === TILT.level), "stays level during the cooldown");
    const again = outs.find((o) => o.t > level.t && o.aim.tilt !== TILT.level);
    assert.ok(again, `looks ${way} at you again after the cooldown`);
    assert.ok(again.t - level.t >= TILT.cooldownMs && again.t - level.t < TILT.cooldownMs + 2 * FRAME_MS, `after ${again.t - level.t} ms`);
    assert.equal(again.aim.tilt, away.aim.tilt);
    // Without the hold it would have kept looking that way the whole time; left/right is the same either way.
    assert.ok(without.every((o) => o.aim.tilt === away.aim.tilt));
    assertPanUnchanged(withHold, without, `staying ${way}`);
  });
}

test(`after going back to level, the timer starts afresh: the next return is a full ${TILT.holdMs / 1000} s later`, () => {
  const sim = fixedCamera(UP);
  sim.show(UP, 14000);
  const isAway = (o) => Math.abs(o.aim.tilt - TILT.level) > TILT.levelBand;
  // Each stretch of looking up, from its first frame to the first frame it eased off.
  const stretches = [];
  let from = null;
  for (const o of sim.outs) {
    const up = isAway(o) && o.aim.tilt === sim.outs[0].aim.tilt;
    if (up && from === null) from = o.t;
    if (!up && from !== null) {
      stretches.push(o.t - from);
      from = null;
    }
  }
  assert.ok(stretches.length >= 2, `went back to level more than once (${stretches})`);
  for (const ms of stretches) {
    assert.ok(ms > TILT.holdMs && ms <= TILT.holdMs + 2 * FRAME_MS, `looked up for ${ms} ms each time before going back`);
  }
});

test("short looks up or down (under 3 s), or long ones broken up by coming back to level, are followed as before", () => {
  const { withHold, without } = withAndWithoutHold(() => {
    const sim = fixedCamera(LEVEL);
    sim.show(LEVEL, 1000);
    sim.glide(LEVEL, UP, 300);
    sim.show(UP, 2500); // up for under 3 s
    sim.glide(UP, LEVEL, 300);
    sim.show(LEVEL, 1000); // level again: the timer restarts
    sim.glide(LEVEL, UP, 300);
    sim.show(UP, 2900); // up again: 5.4 s up out of 6.5, but never 4 s in a row
    sim.glide(UP, LEVEL, 300);
    sim.show(LEVEL, 1000);
    sim.glide(LEVEL, DOWN, 300);
    sim.show(DOWN, 2500); // and down for under 3 s
    sim.glide(DOWN, LEVEL, 300);
    sim.show(LEVEL, 1000);
    return sim.outs;
  });
  assert.ok(withHold.every((o) => o.mode === "tracking"), "kept following you the whole time");
  assert.ok(Math.min(...withHold.map((o) => o.aim.tilt)) <= TILT.level - TILT.range, "looked up");
  assert.ok(Math.max(...withHold.map((o) => o.aim.tilt)) > TILT.level + 10, "looked down");
  // The hold never stepped in: every answer is exactly what it was without it.
  for (let i = 0; i < withHold.length; i++) {
    assert.deepEqual(withHold[i].aim, without[i].aim, `frame ${i}`);
    assert.deepEqual(withHold[i].aimVel, without[i].aimVel, `frame ${i}`);
  }
});

test("during the cooldown it still follows you clearly further up, or the other way (down)", () => {
  // Held a little up (8°): back to level, then you stand up tall during the cooldown.
  const further = fixedCamera(UP_A_LITTLE);
  further.show(UP_A_LITTLE, 4800);
  const levelAt = further.outs.find((o) => o.aim.tilt === TILT.level)?.t;
  assert.ok(levelAt, "went back to level");
  further.show(UP_A_LITTLE, 200); // a moment at level...
  further.glide(UP_A_LITTLE, UP, 300); // ...then clearly further up
  const up = further.outs.find((o) => o.t > levelAt && o.aim.tilt === TILT.level - TILT.range);
  assert.ok(up && up.t - levelAt < TILT.cooldownMs, `followed you further up during the cooldown (${up && up.t - levelAt} ms)`);

  // Held up: back to level, then you crouch down during the cooldown.
  const other = fixedCamera(UP);
  other.show(UP, 4800);
  const levelAt2 = other.outs.find((o) => o.aim.tilt === TILT.level)?.t;
  assert.ok(levelAt2, "went back to level");
  other.glide(UP, DOWN, 600);
  const down = other.outs.find((o) => o.t > levelAt2 && o.aim.tilt > TILT.level + TILT.levelBand);
  assert.ok(down && down.t - levelAt2 < TILT.cooldownMs, `followed you down during the cooldown (${down && down.t - levelAt2} ms)`);
  assert.ok(other.outs.every((o) => o.mode === "tracking"));
});

test("while it holds level, the page isn't told to move up or down between camera frames", () => {
  // Bobbing up and down while looking up (so the brain has an up/down speed), never near level.
  const HIGHER = { ...UP_A_LITTLE, y: 0.05 };
  const sim = fixedCamera(UP_A_LITTLE);
  for (let k = 0; k < 4; k++) {
    sim.glide(UP_A_LITTLE, HIGHER, 1000);
    sim.glide(HIGHER, UP_A_LITTLE, 1000);
  }
  const held = sim.outs.filter((o) => o.t - sim.outs[0].t > TILT.holdMs + FRAME_MS && o.aim.tilt === TILT.level);
  assert.ok(held.length > 5, "held level for a while");
  assert.ok(sim.outs.some((o) => o.aimVel && o.aimVel.tilt !== 0), "the brain did see you moving up");
  for (const o of held) {
    assert.ok(o.aimVel === null || o.aimVel.tilt === 0, `up/down speed while held level at ${o.t} ms`);
    for (const ms of [16, 33, 50]) assert.equal(predictAim(o.aim, o.aimVel ?? { pan: 0, tilt: 0 }, ms).tilt, TILT.level);
  }
  assert.ok(sim.outs.every((o) => o.mode === "tracking"));
});

test("nobody in view: the tilt still goes back to level, before or after the hold, and stays there", () => {
  // You look up for 3 s and then vanish: back to level within a second of noticing, as before.
  const early = fixedCamera(UP);
  early.show(UP, 3000);
  early.show(null, 5000);
  const goneAt = early.outs.find((o) => o.mode !== "tracking").t;
  const level = early.outs.find((o) => o.t > goneAt && o.aim?.tilt === TILT.level);
  assert.ok(level && level.t - goneAt <= 1000, `back to level within a second (${level && level.t - goneAt} ms)`);
  assert.ok(early.outs.filter((o) => o.t >= level.t).every((o) => o.aim === null || o.aim.tilt === TILT.level), "stays level");
  // Held level after looking up too long, then you vanish: it stays level.
  const late = fixedCamera(UP);
  late.show(UP, 5000);
  const heldAt = late.outs.find((o) => o.aim.tilt === TILT.level)?.t;
  assert.ok(heldAt, "went back to level");
  late.show(null, 5000);
  assert.ok(late.outs.filter((o) => o.t >= heldAt).every((o) => o.aim === null || o.aim.tilt === TILT.level), "stays level");
  assert.ok(late.outs.some((o) => o.mode !== "tracking"), "noticed you're gone");
});

test("with the iPhone on the stand: staying up close goes back to level after the hold, walking left and right as before", () => {
  const story = () => {
    // Standing close (the stand looks up as far as allowed), then walking across the room.
    const sim = iphoneOnStand({ head: 60, feet: 118 });
    sim.run(2000);
    sim.run(3000, { head: 0, feet: 0, pan: 8 });
    sim.run(3000, { head: 0, feet: 0, pan: -12 });
    sim.run(2000);
    return sim.log;
  };
  const { withHold, without } = withAndWithoutHold(story);
  assert.ok(withHold.every((l) => l.mode === "tracking"), "kept following you the whole time");
  assert.ok(Math.min(...withHold.map((l) => l.tilt)) < TILT.level - TILT.range + 1, "looked up at you first");
  const back = withHold.find((l) => l.t > TILT.holdMs && Math.abs(l.tilt - TILT.level) < 0.5);
  assert.ok(back && back.t < TILT.holdMs + 2000, `the motor came back to level (${back?.t} ms)`);
  const settled = (l) => l.t > 2000;
  assert.ok(without.filter(settled).every((l) => l.tilt < TILT.level - 10), "without the hold it would have stayed looking up");
  // Left and right: the hold never touches them (the fixed-camera tests above check that exactly).
  // Here the camera really tilts, so the brain sees a slightly different picture and, as before
  // whenever up/down moves, re-aims left/right a little sooner or later (it re-aims both
  // together once either moves past the dead zone). So: the same walk, within a degree or two.
  assert.ok(Math.max(...withHold.map((l) => l.pan)) > 100, "walked across");
  for (let i = 0; i < withHold.length; i++) {
    assert.ok(Math.abs(withHold[i].pan - without[i].pan) < 2, `left/right at ${withHold[i].t} ms: ${withHold[i].pan} vs ${without[i].pan}`);
  }
  assert.ok(Math.abs(withHold.at(-1).pan - without.at(-1).pan) < 0.5, "ends up pointing the same way");
});

test("tilt hold piece: counts only time spent up or down in a row, and lets go of level answers at once", () => {
  const hold = new TiltHold();
  const up = TILT.level - 10;
  let told = TILT.level;
  let t = 0;
  const step = (want) => {
    t += FRAME_MS;
    told = hold.update(want, told, t, FRAME_MS);
    return told;
  };
  // Roughly level (within the band) never counts.
  for (let k = 0; k < 200; k++) assert.equal(step(TILT.level), TILT.level);
  // Up, just under the hold time, then level for one frame: the count starts over.
  for (let k = 0; k * FRAME_MS < TILT.holdMs - FRAME_MS; k++) assert.equal(step(up), up);
  assert.equal(step(TILT.level), TILT.level);
  const start = t + FRAME_MS;
  while (step(up) === up) assert.ok(t - start <= TILT.holdMs + FRAME_MS, `held up too long: ${t - start} ms`);
  assert.ok(t - start > TILT.holdMs, `went back after ${t - start} ms, not earlier`);
  assert.equal(hold.holding, true);
  // Back to level, then the cooldown, then up again; reset() forgets it all.
  while (step(up) !== TILT.level);
  assert.equal(step(up), TILT.level, "cooldown");
  hold.reset();
  assert.equal(step(up), up, "after reset it follows straight away");
  assert.equal(hold.holding, false);
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
