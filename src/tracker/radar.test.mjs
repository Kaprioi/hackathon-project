// Tests for turning toward someone who is out of the picture but heard by the radar
// (radarGuide.ts, and RADAR SEARCH in brain.ts). A simulated room: people stand at
// directions in the room, the "camera" sees the ones in front of it, and a fake radar
// says how loud they are. No camera, stand or radar needed.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { Brain, whereaboutsText } from "./brain.ts";
import { CAMERA_STEERS_IN, DEFAULT_SETTINGS, LIMITS, MOTION, RADAR, TUNING } from "./config.ts";
import { ListeningSweep, louderSide } from "./radarGuide.ts";
import { ServoModel } from "./servoModel.ts";

const W = 320;
const H = 180;
const FRAME_MS = 66; // about 15 frames a second
const RED = [200, 30, 30];
const BLUE = [30, 50, 180];
const GREEN = [30, 160, 60];
const BLACK = [15, 15, 15];
const FOV = DEFAULT_SETTINGS.fovH;
const FOV_V = DEFAULT_SETTINGS.fovV;

function fillRect(img, x0, x1, y0, y1, color) {
  for (let y = Math.max(0, Math.floor(y0 * H)); y < Math.min(H, Math.ceil(y1 * H)); y++) {
    for (let x = Math.max(0, Math.floor(x0 * W)); x < Math.min(W, Math.ceil(x1 * W)); x++) {
      const i = (y * W + x) * 4;
      img.data[i] = color[0];
      img.data[i + 1] = color[1];
      img.data[i + 2] = color[2];
    }
  }
}

/**
 * How loud one LD2410C radar hears someone `off` degrees from where it points: loudest
 * straight ahead, fading to nothing at the edge of its ±60° cone.
 */
function loudness(off) {
  const a = Math.abs(off) / 60;
  return a >= 1 ? 0 : Math.round(75 * (1 - a * a));
}

/**
 * The real motor: slower than the page's guess (10% of the way per 20 ms instead of 15%,
 * and at most 90 degrees a second), like a tired servo carrying a phone.
 */
function realMotor() {
  return {
    now: { pan: LIMITS.center, tilt: LIMITS.center },
    target: { pan: LIMITS.center, tilt: LIMITS.center },
    history: [{ t: 0, pan: LIMITS.center, tilt: LIMITS.center }],
    setTarget(a) {
      this.target = { ...a };
    },
    step(t) {
      const last = this.history.at(-1).t;
      for (let k = last + 5; k <= t; k += 5) {
        const keep = Math.pow(0.9, 5 / 20);
        const max = (90 * 5) / 1000;
        for (const axis of ["pan", "tilt"]) {
          const eased = this.target[axis] + (this.now[axis] - this.target[axis]) * keep;
          this.now[axis] += Math.max(-max, Math.min(max, eased - this.now[axis]));
        }
        this.history.push({ t: k, ...this.now });
      }
    },
    at(t) {
      for (let i = this.history.length - 1; i >= 0; i--) if (this.history[i].t <= t) return this.history[i];
      return this.history[0];
    },
    get current() {
      return this.now;
    },
  };
}

/**
 * A room with people in it (each at a direction in motor degrees) and the stand's head.
 * `radars`: 1 (facing ahead), 2 (toed out 25° each way), or null (no radar connected).
 * The radar reports the loudest person, like the real one, and hears its own motion
 * while the head turns. `quiet`: it hears nobody. `loudness: false`: an old stand that
 * only says yes or no. `webcam`: the camera is a laptop's webcam beside the stand, always
 * looking straight ahead ("fixed": the page knows; "fixed-unknown": the page thinks the
 * camera turns with the head, as before the "Camera turns with the stand" setting).
 */
