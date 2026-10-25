// Settings for the Phone Tracker page. Everything you might want to tune is here.
//
// Keep the Bluetooth part in sync with the stand's firmware:
// phone-tracker/firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino

/** Bluetooth IDs. They must match the firmware exactly. */
export const BLE = {
  name: "PhoneTracker",
  service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
  move: "6e400002-b5a3-f393-e0a9-e50e24dcca9e", // write "pan,tilt", like "90,90"
  // notifies "1" (someone there) or "0" (old one-radar stand), or
  // "presence,left,right,pan,tilt[,radars]" like "1,42,0,95.0,90.0,1" (SightLine, see RADAR below)
  radar: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
  // write "1" (mist on) or "0" (off). The humidifier was dropped on Oct 24, so the page
  // never turns it on; kept so the website and firmware still match.
  mist: "6e400004-b5a3-f393-e0a9-e50e24dcca9e",
};

/** How far the motors may turn, in degrees. The firmware enforces the same limits. */
export const LIMITS = {
  panMin: 10,
  panMax: 170,
  tiltMin: 45,
  tiltMax: 135,
  center: 90,
};

/**
 * Up and down (the tilt motor). The stand only looks a little up or down from level. Its
 * "neutral" is looking straight at the person it follows (brain.ts Brain, facing tilt), and
 * level (straight ahead) when it isn't following someone it can see. It never stays looking
 * up or down away from neutral for long.
 */
export const TILT = {
  /** Level: straight ahead. The firmware's TILT_LEVEL. */
  level: 90,
  /** Look at most this far (degrees) up or down from level. */
  range: 15,
  /** Someone this close to level (degrees) counts as level: the stand stays level. */
  levelBand: 3,
  /** Going back to level, at this speed (degrees/second): from all the way up or down in about 0.75 s. */
  returnSpeed: 20,
  /**
   * Looking up or down away from neutral (more than levelBand) for longer than this (ms) in a
   * row: ease back to neutral at returnSpeed (asked for: after 3 to 5 seconds).
   */
  holdMs: 4000,
  /** Then stay at neutral for this long (ms), so it doesn't bounce straight back. */
  cooldownMs: 1500,
};

/**
 * How the firmware moves each motor toward the page's aim, every 20 ms: `ease` of the
 * remaining way (so it glides to a stop and never swings past), never faster than the top
 * speed, and not at all when the aim is within `deadband` (no twitching). Keep these the
 * same as in the firmware (CAMERA_EASE, PAN_TOP_SPEED, TILT_TOP_SPEED, MOVE_DEADBAND).
 *
 * Why no "speed up gently, slow down gently" profile: a motor that carries momentum, in a
 * loop where the camera always sees a moment late, swung back and forth in the tests (the
 * stand hunting around someone standing still). This kind can't.
 */
export const MOTION = {
  /** Fraction of the remaining way per 20 ms (was 15%, then 25%). */
  ease: 0.25,
  /** Top speed, degrees per second. The HS-422 turns 60° in about 0.21 s at 5 V: about 285°/s (was 240). */
  panSpeed: 280,
  /** Tilt carries the phone against gravity: a little gentler. */
  tiltSpeed: 200,
  /** Ignore aims closer than this (degrees) to where it already points. */
  deadband: 0.3,
};
export const SERVO_TICK_MS = 20;

/** Settings you can change on the page (they're saved in the browser). */
export interface Settings {
  /** Which phone camera faces the person. SightLine mounts the phone screen-forward, so "front". */
  camera: "front" | "back";
  /** 1 or -1. Flip it if the stand turns away from you instead of toward you. */
  panSign: 1 | -1;
  /** 1 or -1. Flip it if the stand tilts the wrong way. */
  tiltSign: 1 | -1;
  /** How wide the camera sees, left to right, in degrees. About 65 for the iPhone's main camera (an estimate). */
  fovH: number;
  /** How tall the camera sees, in degrees, with the phone sideways. */
  fovV: number;
  /** Where on the person to aim: 0 = top of their head, 1 = their feet. 0.35 is about chest height. */
  aimHeight: number;
  /** Ignore moves smaller than this many degrees, so the stand doesn't twitch. */
  deadZoneDeg: number;
  /** How alike two people must look to count as the same person (lower = stricter). Tune it with the on-screen number. */
  matchLimit: number;
  /**
   * How far to turn the camera picture (counterclockwise) so people stand upright for the AI.
   * "auto" uses the phone's motion sensor (needed when the phone is sideways with auto-rotate off).
   */
  turn: "auto" | "0" | "90" | "180" | "270";
  /** Save a face fingerprint of the tapped person and use it to re-find them (faces.ts). */
  faces: boolean;
  /** Watch the tracked person for a fall or seizure and raise the emergency alert (emergency.ts). */
  emergency: boolean;
  /**
   * Does the camera turn with the stand? Yes for the phone on the stand (the default on
   * every device: the page always assumes it runs on the iPhone on the stand). No for a
   * laptop's webcam beside the stand (testing on a PC): then the page must not think the
   * picture turns when the motor does. "auto" is from older saved settings and counts as yes.
   */
  cameraOnStand: "auto" | "yes" | "no";
}

