// Tests for how smoothly and quickly the stand follows someone: the brain, the page moving
// the aim on between camera frames (predictAim), and the firmware's motor steering (as
// copied in servoModel.ts). No camera or stand needed.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { Brain, predictAim } from "./brain.ts";
import { DEFAULT_SETTINGS, LIMITS, TUNING } from "./config.ts";
import { ServoModel } from "./servoModel.ts";

const W = 320;
const H = 180;
const FRAME_MS = 66; // the camera: about 15 frames a second
const SCREEN_MS = 16; // the page: about 60 screen refreshes a second
const FOV = DEFAULT_SETTINGS.fovH;

/**
 * A frame showing a red-and-blue person at `you` degrees, seen from `cam` degrees: standing,
 * or lying on the floor (head to the left: red on the left, blue on the right).
 */
function frame(you, cam, lying = false) {
  const image = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
  const bw = lying ? 0.45 : 0.15;
  const x = 0.5 + (you - cam) / FOV - bw / 2;
  const x0 = Math.max(0, x);
  const x1 = Math.min(1, x + bw);
  if (x1 - x0 < 0.03) return { image, people: [] };
  const [y0, y1] = lying ? [0.65, 0.8] : [0.2, 0.8];
  for (let y = Math.floor(y0 * H); y < Math.ceil(y1 * H); y++) {
    for (let px = Math.floor(x0 * W); px < Math.ceil(x1 * W); px++) {
      const i = (y * W + px) * 4;
      const upper = lying ? px < (x + bw / 2) * W : y < (y0 + y1) * 0.5 * H;
      const c = upper ? [200, 30, 30] : [30, 50, 180];
      image.data[i] = c[0];
      image.data[i + 1] = c[1];
      image.data[i + 2] = c[2];
    }
  }
  return { image, people: [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }] };
}

/**
 * The page and stand together, 60 times a second: the camera picture is a frame late (it
 * shows where you were TUNING.latencyMs ago); the brain looks at it 15 times a second; in
 * between, the page moves a moving aim on by its speed. The motor does exactly what the
 * firmware tells it (the page's own copy of the firmware).
 */
function stand(start) {
  const motor = new ServoModel();
  motor.step(0);
  const brain = new Brain({ ...DEFAULT_SETTINGS });
  const you = [{ t: 0, pan: start }];
  const youAt = (t) => [...you].reverse().find((s) => s.t <= t)?.pan ?? start;
  let lyingSince = Infinity; // when you fell over
  let t = 0;
  let last = null; // the brain's last answer and when
  const log = [];
  const look = (tap = null) => {
    const cam = motor.at(t - TUNING.latencyMs);
    const { image, people } = frame(youAt(t - TUNING.latencyMs), cam.pan, t - TUNING.latencyMs >= lyingSince);
    const out = brain.update({ t, people, image, camera: cam, radar: null, tap });
    if (out.aim) motor.setTarget(out.aim);
    last = { out, t };
  };
  look({ x: 0.5 + (start - 90) / FOV, y: 0.5 });
  return {
    log,
    /** Runs for `ms` while you move at `speed` degrees a second. */
    run(ms, speed = 0) {
      for (let s = 0; s < ms; s += SCREEN_MS) {
        t += SCREEN_MS;
        you.push({ t, pan: youAt(t) + (speed * SCREEN_MS) / 1000 });
        motor.step(t);
        if (t - last.t >= FRAME_MS) look();
        else if (last.out.aim && last.out.aimVel) motor.setTarget(predictAim(last.out.aim, last.out.aimVel, t - last.t));
        log.push({ t, you: youAt(t), pan: motor.current.pan, mode: last.out.mode });
      }
    },
    /** You fall over, now: lying on the floor from the next picture on. */
    fall() {
      lyingSince = t;
    },
    get t() {
      return t;
    },
    motor,
  };
}

test("walking across the room: the stand keeps you near the middle, with little lag", () => {
  const s = stand(60);
  s.run(2000); // face you
  const from = s.t;
  s.run(2000, 40); // walk right at 40°/s (a brisk walk across the room, 2 m away)
  const walking = s.log.filter((l) => l.t > from + 600); // once it has caught up
  assert.ok(walking.every((l) => l.mode === "tracking"));
  const lag = walking.reduce((a, l) => a + Math.abs(l.pan - l.you), 0) / walking.length;
  // Before these changes it lagged about 4.5° behind (camera aims only 15 times a second, no lead).
  assert.ok(lag < 3, `on average ${lag.toFixed(1)}° behind you`);
});

