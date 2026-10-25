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
//   - a flip that ends with the camera at an aim at the end of the range within UNDO_MS is
//     taken back (a wrong flip sends the stand running to the end and keeps it there), unless
//     a check on the way showed the stand turning the right way (then the person really is up
//     or down there);
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
/** A flip that ends with the camera at the end of the up/down range within this long (ms) is taken back. */
const UNDO_MS = 2000;

/** True when `tilt` is at the end of the small up/down range (TILT.range from level), where the stand stops. */
export function atTiltLimit(tilt: number): boolean {
  return Math.abs(tilt - TILT.level) >= TILT.range - 0.01;
}

export class TiltCheck {
  private start: { t: number; tilt: number; y: number; stand: number | null } | null = null;
  private strikes = 0;
  /** When it last flipped up/down by itself (null: not in the last UNDO_MS). */
  private flippedAt: number | null = null;
  /** Since that flip, a check showed the stand turning the right way (so the flip was right). */
  private rightSinceFlip = false;

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
    if (ratio < 0) this.rightSinceFlip = true;
    this.strikes = ratio > WRONG_RATIO ? this.strikes + 1 : 0;
    if (this.strikes < STRIKES) return false;
    this.strikes = 0;
    return true;
  }

  /** Up/down was flipped by itself at time `t` (after update() said so). */
  flipped(t: number): void {
    this.flippedAt = t;
    this.rightSinceFlip = false;
    this.start = null;
    this.strikes = 0;
  }

  /**
   * One frame. `aimTilt`: where the stand is told to point up/down (null: nowhere); `tilt`:
   * where the camera points. Returns true when the flip from the last UNDO_MS should be taken
   * back: the camera has gone all the way to an aim at the end of the up/down range, and no
   * check on the way there showed it turning the right way.
   */
  shouldUndo(t: number, aimTilt: number | null, tilt: number): boolean {
    if (this.flippedAt === null) return false;
    if (t - this.flippedAt > UNDO_MS) {
      this.flippedAt = null;
      return false;
    }
    if (aimTilt === null || !atTiltLimit(aimTilt) || Math.abs(tilt - aimTilt) >= 1 || this.rightSinceFlip) return false;
    this.flippedAt = null;
    this.start = null;
    this.strikes = 0;
    return true;
  }

  /** Starts the check over (a new target). A flip from the last UNDO_MS can still be taken back. */
  reset(): void {
    this.start = null;
    this.strikes = 0;
  }
}
