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

/** Each check covers this much tilting (degrees). */
const CHECK_DEG = 5;
/** A check counts as "wrong way" when you moved away at least this much of how far the camera tilted. */
const WRONG_RATIO = 0.6;
/** Wrong way this many checks in a row: flip. */
const STRIKES = 2;
/** A check that takes longer than this (slow drift) starts over. */
const MAX_CHECK_MS = 2000;

export class TiltCheck {
  private start: { t: number; tilt: number; y: number } | null = null;
  private strikes = 0;

  /**
   * One camera frame while tracking. `tilt`: where the camera pointed (degrees); `y`: the
   * target's aim point in the picture (0 = top, 1 = bottom); `tiltSign` and `fovV` as in the
   * settings; `smooth`: the same box followed smoothly from the last frame (a jump starts over).
   * Returns true when up/down is clearly the wrong way round.
   */
  update(t: number, tilt: number, y: number, tiltSign: number, fovV: number, smooth: boolean): boolean {
    const s = this.start;
    if (!smooth || !s || t - s.t > MAX_CHECK_MS) {
      this.start = { t, tilt, y };
      if (!smooth) this.strikes = 0;
      return false;
    }
    const turned = tilt - s.tilt;
    if (Math.abs(turned) < CHECK_DEG) return false;
    // The right way round, someone standing still moves by -turned (ratio -1) and someone
    // the camera keeps up with stays put (ratio 0). The wrong way round: about +1.
    const ratio = (tiltSign * (y - s.y) * fovV) / turned;
    this.start = { t, tilt, y };
    this.strikes = ratio > WRONG_RATIO ? this.strikes + 1 : 0;
    if (this.strikes < STRIKES) return false;
    this.strikes = 0;
    return true;
  }

  reset(): void {
    this.start = null;
    this.strikes = 0;
  }
}