function room({ radars = 1, quiet = false, loudness: withLoudness = true, webcam = null } = {}) {
  const motor = realMotor();
  const guess = new ServoModel(); // where the page thinks the camera points
  guess.step(0);
  const brain = new Brain({ ...DEFAULT_SETTINGS });
  const sim = {
    t: 0,
    people: [], // { pan, top, bottom }
    brain,
    motor,
    radars,
    log: [], // every frame: { t, mode, note, aim, camera }

    /** The radar's reading right now. */
    radar() {
      const radars = sim.radars;
      if (radars === null) return { radar: null, radarEnergy: null };
      const head = motor.at(sim.t).pan;
      const turning = Math.abs(head - motor.at(sim.t - 100).pan) > 1; // over 10°/s
      const hear = (axis) => {
        if (quiet) return 0;
        let e = 0;
        for (const p of sim.people) e = Math.max(e, loudness(p.pan - axis));
        return Math.min(100, e + (turning ? 30 : 0)); // the radar sees its own motion
      };
      const left = radars === 2 ? hear(head + 25 * RADAR.leftPan) : hear(head);
      const right = radars === 2 ? hear(head - 25 * RADAR.leftPan) : 0;
      const present = left >= RADAR.minEnergy || right >= RADAR.minEnergy;
      return { radar: present, radarEnergy: withLoudness ? { left, right, radars } : null };
    },

    /** One camera frame: the brain looks, and the head turns where it says. */
    step(tap = null) {
      sim.t += FRAME_MS;
      motor.step(sim.t);
      guess.step(sim.t);
      // The picture shows where the camera really was.
      const real = webcam ? { pan: LIMITS.center, tilt: LIMITS.center } : motor.at(sim.t - TUNING.latencyMs);
      const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(128) };
      const boxes = [];
      for (const p of sim.people) {
        const x = 0.5 + (p.pan - real.pan) / FOV - 0.075; // left edge of a 0.15-wide person
        const y = 0.2 + ((p.tilt ?? LIMITS.center) - real.tilt) / FOV_V; // top of a 0.6-tall person
        const x0 = Math.max(0, x);
        const x1 = Math.min(1, x + 0.15);
        if (x1 - x0 < 0.03) continue; // out of the picture
        fillRect(img, x0, x1, y, y + 0.3, p.top);
        fillRect(img, x0, x1, y + 0.3, y + 0.6, p.bottom);
        boxes.push({ x: x0, y, w: x1 - x0, h: 0.6 });
      }
      const head = guess.at(sim.t - TUNING.latencyMs);
      const fixed = webcam === "fixed";
      const camera = fixed ? { pan: LIMITS.center, tilt: LIMITS.center } : head;
      const out = brain.update({ t: sim.t, people: boxes, image: img, camera, head: fixed ? head : undefined, tap, ...sim.radar() });
      if (out.aim && CAMERA_STEERS_IN.includes(out.mode)) {
        motor.setTarget(out.aim);
        guess.setTarget(out.aim);
      }
      sim.log.push({ t: sim.t, mode: out.mode, note: out.note, aim: out.aim, camera: camera.pan, out });
      return out;
    },

    /** Runs for `ms`, moving each person by `walk(person, t)` first. */
    run(ms, walk = () => {}) {
      let out;
      for (let s = 0; s < ms; s += FRAME_MS) {
        sim.people.forEach((p) => walk(p, sim.t));
        out = sim.step();
      }
      return out;
    },

    /** Taps the person at `pan` (in view) and tracks them for a second. */
    lockOn(person) {
      const x = 0.5 + (person.pan - (webcam ? LIMITS.center : motor.current.pan)) / FOV;
      const out = sim.step({ x, y: 0.5 });
      assert.equal(out.mode, "tracking");
      sim.run(1000);
    },

    modes() {
      return new Set(sim.log.map((l) => l.mode));
    },
  };
  return sim;
}

const you = (pan) => ({ pan, top: RED, bottom: BLUE });
const stranger = (pan) => ({ pan, top: GREEN, bottom: BLACK });

