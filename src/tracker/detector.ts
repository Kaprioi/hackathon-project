// Finds people in each camera frame, using Google's MediaPipe object detector.
// It runs entirely on the phone (or PC): no video ever leaves the device.

import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import { TUNING } from "./config.ts";
import type { Box } from "./geometry.ts";
import { clampBox } from "./geometry.ts";

/** A person the detector found, with how sure it is (0-1). */
export interface Detection extends Box {
  score: number;
}

// Keep this the same as the @mediapipe/tasks-vision version in package.json.
const MEDIAPIPE_VERSION = "1.1.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
// EfficientDet-Lite0: a small, fast model that knows 80 kinds of objects, including "person".
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

export interface PersonDetector {
  /** "GPU" or "CPU": which part of the phone runs the model. */
  delegate: string;
  /**
   * Everyone in this frame, as boxes in 0-1 image coordinates, down to TUNING.weakScore.
   * Under TUNING.personScore the detector is unsure (the page passes those as "weak").
   */
  detect(frame: HTMLCanvasElement, timeMs: number): Detection[];
  close(): void;
}

/**
 * Where to run the model: "GPU" (graphics chip, faster) or "CPU". On iPhones the page asks
 * for the CPU: on Kris's iPhone 14 the page reloaded itself after tracking a while, and a
 * WebKit bug report describes that with this model on the graphics chip next to a live camera
 * (bugs.webkit.org/show_bug.cgi?id=321693; not confirmed to be our cause).
 * Add ?gpu or ?cpu to the page's address to choose by hand.
 */
export function preferredDelegate(): "GPU" | "CPU" {
  const q = new URLSearchParams(location.search);
  if (q.has("gpu")) return "GPU";
  if (q.has("cpu")) return "CPU";
  return isIPhone() ? "CPU" : "GPU";
}

/** iPhone or iPad, in any browser (they all run on Apple's WebKit). */
export function isIPhone(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function createPersonDetector(first: "GPU" | "CPU" = "GPU"): Promise<PersonDetector> {
  const files = await FilesetResolver.forVisionTasks(WASM_URL);
  let lastError: unknown = null;
  // The GPU is faster, but not every browser allows it, so fall back to the CPU.
  const order = first === "GPU" ? (["GPU", "CPU"] as const) : (["CPU"] as const);
  for (const delegate of order) {
    try {
      const detector = await ObjectDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        scoreThreshold: TUNING.weakScore,
        maxResults: 8, // room for unsure shapes without crowding out the sure ones
        categoryAllowlist: ["person"],
      });
      let lastTime = 0;
      return {
        delegate,
        detect(frame, timeMs) {
          const t = Math.max(timeMs, lastTime + 1); // MediaPipe needs every timestamp to be later than the last
          lastTime = t;
          const w = frame.width;
          const h = frame.height;
          if (!w || !h) return [];
          const result = detector.detectForVideo(frame, t);
          return result.detections.flatMap((d) => {
            const b = d.boundingBox;
            if (!b) return [];
            const box = clampBox({ x: b.originX / w, y: b.originY / h, w: b.width / w, h: b.height / h });
            return [{ ...box, score: d.categories[0]?.score ?? 0 }];
          });
        },
        close() {
          detector.close();
        },
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error("Couldn't start the person detector.");
}
