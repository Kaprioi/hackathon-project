// Small helpers for boxes and angles.

/** A box in the camera image. 0-1 on both axes, measured from the top-left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A direction for the stand to point, in servo degrees. */
export interface Angles {
  pan: number;
  tilt: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function area(b: Box): number {
  return b.w * b.h;
}

export function centerX(b: Box): number {
  return b.x + b.w / 2;
}

export function centerY(b: Box): number {
  return b.y + b.h / 2;
}

export function contains(b: Box, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** How much two boxes overlap: 0 = not at all, 1 = the same box. */
export function iou(a: Box, b: Box): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  const shared = (x1 - x0) * (y1 - y0);
  return shared / (area(a) + area(b) - shared);
}

/** Keeps a box inside the image. */
export function clampBox(b: Box): Box {
  const w = clamp(b.w, 0.01, 1);
  const h = clamp(b.h, 0.01, 1);
  return { x: clamp(b.x, 0, 1 - w), y: clamp(b.y, 0, 1 - h), w, h };
}
