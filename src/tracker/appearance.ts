// A "look" is a fingerprint of someone's clothes: which colours their top and
// their trousers are made of. It's how the tracker tells you apart from other
// people, and how it recognises you when you come back into view.

import type { Box } from "./geometry.ts";
import { clamp } from "./geometry.ts";

/** A picture as raw pixels: 4 numbers (red, green, blue, alpha) per pixel. Matches the browser's ImageData. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** Colour counts for the upper body, then the lower body. */
export type Look = Float32Array;

const HUES = 12; // colour wheel slices
const BINS = HUES * 2 + 4; // each hue in "soft" and "strong", plus black and 3 greys
const UPPER_WEIGHT = 0.6; // the top matters more: it's bigger and rarely hidden by furniture

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Counts the colours in one rectangle of the image. Returns false if the rectangle is too small. */
function addRegion(
  img: RgbaImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  out: Float32Array,
  offset: number,
): boolean {
  const W = img.width;
  const H = img.height;
  const px0 = Math.floor(clamp(x0, 0, 1) * W);
  const px1 = Math.ceil(clamp(x1, 0, 1) * W);
  const py0 = Math.floor(clamp(y0, 0, 1) * H);
  const py1 = Math.ceil(clamp(y1, 0, 1) * H);
  const pixels = (px1 - px0) * (py1 - py0);
  if (px1 - px0 < 2 || py1 - py0 < 2) return false;

  const step = Math.max(1, Math.floor(Math.sqrt(pixels / 500))); // look at about 500 pixels
  let n = 0;
  for (let y = py0; y < py1; y += step) {
    for (let x = px0; x < px1; x += step) {
      const i = (y * W + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const v = max / 255;
      const sat = max === 0 ? 0 : (max - min) / max;
      let bin: number;
      if (v < 0.18) {
        bin = HUES * 2; // black
      } else if (sat < 0.22) {
        bin = HUES * 2 + 1 + Math.min(2, Math.floor(((v - 0.18) / 0.82) * 3)); // dark grey, grey, white
      } else {
        const slice = Math.floor((hueOf(r, g, b, max, min) / 360) * HUES) % HUES;
        bin = slice + (sat > 0.55 ? HUES : 0);
      }
      out[offset + bin] += 1;
      n++;
    }
  }
  for (let k = 0; k < BINS; k++) out[offset + k] /= n;
  return true;
}

/** The look of the person inside `box`, or null if the box is too small to tell. */
export function lookOf(img: RgbaImage, box: Box): Look | null {
  const out = new Float32Array(BINS * 2);
  // Stay in the middle half of the box, so the background beside the person counts less.
  const left = box.x + box.w * 0.25;
  const right = box.x + box.w * 0.75;
  const upper = addRegion(img, left, box.y + box.h * 0.18, right, box.y + box.h * 0.5, out, 0);
  const lower = addRegion(img, left, box.y + box.h * 0.55, right, box.y + box.h * 0.9, out, BINS);
  if (!upper || !lower) return null;
  return out;
}

/** 0 = identical colours, 1 = nothing in common. Same person between frames: usually under 0.3. */
export function lookDistance(a: Look, b: Look): number {
  let upper = 0;
  let lower = 0;
  for (let k = 0; k < BINS; k++) {
    upper += Math.sqrt(a[k] * b[k]);
    lower += Math.sqrt(a[BINS + k] * b[BINS + k]);
  }
  const du = Math.sqrt(Math.max(0, 1 - upper));
  const dl = Math.sqrt(Math.max(0, 1 - lower));
  return UPPER_WEIGHT * du + (1 - UPPER_WEIGHT) * dl;
}

/** Mixes a little of a new look into the saved one, so it slowly adapts to lighting. */
export function blendLook(saved: Look, fresh: Look, amount: number): Look {
  const out = new Float32Array(saved.length);
  for (let k = 0; k < saved.length; k++) out[k] = saved[k] * (1 - amount) + fresh[k] * amount;
  return out;
}
