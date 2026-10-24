// Turns what the camera sees into a few small text events for the family page.
// Only words like "moving / left / standing" ever leave the phone - never pictures.
//
// The Reporter is fed every frame (people boxes from the detector) and now and then
// says "send this": when the person starts or stops moving, changes side of the
// room, sits down or lies down, leaves the room, or every 30 seconds as a heartbeat.

import type { Box } from "./geometry.ts";
import { area, centerX } from "./geometry.ts";

// "inactive" is sent once when nobody has moved for hours during the day (see TrackerPage.tsx and family/noMovement.ts).
export type EventKind = "moving" | "still" | "nobody" | "fall" | "heartbeat" | "started" | "stopped" | "inactive";
export type Zone = "left" | "middle" | "right";
export type Posture = "standing" | "sitting" | "lying" | "unknown";

export interface MovementEvent {
  kind: EventKind;
  zone: Zone | null;
  posture: Posture | null;
}

export const REPORT = {
  /** How often the phone says "I'm still watching" (the family page counts it as stopped after 2 minutes of silence). */
  heartbeatMs: 30_000,
  /** A change has to last this long before it's reported (stops flicker). */
  settleMs: 2_000,
  /** No one in the picture for this long = "nobody". */
  nobodyMs: 5_000,
  /** The person's middle moving more than this (share of the picture width) within moveWindowMs = moving. */
  moveShare: 0.04,
  moveWindowMs: 1_500,
  /** Standing to lying down within this long counts as a possible fall. */
  fallMs: 3_000,
};

/** Which third of the picture a box is in. */
export function zoneOf(b: Box): Zone {
  const x = centerX(b);
  return x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : "middle";
}

/**
 * A rough guess from the box shape. `aspect` is the picture's width / height, so we
 * can compare the box's real height and width in pixels.
 */
export function postureOf(b: Box, aspect: number): Posture {
  if (b.w <= 0 || b.h <= 0) return "unknown";
  const tall = (b.h / b.w) / aspect; // height / width in pixels
  if (tall >= 1.7) return "standing";
  if (tall >= 0.9) return "sitting";
  return "lying";
}

interface State {
  kind: "moving" | "still" | "nobody";
  zone: Zone | null;
  posture: Posture | null;
}

const same = (a: State, b: State) => a.kind === b.kind && a.zone === b.zone && a.posture === b.posture;

export class Reporter {
  private sent: State | null = null;
  private pending: State | null = null;
  private pendingSince = 0;
  private lastHeartbeat = 0;
  private lastSeen = 0;
  private trail: { t: number; x: number }[] = [];
  private standingAt = -Infinity; // last time they were seen standing

  /** Call when the camera starts. */
  start(t: number): MovementEvent {
    this.sent = null;
    this.pending = null;
    this.trail = [];
    this.lastSeen = t;
    this.lastHeartbeat = t;
    this.standingAt = -Infinity;
    return { kind: "started", zone: null, posture: null };
  }

  /** Call when the camera stops. */
  stop(): MovementEvent {
    return { kind: "stopped", zone: null, posture: null };
  }

  /** Feed one frame. Returns the events to send now (usually none). */
  update(t: number, people: Box[], aspect: number): MovementEvent[] {
    const out: MovementEvent[] = [];
    const now = this.read(t, people, aspect);

    if (!this.pending || !same(now, this.pending)) {
      this.pending = now;
      this.pendingSince = t;
    }
    const settled = t - this.pendingSince >= REPORT.settleMs;
    if (settled && (!this.sent || !same(this.pending, this.sent))) {
      // Went from standing to lying quickly (not sitting down first, like going to bed).
      const fell =
        this.pending.posture === "lying" &&
        this.sent?.posture !== "lying" &&
        this.pendingSince - this.standingAt <= REPORT.fallMs;
      this.sent = this.pending;
      out.push({ ...this.pending, kind: fell ? "fall" : this.pending.kind });
    }

    if (t - this.lastHeartbeat >= REPORT.heartbeatMs) {
      this.lastHeartbeat = t;
      out.push({ kind: "heartbeat", zone: this.sent?.zone ?? null, posture: this.sent?.posture ?? null });
    }
    return out;
  }

  /** What's going on in this frame, before any settling. */
  private read(t: number, people: Box[], aspect: number): State {
    // Follow the biggest person (usually the closest one).
    const person = people.reduce<Box | null>((best, p) => (!best || area(p) > area(best) ? p : best), null);
    if (!person) {
      this.trail = [];
      if (t - this.lastSeen >= REPORT.nobodyMs) return { kind: "nobody", zone: null, posture: null };
      // Briefly missed: keep saying what we last had.
      return this.pending ?? { kind: "nobody", zone: null, posture: null };
    }
    this.lastSeen = t;
    const posture = postureOf(person, aspect);
    if (posture === "standing") this.standingAt = t;

    const x = centerX(person);
    this.trail.push({ t, x });
    while (this.trail.length && t - this.trail[0].t > REPORT.moveWindowMs) this.trail.shift();
    const xs = this.trail.map((p) => p.x);
    const moving = Math.max(...xs) - Math.min(...xs) > REPORT.moveShare;

    return { kind: moving ? "moving" : "still", zone: zoneOf(person), posture };
  }
}