/** First time (ms after `from`) the brain was tracking again, or null. */
function refoundAfter(sim, from) {
  const hit = sim.log.find((l) => l.t > from && l.mode === "tracking");
  return hit ? hit.t - from : null;
}

// ---------- the pieces ----------

test("two radars: turn toward the louder one, hold when they're even", () => {
  assert.equal(louderSide({ left: 60, right: 20, radars: 2 }), RADAR.leftPan);
  assert.equal(louderSide({ left: 10, right: 50, radars: 2 }), -RADAR.leftPan);
  assert.equal(louderSide({ left: 40, right: 36, radars: 2 }), 0, "within the deadband: about even");
  assert.equal(louderSide({ left: 5, right: 12, radars: 2 }), 0, "both too quiet to count");
});

test("one radar: the listening sweep stops, listens, and parks at the loudest spot", () => {
  // Someone at 40°. Start at 90° heading down (toward them).
  const sweep = new ListeningSweep(90, -1, 0);
  let t = 0;
  let pan = 90;
  const stops = new Set();
  for (let i = 0; i < 200 && sweep.parkedAt === null; i++) {
    t += 20;
    const goal = sweep.update(t, pan, loudness(40 - pan));
    pan = goal; // a head that gets there at once
    stops.add(goal);
  }
  assert.deepEqual([...stops], [50, 10], "stopped every 40°, and went one past them");
  assert.equal(sweep.parkedAt, 50, "parked at the loudest stop (closest to 40°)");
});

test("one radar: a quiet side makes the listening sweep try the other side", () => {
  // Someone at 150°, but the sweep starts heading down from 90°: quiet that way.
  const sweep = new ListeningSweep(90, -1, 0);
  let t = 0;
  let pan = 90;
  for (let i = 0; i < 400 && sweep.parkedAt === null; i++) {
    t += 20;
    pan = sweep.update(t, pan, loudness(150 - pan));
  }
  assert.equal(sweep.direction, 1, "turned back the other way");
  assert.ok(Math.abs(sweep.parkedAt - 150) <= RADAR.stepDeg / 2, `should park near 150°, parked at ${sweep.parkedAt}`);
});

// ---------- the simulated room ----------

test("one radar: you walk out on the left, the head turns left and finds you", () => {
  const sim = room({ radars: 1 });
  const me = you(110);
  sim.people.push(me);
  sim.lockOn(me);
  sim.run(1500);

  // Run left, faster than the head can turn, out of the picture, and stop at 35°.
  const left = sim.t;
  sim.run(6000, (p) => {
    p.pan = Math.max(35, p.pan - (160 * FRAME_MS) / 1000);
  });
  const lost = sim.log.filter((l) => l.t > left && l.mode !== "tracking");
  assert.ok(lost.length > 0, "should lose you for a moment");
  assert.ok(lost.some((l) => l.mode === "radar"), `the radar should guide the search (modes: ${[...sim.modes()]})`);
  const firstRadarAim = lost.find((l) => l.mode === "radar").aim.pan;
  assert.ok(firstRadarAim < 90, `should turn left (down from 90°), first aim ${firstRadarAim}`);
  // The screen says where you are believed to be.
  const where = lost.find((l) => l.mode === "radar").out.whereabouts;
  assert.deepEqual(where, { side: -1, radar: true, checking: false });
  assert.equal(whereaboutsText(where, false), "Out of view - to your left (the radar hears you)");
  assert.match(whereaboutsText(where, true), /to your right/, "a mirrored (selfie) picture flips the words");
  const last = sim.log.at(-1);
  assert.equal(last.mode, "tracking", `should have found you, ended ${last.mode}: ${last.note}`);
  // The page never lets go of the motor while it searches (no gap for the stand to fill in).
  for (const l of lost) assert.ok(l.aim && CAMERA_STEERS_IN.includes(l.mode), `no aim at ${l.t} ms in ${l.mode}`);
  assert.ok(Math.abs(sim.motor.current.pan - 35) < 8, `should face you at 35°, faces ${sim.motor.current.pan.toFixed(0)}°`);
});

