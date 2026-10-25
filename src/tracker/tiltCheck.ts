// Notices when the up/down motor turns the wrong way for this stand.
//
// The page doesn't know which way round the tilt servo is mounted. If it's the wrong way,
// the stand tilts away from you instead of toward you, faster and faster, until it hits its
// end stop. That's easy to spot: when the camera tilts toward you, you should move toward the
// middle of the picture. If you instead move away from the middle about as far as the camera
// tilted, twice in a row, up/down is the wrong way round (the brain then flips it).
//
// Someone moving up or down quickly can look like that for a moment (the camera lags behind
// them), but not for two stretches in a row: by the second one the camera has caught up.
//
// A wrong flip must never stick. Up/down only looks TILT.range either side of level, and at
// the end of that range the camera can't tilt any further, so there's nothing left to check:
// a wrong flip there used to stay for good (and was saved). So now:
//   - no check once the camera has tilted all the way to an aim at the end of the range;
//   - a flip is taken back only when the camera then sits at an aim at the end of the range
//     and, for UNDO_EVIDENCE_MS in a row, you're clearly further from the middle of the picture
//     (up/down) than when it flipped (going by where it last saw you): a wrong flip sends the
//     stand running away from you to the end and keeps it there. Otherwise (you're as close
//     to the middle or closer, or it can't tell within UNDO_MS) the flip stays: a motor
//     mounted the other way round, with you really up or down there;
//   - the page doesn't save these flips, so a reload starts from the Settings choice (Flip
//     up/down) again.

import { TILT } from "./config.ts";

/** Each check covers this much tilting (degrees). */
const CHECK_DEG = 5;
/** A check counts as "wrong way" when you moved away at least this much of how far the camera tilted. */
const WRONG_RATIO = 0.6;
/** Wrong way this many checks in a row: flip. */
const STRIKES = 2;
/** A check that takes longer than this (slow drift) starts over. */
const MAX_CHECK_MS = 2000;
/**
 * A check only counts if the stand's own report (SightLine) says it tilted at least this much
 * of what the page's guess says. Less, and it was the guess that was wrong (the stand didn't
 * tilt where it was told), not the motor. (The report comes only 10 times a second and a
 * little late, so it only has to roughly agree.)
 */
const STAND_AGREE = 1 / 3;
/** A flip can only be taken back within this long (ms) after it. */
const UNDO_MS = 3000;
/** Taken back after this long (ms) at the end of the range with you further from the middle all along. */
const UNDO_EVIDENCE_MS = 330;
/** "Further from the middle": by at least this much of the picture's height. */
const UNDO_MARGIN = 0.05;

/** True when `tilt` is at the end of the small up/down range (TILT.range from level), where the stand stops. */
export function atTiltLimit(tilt: number): boolean {
  return Math.abs(tilt - TILT.level) >= TILT.range - 0.01;
}

export class TiltCheck {
  private start: { t: number; tilt: number; y: number; stand: number | null } | null = null;
  private strikes = 0;
  /** When it last flipped up/down by itself (null: not in the last UNDO_MS). */
  private flippedAt: number | null = null;
  /** How far the target was from the middle of the picture (up/down) at that flip. */
  private flippedOff = 0;
  /** Since when the target has been further from the middle, with the camera at the end of the range. */
  private furtherSince: number | null = null;

  /**
   * One camera frame while tracking. `tilt`: where the camera pointed (degrees); `y`: the
   * target's aim point in the picture (0 = top, 1 = bottom); `tiltSign` and `fovV` as in the
   * settings; `smooth`: the same box followed smoothly from the last frame (a jump starts over);
   * `stand`: the tilt the stand itself reports, or null if it doesn't.
   * Returns true when up/down is clearly the wrong way round.
   */
  update(t: number, tilt: number, y: number, tiltSign: number, fovV: number, smooth: boolean, stand: number | null = null): boolean {
    const s = this.start;
    if (!smooth || !s || t - s.t > MAX_CHECK_MS) {
      this.start = { t, tilt, y, stand };
      if (!smooth) this.strikes = 0;
      return false;
    }
    const turned = tilt - s.tilt;
    if (Math.abs(turned) < CHECK_DEG) return false;
    this.start = { t, tilt, y, stand };
    // Did the stand really tilt that far? If it says it hardly moved, the guess was wrong (the
    // stand didn't tilt where it was told), so this stretch says nothing about the motor.
    if (s.stand !== null && stand !== null && (stand - s.stand) * Math.sign(turned) < Math.abs(turned) * STAND_AGREE) return false;
    // The right way round, someone standing still moves by -turned (ratio -1) and someone
    // the camera keeps up with stays put (ratio 0). The wrong way round: about +1.
    const ratio = (tiltSign * (y - s.y) * fovV) / turned;
    this.strikes = ratio > WRONG_RATIO ? this.strikes + 1 : 0;
    if (this.strikes < STRIKES) return false;
    this.strikes = 0;
    return true;
  }

  /** Up/down was flipped by itself at time `t` (after update() said so), with the target at `y`. */
  flipped(t: number, y: number): void {
    this.flippedAt = t;
    this.flippedOff = Math.abs(y - 0.5);
    this.furtherSince = null;
    this.start = null;
    this.strikes = 0;
  }

  /**
   * One camera frame while tracking with the camera at an aim at the end of the up/down range.
   * `y`: where the target's aim point was last seen in the picture, as in update() (someone
   * who ran out of the picture is still as far out as when last seen). Returns true when the
   * flip from the last UNDO_MS should be taken back: for UNDO_EVIDENCE_MS of such frames in a
   * row (notPinned() in between starts over), every one had the target clearly further from
   * the middle than at the flip. Anything less: the flip stays.
   */
  pinned(t: number, y: number): boolean {
    if (this.flippedAt === null) return false;
    if (t - this.flippedAt > UNDO_MS) {
      this.flippedAt = null;
      return false;
    }
    if (Math.abs(y - 0.5) < this.flippedOff + UNDO_MARGIN) {
      this.furtherSince = null;
      return false;
    }
    this.furtherSince ??= t;
    if (t - this.furtherSince < UNDO_EVIDENCE_MS) return false;
    this.flippedAt = null;
    this.start = null;
    this.strikes = 0;
    return true;
  }

  /** One frame without the camera at the end of the range while tracking: the evidence for pinned() starts over. */
  notPinned(): void {
    this.furtherSince = null;
  }

  /** Starts the check over (a new target). A flip from the last UNDO_MS can still be taken back. */
  reset(): void {
    this.start = null;
    this.strikes = 0;
    this.furtherSince = null;
  }
}
