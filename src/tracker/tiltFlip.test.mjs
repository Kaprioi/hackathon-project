// Tests for "once it looks up, it stays up": the stand must never get stuck looking up or
// down. Up/down could get stuck when the page flipped up/down by itself by mistake (its guess
// of where the camera pointed was wrong, because the SightLine firmware ignored tilt aims while
// its own radar was still searching), and then never flipped back, and saved the flip.
//
// The whole loop runs here, with no camera or stand: the page (like TrackerPage), the brain,
// a JS copy of the SightLine firmware's motor loop and radar states, and a simulated person and
// camera picture. The random sequences are the ones from the stress test that found the bug.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { Brain, predictAim, towardLevel } from "./brain.ts";
import { CAMERA_STEERS_IN, DEFAULT_SETTINGS, TILT, TUNING } from "./config.ts";
import { settingsToSave, startSettings } from "./savedSettings.ts";
import { ServoModel } from "./servoModel.ts";
import { Stand } from "./stand.ts";
import { TiltCheck, atTiltLimit } from "./tiltCheck.ts";

const W = 160;
const H = 90;
const FRAME_MS = 66; // the camera: about 15 frames a second
const SCREEN_MS = 16; // the page: about 60 screen refreshes a second
const PERSON_W = 0.15;

/** A small repeatable random number generator (the same seed gives the same run). */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The SightLine firmware's camera loop and radar states, line by line from
 * hardware/firmware/sightline/sightline.ino. `oldRadarGate`: the firmware before this fix,
 * which ignored tilt aims unless its own radar state was TRACKING.
 */
class Firmware {
  pan = 90;
  tilt = TILT.level;
  cameraPan = 90;
  cameraTilt = TILT.level;
  lastCameraMove = 0;
  state = "TRACKING";
  lastSeenAt = 0;
  seenSince = 0;
  lastReport = 0;
  lastTick = 0;
  lastCameraTick = 0;
  /** The report the page has (Bluetooth takes about 30 ms), and when it arrived. */
  reported = null;
  reportedAt = -Infinity;
  pending = null;

  constructor(oldRadarGate = false) {
    this.oldRadarGate = oldRadarGate;
  }

  /** The website wrote "pan,tilt". */
  onMove(pan, tilt, now) {
    this.cameraPan = clamp(pan, 10, 170);
    this.cameraTilt = clamp(tilt, TILT.level - TILT.range, TILT.level + TILT.range);
    this.lastCameraMove = now | 1;
  }

  /** One pass of loop() at time `now`; `radarSees`: the radar hears the person. */
  loop(now, radarSees) {
    const at = this.lastCameraMove;
    const cameraSteering = at !== 0 && now - at < 700; // CAMERA_HOLD_MS
    if (now - this.lastCameraTick >= 20) {
      this.lastCameraTick = now;
      if (Math.abs(this.cameraPan - this.pan) >= 0.3) this.pan += clamp((this.cameraPan - this.pan) * 0.25, -5.6, 5.6);
      const fresh = (!this.oldRadarGate || this.state === "TRACKING") && at !== 0 && now - at < 1500; // TILT_RETURN_MS
      const goal = fresh ? this.cameraTilt : TILT.level;
      const step = ((fresh ? 200 : 40) * 20) / 1000; // TILT_TOP_SPEED, TILT_RETURN_SPEED
      if (Math.abs(goal - this.tilt) >= 0.3) this.tilt += clamp((goal - this.tilt) * 0.25, -step, step);
    }
    if (this.pending && now >= this.pending.at) {
      this.reported = this.pending.v;
      this.reportedAt = this.pending.at;
      this.pending = null;
    }
    if (now - this.lastTick < 50) return; // TICK_MS
    this.lastTick = now;
    const seen = radarSees || cameraSteering;
    if (now - this.lastReport >= 100) {
      this.lastReport = now;
      this.pending = { at: now + 30, v: { pan: this.pan, tilt: this.tilt } };
    }
    if (seen) {
      this.lastSeenAt = now;
      if (this.seenSince === 0) this.seenSince = now;
      if (this.state !== "TRACKING" && now - this.seenSince >= 1000) this.state = "TRACKING"; // FOUND_CONFIRM_MS
    } else {
      this.seenSince = 0;
      if (this.state === "TRACKING" && now - this.lastSeenAt >= 2000) this.state = "SEARCHING"; // LOST_GRACE_MS
    }
  }
}