test("two radars: you leave on the left but double back behind to the right; the radar wins", () => {
  const run = (radars) => {
    const sim = room({ radars });
    const me = you(80);
    sim.people.push(me);
    sim.lockOn(me);
    // Dash out on the left, faster than the head can turn, until it has lost you...
    let out = sim.step();
    for (let i = 0; i < 100 && out.mode === "tracking"; i++) {
      me.pan -= (200 * FRAME_MS) / 1000;
      out = sim.step();
    }
    // ...then, out of sight, double back round behind the head to its right.
    me.pan = sim.motor.current.pan + 50;
    const from = sim.t;
    sim.run(12000);
    return { sim, me, found: refoundAfter(sim, from) };
  };
  const withRadar = run(2);
  const blind = run(null);
  assert.ok(withRadar.sim.modes().has("radar"), "the radars should guide the search");
  const turning = withRadar.sim.log.filter((l) => l.mode === "radar" && l.out.whereabouts && !l.out.whereabouts.checking);
  assert.ok(
    turning.some((l) => l.out.whereabouts.side === 1 && whereaboutsText(l.out.whereabouts, false).includes("to your right")),
    "the screen should say you're to the right once the radar hears you there",
  );
  assert.equal(withRadar.sim.log.at(-1).mode, "tracking");
  const at = withRadar.me.pan;
  assert.ok(Math.abs(withRadar.sim.motor.current.pan - at) < 8, `should face you at ${at.toFixed(0)}°`);
  assert.ok(withRadar.found !== null, "should find you");
  assert.ok(
    blind.found === null || withRadar.found < blind.found - 2000,
    `the radar should find you much sooner than the blind search (${withRadar.found} ms vs ${blind.found} ms)`,
  );
});

test("radar hears someone while nobody is in view: it turns, listens, and finds you", () => {
  const sim = room({ radars: 1 });
  const me = you(90);
  sim.people.push(me);
  sim.lockOn(me);
  // You leave the room: nobody in view, the radar goes quiet.
  sim.people.length = 0;
  sim.run(25000);
  assert.equal(sim.log.at(-1).mode, "lost", "an empty room ends in LOST");
  const lostAt = sim.motor.current.pan;

  // You come back in at 140°, out of the picture. Only the radar hears you.
  me.pan = 140;
  sim.people.push(me);
  const back = sim.t;
  sim.run(10000);
  const after = sim.log.filter((l) => l.t > back);
  assert.ok(after.some((l) => l.mode === "radar"), "should turn to see who the radar hears");
  assert.ok(
    after.some((l) => l.mode === "radar" && l.aim && l.aim.pan !== lostAt),
    "the head should move during the radar search",
  );
  assert.equal(sim.log.at(-1).mode, "tracking", `should have found you, ended ${sim.log.at(-1).mode}: ${sim.log.at(-1).note}`);
  assert.ok(Math.abs(sim.motor.current.pan - 140) < 8, `should face you at 140°, faces ${sim.motor.current.pan.toFixed(0)}°`);
});

test("the radar leads to someone else: not mistaken for you, and the search goes on", () => {
  const sim = room({ radars: 1 });
  const me = you(90);
  sim.people.push(me);
  sim.lockOn(me);
  // Someone else sits at 40°, out of the picture. You walk out on the left and leave the room.
  const other = stranger(40);
  sim.people.push(other);
  sim.run(1500, (p) => {
    if (p === me) p.pan -= (120 * FRAME_MS) / 1000;
  });
  sim.people.splice(sim.people.indexOf(me), 1);
  const from = sim.t;
  sim.run(60000);
  const after = sim.log.filter((l) => l.t > from);
  assert.ok(after.some((l) => l.mode === "radar"), "the radar should lead the head to them");
  assert.ok(after.some((l) => /someone else/i.test(l.note)), "should say it's someone else");
  for (const l of after) {
    assert.notEqual(l.mode, "tracking", `took the stranger for you at ${l.t} ms: ${l.note}`);
  }
  assert.ok(after.some((l) => l.mode === "searching"), "should keep searching for you");
  assert.equal(sim.log.at(-1).mode, "lost", "and give up after a few tries, not search forever");

  // You come back into view: locked straight back on.
  me.pan = sim.motor.current.pan + 5;
  sim.people.push(me);
  sim.run(500);
  assert.equal(sim.log.at(-1).mode, "tracking");
});

