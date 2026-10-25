// Tests for following someone up and down (the tilt motor), with the iPhone on the stand so
// the camera tilts with the motor: standing up, sitting or crouching down, and coming
// closer. The stand must tilt the right way, keep the head in the picture, and settle
// without rocking up and down. No camera or stand needed.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { Brain, aimPointY, predictAim } from "./brain.ts";
import { CAMERA_STEERS_IN, DEFAULT_SETTINGS, LIMITS, TUNING, cameraTurnsWithStand } from "./config.ts";
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
    /** Runs for `ms`, moving you by `change` (degrees per second for head and feet) meanwhile. */
    run(ms, change = { head: 0, feet: 0 }) {
      for (let k = 0; k < ms; k += SCREEN_MS) {
        t += SCREEN_MS;
        const p = youAt(t);
        timeline.push({
          t,
          pan: p.pan,
          head: p.head + (change.head * SCREEN_MS) / 1000,
          feet: p.feet + (change.feet * SCREEN_MS) / 1000,
        });
        real.step(t);
        guess.step(t);
        if (t - last.t >= FRAME_MS) look();
        else if (last.out.aim && last.out.aimVel && CAMERA_STEERS_IN.includes(last.out.mode))
          for (const m of [real, guess]) m.setTarget(predictAim(last.out.aim, last.out.aimVel, t - last.t));
        const view = picture(youAt(t), real.current);
        log.push({ t, tilt: real.current.tilt, mode: last.out.mode, headY: view.top });
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