// Poses, as the motor tilt (degrees, bigger = lower) of the top of the head and of the feet or seat.
const POSES = {
  stand: { head: 80, feet: 112 },
  tall: { head: 68, feet: 100 },
  slightUp: { head: 74, feet: 106 },
  sit: { head: 90, feet: 118 },
  slightDown: { head: 86, feet: 118 },
  crouch: { head: 100, feet: 122 },
  floor: { head: 108, feet: 125 },
  close: { head: 62, feet: 135 }, // right up at the stand: taller than the picture
  closeSit: { head: 72, feet: 140 },
};
const POSE_NAMES = Object.keys(POSES);

/** A random sequence of poses, vanishing, leaving and walking, and a random stand and phone (the stress test's). */
function randomRun(seed) {
  const r = rng(seed);
  const steps = [{ kind: "pose", pose: "stand", ms: 1500 }];
  const n = 3 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const x = r();
    if (x < 0.62) steps.push({ kind: "pose", pose: POSE_NAMES[Math.floor(r() * POSE_NAMES.length)], ms: 2000 + Math.floor(r() * 5000) });
    else if (x < 0.75) steps.push({ kind: "vanish", ms: 1000 + Math.floor(r() * 5000) });
    else if (x < 0.87) steps.push({ kind: "leave", side: r() < 0.5 ? -1 : 1, ms: 2000 + Math.floor(r() * 5000) });
    else
      steps.push({
        kind: "walk",
        dpan: (r() - 0.5) * 70,
        pose: POSE_NAMES[Math.floor(r() * POSE_NAMES.length)],
        ms: 3000 + Math.floor(r() * 3000),
      });
  }
  steps.push({ kind: "pose", pose: POSE_NAMES[Math.floor(r() * POSE_NAMES.length)], ms: 5000 });
  steps.push({ kind: "vanish", ms: 5000 });
  return {
    steps,
    motorSign: r() < 0.8 ? 1 : -1,
    startSign: r() < 0.1 ? -1 : 1,
    fovReal: r() < 0.5 ? 40 : 46 + Math.floor(r() * 10),
    jitter: r() * 0.03,
    miss: r() * 0.2,
    radarDrop: r() < 0.3 ? r() * 0.5 : 0,
    seed,
  };
}

/**
 * Runs the page, brain, firmware and person together. `run.motorSign` -1: the tilt motor is
 * mounted the other way round. `run.startSign`: the page's up/down setting at the start.
 * `oldFirmware`: the stand runs the firmware from before this fix (the page must cope until
 * the stand is updated).
 */