test("radar quiet: you leave the room, and it behaves just as it did before (follow, sweep, LOST)", () => {
  const timeline = (opts) => {
    const sim = room(opts);
    const me = you(80);
    sim.people.push(me);
    sim.lockOn(me);
    // Dash out on the left, and out of the room.
    sim.run(400, (p) => {
      p.pan = Math.max(20, p.pan - (200 * FRAME_MS) / 1000);
    });
    sim.people.length = 0;
    sim.run(25000);
    return sim;
  };
  const quiet = timeline({ radars: 1, quiet: true });
  const before = timeline({ radars: 1, quiet: true, loudness: false }); // a stand that only says yes/no
  assert.ok(!quiet.modes().has("radar"), "no radar search when the radar hears nobody");
  assert.ok(quiet.modes().has("following") && quiet.modes().has("searching"), "follows, then sweeps");
  assert.equal(quiet.log.at(-1).mode, "lost");
  assert.deepEqual(
    quiet.log.map((l) => [l.mode, l.aim && l.aim.pan.toFixed(2)]),
    before.log.map((l) => [l.mode, l.aim && l.aim.pan.toFixed(2)]),
    "the same moves as a stand without radar loudness",
  );
});

test("Bluetooth drops during a radar search: it sweeps the room the usual way", () => {
  const sim = room({ radars: 1 });
  const me = you(90);
  sim.people.push(me);
  sim.lockOn(me);
  // You run off left, then double back behind to 150°: the radar search is under way.
  sim.run(700, (p) => {
    p.pan -= (150 * FRAME_MS) / 1000;
  });
  me.pan = 150;
  sim.run(300);
  assert.equal(sim.log.at(-1).mode, "radar");
  sim.radars = null; // Bluetooth drops
  const out = sim.run(200);
  assert.ok(out.mode === "searching" || out.mode === "lost", `ended ${out.mode}`);
});

// ---------- a laptop's webcam beside the stand (the camera doesn't turn with the motor) ----------

test("laptop webcam: the motor turns to face you and stays there (it ran off to the end before)", () => {
  const face = (webcam) => {
    const sim = room({ radars: 1, webcam });
    const me = you(110);
    sim.people.push(me);
    sim.lockOn(me);
    sim.run(4000); // you stand still
    return sim.motor.current.pan;
  };
  const fixed = face("fixed");
  assert.ok(Math.abs(fixed - 110) < 4, `should point at you (110°), points at ${fixed.toFixed(0)}°`);
  // The bug: the page thought the picture turned with the motor, so you seemed to keep
  // moving away, and the motor chased you to its end stop.
  const before = face("fixed-unknown");
  assert.ok(before > 160, `reproduces the old runaway: ${before.toFixed(0)}°`);
});