test("you stop: it glides back onto you once, without swinging back and forth, then holds still", () => {
  const s = stand(60);
  s.run(2000);
  s.run(1500, 40);
  for (let k = 1; k <= 5; k++) s.run(64, 40 * (1 - k / 5)); // slow down over a third of a second
  const stopped = s.t;
  const you = s.log.at(-1).you;
  s.run(3000);
  const after = s.log.filter((l) => l.t > stopped);
  const peak = Math.max(...after.map((l) => l.pan));
  assert.ok(peak - you < 4, `goes ${(peak - you).toFixed(1)}° past where you stopped`);
  // After the furthest point it only ever comes back toward you (no swinging to and fro).
  const top = after.findIndex((l) => l.pan === peak);
  for (let i = top + 1; i < after.length; i++) {
    assert.ok(after[i].pan <= after[i - 1].pan + 0.01, `swung forward again at ${after[i].t - stopped} ms`);
  }
  const still = after.filter((l) => l.t > stopped + 1500).map((l) => l.pan);
  assert.ok(Math.abs(still.at(-1) - you) < 2.5, "ends up on you (within the dead zone)");
  assert.ok(Math.max(...still) - Math.min(...still) < 0.2, "and holds still: no jitter");
});

test("a motor slower than the page thinks: the stand settles on you, it doesn't hunt back and forth", () => {
  // A tired servo carrying a phone: 10% of the way per 20 ms and at most 90°/s, while the page
  // thinks it does 25% and 280°/s. A smoother "speed up, slow down" motor swung by up to 70°
  // here, and asking for more look-ahead swung too (see MOTION and leadMs in config.ts).
  let worst = 0;
  for (const start of [100, 110, 120]) {
    for (const walk of [0, 25, -40]) {
      const real = { pan: 90, target: 90, hist: [{ t: 0, pan: 90 }] };
      const realAt = (t) => [...real.hist].reverse().find((h) => h.t <= t)?.pan ?? 90;
      const guess = new ServoModel();
      guess.step(0);
      const brain = new Brain({ ...DEFAULT_SETTINGS });
      let t = 0;
      let you = start;
      const look = (tap = null) => {
        const { image, people } = frame(you, realAt(t - TUNING.latencyMs));
        const out = brain.update({ t, people, image, camera: guess.at(t - TUNING.latencyMs), radar: true, tap });
        if (out.aim) {
          real.target = out.aim.pan;
          guess.setTarget(out.aim);
        }
        return out;
      };
      const run = (ms, speed) => {
        const aims = [];
        for (let s = 0; s < ms; s += FRAME_MS) {
          t += FRAME_MS;
          you += (speed * FRAME_MS) / 1000;
          for (let k = 5; k <= FRAME_MS; k += 5) {
            const e = real.target + (real.pan - real.target) * Math.pow(0.9, 5 / 20);
            real.pan += Math.max(-0.45, Math.min(0.45, e - real.pan));
            real.hist.push({ t: t - FRAME_MS + k, pan: real.pan });
          }
          guess.step(t);
          const out = look();
          if (out.aim) aims.push(out.aim.pan);
        }
        return aims;
      };
      guess.step(0);
      look({ x: 0.5 + (you - 90) / FOV, y: 0.5 });
      run(3000, 0);
      run(900, walk);
      run(1500, 0);
      const aims = run(2000, 0);
      worst = Math.max(worst, Math.max(...aims) - Math.min(...aims));
    }
  }
  assert.ok(worst < 1, `the aim wobbled by up to ${worst.toFixed(1)}° while you stood still`);
});

test("between camera frames the aim moves on smoothly, but never runs away if frames stop", () => {
  const aim = { pan: 90, tilt: 90 };
  const vel = { pan: 40, tilt: -10 };
  assert.deepEqual(predictAim(aim, vel, 50), { pan: 92, tilt: 89.5 });
  const stalled = predictAim(aim, vel, 5000);
  assert.ok(stalled.pan <= 90 + (40 * TUNING.predictMaxMs) / 1000 + 1e-9, "at most predictMaxMs ahead");
  assert.equal(predictAim({ pan: 169, tilt: 90 }, vel, 100).pan, LIMITS.panMax, "never past the end stop");
});