function simulate(run, { oldFirmware = false } = {}) {
  const r = rng(run.seed * 7919 + 13);
  let settings = { ...DEFAULT_SETTINGS, tiltSign: run.startSign };
  const brain = new Brain(settings);
  const guess = new ServoModel();
  guess.step(0);
  const fw = new Firmware(oldFirmware);
  const realHist = [{ t: 0, pan: 90, tilt: 90 }];
  const realAt = (t) => {
    for (let i = realHist.length - 1; i >= 0; i--) if (realHist[i].t <= t) return realHist[i];
    return realHist[0];
  };
  // The person's timeline.
  let pan = 90;
  let cur = { ...POSES.stand };
  const timeline = [];
  let t0 = 0;
  for (const st of run.steps) {
    const step = { ...st, t0, t1: t0 + st.ms, panFrom: pan, from: { ...cur } };
    if (st.kind === "pose") cur = { ...POSES[st.pose] };
    if (st.kind === "walk") {
      pan = clamp(pan + st.dpan, 25, 155);
      cur = { ...POSES[st.pose] };
      step.panTo = pan;
    }
    timeline.push(step);
    t0 += st.ms;
  }
  const total = t0;
  const stepAt = (t) => timeline.find((x) => t < x.t1) ?? timeline.at(-1);
  const personAt = (t) => {
    const st = stepAt(t);
    if (st.kind === "vanish") return null;
    if (st.kind === "leave") return { pan: st.panFrom + st.side * 120, ...st.from, gone: true };
    const k = Math.min(1, (t - st.t0) / 600); // 0.6 s to change pose
    const to = POSES[st.pose];
    const kp = st.kind === "walk" ? Math.min(1, (t - st.t0) / (st.ms * 0.7)) : 0;
    return {
      pan: st.kind === "walk" ? st.panFrom + (st.panTo - st.panFrom) * kp : st.panFrom,
      head: st.from.head + (to.head - st.from.head) * k,
      feet: st.from.feet + (to.feet - st.from.feet) * k,
    };
  };
  // Where the camera really looks up/down, in the person's units (smaller = higher).
  const elevation = (motorTilt) => 90 + run.motorSign * (motorTilt - 90);
  const picture = (p, cam) => {
    if (!p) return null;
    const yOf = (w) => 0.5 + (w - elevation(cam.tilt)) / run.fovReal;
    const x = 0.5 + (p.pan - cam.pan) / ((run.fovReal * 65) / 40) - PERSON_W / 2;
    let y0 = Math.max(0, yOf(p.head));
    let y1 = Math.min(1, yOf(p.feet));
    let x0 = Math.max(0, x);
    let x1 = Math.min(1, x + PERSON_W);
    if (y1 - y0 < 0.05 || x1 - x0 < 0.03) return null;
    const j = () => (r() - 0.5) * 2 * run.jitter;
    y0 = Math.max(0, y0 + j());
    y1 = Math.min(1, y1 + j());
    x0 = Math.max(0, x0 + j());
    x1 = Math.min(1, x1 + j());
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, waist: yOf((p.head + p.feet) / 2) };
  };

  let t = 0;
  let last = null;
  let homing = null;
  let prevStepT = 0;
  let lastAim = null;
  let cameraSteering = false;
  let wantMove = null;
  let sentMove = null;
  let lastMoveAt = -1e9;
  let flips = 0;
  const samples = [];

  // One camera frame, like TrackerPage's step().
  const look = (tap = null) => {
    const p = personAt(Math.max(0, t - TUNING.latencyMs));
    const box = picture(p, realAt(t - TUNING.latencyMs));
    const image = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
    const people = [];
    if (box && (tap || r() >= run.miss)) {
      for (let y = Math.floor(box.y * H); y < Math.ceil((box.y + box.h) * H); y++)
        for (let x = Math.floor(box.x * W); x < Math.ceil((box.x + box.w) * W); x++) {
          const i = (y * W + x) * 4;
          const c = y / H < box.waist ? [200, 30, 30] : [30, 50, 180];
          image.data[i] = c[0];
          image.data[i + 1] = c[1];
          image.data[i + 2] = c[2];
        }
      people.push({ x: box.x, y: box.y, w: box.w, h: box.h });
    }
    if (!cameraSteering && fw.reported) guess.sync(fw.reported, t);
    const fresh = fw.reported && t - fw.reportedAt <= 500 ? fw.reported : null;
    if (cameraSteering && fresh) guess.followReportedTilt(fresh.tilt, t);
    brain.settings = settings;
    const out = brain.update({
      t,
      people,
      image,
      camera: guess.at(t - TUNING.latencyMs),
      standTilt: fresh ? fresh.tilt : null,
      radar: !!p && !p.gone,
      tap,
    });
    if (out.flippedTilt) {
      settings = { ...settings, tiltSign: settings.tiltSign === 1 ? -1 : 1 };
      flips++;
    }
    last = { out, t };
    cameraSteering = !!out.aim && CAMERA_STEERS_IN.includes(out.mode);
    if (out.aim && cameraSteering) {
      homing = null;
      lastAim = out.aim;
      guess.setTarget(out.aim);
      wantMove = out.aim;
    } else {
      homing ??= lastAim ? { ...lastAim } : null;
      if (homing && homing.tilt !== TILT.level) {
        homing = { pan: homing.pan, tilt: towardLevel(homing.tilt, t - prevStepT) };
        lastAim = homing;
        guess.setTarget(homing);
        wantMove = homing;
      } else {
        wantMove = null;
        if (fw.reported) lastAim = fw.reported;
      }
    }
    prevStepT = t;
  };

  const first = picture(personAt(0), { pan: 90, tilt: 90 });
  look({ x: first.x + first.w / 2, y: first.y + first.h / 2 });
  let fwT = 0;
  let radarSees = true;
  while (t < total) {
    t += SCREEN_MS;
    guess.step(t);
    if (t - last.t >= FRAME_MS) look();
    else if (last.out.aim && last.out.aimVel && cameraSteering) {
      const a = predictAim(last.out.aim, last.out.aimVel, t - last.t);
      guess.setTarget(a);
      wantMove = a;
    }
    // stand.ts: at most every 25 ms, when the aim changed by more than 0.2° or every 250 ms.
    if (wantMove && t - lastMoveAt >= 25) {
      const changed =
        !sentMove || Math.abs(wantMove.pan - sentMove.pan) > 0.2 || Math.abs(wantMove.tilt - sentMove.tilt) > 0.2;
      if (changed || t - lastMoveAt > 250) {
        fw.onMove(wantMove.pan, wantMove.tilt, t);
        sentMove = wantMove;
        lastMoveAt = t;
      }
    }
    while (fwT + 10 <= t) {
      fwT += 10;
      if (fwT % 20 === 0) {
        const p = personAt(fwT);
        radarSees = !!p && !p.gone && r() >= run.radarDrop; // the radar misses them now and then
      }
      fw.loop(fwT, radarSees);
    }
    realHist.push({ t, pan: fw.pan, tilt: fw.tilt });
    if (realHist.length > 200) realHist.shift();
    samples.push({
      t,
      elevation: elevation(fw.tilt),
      guessTilt: guess.current.tilt,
      reported: fw.reported?.tilt ?? null,
      mode: last.out.mode,
      tiltSign: settings.tiltSign,
      fwState: fw.state,
      step: stepAt(t),
    });
  }
  return { samples, flips, settings, timeline };
}

