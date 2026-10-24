// The tracking brain. Every camera frame, it gets the people the detector found,
// and decides where the stand should point and what state it's in:
//
//   TAP A PERSON  boxes around everyone; tap one to pick them.
//   TRACKING      following the person you picked (works from behind too).
//   HIDDEN        they vanished where they stood (under a blanket or box). Hold on
//                 the cover, follow it if it moves; the radar confirms they're inside.
//   FOLLOWING     they ran out of the frame. Keep turning the way they went.
//   SEARCHING     not found where expected: sweep across the room once.
//   LOST          give up moving; watch for someone who looks like them.
//
// This file has no camera, Bluetooth or screen code, so it can be tested on a PC
// (see brain.test.ts).

import type { Look, RgbaImage } from "./appearance.ts";
import { blendLook, lookDistance, lookOf } from "./appearance.ts";
import type { Settings } from "./config.ts";
import { LIMITS, TUNING } from "./config.ts";
import type { Angles, Box } from "./geometry.ts";
import { area, centerX, centerY, clamp, contains, iou } from "./geometry.ts";
import { LumpTracker, toGray } from "./lump.ts";

export type Mode = "idle" | "tracking" | "hidden" | "following" | "searching" | "lost";

export const MODE_LABEL: Record<Mode, string> = {
  idle: "TAP A PERSON",
  tracking: "TRACKING",
  hidden: "HIDDEN",
  following: "FOLLOWING",
  searching: "SEARCHING",
  lost: "LOST",
};

export interface FrameInput {
  /** Time of the frame, in milliseconds. */
  t: number;
  /** Everyone the detector found in this frame. */
  people: Box[];
  /** A small copy of the frame, for colours and the cover tracker. */
  image: RgbaImage | null;
  /** The radar: true = someone there, false = nobody, null = no radar connected. */
  radar: boolean | null;
  /** Where the camera was pointing when this frame was taken. */
  camera: Angles;
  /** Where the user tapped (0-1 image coordinates), if they tapped this frame. */
  tap?: { x: number; y: number } | null;
}

export interface BrainOutput {
  mode: Mode;
  /** The target's box in this frame's picture, or null when out of view. */
  target: Box | null;
  /** Where the stand should point, or null to leave it where it is. */
  aim: Angles | null;
  /** A plain-words reason for what it's doing, for the on-screen log. */
  note: string;
  /** While searching or lost: how close the best-matching person looks (for tuning matchLimit). */
  match: number | null;
  /** -1 = left the picture on the left, 1 = on the right, 0 = not following. */
  exitSide: -1 | 0 | 1;
}

export class Brain {
  settings: Settings;

  private mode: Mode = "idle";
  private modeSince = 0;
  private note = "Tap a person to lock on.";

  /** The target's saved look (clothes colours). */
  private look: Look | null = null;
  /** Where the target was last seen, as a room direction in servo degrees. */
  private bearing: Angles = { pan: LIMITS.center, tilt: LIMITS.center };
  /** How fast the target was moving (degrees per second). */
  private vel: Angles = { pan: 0, tilt: 0 };
  private lastBox: Box | null = null;
  private lastSeenT = 0;
  private aim: Angles | null = null;

  private prevT = 0;
  private prevCamera: Angles | null = null;

  private radarEmptySince: number | null = null;
  private lump = new LumpTracker();
  private coverBox: Box | null = null;

  private followDir = 0; // +1 or -1, in servo degrees
  private followSpeed = 0;
  private followFrom: Angles = { pan: LIMITS.center, tilt: LIMITS.center };
  private limitSince: number | null = null;
  private sweepGoals: number[] = [];

  constructor(settings: Settings) {
    this.settings = settings;
  }

  get currentMode(): Mode {
    return this.mode;
  }

  /** Stop following anyone. */
  release(): void {
    this.mode = "idle";
    this.look = null;
    this.lastBox = null;
    this.aim = null;
    this.lump.stop();
    this.note = "Released. Tap a person to lock on.";
  }

