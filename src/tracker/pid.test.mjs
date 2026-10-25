// Tests for the phone's steering PID (pid.ts): the controller on its own, then the brain,
// the page and a copy of the firmware's motor loop together, with a simulated person. No
// camera or stand needed.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { Brain, predictAim } from "./brain.ts";
import { DEFAULT_SETTINGS, LIMITS, PAN_PID, TILT_PID, TUNING } from "./config.ts";
import { Pid } from "./pid.ts";
import { ServoModel } from "./servoModel.ts";

const GAINS = { kp: 1, ki: 0, kd: 0, smoothMs: 0, iMax: 100, maxRate: 1e9 };
const FRAME = 66; // ms between camera frames

// ---------- the controller on its own ----------

test("P: the correction is P times the error; with I and D at 0 that's all", () => {
  const pid = new Pid({ ...GAINS, kp: 0.8 });
  assert.equal(pid.update(10, 0), 8);
  assert.equal(pid.update(-5, FRAME), -4);
  assert.equal(pid.integral, 0);
});

test("I: a motor that always sits 3° short (sag) ends up on target with I, but not with P alone", () => {
  // A plant that only gets told where to point and sits 3° short of it, measured each frame.
  const settle = (gains) => {
    const pid = new Pid(gains);
    const goal = 20;
    let pos = 0;
    for (let k = 0; k < 300; k++) {
      const err = goal - pos;
      const told = pid.update(err, FRAME); // where to point, relative to 0
      pos = told - 3;
    }
    return goal - pos;
  };
  const pOnly = settle({ ...GAINS, kp: 0.5 });
  assert.ok(Math.abs(pOnly) > 1, `P alone is left ${pOnly.toFixed(2)}° off`);
  const withI = settle({ ...GAINS, kp: 0.5, ki: 2 });
  assert.ok(Math.abs(withI) < 0.05, `with I: ${withI.toFixed(3)}° off`);
});

test("anti-windup: I never adds more than iMax, and adds nothing while frozen or within the quiet band", () => {
  const pid = new Pid({ ...GAINS, ki: 10, iMax: 4 });
  for (let k = 0; k < 100; k++) pid.update(20, FRAME);
  assert.equal(pid.integral, 4, "clamped at iMax");
  for (let k = 0; k < 100; k++) pid.update(-20, FRAME, { freeze: true });
  assert.equal(pid.integral, 4, "frozen: kept, not added to");
  for (let k = 0; k < 100; k++) pid.update(-1, FRAME, { quiet: 2.5 });
  assert.equal(pid.integral, 4, "an error inside the quiet band isn't added up");
  pid.update(-3, FRAME, { quiet: 2.5 });
  assert.ok(pid.integral < 4, "one outside it is");
});

test("anti-windup: after a long stretch frozen at a limit, there's nothing stored to swing past with", () => {
  const pid = new Pid({ ...GAINS, ki: 2, iMax: 6 });
  for (let k = 0; k < 150; k++) pid.update(25, FRAME, { freeze: true }); // 10 s against the end stop
  assert.equal(pid.integral, 0);
  assert.equal(pid.update(0, FRAME), 0, "back in range: no leftover push");
});

test("D: on the measured error only, smoothed; no kick on the first frame after a reset or a gap", () => {
  const pid = new Pid({ ...GAINS, kp: 0, kd: 0.1, smoothMs: 0 });
  assert.equal(pid.update(10, FRAME), 0, "first frame: nothing to compare with");
  const d = pid.update(13.3, FRAME); // the error grows 50°/s
  assert.ok(Math.abs(d - 5) < 1e-9, `D = kd x 50°/s = 5, got ${d}`);
  assert.equal(pid.update(13.3, FRAME), 0, "steady error: no D");
  assert.equal(pid.update(30, 2000), 0, "after a 2 s gap the speed can't be measured: no kick");
  pid.reset();
  assert.equal(pid.update(-40, FRAME), 0, "after a reset: no kick");

  // Smoothing: one jittery frame moves D much less than it would unsmoothed.
  const raw = new Pid({ ...GAINS, kp: 0, kd: 0.05, smoothMs: 0 });
  const smooth = new Pid({ ...GAINS, kp: 0, kd: 0.05, smoothMs: 100 });
  for (const p of [raw, smooth]) p.update(0, FRAME);
  const jumpRaw = raw.update(2, FRAME);
  const jumpSmooth = smooth.update(2, FRAME);
  assert.ok(Math.abs(jumpSmooth) < Math.abs(jumpRaw) * 0.5, `smoothed ${jumpSmooth.toFixed(2)} vs raw ${jumpRaw.toFixed(2)}`);
});