/**
 * Where the camera ends up in the last second of each step of 3 s or more. With someone in
 * view it must look at them: between their face and their chest (within 4°), after the
 * TILT.range limit and the level band. With nobody in view: within 3° of level.
 * Returns the steps where it was stuck (empty = never stuck).
 */
function stuckSteps(res) {
  const lim = (v) => (Math.abs(v - TILT.level) <= TILT.levelBand ? TILT.level : TILT.level + clamp(v - TILT.level, -TILT.range, TILT.range));
  const stuck = [];
  for (const st of res.timeline) {
    if (st.ms < 3000) continue;
    const win = res.samples.filter((x) => x.t >= st.t1 - 1000 && x.t < st.t1);
    const at = win.reduce((a, x) => a + x.elevation, 0) / win.length;
    const name = `${st.kind}${st.pose ? ":" + st.pose : ""} at ${(st.t0 / 1000).toFixed(1)} s`;
    if (st.kind === "pose" || st.kind === "walk") {
      if (win.at(-1).mode === "lost") continue; // lost them: level is right (another matter)
      const po = POSES[st.pose];
      const chest = lim(po.head + 0.35 * (po.feet - po.head));
      const face = lim(po.head + 0.07 * (po.feet - po.head));
      if (at < Math.min(face, chest) - 4 || at > Math.max(face, chest) + 4)
        stuck.push(`${name}: camera at ${at.toFixed(1)}°, the person at ${face.toFixed(1)}-${chest.toFixed(1)}°`);
    } else if (Math.abs(at - TILT.level) > 3) {
      stuck.push(`${name}: nobody in view, camera at ${at.toFixed(1)}° (level ${TILT.level})`);
    }
  }
  return stuck;
}

const steady = (steps, extra = {}) => ({
  steps,
  motorSign: 1,
  startSign: 1,
  fovReal: 40,
  jitter: 0,
  miss: 0,
  radarDrop: 0,
  seed: 1,
  ...extra,
});

// Leave long enough for the page to give up (LOST, so it stops steering and the stand's radar
// drops to SEARCHING), then come back crouching. On main 93af346 (with its firmware) this
// flipped up/down by mistake as they came back, and the camera then stayed at the bottom of
// its range while they stood, and at the top later, whatever they did.
const COME_BACK_CROUCHING = steady([
  { kind: "pose", pose: "stand", ms: 4500 },
  { kind: "leave", side: 1, ms: 12000 },
  { kind: "pose", pose: "crouch", ms: 6000 },
  { kind: "pose", pose: "stand", ms: 6000 },
  { kind: "pose", pose: "sit", ms: 6000 },
  { kind: "vanish", ms: 3000 },
  { kind: "pose", pose: "stand", ms: 6000 },
]);

