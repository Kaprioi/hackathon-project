// Turns the radar's loudness into "which way to turn" for the tracking brain, while the
// person is out of the picture but the radar still hears someone.
//
// The radar (an LD2410C) only says how loud someone is, not where. So:
//   - Two radars (left and right): turn toward the louder one, stop when they're about even.
//   - One radar facing ahead: a listening sweep. Turn a step, stop, listen, and keep going
//     while it gets louder. Once it gets quieter, go back to the loudest spot and wait there.
// The camera, not the radar, decides who it is (brain.ts).
//
// No camera or Bluetooth code, so it can be tested on a PC.

import { LIMITS, RADAR } from "./config.ts";
import { clamp } from "./geometry.ts";

/** What the radar(s) hear: loudness 0-100 of the left and right radar (one radar: `left` only). */
export interface RadarEnergy {
  left: number;
  right: number;
  radars: 1 | 2;
}

/** The loudest a radar hears (below RADAR.minEnergy counts as nothing). */
export function loudest(e: RadarEnergy): number {
  const l = e.left >= RADAR.minEnergy ? e.left : 0;
  const r = e.radars === 2 && e.right >= RADAR.minEnergy ? e.right : 0;
  return Math.max(l, r);
}

/**
 * Two radars: which way to turn (motor degrees, +1 or -1), or 0 when they hear about the
 * same (the person is roughly in front of the head, so in the camera's view).
 */
export function louderSide(e: RadarEnergy): -1 | 0 | 1 {
  const l = e.left >= RADAR.minEnergy ? e.left : 0;
  const r = e.right >= RADAR.minEnergy ? e.right : 0;
  if (Math.abs(l - r) <= RADAR.deadband) return 0;
  return (Math.sign(l - r) * RADAR.leftPan) as -1 | 1;
}

/**
 * One radar: the listening sweep. Turns in steps of RADAR.stepDeg the way the person most
 * likely went, stopping at each step to listen. Parks at the loudest spot once the loudness
 * drops again (it has passed them) or the head reaches its end stop. If that whole side was
 * quiet, or quieter than where it started, it tries the other side of where it started.
 */
export class ListeningSweep {
  /** Each stop so far: where, and how loud the radar was there. */
  readonly heard: { pan: number; energy: number }[] = [];
  /** Where it has parked (the loudest spot), or null while still sweeping. */
  parkedAt: number | null = null;

  private dir: number;
  private readonly start: number;
  private goal: number;
  private setOffT: number;
  private arrivedT: number | null = null;
  private sum = 0;
  private count = 0;
  private turnedBack = false;

  /**
   * `dir` is +1 or -1 (motor degrees): which way to try first. `startEnergy`, if given, is
   * how loud the radar was where it starts (when it's only a guess which way to go): if the
   * first step that way is quieter, it turns round straight away.
   */
  constructor(startPan: number, dir: number, t: number, startEnergy?: number) {
    this.start = clamp(startPan, LIMITS.panMin, LIMITS.panMax);
    this.dir = dir < 0 ? -1 : 1;
    if (startEnergy !== undefined) this.heard.push({ pan: this.start, energy: startEnergy });
    const first = this.stepFrom(this.start);
    if (first === null) {
      // Already at the end stop that way: start on the other side.
      this.turnedBack = true;
      this.dir = -this.dir;
    }
    this.goal = first ?? this.stepFrom(this.start) ?? this.start;
    this.setOffT = t;
  }

  /** Which way it's heading now (motor degrees, +1 or -1). */
  get direction(): number {
    return this.dir;
  }

  /**
   * Call every frame with where the camera points now and how loud the radar is.
   * Returns where the head should point.
   */
  update(t: number, cameraPan: number, energy: number): number {
    if (this.parkedAt !== null) return this.parkedAt;
    // Wait until the head gets there (or give up waiting), let it settle, then listen.
    if (this.arrivedT === null) {
      if (Math.abs(cameraPan - this.goal) > 2 && t - this.setOffT < RADAR.moveMaxMs) return this.goal;
      this.arrivedT = t;
    }
    const since = t - this.arrivedT;
    if (since < RADAR.settleMs) return this.goal;
    this.sum += energy >= RADAR.minEnergy ? energy : 0;
    this.count++;
    if (since < RADAR.settleMs + RADAR.listenMs) return this.goal;
    this.decide(this.sum / this.count, t);
    return this.parkedAt ?? this.goal;
  }

  private decide(energy: number, t: number): void {
    const best = this.best();
    this.heard.push({ pan: this.goal, energy });
    // Quieter than the loudest stop so far: we've gone past them. (Quieter than where we
    // started, the first time: they're the other way.)
    if (best && energy < best.energy - RADAR.deadband) {
      if (best.pan === this.start && !this.turnedBack) this.turnBack(t);
      else this.parkedAt = best.pan;
      return;
    }
    const next = this.stepFrom(this.goal);
    if (next !== null) {
      this.goTo(next, t);
      return;
    }
    // At the end stop. Heard someone this side: park at the loudest spot.
    const loudest = this.best()!;
    if (loudest.energy >= RADAR.minEnergy || this.turnedBack) {
      this.parkedAt = loudest.pan;
      return;
    }
    // This whole side was quiet: try the other side of where we started.
    this.turnBack(t);
  }

  private turnBack(t: number): void {
    this.turnedBack = true;
    this.dir = -this.dir;
    const other = this.stepFrom(this.start);
    if (other === null) this.parkedAt = this.best()!.pan;
    else this.goTo(other, t);
  }

  private best(): { pan: number; energy: number } | null {
    let best: { pan: number; energy: number } | null = null;
    for (const h of this.heard) if (!best || h.energy > best.energy) best = h;
    return best;
  }

  /** The next stop from `pan` in the current direction, or null at the end stop. */
  private stepFrom(pan: number): number | null {
    const next = clamp(pan + this.dir * RADAR.stepDeg, LIMITS.panMin, LIMITS.panMax);
    return Math.abs(next - pan) < 1 ? null : next;
  }

  private goTo(pan: number, t: number): void {
    this.goal = pan;
    this.setOffT = t;
    this.arrivedT = null;
    this.sum = 0;
    this.count = 0;
  }
}
