// The tracking brain. Every camera frame, it gets the people the detector found,
// and decides where the stand should point and what state it's in:
//
//   TAP A PERSON  boxes around everyone; tap one to pick them.
//   TRACKING      following the person you picked (works from behind too).
//   HIDDEN        they vanished where they stood (under a blanket or box). Hold on
//                 the cover, follow it if it moves; the radar confirms they're inside.
//                 A person shape that walks along with the cover is them. If the cover
//                 is lost but the radar still senses them, let the radars steer.
//   FOLLOWING     they ran out of the frame. Keep turning the way they went.
//   SEARCHING     not found where expected: sweep across the room once (again while
//                 the radar still senses someone, a few times at most).
//   RADAR SEARCH  out of the picture, but the radar hears someone: turn where the radar
//                 is loudest (radarGuide.ts) and let the camera say who it is. The target
//                 locks back on; anyone else is "someone else" and the search goes on.
//   LOST          give up moving; watch for someone who looks like them. If the radar
//                 goes quiet and then hears someone again, turn to see who it is.
//
// This file has no camera, Bluetooth or screen code, so it can be tested on a PC
// (see brain.test.ts).

import type { Look, RgbaImage } from "./appearance.ts";
import { blendLook, lookDistance, lookOf } from "./appearance.ts";
import type { Settings } from "./config.ts";
import { LIMITS, RADAR, TILT, TUNING } from "./config.ts";
import type { Angles, Box } from "./geometry.ts";
import { area, centerX, centerY, clamp, contains, iou } from "./geometry.ts";
import { LumpTracker, toGray } from "./lump.ts";
import type { RadarEnergy } from "./radarGuide.ts";
import { ListeningSweep, loudest, louderSide } from "./radarGuide.ts";
import { TiltCheck } from "./tiltCheck.ts";

export type Mode = "idle" | "tracking" | "hidden" | "following" | "searching" | "radar" | "lost";

export const MODE_LABEL: Record<Mode, string> = {
  idle: "TAP A PERSON",
  tracking: "TRACKING",
  hidden: "HIDDEN",
  following: "FOLLOWING",
  searching: "SEARCHING",
  radar: "RADAR SEARCH",
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
  /**
   * How loud the radar(s) hear someone, if the stand reports it (SightLine firmware).
   * Used to turn toward someone who is out of the picture. Null or missing = only yes/no.
   */
  radarEnergy?: RadarEnergy | null;
  /** Where the camera was pointing when this frame was taken. */
  camera: Angles;
  /**
   * Where the stand's head points, only when the camera does NOT turn with it (a laptop's
   * webcam beside the stand). Then turning the head can't bring anyone into view, so the
   * brain doesn't sweep the room for the camera; it just points the head where the radar
   * hears them. Missing = the camera rides on the head (the phone on the stand).
   */
  head?: Angles;
  /** Where the user tapped (0-1 image coordinates), if they tapped this frame. */
  tap?: { x: number; y: number } | null;
  /**
   * Shapes the detector is less sure are people (someone covering their face, an odd
   * pose). Only used to keep following the target right where it already is.
   */
  weak?: Box[];
  /**
   * Face checks that just finished (they can be a frame or two old): the person's box at
   * the time, and whether their face matches the target's. A match re-finds the target
   * whatever their clothes; a clear mismatch rules that person out.
   */
  faces?: { box: Box; same: boolean }[];
}

export interface BrainOutput {
  mode: Mode;
  /** The target's box in this frame's picture, or null when out of view. */
  target: Box | null;
  /** Where the stand should point, or null to leave it where it is. */
  aim: Angles | null;
  /**
   * How fast the aim is moving (degrees/second), when it moves steadily (following someone
   * walking, turning after them, sweeping). The page moves the aim on by this between camera
   * frames (predictAim), so the stand turns smoothly instead of in steps. Null = hold it.
   */
  aimVel: Angles | null;
  /** A plain-words reason for what it's doing, for the on-screen log. */
  note: string;
  /** While searching or lost: how close the best-matching person looks (for tuning matchLimit). */
  match: number | null;
  /** For each person in `FrameInput.people`: how much they look like the target (0 = same), or null. */
  matches: (number | null)[];
  /**
   * Following them out of the picture, or turning where the radar hears them: -1 = they're
   * believed to be off the left of the picture, 1 = off the right, 0 = neither.
   */
  exitSide: -1 | 0 | 1;
  /** Where the target is believed to be while out of view (null while in view, or nobody picked). */
  whereabouts: Whereabouts | null;
  /** For each person in `FrameInput.people`: true = their face matched the target's, false = it didn't, null = not known. */
  faces: (boolean | null)[];
  /** True on the frame a tap locked onto someone (a new target). */
  picked: boolean;
  /**
   * True on the frame the brain found the up/down motor turning the wrong way for this
   * stand (tiltCheck.ts) and flipped `tiltSign`. The page saves the flip in the settings.
   */
  flippedTilt: boolean;
}

/** Where the target is believed to be while out of view. */
export interface Whereabouts {
  /** -1 = off the left of the picture, 1 = off the right, 0 = not sure which side. */
  side: -1 | 0 | 1;
  /** The radar: true = it hears someone, false = quiet, null = no radar. */
  radar: boolean | null;
  /** Pointed where the radar says they are; the camera is checking who's there. */
  checking: boolean;
}

/**
 * The words for the screen, like "Out of view - to your left (the radar hears you)".
 * `mirrored`: the picture is shown flipped (selfie), so the screen's left is the picture's right.
 */
export function whereaboutsText(w: Whereabouts, mirrored: boolean): string {
  const radar = w.radar === true ? " (the radar hears you)" : w.radar === false ? " (the radar hears nobody)" : "";
  if (w.checking) return `Out of view - the radar says you're where the stand points${radar}`;
  if (w.side === 0) return `Out of view - not sure which side${radar}`;
  const left = mirrored ? w.side > 0 : w.side < 0;
  return `Out of view - to your ${left ? "left" : "right"}${radar}`;
}

/**
 * How far down the picture to aim (0 = top, 1 = bottom): `aimHeight` of the way down the
 * person's box (the chest, by default), so the face stays in view. When the top of the box
 * is close to the top of the picture, their head may be cut off (they stood up, or came
 * closer): then aim higher, up to the box's very top once it touches the edge, so the
 * camera tilts up until the head is back in. It changes smoothly with the box, so the
 * stand doesn't jump or rock up and down when the head comes back into view.
 * `headroom` 0 turns this off (a webcam beside the stand: tilting can't bring the head in).
 */
export function aimPointY(b: Box, aimHeight: number, headroom: number = TUNING.headroom): number {
  const room = headroom > 0 ? Math.min(1, Math.max(0, b.y) / headroom) : 1;
  return b.y + b.h * aimHeight * room;
}

/**
 * Up/down limited to a small look around level: within TILT.range of it, and exactly level
 * when within `band` of it (someone roughly level doesn't keep the stand tilted).
 */