test("laptop webcam: you step out on the left, the motor turns left toward you, no blind sweeping", () => {
  const sim = room({ radars: 1, webcam: "fixed" });
  const me = you(90);
  sim.people.push(me);
  sim.lockOn(me);
  const from = sim.t;
  // Walk left out of the webcam's view and stop at 35°, where only the radar hears you.
  sim.run(15000, (p) => {
    p.pan = Math.max(35, p.pan - (60 * FRAME_MS) / 1000);
  });
  const after = sim.log.filter((l) => l.t > from && l.mode !== "tracking");
  assert.ok(after.some((l) => l.mode === "radar"), "the radar should guide the motor");
  assert.ok(!after.some((l) => l.mode === "searching"), "no sweeping: it can't bring you into the webcam's view");
  const where = after.find((l) => l.out.whereabouts).out.whereabouts;
  assert.equal(whereaboutsText(where, false).includes("to your left"), true, "the screen says you're to the left");
  const pans = sim.motor.history.filter((h) => h.t > from).map((h) => h.pan);
  assert.ok(Math.max(...pans) < 100, `the motor never swings off the other way (reached ${Math.max(...pans).toFixed(0)}°)`);
  assert.ok(pans.some((p) => Math.abs(p - 35) < 15), "the motor points toward you at some point");
  // Off round behind the stand to 150° (out of the webcam's view, out of the radar's hearing
  // where it points): it listens again and follows you there.
  me.pan = 150;
  sim.run(12000);
  assert.equal(sim.log.at(-1).mode, "radar", `ended ${sim.log.at(-1).mode}: ${sim.log.at(-1).note}`);
  assert.ok(Math.abs(sim.motor.current.pan - 150) < 15, `should point at you (150°), points at ${sim.motor.current.pan.toFixed(0)}°`);
  // Back into the webcam's view: locked straight back on.
  sim.run(2000, (p) => {
    p.pan = Math.min(85, p.pan + (60 * FRAME_MS) / 1000);
  });
  assert.equal(sim.log.at(-1).mode, "tracking");
});

// ---------- up and down, and how quickly it turns ----------

for (const webcam of [null, "fixed"]) {
  test(`up and down: it tilts to follow you (${webcam ? "laptop webcam beside the stand" : "camera on the stand"})`, () => {
    const sim = room({ radars: 1, webcam });
    const me = you(90);
    sim.people.push(me);
    sim.lockOn(me);
    // Your chest is about 3.6° above your "tilt" in this room (the aim is at chest height).
    const aimFor = (tilt) => tilt - 0.09 * FOV_V;
    sim.run(1500, (p) => {
      p.tilt = Math.min(105, (p.tilt ?? 90) + (20 * FRAME_MS) / 1000); // you crouch: lower in the picture
    });
    sim.run(1500);
    assert.equal(sim.log.at(-1).mode, "tracking");
    assert.ok(Math.abs(sim.motor.current.tilt - aimFor(105)) < 3, `tilted down to ${sim.motor.current.tilt.toFixed(1)}°, you're at ${aimFor(105)}°`);
    sim.run(1500, (p) => {
      p.tilt = Math.max(78, p.tilt - (30 * FRAME_MS) / 1000); // and stand up tall
    });
    sim.run(1500);
    assert.equal(sim.log.at(-1).mode, "tracking");
    assert.ok(Math.abs(sim.motor.current.tilt - aimFor(78)) < 3, `tilted up to ${sim.motor.current.tilt.toFixed(1)}°, you're at ${aimFor(78)}°`);
  });
}

test("turning to look at someone: quick (25% a tick, at most 280°/s), and it glides in without passing the target", () => {
  // The page's copy of the firmware's motor steering.
  const motor = new ServoModel();
  motor.step(0);
  motor.setTarget({ pan: 150, tilt: 90 });
  let t = 0;
  let last = 90;
  while (Math.abs(motor.current.pan - 150) > 2) {
    t += 20;
    motor.step(t);
    assert.ok(motor.current.pan >= last && motor.current.pan <= 150, `jumped back or past the target at ${t} ms`);
    assert.ok(motor.current.pan - last <= (MOTION.panSpeed * 20) / 1000 + 1e-9, `never faster than ${MOTION.panSpeed}°/s`);
    last = motor.current.pan;
  }
  assert.ok(t <= 340, `a 60° turn should take about a third of a second, took ${t} ms (was 460)`);
});
