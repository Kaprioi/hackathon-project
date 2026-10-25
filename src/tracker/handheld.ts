// Tells the tracking brain when the phone itself turns, for testing by hand without the
// stand. The brain normally learns where the camera points from the stand's motors;
// without them it assumes the camera stands still, so turning the phone looks like
// everyone in the room moving at once, and it can lose the person or pick someone else.
// This reads the phone's gyroscope instead and keeps a pretend "camera angle".

import type { Turn } from "./orientation.ts";

/**
 * The gyroscope's turning speed (degrees per second) around the phone's own axes, as browsers
 * report it (DeviceMotionEvent.rotationRate). Browsers use alpha/beta/gamma for the x/y/z axes
 * in that order. The first version of this file read them in the order of the older spec
 * wording (alpha = z), which mixed up turning with tipping and twisting on Apple's phone.
 */
export interface Rotation {
  /** Around the axis to the phone's right (tipping the top toward or away from you). */
  alpha: number | null;
  /** Around the axis to the phone's top (turning it left or right while upright). */
  beta: number | null;
  /** Around the axis out of the screen (twisting it like a steering wheel): not needed here. */
  gamma: number | null;
}

/**
 * How far the camera's view turned in `seconds`, in the upright picture the AI sees:
 * `right` = degrees it turned toward the picture's right, `down` = toward its bottom.
 * `screenAngle` is screen.orientation.angle (the camera picture follows the screen),
 * `front` = the screen-side camera, `turn` = how the picture is turned for the AI.
 */
export function viewTurn(
  rate: Rotation,
  seconds: number,
  screenAngle: number,
  front: boolean,
  turn: Turn,
): { right: number; down: number } {
  const wx = (rate.alpha ?? 0) * seconds; // around the phone's right-hand axis
  const wy = (rate.beta ?? 0) * seconds; // around the phone's top axis
  // The same turns measured around the screen's right and up axes (the screen may be sideways).
  const screen = (((Math.round(screenAngle / 90) * 90) % 360) + 360) % 360;
  const [aroundRight, aroundUp] =
    screen === 90 ? [-wy, wx] : screen === 180 ? [-wx, -wy] : screen === 270 ? [wy, -wx] : [wx, wy];
  // How the room slides across the camera's picture: turning around the up axis slides it
  // sideways (the same way for both cameras); tipping slides it up or down, opposite ways
  // for the front and back camera because they face opposite ways.
  const slideX = aroundUp;
  const slideY = front ? -aroundRight : aroundRight;
  // Into the upright picture, the same way orientation.ts turns points.
  const [slideRight, slideDown] =
    turn === 90 ? [slideY, -slideX] : turn === 180 ? [-slideX, -slideY] : turn === 270 ? [-slideY, slideX] : [slideX, slideY];
  // The room slides one way when the camera turns the other.
  return { right: -slideRight, down: -slideDown };
}

/** Remembers the pretend camera angle over the last second, so a frame can look up where it pointed. */
export class HandheldCamera {
  private history: { t: number; pan: number; tilt: number }[] = [];
  pan = 90;
  tilt = 90;

  reset(): void {
    this.pan = 90;
    this.tilt = 90;
    this.history = [];
  }

  /** Has the gyroscope said anything yet? (Not on PCs, or on iPhones without permission.) */
  get active(): boolean {
    return this.history.length > 0;
  }

  move(t: number, dPan: number, dTilt: number): void {
    this.pan += dPan;
    this.tilt += dTilt;
    this.history.push({ t, pan: this.pan, tilt: this.tilt });
    while (this.history.length > 2 && t - this.history[0].t > 1000) this.history.shift();
  }

  /** Where the pretend camera pointed at time `t` (the latest reading at or before it). */
  at(t: number): { pan: number; tilt: number } {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].t <= t) return { pan: this.history[i].pan, tilt: this.history[i].tilt };
    }
    const first = this.history[0];
    return first ? { pan: first.pan, tilt: first.tilt } : { pan: 90, tilt: 90 };
  }
}