export function limitTilt(tilt: number, band: number = TILT.levelBand): number {
  const off = tilt - TILT.level;
  if (Math.abs(off) <= band) return TILT.level;
  return TILT.level + clamp(off, -TILT.range, TILT.range);
}

/** One step (`ms` long) of easing the tilt back to level, at TILT.returnSpeed. */
export function towardLevel(tilt: number, ms: number): number {
  const step = (TILT.returnSpeed * Math.max(0, ms)) / 1000;
  const off = limitTilt(tilt) - TILT.level;
  return Math.abs(off) <= step ? TILT.level : TILT.level + off - Math.sign(off) * step;
}

/** One step (`ms` long) from `tilt` toward `goal`, at TILT.returnSpeed. */
export function towardTilt(tilt: number, goal: number, ms: number): number {
  const step = (TILT.returnSpeed * Math.max(0, ms)) / 1000;
  const off = tilt - goal;
  return Math.abs(off) <= step ? goal : tilt - Math.sign(off) * step;
}

/**
 * Up/down never stays looking up or down away from neutral for long. Neutral is looking
 * straight at the person it follows, or level when it isn't following someone it can see.
 * Once the stand has been told a tilt more than TILT.levelBand away from neutral for more
 * than TILT.holdMs in a row, it eases back to neutral, then stays at neutral for
 * TILT.cooldownMs so it doesn't bounce straight back (easing along with it if neutral moves,
 * say to level when the person leaves). Only the tilt: left and right never change.
 */
export class TiltHold {
  /** Since when the stand has been told a tilt away from neutral (null = at neutral). */
  private awaySince: number | null = null;
  /** Away too long: easing back to neutral. */
  private returning = false;
  /** Back at neutral after a hold: since when (null = no cooldown). */
  private backAt: number | null = null;
  /** True when this frame's tilt isn't the wanted one (easing back, or waiting out the cooldown). */
  holding = false;

  /**
   * One frame. `want`: the tilt the brain would like (already limited to TILT.range);
   * `told`: the tilt the stand was told last frame; `neutral`: looking straight at the person
   * (or level); `t`: now; `ms`: since the last frame. Returns the tilt to tell the stand now.
   */
  update(want: number, told: number, neutral: number, t: number, ms: number): number {
    if (!this.returning && this.awaySince !== null && t - this.awaySince > TILT.holdMs) this.returning = true;
    let out = want;
    if (this.returning) {
      out = towardTilt(told, neutral, ms);
      if (out === neutral) {
        this.returning = false;
        this.backAt = t;
      }
    } else if (this.backAt !== null) {
      if (t - this.backAt >= TILT.cooldownMs) this.backAt = null;
      else out = towardTilt(told, neutral, ms);
    }
    this.holding = out !== want;
    if (Math.abs(out - neutral) <= TILT.levelBand) this.awaySince = null;
    else this.awaySince ??= t;
    return out;
  }

  reset(): void {
    this.awaySince = null;
    this.returning = false;
    this.backAt = null;
    this.holding = false;
  }
}

/**
 * Where to point `ms` after the brain's last answer, if its aim keeps moving at `vel`
 * (degrees/second). At most TUNING.predictMaxMs ahead, so a stalled camera can't run it away.
 */
export function predictAim(aim: Angles, vel: Angles, ms: number): Angles {
  const s = Math.max(0, Math.min(ms, TUNING.predictMaxMs)) / 1000;
  return {
    pan: clamp(aim.pan + vel.pan * s, LIMITS.panMin, LIMITS.panMax),
    tilt: limitTilt(aim.tilt + vel.tilt * s, 0),
  };
}

/** The person whose box overlaps `box` the most, if more than `min`; else -1. */
function bestOverlap(people: Box[], box: Box, min: number): number {
  let best = -1;
  let bestO = min;
  people.forEach((p, i) => {
    const o = iou(p, box);
    if (o > bestO) {
      bestO = o;
      best = i;
    }
  });
  return best;
}

export class Brain {
  settings: Settings;

  private mode: Mode = "idle";
  private modeSince = 0;
  private note = "Tap a person to lock on.";

  /** The target's look at the moment they were tapped. Never changes, so it can't drift onto someone else. */
  private anchor: Look | null = null;
  /** The same look, slowly adapted to lighting, but only while we're sure it's them. */
  private look: Look | null = null;
  /** Other sides of the target (turned around), learned while following them cleanly. */
  private views: Look[] = [];
  private viewCandidate: { look: Look; since: number } | null = null;
  /** True while nobody has overlapped the target since their last clear colour match. */
  private cleanSinceClear = false;
  /** When we started following someone who only looks "sort of" like the target. */
  private doubtSince: number | null = null;
  /** True once we've followed a doubtful match for too long: only clear matches count until we see a clear one. */
  private doubtSpent = false;
  /**
   * True while the box we're following has moved smoothly, frame to frame, ever since
   * the last clear match. Then a fading colour match is just the same person in
   * different light, so we keep trusting it. A jump to another box breaks this.
   */
  private chainTrusted = true;
  /** Where the target was last seen, as a room direction in servo degrees. */
  private bearing: Angles = { pan: LIMITS.center, tilt: LIMITS.center };
  /** Does the camera turn with the stand's head (the phone on it)? From the latest frame. */
  private cameraOnHead = true;
  /** Checks that the up/down motor turns the right way; `flippedTilt` says it flipped this frame. */
  private tiltCheck = new TiltCheck();
  private flippedTilt = false;
  /** How fast the target was moving (degrees per second). */
  private vel: Angles = { pan: 0, tilt: 0 };
  private lastBox: Box | null = null;
  private lastSeenT = 0;
  private aim: Angles | null = null;
  /** How fast the aim moves this frame (see BrainOutput.aimVel). */
  private aimVel: Angles | null = null;
  /** The up/down the stand was last told; eases back to level while nobody is followed in view. */
  private outTilt: number = TILT.level;
  /** Brings the tilt back to neutral after looking up or down away from it too long. */
  private tiltHold = new TiltHold();
  /**
   * Neutral while following someone in view: looking straight at them, the tilt that puts their
   * aim point (aimPointY: chest, or higher while their head is cut off) in the middle of the
   * picture, from the latest sighting (null = not seen since the tap or release).
   */
  private facingTilt: number | null = null;

  private prevT = 0;
  private prevCamera: Angles | null = null;

  private radarEmptySince: number | null = null;
  private lump = new LumpTracker();
  private coverBox: Box | null = null;
  /** When the cover tracker last had a sure fix on the cover, and whether it ever had one this time. */
  private coverSeenT = 0;
  private coverEverSeen = false;
  /** A person shape sitting on the cover: since when, and how far off its middle it sat then. */
  private onCoverSince: number | null = null;
  private onCoverOffset = 0;
  /** True while the cover is lost and the stand's radars steer instead of the camera. */
  private radarSteering = false;
  /** Since when the target has only been seen as a weak detection (null = seen properly). */
  private weakSince: number | null = null;
  /** Someone who's been a steadily better match than the person we're on: since when, and their box. */
  private betterSince: number | null = null;
  private betterBox: Box | null = null;
  /** What face checks said about people, each following that person's box from frame to frame. */
  private faceNotes: { box: Box; same: boolean; t: number; seenT: number }[] = [];
  /** This frame: which people a face check ruled out, and which it confirmed as the target. */
  private ruledOut = new Set<number>();
  private faceKnown = new Set<number>();
  /**
   * People who were in view at the same time as the target (while we were sure of the
   * target), followed box to box. They can't be the target, so when the target hides behind
   * a pillar, the person standing next to it isn't taken instead.
   */
  private others: { box: Box; seenT: number }[] = [];
  /** This frame: which people are such "others". */
  private seenWith = new Set<number>();

