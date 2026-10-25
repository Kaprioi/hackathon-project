// Face fingerprints, to re-find the person you tapped by their face (when it's visible),
// not only by their clothes. Uses face-api (@vladmandic/face-api), loaded the first time
// it's needed. Fingerprints stay in this page's memory: never saved, never sent.
//
// FaceWatcher decides whose face to read and when, and turns the readings into verdicts
// for the brain ("this person's face is the target's" / "clearly isn't"). It doesn't
// touch the camera or the AI itself, so it can be tested with made-up fingerprints.

import type { BrainOutput } from "./brain.ts";
import { FACE, TUNING } from "./config.ts";
import type { Box } from "./geometry.ts";
import { clamp, iou } from "./geometry.ts";

/** Reads the face of the person in `box` (upright picture, 0-1). Null if no clear face. */
export type ReadFace = (box: Box) => Promise<Float32Array | ReadMiss | null>;

/** Why a face couldn't be read: none found where the head should be, or too small (too far away). */
export type ReadMiss = "none" | "small";

/** A recent face reading, for the number shown on that person's box. */
export interface FaceLabel {
  box: Box;
  t: number;
  /** How different from the saved face (0 = identical), or null for the first one saved. */
  distance: number | null;
}

export interface FaceVerdict {
  /** The person's box when their face was read. */
  box: Box;
  /** True = their face is the target's; false = clearly someone else. */
  same: boolean;
}

