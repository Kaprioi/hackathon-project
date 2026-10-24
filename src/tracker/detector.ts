// Finds people in each camera frame, using Google's MediaPipe object detector.
// It runs entirely on the phone (or PC): no video ever leaves the device.

import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import type { Box } from "./geometry.ts";
import { clampBox } from "./geometry.ts";

// Keep this the same as the @mediapipe/tasks-vision version in package.json.
const MEDIAPIPE_VERSION = "1.1.1";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
// EfficientDet-Lite0: a small, fast model that knows 80 kinds of objects, including "person".
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

export interface PersonDetector {
  /** "GPU" or "CPU": which part of the phone runs the model. */
  delegate: string;
  /** Everyone in this frame, as boxes in 0-1 image coordinates. */
  detect(frame: HTMLCanvasElement, timeMs: number): Box[];
  close(): void;
}

export async function createPersonDetector(): Promise<PersonDetector> {
  const files = await FilesetResolver.forVisionTasks(WASM_URL);
  let lastError: unknown = null;
  // The GPU is faster, but not every browser allows it, so fall back to the CPU.
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      const detector = await ObjectDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        scoreThreshold: 0.35,
        maxResults: 6,
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
            return [clampBox({ x: b.originX / w, y: b.originY / h, w: b.width / w, h: b.height / h })];
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