export const DEFAULT_SETTINGS: Settings = {
  camera: "front",
  panSign: 1,
  tiltSign: 1,
  fovH: 65,
  fovV: 40,
  aimHeight: 0.35,
  deadZoneDeg: 2.5,
  matchLimit: 0.38,
  turn: "auto",
  faces: true, // the page starts with false on iPhones (see TrackerPage loadSettings)
  emergency: true,
  cameraOnStand: "yes",
};

/** True if the camera turns with the stand (the phone on it), false for a computer's webcam beside it. */
export function cameraTurnsWithStand(s: Pick<Settings, "cameraOnStand">): boolean {
  return s.cameraOnStand !== "no";
}

/** Timing and behaviour of the tracking brain. */
export const TUNING = {
  /** After a missed detection, keep moving the way you were heading for this long. */
  coastMs: 600,
  /** A box this close to the left or right edge (fraction of the frame) counts as "at the edge". */
  edgeMargin: 0.1,
  /**
   * Up and down: a box whose top is closer than this to the top of the picture (fraction of
   * the picture's height) may have the head cut off, so the aim moves up toward the box's top (brain.ts aimPointY).
   */
  headroom: 0.1,
  /** Hidden and the radar reads empty for this long: give up and switch to Lost. */
  lostAfterMs: 4000,
  /** Hidden with no radar connected (testing on a PC): give up after this long. */
  hiddenNoRadarMs: 15000,
  /** How far you can move between frames (degrees) and still count as the same person. */
  gateDeg: 12,
  /** While tracking, how much a look may drift (x matchLimit) before we say it's someone else. */
  trackLookSlack: 1.6,
  /** Right after you leave the frame, how loose the look match is (x matchLimit). */
  followLookSlack: 1.25,
  /** Following you out of the frame: turn at least this fast, and at most this fast (degrees/second). Was 25 and 90. */
  followMinSpeed: 40,
  followMaxSpeed: 120,
  /** Keep turning toward where you went for at most this long. */
  followMaxMs: 3500,
  /** If the stand hits its turning limit while following, wait this long before sweeping. */
  limitPauseMs: 700,
  /** Sweep speed while searching the room (degrees/second). Was 30. */
  sweepSpeed: 45,
  /** How quickly the saved look adapts to lighting changes (0 = never, 1 = instantly). Only while sure it's them. */
  lookUpdate: 0.02,
  /** Follow someone who only "sort of" looks like the target (over matchLimit) for at most this long. */
  doubtMs: 1500,
  /** Switch to another person straight away if they look this much more like the target than the one we're on. */
  switchMargin: 0.15,
  /**
   * ...or if they look at least this much more like them, steadily, for switchSteadyMs. On
   * Apple's phone test the wrong person matched 0.37 and the right one 0.23: only 0.14 apart.
   */
  switchMarginSteady: 0.07,
  switchSteadyMs: 600,
  /**
   * The detector's confidence (0-1) needed to count as a person. Between `weak` and `person`
   * (someone covering their face, an odd pose) only keeps following the target where it is.
   */
  personScore: 0.35,
  weakScore: 0.2,
  /** Follow the target on weak detections alone for at most this long. */
  weakMaxMs: 5000,
  /**
   * Extra looks of the target (from behind, say), learned while following them cleanly: their
   * look must differ from what we know, stay the same (within viewSame) for viewSteadyMs, and
   * nobody may have overlapped them since their last clear match. Keep at most maxViews.
   */
  viewSame: 0.2,
  viewSteadyMs: 1000,
  maxViews: 3,
  /** A face verdict sticks to the person it was about for this long (it follows their box). */
  faceVerdictMs: 15000,
  /**
   * People seen at the same time as the target can't be the target. The brain follows them
   * from frame to frame and won't take them when the target hides. It bridges a gap this
   * short (the detector missing them for a frame or two); after a longer one it forgets
   * them, so the note can't land on someone else who steps into their spot.
   */
  othersKeepMs: 250,
  /**
   * A note about someone (a face verdict, "seen with the target") moves on to the box in the
   * next frame only if it overlaps this much (0-1), after allowing for the camera's own turn.
   * Higher = harder for a note to jump to a neighbour when its person isn't detected.
   */
  carryOverlap: 0.5,
  /** After a pause this long (page hidden, phone locked), forget all such notes: people may have moved. */
  longGapMs: 1000,
  /** Run the person detector at most this many times a second (less heat and memory on phones). */
  maxDetectFps: 15,
  /**
   * ...and only if their match is under matchLimit x this. Measured on a busy street video:
   * strangers scored under 0.38 in 9% of pairs but under 0.30 in only 1.4%.
   */
  switchStrict: 0.8,
  /** How much each new speed reading counts (0-1). Lower = smoother but slower to react. */
  velSmoothing: 0.3,
  /** Fastest believable movement (degrees/second), to ignore glitches. */
  maxSpeed: 150,
  /** Delay between the camera seeing something and the motor reacting. An estimate. */
  latencyMs: 80,
  /**
   * How long an aim takes to reach the stand over Bluetooth once the page sends it (an
   * estimate). The page's guess of where the camera points starts each move this much later
   * than the send, and frame aims are sent only after the AI (servoModel.ts setTarget).
   */
  bluetoothMs: 30,
  /**
   * Aim this far ahead of someone walking (milliseconds of their speed), to make up for that
   * delay. Lower = less overshoot when they stop suddenly, but more lag while they walk.
   */
  leadMs: 100,
  /**
   * Below this speed (degrees/second) someone counts as standing still. Faster, the page
   * moves the aim on smoothly between camera frames (predictAim in brain.ts).
   */
  stillSpeed: 6,
  /** Between camera frames, move the aim on by the person's speed for at most this long. */
  predictMaxMs: 150,
  /** How sure the cover tracker must be (0-1) before the stand follows a moving blanket. */
  lumpMinScore: 0.55,
  /**
   * Walking around under a blanket: a person shape sitting on the moving cover for
   * this long counts as them, whatever its colours...
   */
  coverPersonMs: 500,
  /** ...if its box overlaps the cover this much (0-1)... */
  coverPersonOverlap: 0.4,
  /** ...and it stays put on the cover (moves less than this, as a fraction of the frame, relative to it). */
  coverPersonDrift: 0.04,
  /** Lost the cover for this long while the radar still senses someone: stop aiming and let the radars steer. */
  coverLostMs: 1000,
};