test("rate limit: the correction never changes faster than maxRate (one bad frame can't jerk the stand)", () => {
  const pid = new Pid({ ...GAINS, maxRate: 300 });
  assert.equal(pid.update(0, FRAME), 0);
  const out = pid.update(60, FRAME);
  assert.ok(Math.abs(out - (300 * FRAME) / 1000) < 1e-9, `at most 300°/s: ${out}`);
  pid.reset();
  assert.equal(pid.update(60, FRAME), 60, "after a reset (a new person) the first correction is free");
});

test("reset clears the I part, the D memory and the rate limit", () => {
  const pid = new Pid({ ...GAINS, ki: 1, kd: 0.1, maxRate: 10 });
  for (let k = 0; k < 20; k++) pid.update(5 + k, FRAME);
  assert.ok(pid.integral > 0);
  pid.reset();
  assert.equal(pid.integral, 0);
  assert.equal(pid.update(3, 0), 3, "only P on the first frame after a reset: no I, no D, no rate limit");
});

// ---------- the brain, the page and the firmware's motor loop together ----------

const W = 320;
const H = 180;
const SCREEN_MS = 16; // the page: about 60 screen refreshes a second
const FOV_H = DEFAULT_SETTINGS.fovH;
const FOV_V = DEFAULT_SETTINGS.fovV;
const P_ONLY = { pan: { ...PAN_PID, ki: 0, kd: 0 }, tilt: { ...TILT_PID, ki: 0, kd: 0 } };
const DEFAULTS = { pan: PAN_PID, tilt: TILT_PID };
/** A gentler P (people may tune it down): P alone then leaves them off the middle by up to deadZone / P. */
const SOFT = { pan: { ...PAN_PID, kp: 0.6 }, tilt: { ...TILT_PID, kp: 0.6 } };
const SOFT_P_ONLY = { pan: { ...SOFT.pan, ki: 0, kd: 0 }, tilt: { ...SOFT.tilt, ki: 0, kd: 0 } };

/** A red-and-blue person from `you.head` to `you.feet` (tilt degrees, bigger = lower) at `you.pan`, seen from `cam`. */
function frame(you, cam) {
  const image = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
  const x = 0.5 + (you.pan - cam.pan) / FOV_H - 0.075;
  const top = 0.5 + (you.head - cam.tilt) / FOV_V;
  const bottom = 0.5 + (you.feet - cam.tilt) / FOV_V;
  const x0 = Math.max(0, x);
  const x1 = Math.min(1, x + 0.15);
  const y0 = Math.max(0, top);
  const y1 = Math.min(1, bottom);
  if (x1 - x0 < 0.03 || y1 - y0 < 0.05) return { image, people: [] };
  const waist = (top + bottom) / 2;
  for (let y = Math.floor(y0 * H); y < Math.ceil(y1 * H); y++) {
    for (let px = Math.floor(x0 * W); px < Math.ceil(x1 * W); px++) {
      image.data.set(y / H < waist ? [200, 30, 30] : [30, 50, 180], (y * W + px) * 4);
    }
  }
  return { image, people: [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }] };
}

/**
 * The phone on the stand, 60 times a second, like TrackerPage: the picture shows where you
 * were TUNING.latencyMs ago, the brain looks 15 times a second, and in between the page moves
 * a moving aim on. The real motor runs the firmware's loop (servoModel.ts), but its tilt sits
 * `sag` degrees lower than it's told (the phone's weight; `droop(deg, ms)` changes it later,
 * over `ms`); the page's own guess doesn't know.
 */