// ---------- the whole loop: page, brain, stand and person ----------

test("the stand's radar still says SEARCHING when you come back crouching: it follows you, never flips, never sticks", () => {
  const res = simulate(COME_BACK_CROUCHING);
  // The stand's radar really was still searching when they came back (the case that broke).
  const back = res.samples.filter((x) => x.t > 16500 && x.t < 17500);
  assert.ok(
    back.some((x) => x.fwState === "SEARCHING"),
    "the firmware's radar should still be SEARCHING just after they come back",
  );
  assert.equal(res.flips, 0, "flipped up/down by mistake");
  assert.deepEqual(stuckSteps(res), []);
  // While coming back crouching it tilts down toward them (it used to stay level, then go to the top).
  const crouching = res.samples.filter((x) => x.t > 21500 && x.t < 22500);
  assert.ok(crouching.every((x) => x.elevation > 98), "tilts down toward someone crouching");
});

test("the same with the stand not yet updated (old firmware ignores tilt aims while SEARCHING): the page copes", () => {
  const res = simulate(COME_BACK_CROUCHING, { oldFirmware: true });
  assert.equal(res.flips, 0, "flipped up/down by mistake");
  assert.deepEqual(stuckSteps(res), []);
});

test("stress-test seed 463: back after leaving while the stand's radar says SEARCHING, crouching: no mistaken flip", () => {
  // On main 93af346 this flipped at 27.5 s while the firmware was SEARCHING (the page thought
  // the camera was at 103.7°; it was really level), and stayed stuck.
  for (const oldFirmware of [false, true]) {
    const res = simulate(randomRun(463), { oldFirmware });
    assert.ok(res.samples.some((x) => x.fwState === "SEARCHING" && x.t > 27000 && x.t < 28000), "the stand's radar was SEARCHING");
    assert.equal(res.flips, 0, `flipped up/down by mistake (${oldFirmware ? "old" : "new"} firmware)`);
    assert.deepEqual(stuckSteps(res), []);
  }
});

test("crouch and sit while the page's tilt guess is stale: it re-syncs to the stand's report instead of believing the guess", () => {
  // The old firmware holds the tilt level while its radar searches, but the page tells it to
  // look down at the crouching person: the guess runs ahead of the real tilt.
  const res = simulate(COME_BACK_CROUCHING, { oldFirmware: true });
  const ignored = res.samples.filter((x) => x.fwState === "SEARCHING" && x.mode === "tracking" && x.t > 16000);
  assert.ok(ignored.length > 0, "the firmware ignored tilt aims for a while");
  // Within half a second of the guess going wrong, it's back with the stand's report.
  let wrongSince = null;
  for (const x of res.samples) {
    if (x.reported === null) continue;
    const off = Math.abs(x.guessTilt - x.reported);
    wrongSince = off > 6 ? (wrongSince ?? x.t) : null;
    assert.ok(wrongSince === null || x.t - wrongSince < 500, `the tilt guess stayed ${off.toFixed(1)}° off the stand at ${x.t} ms`);
  }
});

// Stress-test seeds (a normally mounted motor) that got stuck looking up or down on main 93af346
// with its firmware, in this same simulation: mostly a mistaken flip as the camera reached the
// end of the up/down range, which then never flipped back.
const STUCK_ON_MAIN = [23, 55, 84, 198, 219, 259, 318, 334, 359, 428, 436, 463, 480, 481, 487];

test("stress-test sequences that got stuck on main: never stuck now, and up/down ends the right way round", () => {
  for (const seed of STUCK_ON_MAIN) {
    const run = randomRun(seed);
    assert.equal(run.motorSign, 1);
    for (const oldFirmware of [false, true]) {
      const res = simulate(run, { oldFirmware });
      const fw = oldFirmware ? "old" : "new";
      assert.deepEqual(stuckSteps(res), [], `seed ${seed} got stuck (${fw} firmware)`);
      assert.equal(res.settings.tiltSign, 1, `seed ${seed} ended with up/down flipped the wrong way (${fw} firmware)`);
    }
  }
});

