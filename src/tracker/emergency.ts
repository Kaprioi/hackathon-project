// Spots a likely fall or seizure of the person being tracked, for the emergency alert
// ("Are you OK?" countdown, then a pretend emergency call - TrackerPage.tsx).
// A rough guess from the shape and movement of their box only: good enough for a staged
// demo, not a medical device. No camera code here, so it can be tested.

import { EMERGENCY } from "./config.ts";
import type { Box } from "./geometry.ts";

export type EmergencyKind = "fall" | "seizure";

/** How upright a box is in real pixels (height / width). `aspect` = picture width / height. */
export function uprightness(b: Box, aspect: number): number {
  return b.h / b.w / aspect;
}

/** Which edges of the picture cut the box off (then it isn't the person's real shape or size). */
export function cutOff(b: Box): { top: boolean; bottom: boolean; sides: boolean } {
  const m = EMERGENCY.edgeMargin;
  return { top: b.y < m, bottom: b.y + b.h > 1 - m, sides: b.x < m || b.x + b.w > 1 - m };
}

export class EmergencyWatch {
  private lastStanding = -Infinity;
  private lyingSince: number | null = null;
  private upSince: number | null = null;
  private armed = true;
  private trail: { t: number; v: number[] }[] = [];
  /** What the tracked person seems to be doing, for the screen (null when not seen). */
  posture: "standing" | "sitting" | "lying" | null = null;

  /** Start over (a new person tapped, or the alert switched off and on). */
  reset(): void {
    this.lastStanding = -Infinity;
    this.lyingSince = null;
    this.upSince = null;
    this.armed = true;
    this.trail = [];
  }

  /**
   * Once per frame, with the tracked person's box (null while they're not seen). Returns
   * "fall" or "seizure" once when it happens, then nothing until they've been up again.
   */
  update(t: number, box: Box | null, aspect: number): EmergencyKind | null {
    if (!box) {
      this.posture = null;
      this.trail = []; // shaking needs an unbroken view; lying time keeps counting
      return null;
    }
    const u = uprightness(box, aspect);
    // Cut off at the top or bottom only makes a box look shorter, so a tall one is standing for sure.
    if (u >= EMERGENCY.standing) this.lastStanding = t;
    const cut = cutOff(box);
    // Lying is only judged on a whole box of normal size. Cut off at the top or bottom, or right
    // up close, the box looks short and wide whatever the person is doing; someone on the floor
    // is never cut off at the top or this big. Such frames count as "not seen properly": the
    // lying time and the rest keep going, but nothing new starts.
    if (cut.top || cut.bottom || box.w * box.h > EMERGENCY.maxLyingArea) {
      this.posture = u >= EMERGENCY.standing ? "standing" : null;
      this.trail = [];
      return null;
    }
    this.posture = u >= EMERGENCY.standing ? "standing" : u < EMERGENCY.lying ? "lying" : "sitting";
    if (u < EMERGENCY.lying) {
      this.lyingSince ??= t;
      this.upSince = null;
    } else {
      this.lyingSince = null;
      this.upSince ??= t;
      if (!this.armed && t - this.upSince >= EMERGENCY.rearmMs) this.armed = true;
    }

    // The box's width and height, for spotting shaking (a shaking camera moves the box without
    // resizing it), and its middle, to tell shaking in place from moving about. Only while lying,
    // in full view: getting up or lying down, and a side of the picture cutting the box, change
    // its size without any shaking.
    if (u < EMERGENCY.lying && !cut.sides) {
      this.trail.push({ t, v: [box.w, box.h, box.x + box.w / 2, box.y + box.h / 2] });
      while (this.trail.length && t - this.trail[0].t > EMERGENCY.shakeWindowMs) this.trail.shift();
    } else {
      this.trail = [];
    }

    if (!this.armed || this.lyingSince === null) return null;
    if (this.shaking()) {
      this.armed = false;
      return "seizure";
    }
    const fell = this.lyingSince - this.lastStanding <= EMERGENCY.fallWithinMs;
    if (fell && t - this.lyingSince >= EMERGENCY.lyingMs) {
      this.armed = false;
      return "fall";
    }
    return null;
  }

  /**
   * Rapid back-and-forth: the box's width or height swings up and down many times, each swing
   * (from one peak to the next) a clear part of the person's size. Smaller wiggles, like the
   * detector's own wobble, never count, however often they happen.
   */
  private shaking(): boolean {
    const tr = this.trail;
    if (tr.length < 6 || tr[tr.length - 1].t - tr[0].t < EMERGENCY.shakeWindowMs * 0.8) return false;
    const size = tr.reduce((s, p) => s + Math.max(p.v[0], p.v[1]), 0) / tr.length;
    // Moving about, not shaking in place: the middle of the box wandered too far.
    for (const k of [2, 3]) {
      const values = tr.map((p) => p.v[k]);
      if (Math.max(...values) - Math.min(...values) > EMERGENCY.shakeMaxDrift * size) return false;
    }
    const swing = EMERGENCY.shakeSwing * size;
    let most = 0;
    for (let k = 0; k < 2; k++) {
      let flips = 0;
      let dir = 0; // +1 rising, -1 falling, 0 not started
      let peak = tr[0].v[k];
      let lo = peak;
      let hi = peak;
      for (let i = 1; i < tr.length; i++) {
        const x = tr[i].v[k];
        if (dir === 0) {
          // Not moving yet: start once the size has spanned a full swing (up or down from anywhere
          // it has been, not only from the first frame, which may be the middle of a shake).
          lo = Math.min(lo, x);
          hi = Math.max(hi, x);
          if (hi - lo >= swing) {
            dir = x === hi ? 1 : -1;
            peak = x;
          }
        } else if ((x - peak) * dir > 0) {
          peak = x; // still going the same way: a new peak
        } else if (Math.abs(x - peak) >= swing) {
          flips++; // turned back by a clear swing
          dir = -dir;
          peak = x;
        }
      }
      most = Math.max(most, flips);
    }
    return most >= EMERGENCY.shakeFlips;
  }
}