  update(f: FrameInput): BrainOutput {
    const looks = f.people.map((p) => (f.image ? lookOf(f.image, p) : null));
    let target: Box | null = null;
    let match: number | null = null;

    if (f.tap) this.pick(f, looks);

    switch (this.mode) {
      case "idle":
        break;
      case "tracking":
        target = this.tracking(f, looks);
        break;
      case "hidden":
        target = this.hidden(f, looks);
        break;
      case "following":
        target = this.following(f, looks);
        break;
      case "searching":
        target = this.searching(f, looks);
        break;
      case "lost":
        ({ target, match } = this.lost(f, looks));
        break;
    }
    if (this.mode === "searching" || this.mode === "following") match = this.bestMatch(looks).d;

    this.prevT = f.t;
    this.prevCamera = { ...f.camera };
    const exitSide =
      this.mode === "following" ? ((Math.sign(this.followDir * this.settings.panSign) || 0) as -1 | 0 | 1) : 0;
    return { mode: this.mode, target, aim: this.aim, note: this.note, match, exitSide };
  }

  // ---------- picking someone ----------

  private pick(f: FrameInput, looks: (Look | null)[]): void {
    const { x, y } = f.tap!;
    let chosen = -1;
    // The smallest box under the finger (so tapping a child in front of an adult picks the child).
    f.people.forEach((p, i) => {
      if (contains(p, x, y) && (chosen < 0 || area(p) < area(f.people[chosen]))) chosen = i;
    });
    if (chosen < 0) {
      // Missed slightly: take the nearest person within 15% of the frame.
      let best = 0.15;
      f.people.forEach((p, i) => {
        const d = Math.hypot(centerX(p) - x, centerY(p) - y);
        if (d < best) {
          best = d;
          chosen = i;
        }
      });
    }
    if (chosen < 0) {
      this.note = "Nobody there. Tap inside one of the boxes.";
      return;
    }
    this.look = looks[chosen];
    this.vel = { pan: 0, tilt: 0 };
    this.lockOn(f, chosen, "Locked on. I'll keep you in view, even if you hide.");
  }

  /** Start (or resume) tracking person `i` of this frame. */
  private lockOn(f: FrameInput, i: number, note: string): void {
    const box = f.people[i];
    this.bearing = this.toWorld(box, f.camera);
    this.lastBox = box;
    this.lastSeenT = f.t;
    this.aim = this.clampAim(this.bearing);
    this.radarEmptySince = null;
    this.lump.stop();
    this.setMode("tracking", f.t, note);
  }

  // ---------- TRACKING ----------

  private tracking(f: FrameInput, looks: (Look | null)[]): Box | null {
    const sinceSeen = f.t - this.lastSeenT;
    const predicted = this.predict(sinceSeen);
    const gate = TUNING.gateDeg + (Math.abs(this.vel.pan) * sinceSeen) / 2000;
    const i = this.closestCandidate(f, looks, predicted, gate);
    if (i >= 0) {
      this.seen(f, i, looks[i]);
      return f.people[i];
    }

    // Not in this frame. Did they run out of the picture, or vanish in the middle of it?
    const side = this.edgeExit();
    const predictedBox = this.toImageBox(predicted, f.camera);
    const predictedOutside = centerX(predictedBox) < 0 || centerX(predictedBox) > 1;
    if (side !== 0 && (predictedOutside || sinceSeen > TUNING.coastMs / 2)) {
      this.startFollowing(f, side);
      return null;
    }
    if (sinceSeen < TUNING.coastMs) {
      // Probably just a missed frame or a quick pass behind something: keep going.
      this.aim = this.clampAim(predicted);
      this.note = "Lost sight for a moment. Guessing where you're heading.";
      return predictedBox;
    }
    if (side !== 0) this.startFollowing(f, side);
    else this.startHidden(f);
    return this.mode === "hidden" ? this.coverBox : null;
  }