test("you fall over (Dennis's lying-down colours): it keeps you, and the motor settles instead of running off", () => {
  const s = stand(80);
  s.run(2500);
  s.fall();
  const fell = s.t;
  s.run(4000);
  const after = s.log.filter((l) => l.t > fell);
  assert.ok(after.every((l) => l.mode === "tracking"), `lost you after the fall: ${[...new Set(after.map((l) => l.mode))]}`);
  const tilt = s.motor.current.tilt;
  assert.ok(tilt > 90 && tilt < LIMITS.tiltMax, `should look down at you on the floor, tilt ${tilt.toFixed(1)}°`);
  const late = after.filter((l) => l.t > fell + 2500).map((l) => l.pan);
  assert.ok(Math.max(...late) - Math.min(...late) < 0.2, "and hold still while you lie there");
  assert.ok(Math.abs(late.at(-1) - 80) < 3, `pointing at you (80°), at ${late.at(-1).toFixed(1)}°`);
});


test("a phone's real delays (the AI, then Bluetooth): the stand follows you without swinging back and forth", () => {
  // On the Android phone on the stand (Galaxy S22) the AI takes about 95 ms a frame, so the
  // page looks about 9 times a second and only sends a frame's aim once the AI is done; then
  // Bluetooth takes about 30 ms more. The page's guess of where the camera points must start
  // each move when the aim really reaches the motor (servoModel.ts setTarget's `at`).
  // Believing it started at the frame's time put the guess ahead of the real camera: the page
  // thought it had already turned further, over-corrected, and the stand swung to and fro.
  const AI_MS = 95;
  const LOOK_MS = 110;
  const BT = TUNING.bluetoothMs;
  const follow = (knowsTheDelays) => {
    const real = new ServoModel(); // the real motor
    const guess = new ServoModel(); // the page's guess
    real.step(0);
    guess.step(0);
    const brain = new Brain({ ...DEFAULT_SETTINGS });
    const toStand = []; // aims on their way: { at, aim }
    const send = (now, aim) => {
      toStand.push({ at: now + BT, aim });
      if (knowsTheDelays) guess.setTarget(aim, now + BT);
      else guess.setTarget(aim);
    };
    const youAt = (t) => (t < 1500 ? 70 : t < 3500 ? 70 + (40 * (t - 1500)) / 1000 : 150); // walk right, stop
    let outbox = null; // the aim the AI is still working on: { at, out, t }
    let last = null; // the last aim sent from a frame
    let nextLook = 0;
    const log = [];
    for (let t = 0; t <= 7500; t += SCREEN_MS) {
      while (toStand.length && toStand[0].at <= t) real.setTarget(toStand.shift().aim);
      real.step(t);
      if (outbox && t >= outbox.at) {
        if (outbox.out.aim) send(t, outbox.out.aim);
        last = outbox;
        outbox = null;
      } else if (last?.out.aim && last.out.aimVel) {
        send(t, predictAim(last.out.aim, last.out.aimVel, t - last.t));
      }
      if (t >= nextLook) {
        nextLook = t + LOOK_MS;
        guess.step(t);
        const seen = t - TUNING.latencyMs;
        const { image, people } = frame(youAt(seen), real.at(seen).pan);
        const tap = t === 0 ? { x: 0.5 + (70 - 90) / FOV, y: 0.5 } : null;
        const out = brain.update({ t, people, image, camera: guess.at(seen), radar: null, tap });
        outbox = { at: t + AI_MS, out, t };
      }
      log.push({ t, you: youAt(t), pan: real.current.pan });
    }
    const after = log.filter((l) => l.t > 3500); // once you've stopped
    let swings = 0;
    let dir = 0;
    for (let i = 1; i < after.length; i++) {
      const d = after[i].pan - after[i - 1].pan;
      if (Math.abs(d) < 0.05) continue;
      if (dir && Math.sign(d) !== dir) swings++;
      dir = Math.sign(d);
    }
    const off = after.reduce((a, l) => a + Math.abs(l.pan - l.you), 0) / after.length;
    return { swings, off };
  };
  const before = follow(false);
  const now = follow(true);
  assert.ok(now.swings <= 4, `swung back and forth ${now.swings} times after you stopped (was ${before.swings})`);
  assert.ok(now.off < 2.5, `on average ${now.off.toFixed(1)}° off you after you stopped`);
  assert.ok(before.swings >= 3 * Math.max(1, now.swings), `the old guess swung ${before.swings} times, the new one ${now.swings}`);
});

