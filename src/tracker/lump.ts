// Follows a blanket, box or other cover after someone hides under it.
//
// When you vanish under a blanket the person detector can't see you any more,
// but the lump is still there. This remembers what the lump looked like (a small
// grey picture of it) and, each frame, finds the spot nearby that looks most like
// it. So if you crawl across the floor under the blanket, the stand follows.

import type { Box } from "./geometry.ts";
import { clampBox } from "./geometry.ts";
import type { RgbaImage } from "./appearance.ts";

/** A black-and-white picture, one brightness number per pixel. */
export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

/** Shrinks a colour picture to `width` pixels wide and drops the colour. */
export function toGray(img: RgbaImage, width = 160): GrayImage {
  const scale = img.width / width;
  const height = Math.max(1, Math.round(img.height / scale));
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y * scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x * scale));
      const i = (sy * img.width + sx) * 4;
      data[y * width + x] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    }
  }
  return { width, height, data };
}

const TEMPLATE_SIDE = 20; // the remembered picture is at most 20 x 20 pixels
const SEARCH_RADIUS = 12; // look up to 12 pixels away each frame (in the 160-wide picture)

/**
 * Copies the part of `g` inside `box` into `out` (tw x th pixels), then rescales it
 * so its average is 0 and its total size is 1. That makes the comparison ignore
 * overall brightness changes.
 */
function samplePatch(g: GrayImage, box: Box, tw: number, th: number, out: Float32Array): void {
  let sum = 0;
  for (let y = 0; y < th; y++) {
    const sy = Math.min(g.height - 1, Math.max(0, Math.floor((box.y + ((y + 0.5) / th) * box.h) * g.height)));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(g.width - 1, Math.max(0, Math.floor((box.x + ((x + 0.5) / tw) * box.w) * g.width)));
      const v = g.data[sy * g.width + sx];
      out[y * tw + x] = v;
      sum += v;
    }
  }
  const mean = sum / (tw * th);
  let norm = 0;
  for (let k = 0; k < tw * th; k++) {
    out[k] -= mean;
    norm += out[k] * out[k];
  }
  norm = Math.sqrt(norm);
  if (norm < 1e-3) {
    out.fill(0); // a completely flat patch: nothing to match on
    return;
  }
  for (let k = 0; k < tw * th; k++) out[k] /= norm;
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k] * b[k];
  return s;
}

export class LumpTracker {
  active = false;
  box: Box = { x: 0, y: 0, w: 0, h: 0 };
  private tw = 0;
  private th = 0;
  private template = new Float32Array(0);
  private scratch = new Float32Array(0);

  /** Remember what's inside `box` right now. */
  start(g: GrayImage, box: Box): void {
    this.box = clampBox(box);
    const bw = this.box.w * g.width;
    const bh = this.box.h * g.height;
    const shrink = Math.min(1, TEMPLATE_SIDE / Math.max(bw, bh));
    this.tw = Math.max(4, Math.round(bw * shrink));
    this.th = Math.max(4, Math.round(bh * shrink));
    this.template = new Float32Array(this.tw * this.th);
    this.scratch = new Float32Array(this.tw * this.th);
    samplePatch(g, this.box, this.tw, this.th, this.template);
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  /**
   * Finds the lump in the new frame. `shiftX`/`shiftY` say how far the picture is
   * expected to slide because the camera itself turned (fraction of the frame).
   * Returns where the lump is and how sure we are (1 = perfect match).
   */
  update(g: GrayImage, shiftX = 0, shiftY = 0): { box: Box; score: number } | null {
    if (!this.active) return null;
    const base = clampBox({ ...this.box, x: this.box.x + shiftX, y: this.box.y + shiftY });
    const px = 1 / g.width;
    const py = 1 / g.height;

    const tryAt = (dx: number, dy: number): number => {
      const candidate = { ...base, x: base.x + dx * px, y: base.y + dy * py };
      samplePatch(g, candidate, this.tw, this.th, this.scratch);
      return dot(this.template, this.scratch);
    };

    // Coarse search every 2 pixels, then check the 8 neighbours of the best spot.
    let bestX = 0;
    let bestY = 0;
    let best = -Infinity;
    for (let dy = -SEARCH_RADIUS; dy <= SEARCH_RADIUS; dy += 2) {
      for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx += 2) {
        const s = tryAt(dx, dy);
        if (s > best) {
          best = s;
          bestX = dx;
          bestY = dy;
        }
      }
    }
    const cx = bestX;
    const cy = bestY;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const s = tryAt(cx + dx, cy + dy);
        if (s > best) {
          best = s;
          bestX = cx + dx;
          bestY = cy + dy;
        }
      }
    }

    const found = clampBox({ ...base, x: base.x + bestX * px, y: base.y + bestY * py });
    if (best > 0.6) {
      // Good match: move there, and let the remembered picture adapt a little.
      this.box = found;
      samplePatch(g, found, this.tw, this.th, this.scratch);
      let norm = 0;
      for (let k = 0; k < this.template.length; k++) {
        this.template[k] = 0.9 * this.template[k] + 0.1 * this.scratch[k];
        norm += this.template[k] * this.template[k];
      }
      norm = Math.sqrt(norm) || 1;
      for (let k = 0; k < this.template.length; k++) this.template[k] /= norm;
    } else {
      this.box = base; // unsure: stay put, but keep up with the camera's own turning
    }
    return { box: this.box, score: best };
  }
}
