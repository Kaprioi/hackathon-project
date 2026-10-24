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

/** A frame showing a red-and-blue person standing at `you` degrees, seen from `cam` degrees. */
function frame(you, cam) {
  const image = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
  const x = 0.5 + (you - cam) / FOV - 0.075;
  const x0 = Math.max(0, x);
  const x1 = Math.min(1, x + 0.15);
  if (x1 - x0 < 0.03) return { image, people: [] };
  for (let y = 36; y < 144; y++) {
    for (let px = Math.floor(x0 * W); px < Math.ceil(x1 * W); px++) {
      const i = (y * W + px) * 4;
      const c = y < 90 ? [200, 30, 30] : [30, 50, 180];
      image.data[i] = c[0];
      image.data[i + 1] = c[1];
      image.data[i + 2] = c[2];
    }
  }
  return { image, people: [{ x: x0, y: 0.2, w: x1 - x0, h: 0.6 }] };
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
  let t = 0;
  let last = null; // the brain's last answer and when
  const log = [];
  const look = (tap = null) => {
    const cam = motor.at(t - TUNING.latencyMs);
    const { image, people } = frame(youAt(t - TUNING.latencyMs), cam.pan);
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
    get t() {
      return t;
    },
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