test("where the camera points is known between camera frames, not just at them", () => {
  // The page only moves its guess on once per AI frame (about every 100 ms on a phone). Asking
  // where the camera was in between used to answer with the last frame's angle, 10-20 degrees
  // off while the stand turned, so the page thought you'd moved and overshot.
  const rare = new ServoModel();
  const often = new ServoModel();
  rare.step(0);
  often.step(0);
  rare.setTarget({ pan: 150, tilt: 90 });
  often.setTarget({ pan: 150, tilt: 90 });
  for (let t = 5; t <= 300; t += 5) often.step(t);
  rare.step(110);
  rare.step(220);
  rare.step(300);
  for (const t of [60, 130, 200, 260]) {
    assert.ok(Math.abs(rare.at(t).pan - often.at(t).pan) < 1, `at ${t} ms: ${rare.at(t).pan.toFixed(1)} vs ${often.at(t).pan.toFixed(1)}`);
  }
});

/**
 * The phone's real timing (as in the test above: the AI takes 95 ms, the page looks every
 * 110 ms, Bluetooth adds 30 ms), with the detector's box jumping by `wobble` of the picture each
 * frame. You stand at `you` degrees; tap at the start. Returns the stand's angle every 16 ms.
 */
function phoneStand(you, wobble, ms) {
  const AI_MS = 95;
  const LOOK_MS = 110;
  const real = new ServoModel();
  const guess = new ServoModel();
  real.step(0);
  guess.step(0);
  const brain = new Brain({ ...DEFAULT_SETTINGS });
  let seed = 9;
  const jump = () => (((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1) * wobble;
  const toStand = [];
  let outbox = null;
  let last = null;
  let nextLook = 0;
  const log = [];
  const send = (now, aim) => {
    toStand.push({ at: now + TUNING.bluetoothMs, aim });
    guess.setTarget(aim, now + TUNING.bluetoothMs);
  };
  for (let t = 0; t <= ms; t += SCREEN_MS) {
    while (toStand.length && toStand[0].at <= t) real.setTarget(toStand.shift().aim);
    real.step(t);
    if (outbox && t >= outbox.at) {
      if (outbox.out.aim) send(t, outbox.out.aim);
      last = outbox;
      outbox = null;
    } else if (last?.out.aim && last.out.aimVel) {
      send(t, predictAim(last.out.aim, last.out.aimVel, t - last.t));
    }
    if (t >= nextLook) {
      nextLook = t + LOOK_MS;
      guess.step(t); // once per frame, like the page
      const seen = t - TUNING.latencyMs;
      const { image, people } = frame(you + jump() * FOV, real.at(seen).pan);
      const tap = t === 0 ? { x: 0.5 + (you - 90) / FOV, y: 0.5 } : null;
      const out = brain.update({ t, people, image, camera: guess.at(seen), radar: null, tap });
      outbox = { at: t + AI_MS, out, t };
    }
    log.push({ t, pan: real.current.pan });
  }
  return log;
}

/** How many times the stand changes direction (moves of at least half a degree). */
function backAndForths(log) {
  let n = 0;
  let dir = 0;
  let from = log[0].pan;
  for (const l of log) {
    const d = l.pan - from;
    if (Math.abs(d) < 0.5) continue;
    if (dir && Math.sign(d) !== dir) n++;
    dir = Math.sign(d);
    from = l.pan;
  }
  return n;
}

test("tapping someone off to the side: the stand turns to them without overshooting or wobbling", () => {
  const log = phoneStand(112, 0, 3000);
  const overshoot = Math.max(...log.map((l) => l.pan - 112));
  assert.ok(overshoot < 1.5, `overshot by ${overshoot.toFixed(1)}° (the old guess of the camera overshot by 3-5°)`);
  const settled = log.filter((l) => l.t > 800);
  assert.ok(settled.every((l) => Math.abs(l.pan - 112) < 2), "on you, and staying there, within a second");
  assert.ok(backAndForths(log) <= 3, `swung back and forth ${backAndForths(log)} times`);
});

test("standing still while the box jumps about a little: the stand holds still, it doesn't twitch", () => {
  const log = phoneStand(112, 0.02, 10000).filter((l) => l.t > 2000);
  const spread = Math.max(...log.map((l) => l.pan)) - Math.min(...log.map((l) => l.pan));
  assert.ok(backAndForths(log) <= 6, `twitched back and forth ${backAndForths(log)} times in 8 s (was over 20)`);
  assert.ok(spread < 3, `wandered over ${spread.toFixed(1)}°`);
});
