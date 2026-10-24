// Keeps people upright for the AI when the phone is sideways but the screen didn't
// turn (auto-rotate off). The browser then hands over the camera picture on its side,
// and the person detector, trained on upright people, misses some and lumps others
// together. So the page turns the picture before detection, using the phone's motion
// sensor to know which way is up, and turns the boxes back for the screen.
//
// A "turn" is how far to rotate the camera's picture counterclockwise so the room is
// upright: 0, 90, 180 or 270 degrees. "Upright" coordinates are 0-1 in that picture.

import type { Box } from "./geometry.ts";

export type Turn = 0 | 90 | 180 | 270;

/**
 * Which way the phone is turned, from gravity in the motion sensor (m/s², the phone's
 * own axes: x to its right, y to its top). 0 = upright, 90 = turned left (top
 * pointing left), 180 = upside down, 270 = turned right. Keeps `previous` while the
 * phone lies flat or sits near a diagonal, so it doesn't flicker.
 */
export function deviceTurn(x: number, y: number, previous: Turn | null): Turn | null {
  if (Math.hypot(x, y) < 4) return previous; // lying flat: no clear "up"
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ay > ax * 1.5) return y > 0 ? 0 : 180;
  if (ax > ay * 1.5) return x > 0 ? 90 : 270;
  return previous;
}

/**
 * How far to turn the camera's picture so people stand upright. The browser already
 * turns the picture along with the screen, so it's only on its side when the phone is
 * turned and the screen isn't. `screenAngle` is screen.orientation.angle.
 * Never 180 by itself: some phones report the sensor the other way round, and then a
 * screen that turns correctly would get its picture flipped upside down.
 * The front camera faces the other way, so its sideways picture needs the opposite turn.
 */
export function pictureTurn(device: Turn | null, screenAngle: number, frontCamera = false): Turn {
  if (device === null) return 0;
  const screen = Math.round(screenAngle / 90) * 90;
  const d = (((device - screen) % 360) + 360) % 360;
  if (d !== 90 && d !== 270) return 0;
  return frontCamera ? ((360 - d) as Turn) : d;
}

/** A point in the camera's own picture -> the same spot in the upright picture. */
export function toUpright(x: number, y: number, turn: Turn): { x: number; y: number } {
  switch (turn) {
    case 90:
      return { x: y, y: 1 - x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: 1 - y, y: x };
    default:
      return { x, y };
  }
}

/** A point in the upright picture -> the same spot in the camera's own picture. */
export function fromUpright(x: number, y: number, turn: Turn): { x: number; y: number } {
  switch (turn) {
    case 90:
      return { x: 1 - y, y: x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: y, y: 1 - x };
    default:
      return { x, y };
  }
}

/** A box in the upright picture -> the same box in the camera's own picture. */
export function boxFromUpright(b: Box, turn: Turn): Box {
  const a = fromUpright(b.x, b.y, turn);
  const c = fromUpright(b.x + b.w, b.y + b.h, turn);
  return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), w: Math.abs(c.x - a.x), h: Math.abs(c.y - a.y) };
}

/** The screen's current turn (screen.orientation.angle), or 0 where the browser doesn't say. */
export function screenAngle(): number {
  return typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : 0;
}