test("a mistaken flip that sends the camera to the end of the range, away from the person, is taken back within 3 s", () => {
  // Seeds where the page still flips by mistake (camera noise, misses), with a normal motor.
  for (const seed of [233, 388]) {
    const res = simulate(randomRun(seed));
    const changes = [];
    let prev = 1;
    for (const x of res.samples) {
      if (x.tiltSign !== prev) changes.push(x.t);
      prev = x.tiltSign;
    }
    assert.ok(changes.length >= 2 && changes.length % 2 === 0, `seed ${seed}: expected a flip and its undo, got ${changes.length} changes`);
    for (let i = 0; i < changes.length; i += 2) assert.ok(changes[i + 1] - changes[i] <= 3100, `seed ${seed}: undo took ${changes[i + 1] - changes[i]} ms`);
    assert.equal(res.settings.tiltSign, 1);
    assert.deepEqual(stuckSteps(res), [], `seed ${seed} got stuck`);
  }
});

test("100 random stress-test runs with a normally mounted motor: never stuck, never left flipped", () => {
  let runs = 0;
  for (let seed = 1; runs < 100; seed++) {
    const run = randomRun(seed);
    if (run.motorSign !== 1 || run.startSign !== 1) continue;
    runs++;
    const res = simulate(run);
    assert.deepEqual(stuckSteps(res), [], `seed ${seed} got stuck`);
    assert.equal(res.settings.tiltSign, 1, `seed ${seed} ended with up/down flipped`);
  }
});

test("a tilt motor that really is mounted the other way round is still noticed, flipped and followed", () => {
  // Crouching, or looking a little down: the first tilt runs the wrong way and gets noticed.
  const crouch = [
    { kind: "pose", pose: "stand", ms: 1500 },
    { kind: "pose", pose: "crouch", ms: 6000 },
    { kind: "pose", pose: "stand", ms: 6000 },
  ];
  const slightDown = [
    { kind: "pose", pose: "stand", ms: 1500 },
    { kind: "pose", pose: "slightDown", ms: 6000 },
    { kind: "pose", pose: "stand", ms: 6000 },
    { kind: "pose", pose: "sit", ms: 6000 },
  ];
  for (const steps of [crouch, slightDown])
    for (const oldFirmware of [false, true]) {
      const res = simulate(steady(steps, { motorSign: -1 }), { oldFirmware });
      assert.equal(res.flips, 1, "flipped up/down once, and kept it");
      assert.equal(res.settings.tiltSign, -1);
      assert.deepEqual(stuckSteps(res), []);
    }
});

test("a tilt motor mounted the other way round, with someone close or tall (aiming as far up as it goes): the flip stays", () => {
  // Right up at the stand, or tall: the page aims at the end of the up/down range to keep their
  // head in, so the camera runs there straight after the (right) flip. They don't get further
  // from the middle of the picture there, so the flip isn't taken back.
  for (const pose of ["close", "tall"]) {
    const steps = [
      { kind: "pose", pose: "stand", ms: 1500 },
      { kind: "pose", pose: "crouch", ms: 4000 },
      { kind: "pose", pose, ms: 6000 },
      { kind: "pose", pose: "stand", ms: 6000 },
      { kind: "pose", pose, ms: 6000 },
    ];
    for (const oldFirmware of [false, true]) {
      const res = simulate(steady(steps, { motorSign: -1 }), { oldFirmware });
      const fw = oldFirmware ? "old" : "new";
      assert.equal(res.flips, 1, `${pose}: flipped up/down once, and kept it (${fw} firmware)`);
      assert.equal(res.settings.tiltSign, -1);
      assert.deepEqual(stuckSteps(res), [], `${pose} (${fw} firmware)`);
    }
  }
  // Stress-test runs with the motor mounted the other way round, where the (right) flip sends
  // the camera straight to the end of the range: it used to be taken back 0.3 s later, then the
  // camera looked the wrong way at someone close (183, 43) or tall (135).
  for (const seed of [183, 43, 135]) {
    const run = randomRun(seed);
    assert.equal(run.motorSign, -1);
    for (const oldFirmware of [false, true]) {
      const res = simulate(run, { oldFirmware });
      const fw = oldFirmware ? "old" : "new";
      assert.equal(res.flips, 1, `seed ${seed}: flipped up/down once, and kept it (${fw} firmware)`);
      assert.equal(res.settings.tiltSign, -1);
      // (Before the flip, the first move ran to the end of the range the wrong way: that's how it noticed.)
      const flipAt = res.samples.find((x) => x.tiltSign === -1).t;
      assert.deepEqual(stuckSteps({ ...res, timeline: res.timeline.filter((st) => st.t0 >= flipAt) }), [], `seed ${seed} (${fw} firmware)`);
    }
  }
});