  /** Update everything we know after spotting the target (person `i`). */
  private seen(f: FrameInput, i: number, look: Look | null): void {
    const box = f.people[i];
    const w = this.toWorld(box, f.camera);
    const dt = (f.t - this.lastSeenT) / 1000;
    if (dt > 0 && dt < 0.5) {
      const a = TUNING.velSmoothing;
      const vp = clamp((w.pan - this.bearing.pan) / dt, -TUNING.maxSpeed, TUNING.maxSpeed);
      const vt = clamp((w.tilt - this.bearing.tilt) / dt, -TUNING.maxSpeed, TUNING.maxSpeed);
      this.vel = { pan: this.vel.pan * (1 - a) + vp * a, tilt: this.vel.tilt * (1 - a) + vt * a };
    } else {
      this.vel = { pan: 0, tilt: 0 };
    }
    this.bearing = w;
    this.lastBox = box;
    this.lastSeenT = f.t;

    // Let the saved look adapt slowly, but only when nobody else overlaps the target.
    if (look && this.look && this.isAlone(f, i)) this.look = blendLook(this.look, look, TUNING.lookUpdate);
    if (look && !this.look) this.look = look;

    // Aim a little ahead to make up for the delay between camera and motor.
    const lead: Angles = {
      pan: w.pan + (this.vel.pan * TUNING.latencyMs) / 1000,
      tilt: w.tilt + (this.vel.tilt * TUNING.latencyMs) / 1000,
    };
    const dz = this.settings.deadZoneDeg;
    if (!this.aim || Math.abs(lead.pan - this.aim.pan) > dz || Math.abs(lead.tilt - this.aim.tilt) > dz) {
      this.aim = this.clampAim(lead);
    }
    this.setMode("tracking", f.t, this.mode === "tracking" ? "Tracking you." : this.note);
  }

