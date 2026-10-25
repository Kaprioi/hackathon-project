// A "look" is a fingerprint of someone's clothes: which colours their top and
// their trousers are made of. It's how the tracker tells you apart from other
// people (and from coats, chairs and doors), and how it recognises you when you
// come back into view.
//
// Each pixel is sorted into colour "bins": 16 slices of the colour wheel, each
// split into dark and light, plus 5 greys from black to white. Pixels near a
// boundary are shared between the neighbouring bins, so a small lighting change
// doesn't flip a colour into a different bin.

import type { Box } from "./geometry.ts";
import { clamp } from "./geometry.ts";

/** A picture as raw pixels: 4 numbers (red, green, blue, alpha) per pixel. Matches the browser's ImageData. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * Colour amounts for the upper body, then the lower body. For someone lying down it holds two
 * such readings, one for each way round (we can't tell which end their head is).
 */
export type Look = Float32Array;

const HUES = 16; // colour wheel slices (22.5 degrees each)
const COLOUR_BINS = HUES * 2; // each slice in dark and light
const GREYS = 5; // black ... white
const BINS = COLOUR_BINS + GREYS;
const UPPER_WEIGHT = 0.6; // the top matters more: it's bigger and rarely hidden by furniture
const READING = BINS * 2; // one reading: upper body, then lower body
/**
 * A box flatter than this (height / width in real pixels) is someone lying down: their top and
 * trousers are side by side, not one above the other. (Someone crouching or sitting is taller.)
 */
const LYING = 0.75;

/** How much of a pixel counts as "colour" rather than "grey", from its saturation. */
function colourShare(sat: number, v: number): number {
  if (v < 0.12) return 0; // too dark to tell the colour
  return clamp((sat - 0.15) / 0.15, 0, 1); // grey below 0.15, fully coloured above 0.30
}

function hueOf(r: number, g: number, b: number, max: number, min: number): number {
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Adds `weight` of one pixel to the bins. */
function addPixel(r: number, g: number, b: number, weight: number, out: Float32Array, offset: number): void {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const sat = max === 0 ? 0 : (max - min) / max;
  const colour = colourShare(sat, v) * weight;
  const grey = weight - colour;

  if (colour > 0) {
    // Share between the two nearest hue slices...
    const pos = (hueOf(r, g, b, max, min) / 360) * HUES;
    const h0 = Math.floor(pos) % HUES;
    const h1 = (h0 + 1) % HUES;
    const toNext = pos - Math.floor(pos);
    // ...and between dark and light (fully dark below 0.35, fully light above 0.65).
    const light = clamp((v - 0.35) / 0.3, 0, 1);
    out[offset + h0 * 2] += colour * (1 - toNext) * (1 - light);
    out[offset + h0 * 2 + 1] += colour * (1 - toNext) * light;
    out[offset + h1 * 2] += colour * toNext * (1 - light);
    out[offset + h1 * 2 + 1] += colour * toNext * light;
  }
  if (grey > 0) {
    const pos = v * (GREYS - 1);
    const g0 = Math.min(GREYS - 1, Math.floor(pos));
    const g1 = Math.min(GREYS - 1, g0 + 1);
    const toNext = pos - g0;
    out[offset + COLOUR_BINS + g0] += grey * (1 - toNext);
    out[offset + COLOUR_BINS + g1] += grey * toNext;
  }
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
  const px1 = Math.min(W, Math.ceil(clamp(x1, 0, 1) * W));
  const py0 = Math.floor(clamp(y0, 0, 1) * H);
  const py1 = Math.min(H, Math.ceil(clamp(y1, 0, 1) * H));
  if (px1 - px0 < 2 || py1 - py0 < 2) return false;

  const step = Math.max(1, Math.floor(Math.sqrt(((px1 - px0) * (py1 - py0)) / 600))); // about 600 pixels
  let n = 0;
  for (let y = py0; y < py1; y += step) {
    for (let x = px0; x < px1; x += step) {
      const i = (y * W + x) * 4;
      addPixel(img.data[i], img.data[i + 1], img.data[i + 2], 1, out, offset);
      n++;
    }
  }
  for (let k = 0; k < BINS; k++) out[offset + k] /= n;
  return true;
}

/** The look of the person inside `box`, or null if the box is too small to tell. */
export function lookOf(img: RgbaImage, box: Box): Look | null {
  if ((box.h * img.height) / (box.w * img.width) < LYING) return lyingLook(img, box);
  const out = new Float32Array(READING);
  // Stay in the middle half of the box, so the background beside the person counts less.
  const left = box.x + box.w * 0.25;
  const right = box.x + box.w * 0.75;
  const upper = addRegion(img, left, box.y + box.h * 0.18, right, box.y + box.h * 0.5, out, 0);
  const lower = addRegion(img, left, box.y + box.h * 0.55, right, box.y + box.h * 0.9, out, BINS);
  if (!upper || !lower) return null;
  return out;
}

/**
 * Someone lying down: the left and right parts of the box (staying in its middle half, top to
 * bottom). Read both ways round: head on the left (left = upper body), and head on the right.
 */
function lyingLook(img: RgbaImage, box: Box): Look | null {
  const top = box.y + box.h * 0.25;
  const bottom = box.y + box.h * 0.75;
  const left = new Float32Array(BINS);
  const right = new Float32Array(BINS);
  if (!addRegion(img, box.x + box.w * 0.15, top, box.x + box.w * 0.48, bottom, left, 0)) return null;
  if (!addRegion(img, box.x + box.w * 0.52, top, box.x + box.w * 0.85, bottom, right, 0)) return null;
  const out = new Float32Array(READING * 2);
  out.set(left, 0);
  out.set(right, BINS);
  out.set(right, READING);
  out.set(left, READING + BINS);
  return out;
}

/** The readings in a look: one, or two for someone lying down. */
function readings(l: Look): Look[] {
  return l.length > READING ? [l.subarray(0, READING), l.subarray(READING)] : [l];
}

/** 0 = identical colours, 1 = nothing in common. Same person between frames: usually well under 0.3. */
export function lookDistance(a: Look, b: Look): number {
  let best = Infinity;
  for (const x of readings(a)) for (const y of readings(b)) best = Math.min(best, readingDistance(x, y));
  return best;
}

function readingDistance(a: Look, b: Look): number {
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
  if (saved.length !== fresh.length) return saved; // standing and lying down: not comparable bin by bin
  const out = new Float32Array(saved.length);
  for (let k = 0; k < saved.length; k++) out[k] = saved[k] * (1 - amount) + fresh[k] * amount;
  return out;
}