// ---------- the pieces ----------

test("tilt guess: re-syncs to the stand's report only when it has been clearly off for a moment; pan never changes", () => {
  // The stand didn't tilt where it was told: the report stays level while the guess goes down.
  const guess = new ServoModel();
  guess.sync({ pan: 120, tilt: 90 }, 0);
  guess.setTarget({ pan: 120, tilt: 105 });
  let moved = null;
  for (let t = 16; t <= 1000; t += 16) {
    guess.step(t);
    if (guess.followReportedTilt(90, t) && moved === null) moved = t;
    assert.equal(guess.current.pan, 120, "pan untouched");
  }
  assert.ok(moved !== null && moved > 250 && moved < 600, `re-synced at ${moved} ms`);

  // A quick move the stand really makes: its report lags 100-130 ms behind, but that's no reason to re-sync.
  const g = new ServoModel();
  const stand = new ServoModel(); // the firmware moves exactly like the guess
  g.step(0);
  stand.step(0);
  for (let t = 16; t <= 3000; t += 16) {
    const aim = { pan: 90, tilt: t % 1000 < 500 ? 76 : 104 }; // up and down as far as it goes, twice a second
    g.setTarget(aim);
    stand.setTarget(aim);
    g.step(t);
    stand.step(t);
    const report = stand.at(t - 100 - 30); // sent every 100 ms, then Bluetooth
    assert.equal(g.followReportedTilt(report.tilt, t), false, `re-synced during a real move at ${t} ms`);
  }
});

test("the stand's report only counts while fresh (it comes 10 times a second)", () => {
  const stand = new Stand();
  assert.equal(stand.freshReport(0), null, "nothing reported yet");
  stand.reported = { pan: 100, tilt: 80 };
  stand.reportedAt = 1000;
  assert.deepEqual(stand.freshReport(1200), { pan: 100, tilt: 80 });
  assert.equal(stand.freshReport(1600), null, "too old");
});

test("up/down check: taken back only when, at the end of the range, the person is clearly further from the middle for a third of a second in a row", () => {
  assert.ok(atTiltLimit(TILT.level - TILT.range) && atTiltLimit(TILT.level + TILT.range));
  assert.ok(!atTiltLimit(TILT.level + TILT.range - 1));

  // Flipped with the person 0.1 below the middle; then, at the end of the range, `y` each frame.
  const undoneAt = (ys, from = 1066) => {
    const check = new TiltCheck();
    check.flipped(1000, 0.6);
    for (let k = 0; k < ys.length; k++) if (check.pinned(from + k * 66, ys[k])) return from + k * 66;
    return null;
  };
  const frames = (n, y) => Array(n).fill(y);
  // A wrong flip ran away from them: they're 0.3 from the middle now, and stay there. Taken back after 330 ms (5 frames).
  assert.equal(undoneAt(frames(30, 0.8)), 1066 + 5 * 66);
  // Further, but only a little (within the margin): not enough to say, the flip stays.
  assert.equal(undoneAt(frames(30, 0.62)), null);
  // Closer to the middle (a motor mounted the other way round, aiming as far as it goes): the flip stays.
  assert.equal(undoneAt(frames(30, 0.52)), null);
  // Further for a moment, then back toward the middle: not long enough in a row, the flip stays.
  assert.equal(undoneAt([...frames(4, 0.8), 0.55, ...frames(4, 0.8), 0.55, ...frames(4, 0.8)]), null);
  // Further, then a gap with the camera off the end of the range, then further again: the gap starts the evidence over.
  const gappy = new TiltCheck();
  gappy.flipped(1000, 0.6);
  assert.equal(gappy.pinned(1400, 0.85), false);
  gappy.notPinned();
  assert.equal(gappy.pinned(2466, 0.85), false, "the gap starts the evidence over");
  for (let t = 2532; t < 2796; t += 66) assert.equal(gappy.pinned(t, 0.85), false);
  assert.equal(gappy.pinned(2796, 0.85), true, "330 ms in a row after the gap");
  // Further up instead of down counts the same.
  assert.equal(undoneAt(frames(30, 0.2)), 1066 + 5 * 66);
  // Too late: after 3 s the flip stays.
  assert.equal(undoneAt(frames(30, 0.8), 3800), null);
  // Only once.
  const check = new TiltCheck();
  check.flipped(0, 0.5);
  let undos = 0;
  for (let t = 66; t < 2900; t += 66) if (check.pinned(t, 0.9)) undos++;
  assert.equal(undos, 1);
});

