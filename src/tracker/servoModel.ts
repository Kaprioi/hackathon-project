// Guesses where the camera is pointing right now.
//
// The stand doesn't report its angle back (older firmware), but we know exactly how the
// firmware moves the motors (MOTION in config.ts: a quarter of the remaining way every
// 20 ms, never faster than a top speed, and not at all for a tiny move), so we copy that
// here. Knowing where the camera was pointing when a frame was taken lets the brain turn
// "you're on the left of the picture" into "you're at 70 degrees in the room".

import { LIMITS, MOTION, SERVO_TICK_MS } from "./config.ts";
import type { Angles } from "./geometry.ts";

/**
 * The stand's own report of its tilt (SightLine, 10 times a second) arrives a little late
 * (up to 100 ms between reports, then Bluetooth), so it's compared with where we guessed the
 * tilt was this long ago.
 */
const REPORT_LAG_MS = 100;
/** Our up/down guess and the stand's report disagree by more than this (degrees)... */
const TILT_SYNC_DEG = 4;
/** ...for this long (ms): believe the stand. A moment of disagreement is just the report lagging behind a quick move. */
const TILT_SYNC_MS = 250;

interface Sample {
  t: number;
  pan: number;
  tilt: number;
}

export class ServoModel {
  private now: Angles = { pan: LIMITS.center, tilt: LIMITS.center };
  private target: Angles = { pan: LIMITS.center, tilt: LIMITS.center };
  private lastT = -1;
  private history: Sample[] = [];
  private tiltOffSince: number | null = null;
  /** Aims still on their way to the stand: { when they arrive, the aim }, oldest first. */
  private pending: { at: number; target: Angles }[] = [];

  /**
   * Aim the motor. `at` = when the aim really reaches the stand (performance.now() time).
   * The page only sends a frame's aim once the AI has looked at it (about 100 ms on a phone),
   * and Bluetooth adds a little more; until then the real motor keeps going toward the old
   * aim. Believing it moved straight away put this guess ahead of the real camera, so the
   * page thought it had already turned further than it had, over-corrected, and the stand
   * swung back and forth. Without `at`: straight away.
   */
  setTarget(a: Angles, at?: number): void {
    if (at === undefined || at <= this.lastT) {
      this.pending = [];
      this.target = { ...a };
      return;
    }
    // Only the newest aim matters (the stand only gets the newest request).
    this.pending = this.pending.filter((p) => p.at < at);
    this.pending.push({ at, target: { ...a } });
  }

  /** The stand reported where it really is (its radars moved it): believe that instead. */
  sync(a: Angles, t: number): void {
    this.pending = [];
    this.now = { ...a };
    this.target = { ...a };
    this.lastT = t;
    this.tiltOffSince = null;
    this.history.push({ t, pan: a.pan, tilt: a.tilt });
    while (this.history.length > 2 && this.history[0].t < t - 1000) this.history.shift();
  }

  /**
   * While the page steers, the stand (SightLine) still reports where its tilt really is. If our
   * up/down guess has been clearly off that for a moment (the stand didn't tilt where it was
   * told: older firmware ignored the aims while its own radar was searching, or the aims
   * stopped arriving), believe the stand's tilt. Left/right keeps its guess, exactly as before.
   * Call it after step(t). Returns true when it moved the guess.
   */
  followReportedTilt(tilt: number, t: number): boolean {
    if (Math.abs(this.at(t - REPORT_LAG_MS).tilt - tilt) <= TILT_SYNC_DEG) {
      this.tiltOffSince = null;
      return false;
    }
    this.tiltOffSince ??= t;
    if (t - this.tiltOffSince < TILT_SYNC_MS) return false;
    this.tiltOffSince = null;
    this.now = { ...this.now, tilt };
    this.history.push({ t, pan: this.now.pan, tilt });
    return true;
  }

  /** Moves the guess forward to time `t` (milliseconds), switching aims as they arrive. */
  step(t: number): void {
    while (this.pending.length && this.pending[0].at <= t) {
      const p = this.pending.shift()!;
      this.advance(p.at);
      this.target = p.target;
    }
    this.advance(t);
  }

  private advance(t: number): void {
    if (this.lastT < 0) this.lastT = t;
    const dt = t - this.lastT;
    if (dt <= 0) return;
    const keep = Math.pow(1 - MOTION.ease, dt / SERVO_TICK_MS);
    const speed = { pan: MOTION.panSpeed, tilt: MOTION.tiltSpeed };
    for (const axis of ["pan", "tilt"] as const) {
      if (Math.abs(this.target[axis] - this.now[axis]) < MOTION.deadband) continue; // a tiny move: the firmware holds still
      const maxMove = (speed[axis] * dt) / 1000;
      const eased = this.target[axis] + (this.now[axis] - this.target[axis]) * keep;
      const move = Math.max(-maxMove, Math.min(maxMove, eased - this.now[axis]));
      this.now[axis] += move;
    }
    this.lastT = t;
    this.history.push({ t, pan: this.now.pan, tilt: this.now.tilt });
    while (this.history.length > 2 && this.history[0].t < t - 1000) this.history.shift();
  }

  /** Where the camera was pointing at time `t` (within the last second). */
  at(t: number): Angles {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].t <= t) return { pan: this.history[i].pan, tilt: this.history[i].tilt };
    }
    const first = this.history[0];
    return first ? { pan: first.pan, tilt: first.tilt } : { ...this.now };
  }

  get current(): Angles {
    return { ...this.now };
  }
}
