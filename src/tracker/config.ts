// Settings for the Phone Tracker page. Everything you might want to tune is here.
//
// Keep the Bluetooth part in sync with the stand's firmware:
// phone-tracker/firmware/PhoneTracker_ESP32/PhoneTracker_ESP32.ino

/** Bluetooth IDs. They must match the firmware exactly. */
export const BLE = {
  name: "PhoneTracker",
  service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
  move: "6e400002-b5a3-f393-e0a9-e50e24dcca9e", // write "pan,tilt", like "90,90"
  radar: "6e400003-b5a3-f393-e0a9-e50e24dcca9e", // notifies "1" (someone there) or "0"
  mist: "6e400004-b5a3-f393-e0a9-e50e24dcca9e", // write "1" (mist on) or "0" (off)
};

/** How far the motors may turn, in degrees. The firmware enforces the same limits. */
export const LIMITS = {
  panMin: 10,
  panMax: 170,
  tiltMin: 45,
  tiltMax: 135,
  center: 90,
};

/** The firmware moves each motor 15% of the remaining way every 20 ms. */
export const SERVO_EASE = 0.15;
export const SERVO_TICK_MS = 20;
/** Roughly the fastest an HS-422 servo turns (degrees per second). An estimate. */
export const SERVO_MAX_SPEED = 280;

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
};

/** Timing and behaviour of the tracking brain. */
export const TUNING = {
  /** After a missed detection, keep moving the way you were heading for this long. */
  coastMs: 600,
  /** A box this close to the left or right edge (fraction of the frame) counts as "at the edge". */
  edgeMargin: 0.1,
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
  /** Following you out of the frame: turn at least this fast, and at most this fast (degrees/second). */
  followMinSpeed: 25,
  followMaxSpeed: 90,
  /** Keep turning toward where you went for at most this long. */
  followMaxMs: 3500,
  /** If the stand hits its turning limit while following, wait this long before sweeping. */
  limitPauseMs: 700,
  /** Sweep speed while searching the room (degrees/second). */
  sweepSpeed: 30,
  /** How quickly the saved look adapts to lighting changes (0 = never, 1 = instantly). Only while sure it's them. */
  lookUpdate: 0.02,
  /** Follow someone who only "sort of" looks like the target (over matchLimit) for at most this long. */
  doubtMs: 1500,
  /** Switch to another person if they look this much more like the target than the one we're on. */
  switchMargin: 0.15,
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
  /** How sure the cover tracker must be (0-1) before the stand follows a moving blanket. */
  lumpMinScore: 0.55,
};

/** Long side of the small copy of each frame used for colours and the cover tracker. */
export const ANALYSIS_WIDTH = 320;

/**
 * Long side of the copy the person detector sees (its width with the phone sideways).
 * Smaller is faster: on a laptop's built-in graphics, 640 took about 70 ms a frame
 * against 90 ms for the full 1280.
 */
export const DETECT_WIDTH = 640;

/** Which tracking states turn the mist on when the mist is set to "Follow me". */
export const MIST_FOLLOW_MODES = ["tracking", "hidden", "following"] as const;

/**
 * Which tracking states let the camera steer the stand. In the others (TAP A PERSON
 * and LOST) the website stops sending moves, and a two-radar SightLine stand
 * steers by radar instead, which also works in the dark.
 */
export const CAMERA_STEERS_IN = ["tracking", "hidden", "following", "searching"] as const;