  /**
   * Which person is most likely the target: close to where we expect them, and
   * not clearly wearing different clothes. Returns -1 if nobody fits.
   */
  private closestCandidate(f: FrameInput, looks: (Look | null)[], expected: Angles, gate: number): number {
    const limit = this.settings.matchLimit;
    let best = -1;
    let bestScore = Infinity;
    f.people.forEach((p, i) => {
      const w = this.toWorld(p, f.camera);
      const dist = Math.hypot(w.pan - expected.pan, (w.tilt - expected.tilt) * 0.5);
      if (dist > gate) return;
      const d = this.look && looks[i] ? lookDistance(this.look, looks[i]!) : null;
      if (d !== null && d > limit * TUNING.trackLookSlack) return; // someone else walking past
      const score = dist / gate + (d ?? limit * 0.5) / limit;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  private isAlone(f: FrameInput, i: number): boolean {
    return f.people.every((p, j) => j === i || iou(p, f.people[i]) < 0.05);
  }

  /** -1/+1 (servo degrees) if the target was last seen at the left/right edge of the picture, else 0. */
  private edgeExit(): number {
    const b = this.lastBox;
    if (!b) return 0;
    const atLeft = b.x < TUNING.edgeMargin;
    const atRight = b.x + b.w > 1 - TUNING.edgeMargin;
    let imageSide = 0;
    if (atLeft && !atRight) imageSide = -1;
    else if (atRight && !atLeft) imageSide = 1;
    else if (atLeft && atRight) imageSide = Math.sign(this.vel.pan * this.settings.panSign); // very close: go by movement
    if (imageSide === 0) return 0;
    // At the edge but clearly walking back toward the middle: not an exit.
    const inward = -imageSide * this.vel.pan * this.settings.panSign;
    if (inward > 15) return 0;
    return imageSide * this.settings.panSign;
  }

  // ---------- HIDDEN ----------

  private startHidden(f: FrameInput): void {
    const size = this.lastBox ?? { x: 0, y: 0, w: 0.2, h: 0.5 };
    this.coverBox = this.toImageBox(this.bearing, f.camera, size);
    if (f.image) this.lump.start(toGray(f.image), this.coverBox);
    this.aim = this.clampAim(this.bearing);
    this.radarEmptySince = null;
    this.setMode("hidden", f.t, "You vanished where you stood and nobody walked away. Watching the cover.");
  }

  private hidden(f: FrameInput, looks: (Look | null)[]): Box | null {
    // 1. Did they come back out?
    const back = this.reappeared(f, looks);
    if (back >= 0) {
      this.lockOn(f, back, "Back out from under the cover. Still locked on.");
      return f.people[back];
    }

    // 2. Follow the cover if it moves.
    if (f.image && this.lump.active) {
      const shift = this.cameraShift(f.camera);
      const r = this.lump.update(toGray(f.image), shift.x, shift.y);
      if (r) {
        this.coverBox = r.box;
        if (r.score > TUNING.lumpMinScore) {
          const w = this.toWorld(r.box, f.camera);
          this.bearing = w;
          const dz = this.settings.deadZoneDeg;
          if (!this.aim || Math.abs(w.pan - this.aim.pan) > dz || Math.abs(w.tilt - this.aim.tilt) > dz) {
            this.aim = this.clampAim(w);
          }
        }
      }
    }

    // 3. Ask the radar whether anyone is still there.
    if (f.radar === true) {
      this.radarEmptySince = null;
      this.note = "Covered up. The radar says you're still there.";
    } else if (f.radar === false) {
      this.radarEmptySince ??= f.t;
      if (f.t - this.radarEmptySince > TUNING.lostAfterMs) {
        this.goLost(f, "The cover is empty: the radar sees nobody. Waiting for you to come back.");
        return null;
      }
      this.note = "Covered up, but the radar sees nobody. Checking...";
    } else if (f.t - this.modeSince > TUNING.hiddenNoRadarMs) {
      this.goLost(f, "Hidden for a long time and no radar to check. Waiting for you to come back.");
      return null;
    }
    return this.coverBox;
  }

  /** Someone near the cover who looks about right, or anyone anywhere who clearly looks like the target. */
  private reappeared(f: FrameInput, looks: (Look | null)[]): number {
    const limit = this.settings.matchLimit;
    let best = -1;
    let bestD = Infinity;
    f.people.forEach((p, i) => {
      const w = this.toWorld(p, f.camera);
      const near = Math.abs(w.pan - this.bearing.pan) < TUNING.gateDeg * 2;
      const d = this.look && looks[i] ? lookDistance(this.look, looks[i]!) : near ? 0 : Infinity;
      const ok = (near && d < limit * TUNING.trackLookSlack) || d < limit;
      if (ok && d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  // ---------- FOLLOWING (ran out of the frame) ----------

  private startFollowing(f: FrameInput, dir: number): void {
    this.followDir = dir;
    this.followSpeed = clamp(Math.abs(this.vel.pan), TUNING.followMinSpeed, TUNING.followMaxSpeed);
    this.followFrom = this.aim ? { ...this.aim } : { ...this.bearing };
    this.limitSince = null;
    const side = dir * this.settings.panSign < 0 ? "left" : "right";
    this.setMode("following", f.t, `You left the picture on the ${side}. Turning to follow.`);
  }

  private following(f: FrameInput, looks: (Look | null)[]): Box | null {
    const found = this.recognised(looks, TUNING.followLookSlack);
    if (found >= 0) {
      this.lockOn(f, found, "There you are. Locked back on.");
      return f.people[found];
    }
    const elapsed = f.t - this.modeSince;
    const pan = this.followFrom.pan + (this.followDir * this.followSpeed * elapsed) / 1000;
    this.aim = this.clampAim({ pan, tilt: this.followFrom.tilt });
    const atLimit = this.aim.pan <= LIMITS.panMin || this.aim.pan >= LIMITS.panMax;
    if (atLimit) this.limitSince ??= f.t;
    if ((atLimit && f.t - this.limitSince! > TUNING.limitPauseMs) || elapsed > TUNING.followMaxMs) {
      this.startSearching(f);
    }
    return null;
  }

  // ---------- SEARCHING (sweep the room once) ----------

  private startSearching(f: FrameInput): void {
    const ahead = this.followDir < 0 ? LIMITS.panMin : LIMITS.panMax;
    const behind = this.followDir < 0 ? LIMITS.panMax : LIMITS.panMin;
    // Finish turning the way they went, sweep all the way back, then return to where they were last seen.
    this.sweepGoals = [ahead, behind, clamp(this.bearing.pan, LIMITS.panMin, LIMITS.panMax)];
    this.setMode("searching", f.t, "Not where I expected. Sweeping the room.");
  }

  private searching(f: FrameInput, looks: (Look | null)[]): Box | null {
    const found = this.recognised(looks, 1);
    if (found >= 0) {
      this.lockOn(f, found, "Found you while sweeping. Locked back on.");
      return f.people[found];
    }
    const dt = Math.max(0, f.t - this.prevT) / 1000;
    const current = this.aim?.pan ?? LIMITS.center;
    const goal = this.sweepGoals[0] ?? current;
    const step = TUNING.sweepSpeed * dt;
    const next = Math.abs(goal - current) <= step ? goal : current + Math.sign(goal - current) * step;
    this.aim = this.clampAim({ pan: next, tilt: this.aim?.tilt ?? this.bearing.tilt });
    if (next === goal) this.sweepGoals.shift();
    if (this.sweepGoals.length === 0) {
      this.goLost(f, "Swept the whole room and didn't find you. Waiting for you to come back.");
    }
    return null;
  }

  // ---------- LOST ----------

  private goLost(f: FrameInput, note: string): void {
    this.lump.stop();
    this.coverBox = null;
    this.setMode("lost", f.t, note);
  }

  private lost(f: FrameInput, looks: (Look | null)[]): { target: Box | null; match: number | null } {
    const { i, d } = this.bestMatch(looks);
    if (i >= 0 && d !== null && d < this.settings.matchLimit) {
      this.lockOn(f, i, "That's you. Locked back on.");
      return { target: f.people[i], match: d };
    }
    return { target: null, match: d };
  }

  // ---------- helpers ----------

  /** The person who looks most like the target, if they're within `slack` x matchLimit. */
  private recognised(looks: (Look | null)[], slack: number): number {
    const { i, d } = this.bestMatch(looks);
    return i >= 0 && d !== null && d < this.settings.matchLimit * slack ? i : -1;
  }

  private bestMatch(looks: (Look | null)[]): { i: number; d: number | null } {
    let i = -1;
    let d: number | null = null;
    if (!this.look) return { i, d };
    looks.forEach((l, k) => {
      if (!l) return;
      const dk = lookDistance(this.look!, l);
      if (d === null || dk < d) {
        d = dk;
        i = k;
      }
    });
    return { i, d };
  }

  private predict(ms: number): Angles {
    const s = Math.min(ms, TUNING.coastMs) / 1000; // don't guess further than the coast time
    return { pan: this.bearing.pan + this.vel.pan * s, tilt: this.bearing.tilt + this.vel.tilt * s };
  }

  /** Box in the picture -> room direction (servo degrees) of the aim point (chest by default). */
  private toWorld(b: Box, camera: Angles): Angles {
    const s = this.settings;
    const ax = b.x + b.w / 2;
    const ay = b.y + b.h * s.aimHeight;
    return {
      pan: camera.pan + s.panSign * (ax - 0.5) * s.fovH,
      tilt: camera.tilt + s.tiltSign * (ay - 0.5) * s.fovV,
    };
  }

  /** Room direction -> where a box of `size` would appear in the picture. */
  private toImageBox(w: Angles, camera: Angles, size: Box | null = this.lastBox): Box {
    const s = this.settings;
    const bw = size?.w ?? 0.2;
    const bh = size?.h ?? 0.5;
    const ax = 0.5 + (w.pan - camera.pan) / (s.panSign * s.fovH);
    const ay = 0.5 + (w.tilt - camera.tilt) / (s.tiltSign * s.fovV);
    return { x: ax - bw / 2, y: ay - bh * s.aimHeight, w: bw, h: bh };
  }

  /** How far the picture slid since the last frame because the camera turned (fraction of the frame). */
  private cameraShift(camera: Angles): { x: number; y: number } {
    if (!this.prevCamera) return { x: 0, y: 0 };
    const s = this.settings;
    return {
      x: -(camera.pan - this.prevCamera.pan) / (s.panSign * s.fovH),
      y: -(camera.tilt - this.prevCamera.tilt) / (s.tiltSign * s.fovV),
    };
  }

  private clampAim(a: Angles): Angles {
    return {
      pan: clamp(a.pan, LIMITS.panMin, LIMITS.panMax),
      tilt: clamp(a.tilt, LIMITS.tiltMin, LIMITS.tiltMax),
    };
  }

  private setMode(m: Mode, t: number, note: string): void {
    if (this.mode !== m) {
      this.mode = m;
      this.modeSince = t;
    }
    this.note = note;
  }
}