/** How different two face fingerprints are (0 = identical). */
export function faceDistance(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export class FaceWatcher {
  private prints: Float32Array[] = [];
  private busy = false;
  private lastStart = -Infinity;
  private lastEnrol = -Infinity;
  private recent: { box: Box; t: number }[] = [];
  private finished: FaceVerdict[] = [];
  private generation = 0; // bumped by forget(), so a reading under way can't touch a new target
  /**
   * The person whose face is being read, followed frame to frame while the reading runs. If
   * it stops being clear who they are (they left, or someone overlapped them), the result is dropped.
   */
  private reading: { box: Box; lost: boolean } | null = null;
  private read: ReadFace;

  constructor(read: ReadFace) {
    this.read = read;
  }

  /** How many fingerprints of the target are saved. */
  /** Recent readings, newest last, for showing each person's face number on screen. */
  labels: FaceLabel[] = [];
  /** Why the last readings found no usable face (cleared by a good one), and when. */
  miss: ReadMiss | null = null;

  get saved(): number {
    return this.prints.length;
  }

  /** A new target (or none): drop everything about the old one. */
  forget(): void {
    this.prints = [];
    this.finished = [];
    this.recent = [];
    this.labels = [];
    this.miss = null;
    this.reading = null;
    this.lastEnrol = -Infinity;
    this.generation++;
  }

  /** Verdicts that finished since the last call, for the brain's next frame. */
  takeVerdicts(): FaceVerdict[] {
    const v = this.finished;
    this.finished = [];
    return v;
  }

  /** Once per frame, after the brain: maybe starts reading one face in the background. */
  step(t: number, people: Box[], out: BrainOutput, matchLimit: number): void {
    const r = this.reading;
    if (r && !r.lost) {
      const hits = people.filter((p) => iou(p, r.box) > TUNING.carryOverlap);
      if (hits.length === 1) r.box = hits[0];
      else r.lost = true;
    }
    if (this.busy || out.mode === "idle" || t - this.lastStart < FACE.everyMs) return;
    this.recent = this.recent.filter((r) => t - r.t < FACE.recheckMs);
    const checkedLately = (b: Box) => this.recent.some((r) => iou(r.box, b) > 0.3);
    const target = out.target;
    const ti = target ? people.findIndex((p) => p === target || iou(p, target) > 0.6) : -1;
    // Not heavily overlapping anyone (the reader picks the face where this person's head
    // should be, so someone standing close is fine; at first this needed no overlap at all,
    // which in a group meant a face was rarely saved).
    const alone = (i: number) => people.every((p, j) => j === i || iou(p, people[i]) < 0.3);
    const colourSure = (i: number) => {
      const d = out.matches[i];
      return d !== null && d !== undefined && d <= matchLimit * 0.8;
    };

    if (out.mode === "tracking" && ti >= 0 && alone(ti) && !checkedLately(people[ti])) {
      // Sure it's them by their clothes: save (or refresh) their face. This also catches a
      // look-alike: a face that clearly isn't the saved one comes back as "not them".
      if (colourSure(ti) && (this.prints.length < FACE.maxPrints || t - this.lastEnrol > FACE.refreshMs)) {
        this.start(t, people[ti], true);
        return;
      }
      // Not sure by their clothes: let their face decide - again every few seconds, even if
      // it said "them" before, so one wrong verdict can't hold the box on the wrong person.
      if (!colourSure(ti) && this.prints.length > 0) {
        this.start(t, people[ti], false);
        return;
      }
    }

    // Lost them, or the clothes don't back up the one we're on: check the others, best colour match first.
    if (this.prints.length === 0) return;
    const unsure = ti < 0 || out.mode !== "tracking" || !colourSure(ti);
    if (!unsure) return;
    const order = people
      .map((p, i) => ({ p, i, d: out.matches[i] ?? Infinity }))
      .filter(({ p, i }) => i !== ti && out.faces[i] === null && !checkedLately(p))
      .sort((a, b) => a.d - b.d);
    if (order.length) this.start(t, order[0].p, false);
  }

  private start(t: number, box: Box, enrol: boolean): void {
    this.busy = true;
    this.lastStart = t;
    this.recent.push({ box, t });
    if (enrol) this.lastEnrol = t;
    const generation = this.generation;
    const reading = { box, lost: false };
    this.reading = reading;
    this.read(box)
      .then((result) => {
        if (generation !== this.generation || reading.lost) return;
        if (!(result instanceof Float32Array)) {
          this.miss = result ?? "none";
          return;
        }
        const print = result;
        this.miss = null;
        box = reading.box; // where that person is now
        const label = (distance: number | null) => {
          this.labels.push({ box, t, distance });
          if (this.labels.length > 8) this.labels.shift();
        };
        if (this.prints.length === 0) {
          if (enrol) {
            this.prints.push(print); // the first fingerprint, while sure it's them
            label(null);
          }
          return;
        }
        const d = Math.min(...this.prints.map((p) => faceDistance(p, print)));
        label(d);
        if (d <= FACE.same) {
          this.finished.push({ box, same: true });
          if (enrol) {
            this.prints.push(print);
            if (this.prints.length > FACE.maxPrints) this.prints.splice(1, 1); // keep the first one (nearest the tap)
          }
        } else if (d >= FACE.different) {
          this.finished.push({ box, same: false });
        }
      })
      .catch(() => {
        // a failed reading just means no verdict this time
      })
      .finally(() => {
        this.busy = false;
        if (this.reading === reading) this.reading = null;
      });
  }
}

/**
 * The part of an upright picture where the person's head should be (the top of their box,
 * FACE.headShare of it, a little wider), copied onto its own canvas. `scale` = canvas pixels
 * per picture pixel.
 */
export function cropHead(source: HTMLCanvasElement, box: Box, out: HTMLCanvasElement): { canvas: HTMLCanvasElement; scale: number } {
  const x0 = clamp(box.x - box.w * 0.15, 0, 1) * source.width;
  const x1 = clamp(box.x + box.w * 1.15, 0, 1) * source.width;
  const y0 = clamp(box.y - box.h * 0.05, 0, 1) * source.height;
  const y1 = clamp(box.y + box.h * FACE.headShare, 0, 1) * source.height;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  // Keep the camera's own detail, between 160 and 320 pixels on the long side.
  const long = Math.max(w, h);
  const scale = clamp(long, 160, 320) / long;
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  out.getContext("2d")?.drawImage(source, x0, y0, w, h, 0, 0, out.width, out.height);
  return { canvas: out, scale };
}

// Keep the same as the @vladmandic/face-api version in package.json: the models load from jsDelivr.
const FACE_API_VERSION = "1.7.15";
const MODEL_URL = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACE_API_VERSION}/model/`;

export interface FaceReader {
  /** Finds the clearest face on `crop` and returns its fingerprint and width in pixels. */
  read(crop: HTMLCanvasElement): Promise<{ print: Float32Array; width: number } | null>;
}

/** Loads face-api and its three small models (about 7 MB the first time). */
export async function createFaceReader(): Promise<FaceReader> {
  const faceapi = await import("@vladmandic/face-api");
  // face-api ships TensorFlow.js; its type file leaves out these two (they exist at runtime).
  const tf = faceapi.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void> };
  if (!(await tf.setBackend("webgl"))) await tf.setBackend("cpu");
  await tf.ready();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: FACE.minScore });
  // The very first run prepares the graphics chip and can freeze the page for seconds (5-10 s
  // on Apple's laptop). Do it now, on a blank picture, rather than in the middle of tracking.
  const blank = document.createElement("canvas");
  blank.width = 160;
  blank.height = 160;
  await faceapi.detectSingleFace(blank, options);
  await faceapi.nets.faceLandmark68TinyNet.detectLandmarks(blank);
  await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(blank);
  return {
    async read(crop) {
      // The crop is centred on the person, head near the top. Someone close by can show up in it
      // too, so take the face nearest where this person's head should be, not the clearest one.
      const all = await faceapi.detectAllFaces(crop, options).withFaceLandmarks(true).withFaceDescriptors();
      let best: (typeof all)[number] | null = null;
      let bestD = Infinity;
      for (const r of all) {
        const b = r.detection.box;
        const d = Math.hypot((b.x + b.width / 2) / crop.width - 0.5, (b.y + b.height / 2) / crop.height - 0.35);
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      }
      return best ? { print: best.descriptor, width: best.detection.box.width } : null;
    },
  };
}
