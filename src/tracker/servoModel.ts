// Guesses where the camera is pointing right now.
//
// The stand doesn't report its angle back, but we know exactly how the firmware
// moves (25% of the remaining way every 20 ms, at most 240 degrees a second), so we copy that here. Knowing
// where the camera was pointing when a frame was taken lets the brain turn
// "you're on the left of the picture" into "you're at 70 degrees in the room".

import { LIMITS, SERVO_EASE, SERVO_MAX_SPEED, SERVO_TICK_MS } from "./config.ts";
import type { Angles } from "./geometry.ts";

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

  setTarget(a: Angles): void {
    this.target = { ...a };
  }

  /** The stand reported where it really is (its radars moved it): believe that instead. */
  sync(a: Angles, t: number): void {
    this.now = { ...a };
    this.target = { ...a };
    this.lastT = t;
    this.history.push({ t, pan: a.pan, tilt: a.tilt });
    while (this.history.length > 2 && this.history[0].t < t - 1000) this.history.shift();
  }

  /** Moves the guess forward to time `t` (milliseconds). */
  step(t: number): void {
    if (this.lastT < 0) this.lastT = t;
    const dt = t - this.lastT;
    if (dt <= 0) return;
    const keep = Math.pow(1 - SERVO_EASE, dt / SERVO_TICK_MS);
    const maxMove = (SERVO_MAX_SPEED * dt) / 1000;
    for (const axis of ["pan", "tilt"] as const) {
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