  private followDir = 0; // +1 or -1, in servo degrees
  /** Which way (+1 or -1 servo degrees) we believe the target is while out of view: the edge they left by, or the radar's side. */
  private believedDir = 0;
  private followSpeed = 0;
  private followFrom: Angles = { pan: LIMITS.center, tilt: LIMITS.center };
  private limitSince: number | null = null;
  private sweepGoals: number[] = [];

  /** RADAR SEARCH with one radar: the stop-and-listen sweep (null with two radars). */
  private radarSweep: ListeningSweep | null = null;
  /** Pointed where the radar says: since when (null while still turning). */
  private radarParkSince: number | null = null;
  /** Saw someone who isn't the target while pointed where the radar says. */
  private radarSomeoneElse = false;
  /** Whether this radar search started knowing which way they went (else the first stop tells). */
  private radarDirKnown = false;
  /** Camera not on the stand: since when the radar has been clearly quieter where we point. */
  private radarFadeSince: number | null = null;
  /** How many radar searches or extra sweeps since the target was last seen (at most RADAR.rounds). */
  private radarRounds = 0;
  /** Where the target hid under the cover (to tell which way the cover went). */
  private coverStartPan = LIMITS.center;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  /** The states whose aims move steadily enough to move on between frames. */
  private readonly CAN_PREDICT = ["tracking", "following", "searching", "radar"] as const;

  get currentMode(): Mode {
    return this.mode;
  }

  /** Face recognition switched off: drop what face checks said. */
  forgetFaces(): void {
    this.faceNotes = [];
  }

  /** Stop following anyone. */
  release(): void {
    this.mode = "idle";
    this.anchor = null;
    this.look = null;
    this.views = [];
    this.viewCandidate = null;
    this.doubtSince = null;
    this.doubtSpent = false;
    this.lastBox = null;
    this.aim = null;
    this.lump.stop();
    this.faceNotes = [];
    this.others = [];
    this.note = "Released. Tap a person to lock on.";
    this.tiltCheck.reset();
    this.tiltHold.reset();
    this.facingTilt = null;
  }

  update(frameIn: FrameInput): BrainOutput {
    const strongCount = frameIn.people.length;
    this.cameraOnHead = !frameIn.head;
    this.flippedTilt = false;
    // After a long pause (page hidden, phone locked) people may have moved: don't carry notes over.
    if (frameIn.t - this.prevT > TUNING.longGapMs) {
      this.faceNotes = [];
      this.others = [];
    }
    const f = this.withWeakTarget(frameIn);
    const allLooks = f.people.map((p) => (f.image ? lookOf(f.image, p) : null));
    let target: Box | null = null;
    let match: number | null = null;

    // A tap that picks someone starts afresh: what faces said, and who was "someone else",
    // was about the old target. (A tap that hits nobody changes nothing.)
    this.aimVel = null; // each state sets it again if its aim moves steadily
    const picked = f.tap ? this.pick(f, allLooks) : false;
    if (picked) {
      this.faceNotes = [];
      this.others = [];
    }

    // Faces: someone whose face matched is the target, whatever their clothes; someone whose
    // face clearly didn't is ruled out (they can't be re-found or kept by their colours).
    const faceOf = this.mode === "idle" ? f.people.map(() => null) : this.readFaces(f, picked ? [] : (f.faces ?? []));
    this.ruledOut = new Set(faceOf.flatMap((v, i) => (v === false ? [i] : [])));
    this.faceKnown = new Set(faceOf.flatMap((v, i) => (v === true ? [i] : [])));
    // People seen at the same time as the target: follow them on to this frame (a face match beats this).
    this.seenWith = this.mode === "idle" ? new Set() : this.carryOthers(f);
    for (const i of this.faceKnown) this.seenWith.delete(i);
    if (this.mode !== "idle") {
      // The person we're on: the one whose box best continues the target's (not just anyone touching it).
      const onIdx = this.mode === "tracking" && this.lastBox ? bestOverlap(f.people, this.lastBox, 0.3) : -1;
      const known = faceOf.findIndex((v, i) => v === true && i !== onIdx);
      if (known >= 0) {
        this.vel = { pan: 0, tilt: 0 };
        this.lockOn(f, known, "Recognised your face. Locked back on.");
        this.chainTrusted = true; // the face says it's them, whatever the colours say
        this.doubtSince = null;
        this.doubtSpent = false;
      } else if (onIdx >= 0 && faceOf[onIdx] === false) {
        // We were following the wrong person, so who was "in view at the same time" means nothing.
        this.others = [];
        this.seenWith.clear();
        this.goLost(f, "That face isn't yours. Looking for you.");
      }
    }
    // While the target is missing, the others can't be re-found by their colours. (While
    // tracking, a clearly better match may still take over: we might be on the wrong person.)
    const hideOthers = this.mode !== "tracking";
    const looks = allLooks.map((l, i) => (this.ruledOut.has(i) || (hideOthers && this.seenWith.has(i)) ? null : l));

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
      case "radar":
        target = this.radarSearch(f, looks);
        break;
      case "lost":
        ({ target, match } = this.lost(f, looks));
        break;
    }
    if (this.mode === "searching" || this.mode === "following" || this.mode === "radar") match = this.bestMatch(looks).d;

    // Sure it's the target this frame? Then everyone else in view is someone else: remember them.
    if (this.mode === "tracking" && target) {
      const ti = f.people.indexOf(target);
      const d = ti >= 0 ? this.dist(allLooks[ti]) : null;
      const sure = ti >= 0 && (this.faceKnown.has(ti) || (d !== null && d <= this.settings.matchLimit * 0.8));
      if (sure) this.noteOthers(f, target);
    }

    // Seen properly this frame (not only as a weak detection)? Then the weak-detection clock restarts.
    const seenStrong = target !== null && f.people.indexOf(target) >= 0 && f.people.indexOf(target) < strongCount;
    if (seenStrong || (this.mode !== "tracking" && this.mode !== "hidden")) this.weakSince = null;

