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
  /** Their box the last time it looked standing, to tell how far the top of it dropped since. */
  private standBox: Box | null = null;
  private lyingSince: number | null = null;
  /** Since this lying spell started, the top of their box came most of the way down (a fall, not sitting down). */
  private dropped = false;
  private standingSince: number | null = null;
  private armed = true;
  private alertT = -Infinity;
  private trail: { t: number; v: number[] }[] = [];
  /** What the tracked person seems to be doing, for the screen (null when not seen). */
  posture: "standing" | "sitting" | "lying" | null = null;

  /** Start over (a new person tapped, or the alert switched off and on). */
  reset(): void {
    this.lastStanding = -Infinity;
    this.standBox = null;
    this.lyingSince = null;
    this.dropped = false;
    this.standingSince = null;
    this.armed = true;
    this.alertT = -Infinity;
    this.trail = [];
  }

  /**
   * Once per frame, with the tracked person's box (null while they're not seen). `tiltShift` is
   * how far the picture has slid up (share of its height) because the camera looks down: the
   * drop is measured as if the camera were level, so the stand tilting down to follow someone
   * to the floor doesn't hide how far they fell. Returns "fall" or "seizure" once when it
   * happens, then nothing until they've stood up again (or a while has passed).
   */
  update(t: number, box: Box | null, aspect: number, tiltShift = 0): EmergencyKind | null {
    if (!this.armed && t - this.alertT >= EMERGENCY.cooldownMs) this.armed = true;
    if (!box) {
      this.posture = null;
      this.trail = []; // shaking needs an unbroken view; lying time keeps counting
      return null;
    }
    const u = uprightness(box, aspect);
    // Cut off at the top or bottom only makes a box look shorter, so a tall one is standing for sure.
    const level = { ...box, y: box.y + tiltShift }; // where the box would be with the camera level
    if (u >= EMERGENCY.standing) {
      this.lastStanding = t;
      this.standBox = level;
      // After an alert, watch again only once they've clearly stood up (sitting isn't enough:
      // re-arming after a few seconds of "not lying" set the alert off again and again at a table).
      this.standingSince ??= t;
      if (!this.armed && t - this.standingSince >= EMERGENCY.rearmMs) this.armed = true;
    } else {
      this.standingSince = null;
    }
    const s = this.standBox;
    const drop = s ? (level.y - s.y) / s.h : 0; // how far the top of the box came down, in standing heights
    const cut = cutOff(box);
    // Lying is only judged on a whole box of normal size. Cut off at the top or bottom, or right
    // up close, the box looks short and wide whatever the person is doing; someone on the floor
    // is never cut off at the top or this big. Such frames count as "not seen properly": the
    // lying time and the rest keep going, but nothing new starts.
    // Except after a real drop: a fall usually ends low in the picture, cut off by its bottom edge
    // (the stand only looks a little down), or close to the camera. So a flat box still counts as
    // lying when the top of the box (their head) came most of the way down since they last stood,
    // or when they were already lying. Sitting down close to the camera only drops it about a third.
    if (cut.top || cut.bottom || box.w * box.h > EMERGENCY.maxLyingArea) {
      this.trail = [];
      if (u < EMERGENCY.lying && (drop >= EMERGENCY.fallDrop || this.lyingSince !== null)) {
        this.posture = "lying";
        this.startLying(t, drop);
        return this.fallen(t);
      }
      this.posture = u >= EMERGENCY.standing ? "standing" : null;
      return null;
    }
    this.posture = u >= EMERGENCY.standing ? "standing" : u < EMERGENCY.lying ? "lying" : "sitting";
    if (u < EMERGENCY.lying) this.startLying(t, drop);
    else this.lyingSince = null;

    // The box's width and height, for spotting shaking (a shaking camera moves the box without
    // resizing it), and its middle, to tell shaking in place from moving about. Only while lying,
    // in full view: getting up or lying down, and a side of the picture cutting the box, change
    // its size without any shaking. And only while really flat: someone sitting at a table with
    // their elbows out is nearly as wide as someone lying, and their arms resize the box all the time.
    if (u < EMERGENCY.flat && !cut.sides) {
      this.trail.push({ t, v: [box.w, box.h, box.x + box.w / 2, box.y + box.h / 2] });
      while (this.trail.length && t - this.trail[0].t > EMERGENCY.shakeWindowMs) this.trail.shift();
    } else {
      this.trail = [];
    }

    if (!this.armed || this.lyingSince === null) return null;
    if (this.shaking()) return this.alert(t, "seizure");
    return this.fallen(t);
  }

  /** Lying this frame: the lying time starts (or carries on), and a big enough drop is noted. */
  private startLying(t: number, drop: number): void {
    if (this.lyingSince === null) {
      this.lyingSince = t;
      this.dropped = false;
    }
    if (drop >= EMERGENCY.fallDrop) this.dropped = true;
  }

  /**
   * A fall: standing a moment before they started lying, the top of their box (their head) came
   * most of the way down (sitting down, even at a table with a wide box, only drops it about a
   * third), and still lying a while later.
   */
  private fallen(t: number): EmergencyKind | null {
    if (!this.armed || this.lyingSince === null || !this.dropped) return null;
    const fell = this.lyingSince - this.lastStanding <= EMERGENCY.fallWithinMs;
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
