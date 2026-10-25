// A small PID controller: the phone's half of the stand's steering.
//
// It works like a camera gimbal, in two loops. The OUTER loop is here, on the phone: every
// camera frame it looks at how far the person is from the middle of the picture (the error,
// in degrees) and decides where the stand should point. The INNER loop is on the stand
// (the ESP32 firmware): it gets the motor to that point smoothly. The phone still sends
// plain "pan,tilt" angles; this only changes how it works them out:
//
//   where to point = where the camera points + PID(how far they are from the middle)
//
// One controller per motor (brain.ts), with its own numbers (PAN_PID and TILT_PID in
// config.ts): the tilt motor carries the phone's weight, so it needs different ones.
//
//   P  turns the error straight into a correction. P = 1 points right at the person, the
//      way the stand always has (with I and D at 0 it's exactly the old behaviour).
//   I  slowly adds up an error that doesn't go away (the tilt motor sagging under the
//      phone, so the person always sits a little low) and corrects it. It only adds up
//      while the person holds still and is further off than the dead zone, and never past
//      `iMax`, so it can't wind up and swing past them later.
//   D  reacts to how fast the error changes: it pushes a little harder as someone starts
//      to move away, and holds back as the camera catches up with them (less overshoot).
//      Only the measured error counts (the middle of the picture never moves), smoothed
//      over `smoothMs` so the detector's jitter doesn't make the motor fidget.
//
// No camera or Bluetooth code here, so it can be tested on a PC (pid.test.mjs).

/** The numbers for one motor's PID (see PAN_PID and TILT_PID in config.ts). */
export interface PidGains {
  /** Proportional: degrees of correction per degree of error. */
  kp: number;
  /** Integral: degrees of correction added per second, per degree of error that stays. */
  ki: number;
  /** Derivative: seconds. Degrees of correction per (degree per second) the error changes. */
  kd: number;
  /** How long (ms) the D part smooths the error's speed over (the detector jitters). */
  smoothMs: number;
  /** The I part never adds more than this many degrees either way (anti-windup). */
  iMax: number;
  /** The correction may change at most this fast (degrees/second): one bad frame can't jerk the stand. */
  maxRate: number;
}

export interface PidOptions {
  /**
   * Don't add up the error this time (the I part keeps its value): the stand can't go any
   * further that way (a turning limit, the tilt held level or pinned), or the person is moving.
   */
  freeze?: boolean;
  /** Errors this small (degrees) aren't added up either: the dead zone ignores them on purpose. */
  quiet?: number;
}

/** After a gap longer than this (ms), the error's speed starts afresh (it can't be measured across a gap). */
const MAX_GAP_MS = 500;
/** The I part adds up at most this long (ms) per update, about one camera frame: a gap since the last sighting isn't an error that stayed. */
const MAX_I_MS = 100;

export class Pid {
  gains: PidGains;
  /** The I part, in degrees. */
  private iTerm = 0;
  /** The last error, for the D part (null: none since the last reset or gap). */
  private prevError: number | null = null;
  /** The smoothed speed of the error, degrees/second. */
  private dRate = 0;
  /** The last correction, for the rate limit (null: none since the last reset). */
  private prevOut: number | null = null;

  constructor(gains: PidGains) {
    this.gains = gains;
  }

  /**
   * One camera frame. `error`: how far (degrees) the person is from where the motor points
   * in the picture (positive = the motor should turn to a bigger angle); `ms`: since the last
   * update. Returns the correction to add to where the camera points (degrees).
   */
  update(error: number, ms: number, opts: PidOptions = {}): number {
    const g = this.gains;
    const dt = Math.max(0, ms) / 1000;

    // D: how fast the error changes, smoothed. Nothing to compare with after a reset or a gap.
    if (this.prevError === null || ms > MAX_GAP_MS) {
      this.dRate = 0;
    } else if (dt > 0) {
      const raw = (error - this.prevError) / dt;
      const a = dt / (dt + Math.max(0, g.smoothMs) / 1000);
      this.dRate += (raw - this.dRate) * a;
    }
    this.prevError = error;

    // I: add up an error that stays, only when allowed, and never past iMax either way.
    if (!opts.freeze && dt > 0 && Math.abs(error) > (opts.quiet ?? 0)) {
      this.iTerm += g.ki * error * Math.min(dt, MAX_I_MS / 1000);
    }
    this.iTerm = Math.max(-g.iMax, Math.min(g.iMax, this.iTerm));

    let out = g.kp * error + this.iTerm + g.kd * this.dRate;
    // Never change the correction faster than maxRate.
    if (this.prevOut !== null && dt > 0) {
      const step = g.maxRate * dt;
      out = Math.max(this.prevOut - step, Math.min(this.prevOut + step, out));
    }
    this.prevOut = out;
    return out;
  }

  /** Start afresh: a new person, or the person found again after losing them. */
  reset(): void {
    this.iTerm = 0;
    this.prevError = null;
    this.dRate = 0;
    this.prevOut = null;
  }

  /** The I part right now (degrees), for tests and the log. */
  get integral(): number {
    return this.iTerm;
  }
}