/**
 * The radar on the stand's head (radarGuide.ts). When the person is out of the picture but
 * the radar still hears someone, the phone turns the head where the radar is loudest and the
 * camera checks who it is. Starting points, not yet measured on the real head.
 */
export const RADAR = {
  /**
   * How many radars the head has: 1 = one facing straight ahead (the SightLine head on main),
   * 2 = a left and a right one. The config switch: a stand that reports its count (the
   * SightLine firmware in this repo does) overrides it.
   */
  count: 1 as 1 | 2,
  /**
   * Two radars: which way the head turns (in motor degrees, +1 or -1) when the LEFT radar is
   * louder. +1 matches the firmware ("a stronger left signal means turn left" with
   * PAN_DIRECTION = 1). Flip it if the head turns away from the louder radar.
   */
  leftPan: 1 as 1 | -1,
  /** 0-100. Below this a radar hears nobody (the firmware's MIN_ENERGY). */
  minEnergy: 15,
  /** Ignore loudness differences smaller than this (the firmware's DEADBAND). */
  deadband: 8,
  /**
   * One radar, the listening sweep: turn this far between stops (was 30; the camera is about
   * 65° wide, so each stop still overlaps the last)...
   */
  stepDeg: 40,
  /** ...wait this long once there (the radar hears its own motion while the head turns; was 250)... */
  settleMs: 200,
  /** ...then listen this long, averaging the loudness (was 350). */
  listenMs: 300,
  /** Stop waiting for the head to reach a stop after this long (it may be stuck at an end). */
  moveMaxMs: 1200,
  /** Two radars: turn toward the louder one at this speed (degrees/second; was 45). */
  turnSpeed: 75,
  /** Pointed where the radar says, and the camera doesn't see them there for this long: sweep the room instead. */
  parkMs: 2500,
  /**
   * Camera not on the stand (a laptop's webcam): stay pointed where the radar is loudest
   * until it's this much quieter than it was there for `fadeMs` (they moved), then listen again.
   */
  fadeDrop: 15,
  fadeMs: 1000,
  /**
   * After a sweep, look again (radar search or another sweep) while the radar still hears
   * someone, up to this many times. Then LOST, so a dog or a fan can't keep it searching forever.
   */
  rounds: 3,
};