function stand({ gains, sag = 0, you: start = { pan: 90, head: 80, feet: 112 } }) {
  const real = new ServoModel();
  const guess = new ServoModel();
  real.step(0);
  guess.step(0);
  const brain = new Brain({ ...DEFAULT_SETTINGS }, gains);
  const timeline = [{ t: 0, ...start }];
  const youAt = (t) => [...timeline].reverse().find((p) => p.t <= t) ?? timeline[0];
  let t = 0;
  let last = null;
  const log = [];
  let droop = null; // { from, to, t0, ms }
  const tell = (a) => {
    guess.setTarget(a);
    real.setTarget({ pan: a.pan, tilt: a.tilt + sag });
  };
  const look = (tap = null) => {
    const { image, people } = frame(youAt(t - TUNING.latencyMs), real.at(t - TUNING.latencyMs));
    const out = brain.update({ t, people, image, camera: guess.at(t - TUNING.latencyMs), radar: null, tap });
    if (out.aim) tell(out.aim);
    last = { out, t };
  };
  const tapAt = (p) => {
    const b = frame(p, real.current).people[0];
    look({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  };
  tapAt(start);
  assert.equal(last.out.mode, "tracking", "the tap should lock on");
  return {
    brain,
    log,
    tapAt,
    droop(deg, ms = 0) {
      droop = { from: sag, to: deg, t0: t, ms };
    },
    /** Runs for `ms` while you move at `speed` (degrees/second: pan, and tilt for head and feet together). */
    run(ms, speed = {}) {
      for (let k = 0; k < ms; k += SCREEN_MS) {
        t += SCREEN_MS;
        const p = youAt(t);
        const tilt = ((speed.tilt ?? 0) * SCREEN_MS) / 1000;
        timeline.push({ t, pan: p.pan + ((speed.pan ?? 0) * SCREEN_MS) / 1000, head: p.head + tilt, feet: p.feet + tilt });
        if (droop) {
          sag = droop.from + (droop.to - droop.from) * Math.min(1, (t - droop.t0) / Math.max(1, droop.ms));
          real.setTarget({ pan: last.out.aim.pan, tilt: last.out.aim.tilt + sag });
          if (sag === droop.to) droop = null;
        }
        real.step(t);
        guess.step(t);
        if (t - last.t >= FRAME) look();
        else if (last.out.aim && last.out.aimVel) tell(predictAim(last.out.aim, last.out.aimVel, t - last.t));
        const y = youAt(t);
        // Where the camera should look: their chest (Aim height), as the real motor points.
        const chest = y.head + DEFAULT_SETTINGS.aimHeight * (y.feet - y.head);
        log.push({ t, you: y.pan, pan: real.current.pan, chest, tilt: real.current.tilt, mode: last.out.mode });
      }
    },
    get t() {
      return t;
    },
    get you() {
      return youAt(t);
    },
  };
}

/** On you: within the dead zone of where the brain aims (plus a little, for the lead and the firmware's own dead band). */
const NEAR = DEFAULT_SETTINGS.deadZoneDeg + 0.5;

/** You side-step `size` degrees at `speed`°/s and stand still: how far past you it goes, and how long until it stays within the dead zone. */
function sideStep(gains, size, speed) {
  const s = stand({ gains });
  s.run(2000);
  const from = s.t;
  s.run((Math.abs(size) / speed) * 1000, { pan: Math.sign(size) * speed });
  s.run(3000);
  const after = s.log.filter((l) => l.t > from);
  const you = s.you.pan;
  const over = Math.max(...after.map((l) => Math.sign(size) * (l.pan - you)));
  const settled = after.findIndex((_, i) => after.slice(i).every((l) => Math.abs(l.pan - you) < NEAR));
  return { over, settleMs: settled < 0 ? Infinity : after[settled].t - from, end: Math.abs(after.at(-1).pan - you) };
}

test("a quick side-step: it settles on you with little overshoot, sooner than P alone", () => {
  const pid = sideStep(DEFAULTS, 12, 60);
  const p = sideStep(P_ONLY, 12, 60);
  assert.ok(pid.over < p.over && pid.over < 4, `goes ${pid.over.toFixed(1)}° past you (P alone: ${p.over.toFixed(1)}°)`);
  assert.ok(pid.settleMs <= p.settleMs, `settles in ${pid.settleMs} ms (P alone: ${p.settleMs} ms)`);
  assert.ok(pid.end < NEAR, "and ends on you");
});

test("side-steps of every size and speed: never far past you, and on average no worse than P alone", () => {
  const overs = { pid: [], p: [] };
  for (const size of [6, 10, 14, 20, 30, -6, -14, -30]) {
    for (const speed of [50, 100, 150]) {
      const pid = sideStep(DEFAULTS, size, speed);
      overs.pid.push(pid.over);
      overs.p.push(sideStep(P_ONLY, size, speed).over);
      assert.ok(pid.over < 9, `${size}° at ${speed}°/s: goes ${pid.over.toFixed(1)}° past you`);
      assert.ok(pid.end < NEAR, `${size}° at ${speed}°/s: ends ${pid.end.toFixed(1)}° off you`);
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(overs.pid) <= mean(overs.p), `on average ${mean(overs.pid).toFixed(2)}° past you (P alone ${mean(overs.p).toFixed(2)}°)`);
});

/** You walk right at 40°/s for 2 s and stop: how far behind while walking, and the pan after you stop. */
function walkAndStop(gains) {
  const s = stand({ gains, you: { pan: 60, head: 80, feet: 112 } });
  s.run(2000);
  const from = s.t;
  s.run(2000, { pan: 40 });
  const walking = s.log.filter((l) => l.t > from + 600);
  const lag = walking.reduce((a, l) => a + Math.abs(l.pan - l.you), 0) / walking.length;
  for (let k = 1; k <= 5; k++) s.run(64, { pan: 40 * (1 - k / 5) }); // slow down over a third of a second
  const stopped = s.t;
  const you = s.you.pan;
  s.run(3000);
  const after = s.log.filter((l) => l.t > stopped);
  return { lag, you, stopped, after, over: Math.max(...after.map((l) => l.pan)) - you };
}

test("walking, then stopping: keeps up while you walk, glides onto you once, then holds still", () => {
  const { lag, stopped, after, over } = walkAndStop(DEFAULTS);
  assert.ok(lag < 3, `on average ${lag.toFixed(1)}° behind you`);
  // The look-ahead (TUNING.leadMs) causes most of this; the PID mustn't add to it.
  const before = walkAndStop(P_ONLY).over;
  assert.ok(over <= before + 0.1 && over < 6.5, `goes ${over.toFixed(1)}° past where you stopped (P alone: ${before.toFixed(1)}°)`);
  // After the furthest point it only comes back toward you. (Nudges of a tenth of a degree come
  // from the page moving the aim on between camera frames, as before the PID: motion.test.mjs
  // checks the strict version.)
  const top = after.reduce((best, l, i) => (l.pan > after[best].pan ? i : best), 0);
  for (let i = top + 1; i < after.length; i++) assert.ok(after[i].pan <= after[i - 1].pan + 0.2, "no swinging back and forth");
  const still = after.filter((l) => l.t > stopped + 1500).map((l) => l.pan);
  assert.ok(Math.max(...still) - Math.min(...still) < 0.2, "and holds still");
});

test("left and right at the default numbers: within a degree of how the stand steered before the PID", () => {
  // P alone (P = 1, no I, no D) is exactly the old steering.
  const story = (gains) => {
    const s = stand({ gains, you: { pan: 70, head: 80, feet: 112 } });
    s.run(1500);
    s.run(1500, { pan: 35 });
    s.run(1500);
    s.run(1000, { pan: -50 });
    s.run(2000);
    return s.log.map((l) => l.pan);
  };
  const before = story(P_ONLY);
  const now = story(DEFAULTS);
  const worst = Math.max(...now.map((p, i) => Math.abs(p - before[i])));
  assert.ok(worst < 1, `differs by up to ${worst.toFixed(2)}°`);
});

test("a tilt motor that sags under the phone, from the start or later on: it still ends up looking at your chest", () => {
  for (const sag of [2, 3, 5]) {
    const s = stand({ gains: DEFAULTS, sag, you: { pan: 90, head: 92, feet: 110 } });
    s.run(6000);
    const l = s.log.at(-1);
    assert.ok(Math.abs(l.tilt - l.chest) < NEAR, `sag ${sag}°: ${(l.tilt - l.chest).toFixed(1)}° off your chest`);
    s.droop(sag + 3.5, 4000); // the tired motor slowly droops further while you sit still
    s.run(6000);
    const m = s.log.at(-1);
    assert.ok(Math.abs(m.tilt - m.chest) < NEAR, `drooped to ${sag + 3.5}°: ${(m.tilt - m.chest).toFixed(1)}° off your chest`);
  }
});

/**
 * You sit still a little above level; after 3 s the tilt motor slowly droops 3.5° under the
 * phone (over 4 s), away from you. How far off your chest does it end up?
 */
function droopLater(gains) {
  const s = stand({ gains, you: { pan: 90, head: 72, feet: 90 } });
  s.run(3000);
  const l = s.log.at(-1);
  const before = Math.abs(l.tilt - l.chest);
  s.droop(3.5, 4000);
  s.run(8000);
  const m = s.log.at(-1);
  return { s, before, off: Math.abs(m.tilt - m.chest), still: s.log.filter((x) => x.t > s.t - 2000).map((x) => x.tilt) };
}

test("a gentler P: P alone stops short of you (more so when the tilt motor droops), I brings you to the middle", () => {
  const p = droopLater(SOFT_P_ONLY);
  const pid = droopLater(SOFT);
  assert.ok(p.before > DEFAULT_SETTINGS.deadZoneDeg, `P alone stops ${p.before.toFixed(1)}° short of your chest`);
  assert.ok(p.off > DEFAULT_SETTINGS.deadZoneDeg, `and after the droop is ${p.off.toFixed(1)}° off`);
  assert.ok(pid.before < 1, `with I: ${pid.before.toFixed(1)}° off`);
  assert.ok(pid.off < 1, `with I, after the droop: ${pid.off.toFixed(1)}° off`);
  assert.ok(Math.max(...pid.still) - Math.min(...pid.still) < 0.2, "and then holds still (no hunting)");
});

test("no windup at a turning limit: standing past the end stop adds nothing up, and coming back doesn't overshoot", () => {
  const s = stand({ gains: SOFT, you: { pan: 110, head: 80, feet: 112 } });
  s.run(1500);
  s.run(2000, { pan: 40 }); // walk to 190°: past the 170° end stop (still in the picture)
  s.run(500);
  const before = s.brain.pidIntegral.pan;
  s.run(5000);
  assert.ok(s.log.at(-1).pan > LIMITS.panMax - 1, "the stand is at its end stop");
  assert.equal(s.brain.pidIntegral.pan, before, "nothing added up while it couldn't turn further");
  s.run(1000, { pan: -40 }); // back to 150°
  const from = s.t;
  s.run(3000);
  const after = s.log.filter((l) => l.t > from);
  const you = s.you.pan;
  const under = Math.max(...after.map((l) => you - l.pan));
  // No worse than the stand steered before the PID (P alone), in the same walk.
  const p = stand({ gains: P_ONLY, you: { pan: 110, head: 80, feet: 112 } });
  p.run(1500);
  p.run(2000, { pan: 40 });
  p.run(5500);
  p.run(1000, { pan: -40 });
  const pFrom = p.t;
  p.run(3000);
  const pUnder = Math.max(...p.log.filter((l) => l.t > pFrom).map((l) => p.you.pan - l.pan));
  assert.ok(under <= pUnder, `went ${under.toFixed(1)}° past you on the way back (before the PID: ${pUnder.toFixed(1)}°)`);
  assert.ok(Math.abs(after.at(-1).pan - you) < NEAR, "and ends on you");
});

test("no windup at the end of the up/down range: someone on the floor adds nothing up", () => {
  const s = stand({ gains: SOFT, you: { pan: 90, head: 105, feet: 135 } }); // far below: tilt held at +15°
  s.run(5000);
  assert.ok(s.log.at(-1).tilt > LIMITS.center + 14.5, "the stand looks as far down as it goes");
  assert.equal(s.brain.pidIntegral.tilt, 0);
});

test("the I part starts afresh when tracking starts or you're found again", () => {
  const { s } = droopLater(SOFT);
  assert.ok(Math.abs(s.brain.pidIntegral.tilt) > 0.5, "it has added up the sag");
  s.tapAt(s.you); // tap them again (or any re-lock): a fresh start
  assert.equal(s.brain.pidIntegral.tilt, 0);
  assert.equal(s.brain.pidIntegral.pan, 0);
});
