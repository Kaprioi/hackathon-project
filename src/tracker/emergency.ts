// Spots a likely fall or seizure of the person being tracked, for the emergency alert
// ("Are you OK?" countdown, then a pretend emergency call - TrackerPage.tsx).
// A rough guess from the shape and movement of their box only: good enough for a staged
// demo, not a medical device. No camera code here, so it can be tested.

import { EMERGENCY } from "./config.ts";
import type { Box } from "./geometry.ts";

export type EmergencyKind = "fall" | "seizure";

/** What the tracked person seems to be doing. "cut off" = partly out of the picture, so we can't tell. */
export type Posture = "standing" | "sitting" | "lying" | "cut off";

/** How upright a box is in real pixels (height / width). `aspect` = picture width / height. */
export function uprightness(b: Box, aspect: number): number {
  return b.h / b.w / aspect;
}

/**
 * True when the box touches an edge of the picture: part of the person is out of view, so the
 * box isn't their real shape. Someone sitting close to the stand (legs below the picture) or
 * leaning out of it gets a short, wide box that looks like lying down.
 */
export function cutOff(b: Box): boolean {
  const m = EMERGENCY.edgeMargin;
  return b.x < m || b.y < m || b.x + b.w > 1 - m || b.y + b.h > 1 - m;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export class EmergencyWatch {
  private lastStanding = -Infinity;
  /** The person's box the last time they were seen standing (whole, camera level). */
  private standBox: Box | null = null;
  private standingSince: number | null = null;
  private lyingSince: number | null = null;
  /** How far the top of the box has come down since they last stood (share of their standing height). */
  private drop = 0;
  private armed = true;
  private alertT = -Infinity;
  /** The last second of uprightness values, for a steady posture (the detector's box jumps about). */
  private recent: { t: number; u: number }[] = [];
  private trail: { t: number; v: number[] }[] = [];
  /** What the tracked person seems to be doing, for the screen (null when not seen). */
  posture: Posture | null = null;

  /** Start over (a new person tapped, or the alert switched off and on). */
  reset(): void {
    this.lastStanding = -Infinity;
    this.standBox = null;
    this.standingSince = null;
    this.lyingSince = null;
    this.drop = 0;
    this.armed = true;
    this.alertT = -Infinity;
    this.recent = [];
    this.trail = [];
  }

  /**
   * Once per frame, with the tracked person's box (null while they're not seen). `tiltShift` is
   * how far the picture has slid up (share of its height) because the camera looks down: box
   * positions are compared as if the camera were level, so the stand following someone down to
   * the floor doesn't hide how far they dropped. Returns "fall" or "seizure" once when it
   * happens, then nothing until they've clearly stood up again (or a while has passed).
   */
  update(t: number, box: Box | null, aspect: number, tiltShift = 0): EmergencyKind | null {
    if (!this.armed && t - this.alertT >= EMERGENCY.cooldownMs) this.armed = true;
    if (!box) {
      this.posture = null;
      this.trail = []; // shaking needs an unbroken view; lying time keeps counting
      return null;
    }
    const u = uprightness(box, aspect);
    if (cutOff(box)) {
      // Not the person's real shape: nothing new starts. A box that doesn't look flat even so
      // isn't lying (being cut off only makes it look shorter or narrower), so they're up.
      this.posture = "cut off";
      this.trail = [];
      this.standingSince = null;
      if (u >= EMERGENCY.lying) this.lyingSince = null;
      return null;
    }

    // The posture from the middle value of the last second, so one odd frame changes nothing.
    this.recent.push({ t, u });
    while (t - this.recent[0].t > EMERGENCY.smoothMs) this.recent.shift();
    const su = median(this.recent.map((r) => r.u));
    this.posture = su >= EMERGENCY.standing ? "standing" : su < EMERGENCY.lying ? "lying" : "sitting";
    const level = { ...box, y: box.y + tiltShift };

    if (this.posture === "standing") {
      this.lastStanding = t;
      // (Only a box that is itself tall: for half a second after they go down, the middle value still says standing.)
      if (u >= EMERGENCY.standing) this.standBox = level;
      this.standingSince ??= t;
      // Clearly up again after an alert: watch again.
      if (!this.armed && t - this.standingSince >= EMERGENCY.rearmMs) this.armed = true;
    } else {
      this.standingSince = null;
    }
    if (this.posture === "lying") {
      if (this.lyingSince === null) {
        this.lyingSince = t;
        this.drop = 0;
      }
      if (this.standBox) this.drop = Math.max(this.drop, (level.y - this.standBox.y) / this.standBox.h);
    } else {
      this.lyingSince = null;
    }

    // The box's width and height, for spotting shaking (a shaking camera moves the box without
    // resizing it), and its middle, to tell shaking in place from moving about. Only while really flat: someone sitting at a
    // table with their elbows out is nearly as wide, and their arms resize the box all the time.
    if (this.posture === "lying" && su < EMERGENCY.flat) {
      this.trail.push({ t, v: [box.w, box.h, box.x + box.w / 2, box.y + box.h / 2] });
      while (this.trail.length && t - this.trail[0].t > EMERGENCY.shakeWindowMs) this.trail.shift();
    } else {
      this.trail = [];
    }

    if (!this.armed || this.lyingSince === null) return null;
    if (this.shaking()) return this.alert(t, "seizure");
    // A fall: standing a moment ago, lying down for a while since, and the top of the box came
    // most of the way down to the floor. Sitting down, even at a table, only lowers it a bit.
    const fell = this.lyingSince - this.lastStanding <= EMERGENCY.fallWithinMs && this.drop >= EMERGENCY.fallDrop;
    if (fell && t - this.lyingSince >= EMERGENCY.lyingMs) return this.alert(t, "fall");
    return null;
  }

  private alert(t: number, kind: EmergencyKind): EmergencyKind {
    this.armed = false;
    this.alertT = t;
    return kind;
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
    // Moving about (crawling, rolling over), not shaking in place: the middle of the box wandered too far.
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
      for (let i = 1; i < tr.length; i++) {
        const x = tr[i].v[k];
        if (dir === 0) {
          // Not moving yet: start once the size has gone a full swing away from where it began.
          if (Math.abs(x - peak) >= swing) {
            dir = Math.sign(x - peak);
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