test("up/down check: a stretch the stand says it never tilted (the guess was wrong) doesn't count", () => {
  // The guess tilts 6° down twice while the person moves away from the middle: the wrong way round...
  const wrongWay = (stand) => {
    const check = new TiltCheck();
    let flipped = false;
    check.update(0, 90, 0.5, 1, 40, true, stand(90));
    flipped ||= check.update(200, 96, 0.6, 1, 40, true, stand(96));
    flipped ||= check.update(400, 102, 0.7, 1, 40, true, stand(102));
    return flipped;
  };
  // ...if the stand really tilted like that, it flips;
  assert.equal(wrongWay((tilt) => tilt), true);
  // ...if the stand says it stayed level, the guess was wrong, not the motor: no flip;
  assert.equal(wrongWay(() => 90), false);
  // ...and with no report from the stand, it trusts the guess as before.
  assert.equal(wrongWay(() => null), true);
});

test("the brain doesn't check up/down once the camera has tilted all the way to an aim at the end of the range", () => {
  // A wrong-way pattern (the camera tilts down, the person slides further down the picture),
  // with the aim at the bottom of the range. `frames`: the camera tilt and the box top, per frame.
  const flipsFor = (frames) => {
    const brain = new Brain(DEFAULT_SETTINGS);
    const image = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
    let flips = 0;
    frames.forEach(([tilt, top], k) => {
      const camera = { pan: 90, tilt };
      const people = [{ x: 0.42, y: top, w: 0.16, h: 0.3 }];
      const tap = k === 0 ? { x: 0.5, y: top + 0.15 } : null;
      if (brain.update({ t: k * 66, people, image, camera, standTilt: tilt, radar: true, tap }).flippedTilt) flips++;
    });
    return flips;
  };
  const bottom = TILT.level + TILT.range;
  // The second wrong-way stretch ends 3° short of the end: it flips (the check works here)...
  assert.equal(flipsFor([[90, 0.6], [93, 0.64], [96, 0.7], [99, 0.76], [bottom - 3, 0.82]]), 1);
  // ...but ending as the camera gets to the end of the range, it doesn't.
  assert.equal(flipsFor([[90, 0.6], [93, 0.64], [96, 0.7], [99, 0.76], [bottom - 0.3, 0.85]]), 0);
});

test("saved settings: up/down flips made by the page itself are never saved; an old saved flip is dropped once", () => {
  // Saved before this fix: can't tell a hand-made flip from an automatic one, so it's dropped.
  const old = startSettings({ ...DEFAULT_SETTINGS, tiltSign: -1, fovV: 50 }, false, false, false);
  assert.equal(old.tiltSign, 1, "the old saved flip is dropped");
  assert.equal(old.fovV, 50, "everything else is kept");
  // An automatic flip in this visit (-1) with the hand-chosen setting 1: 1 is what's saved.
  const auto = settingsToSave({ ...DEFAULT_SETTINGS, tiltSign: -1, fovV: 50 }, 1);
  assert.equal(auto.tiltSign, 1);
  assert.equal(auto.fovV, 50);
  // Flip up/down pressed by hand: saved, and kept across reloads.
  const byHand = settingsToSave({ ...DEFAULT_SETTINGS, tiltSign: -1 }, -1);
  assert.equal(startSettings(byHand, false, false, true).tiltSign, -1);
  assert.equal(startSettings(byHand, true, false, true).tiltSign, -1, "on an iPhone too");
  assert.equal(startSettings(null, false, false, true).tiltSign, DEFAULT_SETTINGS.tiltSign, "nothing saved");
});