    // Up and down: only while following someone in view. Otherwise (hidden, out of the
    // picture, nobody picked) ease back to level. And never looking up or down away from
    // neutral (looking straight at them; level when nobody is followed in view) for more
    // than TILT.holdMs in a row (TiltHold). Only what the stand is told changes, so left
    // and right carry on exactly as they are.
    const tracking = this.mode === "tracking";
    const ms = Math.min(f.t - this.prevT, 1000);
    const want = tracking && this.aim ? this.aim.tilt : towardLevel(this.outTilt, ms);
    const neutral = tracking ? (this.facingTilt ?? TILT.level) : TILT.level;
    this.outTilt = this.tiltHold.update(want, this.outTilt, neutral, f.t, ms);
    const followsTilt = tracking && !this.tiltHold.holding;
    const aim = this.aim && this.aim.tilt !== this.outTilt ? { ...this.aim, tilt: this.outTilt } : this.aim;

    this.prevT = f.t;
    this.prevCamera = { ...f.camera };
    const checking = this.mode === "radar" && this.radarParkSince !== null;
    const towards = this.mode === "following" || (this.mode === "radar" && !checking);
    const exitSide = towards ? ((Math.sign(this.believedDir * this.settings.panSign) || 0) as -1 | 0 | 1) : 0;
    const outOfView = this.mode === "following" || this.mode === "radar" || this.mode === "searching" || this.mode === "lost";
    const whereabouts: Whereabouts | null = outOfView && !target ? { side: exitSide, radar: f.radar, checking } : null;
    const matches = this.mode === "idle" ? allLooks.map(() => null) : allLooks.map((l) => this.dist(l));
    const faces = this.mode === "idle" ? f.people.map(() => null) : faceOf;
    const vel = this.aimVel as Angles | null; // (set by the state above)
    const aimVel = aim && vel && (this.CAN_PREDICT as readonly Mode[]).includes(this.mode) ? (followsTilt ? vel : { pan: vel.pan, tilt: 0 }) : null;
    const flippedTilt = this.flippedTilt;
    return { mode: this.mode, target, aim, aimVel, note: this.note, match, matches, exitSide, whereabouts, faces, picked, flippedTilt };
  }

  /**
   * Moves each remembered "other" person along to their box in this frame, and returns which
   * people they are. Two people overlapping = can't tell who's who, so that one is forgotten.
   */
  private carryOthers(f: FrameInput): Set<number> {
    const found = new Set<number>();
    for (const n of this.others) {
      if (f.t - n.seenT > TUNING.othersKeepMs) continue; // out of sight too long to be sure who's who
      const hits = this.carryHits(f, n.box);
      if (hits.length === 1) {
        n.box = f.people[hits[0]];
        n.seenT = f.t;
        found.add(hits[0]);
      } else if (hits.length > 1) {
        n.seenT = -Infinity; // forget them
      }
    }
    this.others = this.others.filter((n) => f.t - n.seenT < TUNING.othersKeepMs);
    return found;
  }

  /**
   * Who a note about the person in `box` (the previous frame) can be about now: someone whose
   * box overlaps it by more than carryOverlap, allowing for the camera's own turn. If the target
   * was seen in the previous frame, a note about someone else never moves onto the target's own
   * track, and a note about the target never moves off it (someone passing behind the target
   * and vanishing must not hand their note to the target).
   */
  private carryHits(f: FrameInput, box: Box): number[] {
    const shift = this.cameraShift(f.camera);
    const move = (b: Box): Box => ({ ...b, x: b.x + shift.x, y: b.y + shift.y });
    const was = move(box);
    const targetBefore = this.mode === "tracking" && this.lastBox && this.lastSeenT >= this.prevT ? this.lastBox : null;
    const targetNow = targetBefore ? move(targetBefore) : null;
    const aboutTarget = !!targetBefore && iou(box, targetBefore) > TUNING.carryOverlap;
    return f.people.flatMap((p, i) => {
      if (iou(p, was) <= TUNING.carryOverlap) return [];
      if (targetNow && iou(p, targetNow) > TUNING.carryOverlap !== aboutTarget) return [];
      return [i];
    });
  }

  /** Everyone in view apart from the target is someone else (a box mostly over the target's may be the target counted twice). */
  private noteOthers(f: FrameInput, target: Box): void {
    for (const p of f.people) {
      if (p === target || iou(p, target) > 0.3) continue;
      const known = this.others.find((n) => n.box === p || iou(n.box, p) > 0.3);
      if (known) {
        known.box = p;
        known.seenT = f.t;
      } else {
        this.others.push({ box: p, seenT: f.t });
      }
    }
  }

  /**
   * Adds the face checks that just finished, moves every earlier one along to wherever that
   * person's box is now, and returns what's known about each person in this frame.
   */
  private readFaces(f: FrameInput, verdicts: { box: Box; same: boolean }[]): (boolean | null)[] {
    for (const v of verdicts) {
      // A newer verdict about the same person replaces the old one.
      this.faceNotes = this.faceNotes.filter((n) => iou(n.box, v.box) < 0.3);
      this.faceNotes.push({ box: v.box, same: v.same, t: f.t, seenT: f.t });
    }
    const out: (boolean | null)[] = f.people.map(() => null);
    for (const n of this.faceNotes) {
      // Only from one frame to the next, and only when it's clear who's who. A verdict whose
      // person dropped out of view must not jump to whoever steps into that spot (on Apple's
      // phone, a turning camera slid another person into it and they got "face ✓").
      if (n.seenT < this.prevT) continue;
      const hits = this.carryHits(f, n.box);
      if (hits.length === 1) {
        n.box = f.people[hits[0]];
        n.seenT = f.t;
        out[hits[0]] = n.same;
      }
    }
    // Forget verdicts whose person wasn't followed into this frame, and old ones (people turn, swap seats).
    this.faceNotes = this.faceNotes.filter((n) => n.seenT === f.t && f.t - n.t < TUNING.faceVerdictMs);
    return out;
  }

  /**
   * The detector is less sure about someone covering their face or in an odd pose. A weak
   * detection right where the target is (and still dressed like them) counts as them for a
   * few seconds, so they don't "vanish" in plain view. Weak shapes anywhere else are ignored.
   */
  private withWeakTarget(f: FrameInput): FrameInput {
    const weak = f.weak ?? [];
    if (!weak.length || !f.image) return f;
    let where: Box | null = null;
    let overlap = 0;
    if (this.mode === "tracking" && this.lastBox && f.t - this.lastSeenT < TUNING.coastMs) {
      where = this.lastBox;
      overlap = 0.3;
    } else if (this.mode === "hidden" && this.coverBox) {
      where = this.coverBox;
      overlap = 0.4;
    }
    if (!where) return f;
    if (this.weakSince !== null && f.t - this.weakSince > TUNING.weakMaxMs) return f;
    let best: Box | null = null;
    let bestOverlap = overlap;
    for (const w of weak) {
      if (f.people.some((p) => iou(p, w) > 0.3)) continue; // the same shape as a proper detection
      const o = iou(w, where);
      if (o > bestOverlap) {
        bestOverlap = o;
        best = w;
      }
    }
    if (!best) return f;
    const d = this.dist(lookOf(f.image, best));
    if (d !== null && d > this.settings.matchLimit * TUNING.trackLookSlack) return f; // dressed differently
    this.weakSince ??= f.t;
    return { ...f, people: [...f.people, best] };
  }

  // ---------- picking someone ----------

  /** Locks onto the person under the tap. Returns false (and changes nothing) if nobody is there. */
  private pick(f: FrameInput, looks: (Look | null)[]): boolean {
    const { x, y } = f.tap!;
    this.tiltCheck.reset();
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
      return false;
    }
    this.anchor = looks[chosen];
    this.look = looks[chosen];
    this.views = [];
    this.doubtSince = null;
    this.doubtSpent = false;
    this.chainTrusted = true;
    this.vel = { pan: 0, tilt: 0 };
    this.lockOn(f, chosen, "Locked on. I'll keep you in view, even if you hide.");
    return true;
  }

  /** Start (or resume) tracking person `i` of this frame. */
  private lockOn(f: FrameInput, i: number, note: string): void {
    const box = f.people[i];
    this.bearing = this.toWorld(box, f.camera);
    this.facingTilt = limitTilt(this.bearing.tilt);
    this.lastBox = box;
    this.lastSeenT = f.t;
    this.aim = this.clampAim(this.bearing);
    this.radarEmptySince = null;
    this.radarRounds = 0;
    this.lump.stop();
    this.chainTrusted = false; // until a clear colour match confirms it's them
    this.cleanSinceClear = false;
    this.viewCandidate = null;
    this.setMode("tracking", f.t, note);
  }

  // ---------- TRACKING ----------

  private tracking(f: FrameInput, looks: (Look | null)[]): Box | null {
    const sinceSeen = f.t - this.lastSeenT;
    const predicted = this.predict(sinceSeen);
    const gate = TUNING.gateDeg + (Math.abs(this.vel.pan) * sinceSeen) / 2000;
    const i = this.closestCandidate(f, looks, predicted, gate);

    // Someone who clearly looks like the target, somewhere else in the picture, while
    // where we expected them there's nobody, only a "sort of" match, or someone who
    // looks clearly less like them (a coat on a chair, a passer-by)? Go with the look.
    const limit = this.settings.matchLimit;
    const di = i >= 0 ? this.dist(looks[i]) : null;
    // With the target out of sight, people seen alongside them can't be them.
    const best = this.bestMatch(i < 0 ? looks.map((l, k) => (this.seenWith.has(k) ? null : l)) : looks);
    // Jumping away from where we expect them needs a stronger match than re-finding
    // them after they're lost: in a crowd, a stranger often scores under matchLimit.
    // (Never by colours away from someone whose face says they're the target.)
    if (!this.faceKnown.has(i) && best.i >= 0 && best.i !== i && best.d !== null && best.d <= limit * TUNING.switchStrict) {
      // A box we've followed smoothly isn't dropped on the spot for a colour match elsewhere
      // (Apple's test: a passer-by in the target's front colours while the target showed their back).
      const instant = !(this.chainTrusted && i >= 0);
      const muchBetter = instant && (i < 0 || (di !== null && (di > limit || best.d + TUNING.switchMargin < di)));
      // Better, but not by much (the one we're on also roughly matches)? Switch only if it
      // stays that way for a moment, so a single lucky frame can't pull the box away.
      const better = di !== null && best.d + TUNING.switchMarginSteady < di;
      if (muchBetter || (better && this.steadilyBetter(f.t, f.people[best.i]))) {
        this.vel = { pan: 0, tilt: 0 };
        this.betterSince = null;
        this.lockOn(f, best.i, i < 0 ? "Found you again." : "That's you over there. Switched back to you.");
        this.judge(f.t, best.d);
        return f.people[best.i];
      }
      if (!better) this.betterSince = null;
    } else {
      this.betterSince = null;
    }

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

  /** True once the same person (followed by their box) has been the better match for switchSteadyMs. */
  private steadilyBetter(t: number, box: Box): boolean {
    if (this.betterSince === null || !this.betterBox || iou(box, this.betterBox) < 0.3) {
      this.betterSince = t; // someone new: start counting
    }
    this.betterBox = box;
    return t - this.betterSince >= TUNING.switchSteadyMs;
  }

  /** Update everything we know after spotting the target (person `i`). */
  private seen(f: FrameInput, i: number, look: Look | null): void {
    const box = f.people[i];
    const dt = (f.t - this.lastSeenT) / 1000;
    // Same box moving smoothly from the last frame (not a jump to something else)?
    const smooth = !!this.lastBox && dt < 0.4 && iou(box, this.lastBox) > 0.3;
    if (!smooth) this.chainTrusted = false;
    // Up/down turning the wrong way for this stand (tilting away from them)? Flip it.
    // Only when the camera rides on the head: a webcam beside it doesn't tilt.
    const s = this.settings;
    const y = aimPointY(box, s.aimHeight);
    if (this.cameraOnHead && this.mode === "tracking" && this.tiltCheck.update(f.t, f.camera.tilt, y, s.tiltSign, s.fovV, smooth)) {
      this.settings = { ...s, tiltSign: s.tiltSign === 1 ? -1 : 1 };
      this.flippedTilt = true;
    }
    const w = this.toWorld(box, f.camera);
    if (this.flippedTilt) {
      // Up and down meant the opposite until now: start the up/down guesses afresh.
      this.bearing = { ...this.bearing, tilt: w.tilt };
      this.vel = { ...this.vel, tilt: 0 };
    }
    if (dt > 0 && dt < 0.5) {
      const vp = clamp((w.pan - this.bearing.pan) / dt, -TUNING.maxSpeed, TUNING.maxSpeed);
      const vt = clamp((w.tilt - this.bearing.tilt) / dt, -TUNING.maxSpeed, TUNING.maxSpeed);
      const a = TUNING.velSmoothing;
      this.vel = { pan: this.vel.pan * (1 - a) + vp * a, tilt: this.vel.tilt * (1 - a) + vt * a };
    } else {
      this.vel = { pan: 0, tilt: 0 };
    }
    this.bearing = w;
    this.facingTilt = limitTilt(w.tilt);
    this.lastBox = box;
    this.lastSeenT = f.t;

    const d = this.dist(look);
    this.judge(f.t, d);
    // Let the saved look adapt slowly to lighting, but only when we're sure it's them
    // and nobody else overlaps them. The anchor (the look at the tap) never changes.
    if (look && d !== null && d <= this.settings.matchLimit * 0.8 && this.isAlone(f, i)) {
      this.look = blendLook(this.look ?? look, look, TUNING.lookUpdate);
    }
    if (look && !this.anchor) {
      this.anchor = look;
      this.look = look;
    }
    if (this.faceKnown.has(i)) this.cleanSinceClear = true; // the face says it's them
    if (!this.isAlone(f, i)) this.cleanSinceClear = false;
    this.learnView(f.t, look, d);

    // Aim a little ahead to make up for the delay between camera and motor.
    const lead: Angles = {
      pan: w.pan + (this.vel.pan * TUNING.leadMs) / 1000,
      tilt: w.tilt + (this.vel.tilt * TUNING.leadMs) / 1000,
    };
    const dz = this.settings.deadZoneDeg;
    if (!this.aim || Math.abs(lead.pan - this.aim.pan) > dz || Math.abs(lead.tilt - this.aim.tilt) > dz) {
      this.aim = this.clampAim(lead);
    }
    // Walking: the page moves the aim on smoothly between camera frames. (Following every
    // small move each frame, or trusting a sudden change of speed at once, made the stand
    // hunt back and forth when the real motor is slower than the page thinks.)
    if (Math.hypot(this.vel.pan, this.vel.tilt) > TUNING.stillSpeed) this.aimVel = { ...this.vel };
    const unsure = d !== null && d > this.settings.matchLimit;
    const note = this.flippedTilt
      ? "Up and down was the wrong way round for this stand, so it's flipped now (Settings: Flip up/down)."
      : this.faceKnown.has(i)
        ? "Tracking you. Recognised your face."
        : unsure
          ? "Not sure that's you (the colours don't match). Checking..."
          : "Tracking you.";
    this.setMode("tracking", f.t, this.mode === "tracking" ? note : this.note);
  }

  /**
   * Which person is most likely the target: close to where we expect them, and
   * not clearly wearing different clothes. Returns -1 if nobody fits.
   */
  private closestCandidate(f: FrameInput, looks: (Look | null)[], expected: Angles, gate: number): number {
    const limit = this.settings.matchLimit;
    // Following them smoothly and one box clearly continues theirs from the last frame? That box,
    // whatever the colours say: someone walking past in front can spoil the target's colours
    // for a moment, and the passer-by may look more like them (Apple's phone test).
    if (this.chainTrusted && this.lastBox && f.t - this.lastSeenT < 400) {
      const cont = bestOverlap(f.people, this.lastBox, 0.5);
      if (cont >= 0 && !this.ruledOut.has(cont) && !this.seenWith.has(cont)) return cont;
    }
    let best = -1;
    let bestScore = Infinity;
    f.people.forEach((p, i) => {
      if (this.ruledOut.has(i) || this.seenWith.has(i)) return; // their face isn't the target's, or they were in view with the target
      const w = this.toWorld(p, f.camera);
      const dist = Math.hypot(w.pan - expected.pan, (w.tilt - expected.tilt) * 0.5);
      if (dist > gate) return;
      const d = this.dist(looks[i]);
      // The same box moving smoothly on from a trusted chain is them, whatever the colours say.
      const smooth =
        this.chainTrusted && !!this.lastBox && f.t - this.lastSeenT < 400 && iou(p, this.lastBox) > 0.3;
      if (!smooth) {
        if (d !== null && d > limit * TUNING.trackLookSlack) return; // someone else walking past
        if (d !== null && d > limit && this.doubtSpent) return; // "sort of" matches have had their chance
      }
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
    this.coverSeenT = f.t;
    this.coverStartPan = this.bearing.pan;
    this.coverEverSeen = false;
    this.onCoverSince = null;
    this.radarSteering = false;
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
    let coverSure = false;
    if (f.image && this.lump.active) {
      const shift = this.cameraShift(f.camera);
      const r = this.lump.update(toGray(f.image), shift.x, shift.y);
      if (r) {
        this.coverBox = r.box;
        if (r.score > TUNING.lumpMinScore) {
          coverSure = true;
          this.coverSeenT = f.t;
          this.coverEverSeen = true;
          const w = this.toWorld(r.box, f.camera);
          this.bearing = w;
          const dz = this.settings.deadZoneDeg;
          if (!this.aim || Math.abs(w.pan - this.aim.pan) > dz || Math.abs(w.tilt - this.aim.tilt) > dz) {
            this.aim = this.clampAim(w);
          }
        }
      }
    }

    // 3. Walking around under it? The detector may see a person shape (legs below the
    // blanket) in the blanket's colours. One that stays on the moving cover is them.
    const under = coverSure ? this.personOnCover(f) : -1;
    if (under >= 0) {
      const offset = centerX(f.people[under]) - centerX(this.coverBox!);
      // Someone walking past in front slides across the cover; the person under it moves with it.
      if (this.onCoverSince === null || Math.abs(offset - this.onCoverOffset) > TUNING.coverPersonDrift) {
        this.onCoverSince = f.t;
        this.onCoverOffset = offset;
      } else if (f.t - this.onCoverSince >= TUNING.coverPersonMs) {
        this.lockOn(f, under, "Walking around under the cover. Following you.");
        this.chainTrusted = true; // the colours are the blanket's: follow the shape as long as it moves smoothly
        return f.people[under];
      }
    } else {
      this.onCoverSince = null;
    }

    // 4. Lost the cover after following it (they moved off faster than it could keep up)?
    // If the radar still senses someone, turn where it's loudest (if the stand says how
    // loud), or else stop aiming, so the stand steers by radar on its own.
    if (coverSure) this.radarSteering = false;
    else if (this.coverEverSeen && f.radar === true && f.t - this.coverSeenT > TUNING.coverLostMs) {
      if (this.radarCanGuide(f)) {
        this.lump.stop();
        this.coverBox = null;
        const dir = Math.sign(this.bearing.pan - this.coverStartPan);
        this.startRadar(f, dir, "Lost track of the cover, but the radar still hears you. Turning to look.");
        return null;
      }
      this.radarSteering = true;
    }
    if (this.radarSteering) {
      this.aim = null;
      this.bearing = { ...f.camera }; // the radars turn the head toward them
    }

    // 5. Ask the radar whether anyone is still there.
    if (f.radar === true) {
      this.radarEmptySince = null;
      this.note = this.radarSteering
        ? "Lost track of the cover. The radar still senses you, so it's steering."
        : "Covered up. The radar says you're still there.";
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
    return this.radarSteering ? null : this.coverBox;
  }

  /** The person whose box sits on the cover (overlapping it the most, and enough), or -1. */
  private personOnCover(f: FrameInput): number {
    const cover = this.coverBox;
    if (!cover) return -1;
    let best = -1;
    let bestOverlap = TUNING.coverPersonOverlap;
    f.people.forEach((p, i) => {
      if (this.ruledOut.has(i) || this.seenWith.has(i)) return; // their face isn't the target's, or they were in view with the target
      const o = iou(p, cover);
      if (o > bestOverlap) {
        bestOverlap = o;
        best = i;
      }
    });
    return best;
  }

  /** Someone near the cover who looks about right, or anyone anywhere who clearly looks like the target. */
  private reappeared(f: FrameInput, looks: (Look | null)[]): number {
    const limit = this.settings.matchLimit;
    let best = -1;
    let bestD = Infinity;
    f.people.forEach((p, i) => {
      if (this.ruledOut.has(i) || this.seenWith.has(i)) return; // their face isn't the target's, or they were in view with the target
      const w = this.toWorld(p, f.camera);
      const near = Math.abs(w.pan - this.bearing.pan) < TUNING.gateDeg; // stepping back out where they hid
      const d = this.dist(looks[i]) ?? (near ? 0 : Infinity);
      const ok = (near && !this.doubtSpent && d < limit * TUNING.trackLookSlack) || d < limit;
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
    this.believedDir = dir;
    this.followSpeed = clamp(Math.abs(this.vel.pan), TUNING.followMinSpeed, TUNING.followMaxSpeed);
    this.followFrom = this.aim ? { ...this.aim } : { ...this.bearing };
    this.limitSince = null;
    const side = dir * this.settings.panSign < 0 ? "left" : "right";
    this.setMode("following", f.t, `You left the picture on the ${side}. Turning to follow.`);
    this.followByRadar(f, side);
  }

  /**
   * Out of the picture, and the radar hears someone? Then let it guide the turn: one radar
   * listens its way that way; two radars turn toward the louder one (even if that's the
   * other way: they doubled back). Two radars hearing the same keep following the edge.
   */
  private followByRadar(f: FrameInput, side: string): boolean {
    if (!this.radarCanGuide(f)) return false;
    const e = f.radarEnergy!;
    if (e.radars === 2 && louderSide(e) === 0) return false;
    this.startRadar(
      f,
      this.followDir,
      e.radars === 1
        ? `You left the picture on the ${side}. Turning that way, listening with the radar.`
        : "Out of the picture. Turning toward the louder radar.",
    );
    return true;
  }

  private following(f: FrameInput, looks: (Look | null)[]): Box | null {
    // Someone coming back in at the edge they left by gets a looser match; anyone else must match clearly.
    const exitImageSide = this.followDir * this.settings.panSign; // -1 = left edge, 1 = right edge
    let found = -1;
    let foundD = Infinity;
    f.people.forEach((p, k) => {
      const d = this.dist(looks[k]);
      if (d === null) return;
      const cx = centerX(p);
      const atExitEdge = exitImageSide > 0 ? cx > 0.6 : cx < 0.4;
      const limit = this.settings.matchLimit * (atExitEdge ? TUNING.followLookSlack : 1);
      if (d <= limit && d < foundD) {
        found = k;
        foundD = d;
      }
    });
    if (found >= 0) {
      this.lockOn(f, found, "There you are. Locked back on.");
      return f.people[found];
    }
    if (this.followByRadar(f, exitImageSide < 0 ? "left" : "right")) return null;
    const elapsed = f.t - this.modeSince;
    const pan = this.followFrom.pan + (this.followDir * this.followSpeed * elapsed) / 1000;
    this.aim = this.clampAim({ pan, tilt: this.followFrom.tilt });
    this.aimVel = { pan: this.followDir * this.followSpeed, tilt: 0 };
    const atLimit = this.aim.pan <= LIMITS.panMin || this.aim.pan >= LIMITS.panMax;
    if (atLimit) this.limitSince ??= f.t;
    if ((atLimit && f.t - this.limitSince! > TUNING.limitPauseMs) || elapsed > TUNING.followMaxMs) {
      // The camera doesn't turn with the head: sweeping the room can't bring you into view.
      if (f.head) this.goLost(f, "Out of the camera's view. Waiting for you to come back.");
      else this.startSearching(f);
    }
    return null;
  }

  // ---------- SEARCHING (sweep the room once) ----------

  private startSearching(f: FrameInput, note = "Not where I expected. Sweeping the room."): void {
    const ahead = this.followDir < 0 ? LIMITS.panMin : LIMITS.panMax;
    const behind = this.followDir < 0 ? LIMITS.panMax : LIMITS.panMin;
    // Finish turning the way they went, sweep all the way back, then return to where they were last seen.
    this.sweepGoals = [ahead, behind, clamp(this.bearing.pan, LIMITS.panMin, LIMITS.panMax)];
    this.setMode("searching", f.t, note);
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
    else this.aimVel = { pan: Math.sign(goal - current) * TUNING.sweepSpeed, tilt: 0 };
    if (this.sweepGoals.length === 0) {
      // The radar still senses someone: look again, a few times at most.
      if (f.radar === true && this.radarRounds < RADAR.rounds) {
        if (this.radarCanGuide(f)) {
          this.startRadar(f, this.followDir, "Swept the room, but the radar still hears someone. Listening for where.");
        } else {
          this.radarRounds++;
          this.startSearching(f, "Swept the room, but the radar still senses someone. Sweeping again.");
        }
      } else {
        this.goLost(f, "Swept the whole room and didn't find you. Waiting for you to come back.");
      }
    }
    return null;
  }

  // ---------- RADAR SEARCH (out of the picture, but the radar hears someone) ----------

  /** True if the radar hears someone and says how loud, and we haven't looked too often already. */
  private radarCanGuide(f: FrameInput): boolean {
    return f.radar === true && !!f.radarEnergy && loudest(f.radarEnergy) > 0 && this.radarRounds < RADAR.rounds;
  }

  /** `dir` (+1/-1 motor degrees, or 0 = don't know): which way they most likely went. */
  private startRadar(f: FrameInput, dir: number, note: string): void {
    const e = f.radarEnergy!;
    // Don't know which way? Two radars say; else try the side with more room.
    const head = (f.head ?? f.camera).pan;
    const guess = (e.radars === 2 ? louderSide(e) : 0) || (head < LIMITS.center ? 1 : -1);
    this.followDir = dir || guess; // also used by a sweep afterwards
    // One radar with no idea which way: don't claim a side until the first stop has been heard.
    this.radarDirKnown = !!dir || e.radars === 2;
    this.believedDir = this.radarDirKnown ? this.followDir : 0;
    this.radarFadeSince = null;
    this.radarRounds++;
    this.radarParkSince = null;
    this.radarSomeoneElse = false;
    this.radarEmptySince = null;
    // One radar and no idea which way: note how loud it is here, to compare with the first step.
    const here = dir ? undefined : loudest(e);
    this.radarSweep = e.radars === 1 ? new ListeningSweep(head, this.followDir, f.t, here) : null;
    this.aim = this.clampAim({ pan: head, tilt: this.aim?.tilt ?? this.bearing.tilt });
    this.setMode("radar", f.t, note);
  }

  private radarSearch(f: FrameInput, looks: (Look | null)[]): Box | null {
    // 1. The camera decides who it is: the target (by clothes or face) locks back on.
    const found = this.recognised(looks, 1);
    if (found >= 0) {
      this.lockOn(f, found, "The radar led me to you. Locked back on.");
      return f.people[found];
    }

    // 2. Radar gone (Bluetooth dropped)?
    const e = f.radarEnergy;
    if (f.radar === null || !e) {
      this.startSearching(f, "Lost the radar. Sweeping the room.");
      return null;
    }
    if (f.radar === false) this.radarEmptySince ??= f.t;
    else this.radarEmptySince = null;
    const quiet = this.radarEmptySince !== null;

    // 3. Turn where the radar is loudest. (One radar going quiet mid-sweep is just a quiet
    // stop: the sweep carries on. Two radars that both go quiet hold still.)
    const tilt = this.aim?.tilt ?? this.bearing.tilt;
    let pointed: boolean;
    if (this.radarSweep) {
      this.aim = this.clampAim({ pan: this.radarSweep.update(f.t, (f.head ?? f.camera).pan, quiet ? 0 : e.left), tilt });
      pointed = this.radarSweep.parkedAt !== null;
      if (!pointed) {
        if (this.radarDirKnown || this.radarSweep.heard.length >= 2) this.believedDir = this.radarSweep.direction;
        this.note = "The radar hears someone. Turning and listening for where they are.";
      }
    } else {
      const side = quiet ? 0 : louderSide(e);
      const dt = Math.max(0, f.t - this.prevT) / 1000;
      const from = this.aim?.pan ?? (f.head ?? f.camera).pan;
      this.aim = this.clampAim({ pan: from + side * RADAR.turnSpeed * dt, tilt });
      const stuck = (side < 0 && this.aim.pan <= LIMITS.panMin) || (side > 0 && this.aim.pan >= LIMITS.panMax);
      pointed = side === 0 || stuck;
      if (side !== 0) this.believedDir = side;
      if (!pointed) this.aimVel = { pan: side * RADAR.turnSpeed, tilt: 0 };
      if (!pointed) {
        const words = side * this.settings.panSign < 0 ? "left" : "right";
        this.note = `The radar hears someone to the ${words}. Turning there.`;
      }
    }
    if (!pointed) {
      this.radarParkSince = null;
      return null;
    }

    // 4. Pointed where the radar says. Radar quiet for a while: they've left the room.
    if (quiet && f.t - this.radarEmptySince! > TUNING.lostAfterMs) {
      this.goLost(f, "The radar hears nobody now, so you've left. Waiting for you to come back.");
      return null;
    }
    // Anyone in view who isn't the target is someone else: keep looking for the target
    // (after a moment, so a face check can still re-find them).
    this.radarParkSince ??= f.t;
    if (f.people.length > 0) this.radarSomeoneElse = true;
    this.note = this.radarSomeoneElse
      ? "Someone else is there, not you. Still looking for you."
      : quiet
        ? "The radar has gone quiet. Looking here a moment..."
        : "The radar says someone's here. Looking...";
    if (f.head) {
      // The camera doesn't turn with the head, so a sweep can't help. Keep pointing where the
      // radar hears them, and listen again only once it's clearly quieter here (they moved).
      if (this.radarSweep && (quiet || loudest(e) < this.radarSweep.peak - RADAR.fadeDrop)) {
        this.radarFadeSince ??= f.t;
        if (f.t - this.radarFadeSince > RADAR.fadeMs) {
          this.radarRounds = 0; // following them by radar, not searching: no limit
          this.startRadar(f, 0, "You moved, out of the camera's view. Listening again with the radar.");
        }
      } else {
        this.radarFadeSince = null;
      }
      if (!this.radarSomeoneElse) this.note = quiet ? this.note : "Out of the camera's view. The radar says you're over here.";
      return null;
    }
    if (f.t - this.radarParkSince > RADAR.parkMs) {
      this.startSearching(
        f,
        this.radarSomeoneElse
          ? "That was someone else. Sweeping the room for you."
          : "The radar led me here, but I can't see you. Sweeping the room.",
      );
    }
    return null;
  }

  // ---------- LOST ----------

  private goLost(f: FrameInput, note: string): void {
    this.lump.stop();
    this.coverBox = null;
    if (f.radar !== false) this.radarEmptySince = null; // (keep counting how long the radar's been quiet)
    this.setMode("lost", f.t, note);
  }

  private lost(f: FrameInput, looks: (Look | null)[]): { target: Box | null; match: number | null } {
    const { i, d } = this.bestMatch(looks);
    if (i >= 0 && d !== null && d < this.settings.matchLimit) {
      this.lockOn(f, i, "That's you. Locked back on.");
      return { target: f.people[i], match: d };
    }
    // The radar was quiet for a while (nobody around) and now hears someone: maybe it's them
    // coming back. Turn to see who it is.
    if (f.radar === false) {
      this.radarEmptySince ??= f.t;
    } else if (f.radar === true && f.radarEnergy && loudest(f.radarEnergy) > 0) {
      const arrived = this.radarEmptySince !== null && f.t - this.radarEmptySince >= TUNING.lostAfterMs;
      this.radarEmptySince = null;
      if (arrived) {
        this.radarRounds = 0;
        this.startRadar(f, 0, "The radar hears someone coming. Turning to see who it is.");
      }
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
    looks.forEach((l, k) => {
      const dk = this.dist(l);
      if (dk === null) return;
      if (d === null || dk < d) {
        d = dk;
        i = k;
      }
    });
    return { i, d };
  }

  /** How much `l` looks like the target: 0 = same, 1 = nothing alike. Null if we can't tell. */
  private dist(l: Look | null): number | null {
    if (!l || !this.anchor) return null;
    let d = lookDistance(this.anchor, l);
    if (this.look) d = Math.min(d, lookDistance(this.look, l));
    for (const v of this.views) d = Math.min(d, lookDistance(v, l));
    return d;
  }

  /**
   * Learns another side of the target (they turned around) as an extra look, so a passer-by in
   * their front colours can't take over. Only from a clean stretch: followed smoothly, nobody
   * overlapping them since their last clear match, and the new look steady for a moment.
   */
  private learnView(t: number, look: Look | null, d: number | null): void {
    if (!look || d === null || d <= this.settings.matchLimit * 0.6 || !this.chainTrusted || !this.cleanSinceClear) {
      this.viewCandidate = null;
      return;
    }
    const c = this.viewCandidate;
    if (!c || lookDistance(c.look, look) > TUNING.viewSame) {
      this.viewCandidate = { look, since: t };
      return;
    }
    if (t - c.since >= TUNING.viewSteadyMs) {
      this.views.push(look);
      if (this.views.length > TUNING.maxViews) this.views.shift();
      this.viewCandidate = null;
    }
  }

  /** Keeps count of how long we've been following someone who only "sort of" looks right. */
  private judge(t: number, d: number | null): void {
    if (d === null || d <= this.settings.matchLimit) {
      this.doubtSince = null;
      this.doubtSpent = false;
      this.chainTrusted = true;
      // Extra looks may only be learned after a strong match (a "just under the limit" one could be a look-alike).
      if (d === null || d <= this.settings.matchLimit * 0.5) this.cleanSinceClear = true;
      return;
    }
    if (this.chainTrusted) {
      this.doubtSince = null; // the same person, smoothly followed, in different light: keep trusting
      return;
    }
    this.doubtSince ??= t;
    if (t - this.doubtSince > TUNING.doubtMs) this.doubtSpent = true;
  }

  private predict(ms: number): Angles {
    const s = Math.min(ms, TUNING.coastMs) / 1000; // don't guess further than the coast time
    return { pan: this.bearing.pan + this.vel.pan * s, tilt: this.bearing.tilt + this.vel.tilt * s };
  }

  /** Box in the picture -> room direction (servo degrees) of the aim point (chest by default). */
  private toWorld(b: Box, camera: Angles): Angles {
    const s = this.settings;
    const ax = b.x + b.w / 2;
    const ay = aimPointY(b, s.aimHeight, this.cameraOnHead ? TUNING.headroom : 0);
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
      tilt: limitTilt(a.tilt),
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