/**
 * Face fingerprints (faces.ts). Distances are face-api's: 0 = the same picture; it suggests
 * 0.6 as the line between the same person and someone else. These are starting points to
 * tune on real faces, not measured yet.
 */
export const FACE = {
  /** Closer than this: the same person. */
  same: 0.5,
  /** Further than this: clearly someone else. In between: unsure, so ignored. */
  different: 0.7,
  /** Read at most one face this often (milliseconds), in the background. */
  everyMs: 400,
  /** Don't read the same person's face again within this long. */
  recheckMs: 2000,
  /** Keep up to this many fingerprints of the target (from different moments), and add one at most this often. */
  maxPrints: 5,
  refreshMs: 3000,
  /** Ignore faces smaller than this (pixels across, in the camera's full picture) or less sure than this. */
  minFacePx: 40,
  minScore: 0.6,
};

/**
 * The emergency alert (emergency.ts): a rough guess at a fall or a seizure from the tracked
 * person's box. Good enough for a staged demo, not a medical device. Estimates, to tune.
 */
export const EMERGENCY = {
  /**
   * Box height / width in real pixels: over this = standing, under `lying` = lying down. Lying
   * was 0.9 at first, but someone sitting at a table (legs hidden, arms out) gets a box that wide.
   */
  standing: 1.7,
  lying: 0.6,
  /** A fall: standing, then lying within this long... */
  fallWithinMs: 4000,
  /** ...and still lying after this long. */
  lyingMs: 3000, // long enough for the shaking check to speak first if they fell into a seizure
  /**
   * A seizure: while lying, the box's width or height swings back and forth at least `shakeFlips`
   * times within `shakeWindowMs`, each swing (peak to peak) at least `shakeSwing` of the person's
   * size. Only the size counts: a shaking camera moves the box but doesn't resize it. The
   * detector's own wobble is a few percent; on Apple's phone 3% steps raised a false alarm.
   */
  shakeWindowMs: 3000,
  shakeSwing: 0.1,
  shakeFlips: 5,
  /** After an alert, watch again once the person has been up (not lying) this long. */
  rearmMs: 3000,
  /** "Are you OK?" countdown before the pretend emergency call (seconds). */
  countdownS: 15,
};

/** Long side of the small copy of each frame used for colours and the cover tracker. */
export const ANALYSIS_WIDTH = 320;

/**
 * Long side of the copy the person detector sees (its width with the phone sideways).
 * Smaller is faster: on a laptop's built-in graphics, 640 took about 70 ms a frame
 * against 90 ms for the full 1280.
 */
export const DETECT_WIDTH = 640;


/**
 * Which tracking states let the phone steer the stand (RADAR SEARCH steers by the radar's
 * loudness, but it's still the phone deciding). In the others (TAP A PERSON and LOST) the
 * website stops sending moves and the stand holds still. (The SightLine firmware only
 * steers by radar on its own once Bluetooth is gone; older firmware did it whenever moves
 * stopped, so HIDDEN still stops sending moves when it loses the cover and the stand
 * doesn't report radar loudness.)
 */
export const CAMERA_STEERS_IN = ["tracking", "hidden", "following", "searching", "radar"] as const;
