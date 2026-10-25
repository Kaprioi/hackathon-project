// The Phone Tracker page (/tracker). Shows the camera, draws a box around each
// person, lets you tap one to follow, and drives the stand.
// Laid out for phones first (either way up), and still works on a PC.
//
// How the pieces fit:
//   camera frame -> detector.ts (find people) -> brain.ts (decide) -> stand.ts (Bluetooth to the ESP32)
//                                               -> events.ts (small text events) -> cloud.ts (Supabase, for the family page)
//                -> faces.ts (now and then, one face fingerprint) -> back into brain.ts

import { useCallback, useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, CSSProperties, PointerEvent, ReactNode } from "react";
import { Link } from "react-router";
import BackButton from "../components/BackButton";
import { buttonVariants } from "../components/ButtonLink";
import Highlight from "../components/Highlight";
import LanguagePicker from "../components/LanguagePicker";
import { Blobs, LogoMark } from "../components/SiteLayout";
import { useLanguage } from "../i18n/useLanguage";
import { supabase } from "../lib/supabase";
import type { BrainOutput, Mode } from "./brain.ts";
import { Brain, MODE_LABEL, predictAim, towardLevel, whereaboutsText } from "./brain.ts";
import type { Settings } from "./config.ts";
import {
  ANALYSIS_WIDTH,
  CAMERA_STEERS_IN,
  cameraTurnsWithStand,
  DETECT_WIDTH,
  EMERGENCY,
  FACE,
  LIMITS,
  TILT,
  TUNING,
} from "./config.ts";
import ReminderPopup from "../components/ReminderPopup";
import { shouldSendInactive, startWatch, watchSaw } from "../family/noMovement.ts";
import { unlockVoice } from "../family/voice";
import { rememberWatching, takeReopened } from "./cameraPhone.ts";
import { Cloud } from "./cloud.ts";
import type { Detection, PersonDetector } from "./detector.ts";
import { createPersonDetector, isIPhone, preferredDelegate } from "./detector.ts";
import type { FaceLabel, FaceReader, ReadMiss } from "./faces.ts";
import { FaceWatcher, createFaceReader, cropHead } from "./faces.ts";
import type { EmergencyKind } from "./emergency.ts";
import { EmergencyWatch } from "./emergency.ts";
import type { MovementEvent } from "./events.ts";
import { Reporter } from "./events.ts";
import { HandheldCamera, viewTurn } from "./handheld.ts";
import type { Turn } from "./orientation.ts";
import { boxFromUpright, deviceTurn, fromUpright, pictureTurn, screenAngle, toUpright } from "./orientation.ts";
import type { Angles, Box } from "./geometry.ts";
import { centerX, centerY, contains, iou } from "./geometry.ts";
import { settingsToSave, startSettings } from "./savedSettings.ts";
import { ServoModel } from "./servoModel.ts";
import type { StandStatus } from "./stand.ts";
import { Stand } from "./stand.ts";
import type { RadarEnergy } from "./radarGuide.ts";

type Camera = Settings["camera"];

interface Snapshot {
  mode: Mode;
  note: string;
  match: number | null;
  aim: Angles | null;
  fps: number;
  people: number;
  portrait: boolean;
  /** How far the camera picture is being turned for the AI (degrees counterclockwise). */
  turn: Turn;
  /** How many face fingerprints of the target are saved. */
  facesSaved: number;
  /** How long the person detector takes per picture (milliseconds, smoothed). */
  aiMs: number;
  /** What the tracked person seems to be doing (for the emergency alert), or null. */
  posture: "standing" | "sitting" | "lying" | null;
  /** Why no face was read lately: none where the head should be, or too far away. */
  faceMiss: ReadMiss | null;
  /** Where the target is believed to be while out of view, in words ("Out of view - to your left"). */
  whereabouts: string | null;
}

/** Face recognition: not wanted, still loading its AI, ready, or couldn't load. */
type FaceStatus = "off" | "loading" | "ready" | "failed";

/** The emergency alert on screen: "Are you OK?" until `endsAt`, then a pretend call from `callStart`. */
interface Alarm {
  kind: EmergencyKind;
  phase: "ask" | "calling";
  endsAt: number;
  callStart: number;
}

/** Plays tones (the sound is unlocked by the Start watching tap; without it, it stays silent). */
function tone(ctx: AudioContext, freqs: number[], start: number, seconds: number, volume: number): void {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.setValueAtTime(0, start + seconds);
  gain.connect(ctx.destination);
  for (const f of freqs) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(gain);
    o.start(start);
    o.stop(start + seconds);
  }
}

/** Three short beeps, to get attention. */
function beep(ctx: AudioContext | null): void {
  if (!ctx) return;
  for (let i = 0; i < 3; i++) tone(ctx, [880], ctx.currentTime + i * 0.35, 0.2, 0.25);
}

/** A phone ringing (two seconds on, four off) until the returned function is called. */
function ring(ctx: AudioContext | null): () => void {
  if (!ctx) return () => {};
  const once = () => tone(ctx, [440, 480], ctx.currentTime, 2, 0.2);
  once();
  const id = window.setInterval(once, 6000);
  return () => window.clearInterval(id);
}

interface LogLine {
  time: string;
  mode: Mode;
  note: string;
}

/** Is someone signed in, so updates can go to the family page? */
type Account = "checking" | "signed-in" | "signed-out" | "no-database";

/** Plain words for the "family sees" line. */
const EVENT_WORDS: Record<MovementEvent["kind"], string> = {
  moving: "Moving around",
  still: "Staying still",
  nobody: "Nobody in view",
  fall: "Possible fall",
  heartbeat: "Still watching",
  started: "Started watching",
  stopped: "Stopped watching",
  inactive: "No movement for a while",
};

function describe(e: MovementEvent): string {
  return [EVENT_WORDS[e.kind], e.zone && `${e.zone} side`, e.posture && e.posture !== "unknown" && e.posture]
    .filter(Boolean)
    .join(" - ");
}

const SETTINGS_KEY = "phoneTracker.settings.v1";
const FACES_CHOSEN_KEY = "phoneTracker.facesChosen.v1";
const TILT_CHOSEN_KEY = "phoneTracker.tiltChosen.v1";

/** A hidden page can't watch (the browser pauses it), so after this long the camera stops and tells the family. */
const HIDDEN_STOP_MS = 15_000;
/** Tabs in this browser tell each other when one starts watching, so only one watches at a time. */
const TABS_CHANNEL = "carenest-camera";
const HIDDEN_NOTE =
  "The camera stopped because this page was hidden or the screen turned off. Keep this page open on the screen while it watches.";
const OTHER_TAB_NOTE = "The camera is now watching in another tab, so it stopped here.";
const REOPENED_NOTE = "The iPhone restarted CareNest, so the camera stopped. Tap Start watching to carry on.";

/** A touch counts as a tap only if it's this short and moves this little. */
const TAP_MAX_MS = 600;
const TAP_MAX_MOVE_PX = 20;

// Keep controls clear of the notch, rounded corners and the home bar.
const SIDES = {
  paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
  paddingRight: "max(0.5rem, env(safe-area-inset-right))",
};
const SAFE_TOP: CSSProperties = { ...SIDES, paddingTop: "max(0.5rem, env(safe-area-inset-top))" };
const SAFE_BOTTOM: CSSProperties = { ...SIDES, paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" };
const SAFE_ALL: CSSProperties = { ...SAFE_TOP, ...SAFE_BOTTOM };
const MIRROR: CSSProperties = { transform: "scaleX(-1)" };

// The ring that flashes where you tap.
const TAP_RING_CSS = `
@keyframes tracker-tap {
  from { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
  to { transform: translate(-50%, -50%) scale(1); opacity: 0; }
}
.tracker-tap {
  position: absolute; width: 72px; height: 72px; border: 3px solid #fff; border-radius: 9999px;
  pointer-events: none; animation: tracker-tap 0.45s ease-out forwards;
}`;

/** The defaults for this phone, as for a phone with nothing saved. */
function defaultSettings(): Settings {
  return startSettings(null, isIPhone(), false, false);
}

function loadSettings(): Settings {
  let saved: Partial<Settings> | null = null;
  let facesChosen = false;
  let tiltChosen = false;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) saved = JSON.parse(raw) as Partial<Settings>;
    facesChosen = localStorage.getItem(FACES_CHOSEN_KEY) === "yes";
    tiltChosen = localStorage.getItem(TILT_CHOSEN_KEY) === "yes";
  } catch {
    // private browsing or blocked storage: just use the defaults
  }
  return startSettings(saved, isIPhone(), facesChosen, tiltChosen);
}

/** Someone chose up/down by hand (Flip up/down), so it's kept; the page's own flips aren't (savedSettings.ts). */
function rememberTiltChoice(): void {
  try {
    localStorage.setItem(TILT_CHOSEN_KEY, "yes");
  } catch {
    // not saved; up/down then starts from the default again
  }
}

/** Someone switched face recognition on or off by hand, so an iPhone keeps their choice. */
function rememberFacesChoice(): void {
  try {
    localStorage.setItem(FACES_CHOSEN_KEY, "yes");
  } catch {
    // not saved; an iPhone then starts with faces off again
  }
}

/** Draws the video frame onto `canvas` at w x h, turned upright by `turn` (counterclockwise). */
function drawUpright(canvas: HTMLCanvasElement, video: HTMLVideoElement, turn: Turn, w: number, h: number): void {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (turn === 0) {
    ctx.drawImage(video, 0, 0, w, h);
    return;
  }
  const sideways = turn === 90 || turn === 270;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((-turn * Math.PI) / 180);
  const cw = sideways ? h : w; // the camera picture's size before turning
  const ch = sideways ? w : h;
  ctx.drawImage(video, -cw / 2, -ch / 2, cw, ch);
  ctx.restore();
}

/** Saves the settings, with up/down as last chosen by hand (savedSettings.ts: never an automatic flip). */
function saveSettings(s: Settings, handTiltSign: Settings["tiltSign"]): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsToSave(s, handTiltSign)));
  } catch {
    // not saved; fine
  }
}

/** The kind of error the browser gave, like "NotAllowedError", or "". */
function errorName(e: unknown): string {
  return typeof e === "object" && e !== null && "name" in e ? String(e.name) : "";
}

/** Turns a camera error into words that say what to do. */
function cameraErrorText(e: unknown): string {
  const name = errorName(e);
  if (name === "NotAllowedError" || name === "SecurityError")
    return "The camera is blocked for this page. Allow it in the browser's site settings (the icon next to the address), then reload.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera found on this device.";
  if (name === "NotReadableError" || name === "AbortError")
    return "The camera is busy. Close other apps or tabs that use it, then try again.";
  return `Couldn't start the camera: ${e instanceof Error ? e.message : String(e)}`;
}

/**
 * Opens the front or back camera. `avoid` is the camera that was open before a flip:
 * if asking by direction gives that same camera again (common on a PC with two
 * webcams, which don't say which way they face), take a different one.
 */
async function openCamera(camera: Camera, avoid?: string): Promise<MediaStream> {
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
  const get = (video: MediaTrackConstraints) => navigator.mediaDevices.getUserMedia({ video, audio: false });
  const byDirection = () => get({ facingMode: { ideal: camera === "front" ? "user" : "environment" }, ...size });
  let stream: MediaStream;
  try {
    stream = await byDirection();
  } catch (e) {
    // Right after closing the other camera, some phones still call it busy. Try once more.
    if (errorName(e) !== "NotReadableError" && errorName(e) !== "AbortError") throw e;
    await new Promise((r) => setTimeout(r, 400));
    stream = await byDirection();
  }
  if (avoid && stream.getVideoTracks()[0]?.getSettings().deviceId === avoid) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const other = devices.find((d) => d.kind === "videoinput" && d.deviceId && d.deviceId !== avoid);
    if (other) {
      stream.getTracks().forEach((t) => t.stop());
      stream = await get({ deviceId: { exact: other.deviceId }, ...size });
    }
  }
  return stream;
}

async function countCameras(): Promise<number> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length;
  } catch {
    return 0;
  }
}

const MODE_STYLE: Record<Mode, { pill: string; stroke: string }> = {
  idle: { pill: "bg-white text-ink", stroke: "#ffffff" },
  tracking: { pill: "bg-leaf text-white", stroke: "#3ddc97" },
  hidden: { pill: "bg-sun text-ink", stroke: "#ffd84d" },
  following: { pill: "bg-coral text-ink", stroke: "#ff9f7a" },
  searching: { pill: "bg-coral text-ink", stroke: "#ff9f7a" },
  radar: { pill: "bg-lilac text-ink", stroke: "#b9a4f5" },
  lost: { pill: "bg-red-700 text-white", stroke: "#ff6b6b" },
};

/** Where the video actually appears inside an element using object-fit: contain. */
function contentRect(cw: number, ch: number, vw: number, vh: number) {
  const scale = Math.min(cw / vw, ch / vh);
  const w = vw * scale;
  const h = vh * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

/**
 * Draws the boxes over the video. Boxes come in the upright picture the AI saw; `turn`
 * says how that picture was turned from the camera's, so they're turned back here.
 */
function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  people: Box[],
  out: BrainOutput,
  matchLimit: number,
  mirrored: boolean,
  turn: Turn,
  faceLabels: FaceLabel[],
  now: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx || !video.videoWidth) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const r = contentRect(cw, ch, video.videoWidth, video.videoHeight);
  // Back to the camera's own picture, then flipped left to right if it's shown mirrored (selfie).
  const toScreen = (upright: Box) => {
    const b = boxFromUpright(upright, turn);
    return { x: r.x + (mirrored ? 1 - b.x - b.w : b.x) * r.w, y: r.y + b.y * r.h, w: b.w * r.w, h: b.h * r.h };
  };
  const pointToScreen = (x: number, y: number) => {
    const p = fromUpright(x, y, turn);
    return { x: r.x + (mirrored ? 1 - p.x : p.x) * r.w, y: r.y + p.y * r.h };
  };

  // Everyone the detector sees: thin white boxes, each labelled with how much they
  // look like the target (0.00 = same clothes colours; under "Match strictness" = counts as them).
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.font = "600 14px ui-monospace, monospace";
  people.forEach((p, i) => {
    const s = toScreen(p);
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    const m = out.matches[i];
    if (m === null || m === undefined) return;
    // Their latest face reading (number: 0 = the saved face), else what the brain was told.
    const read = [...faceLabels].reverse().find((l) => now - l.t < 3000 && iou(l.box, p) > 0.3);
    const d = read ? read.distance : undefined;
    const face = d === undefined ? out.faces[i] : d === null || d <= FACE.same ? true : d >= FACE.different ? false : null;
    const faceText =
      d === null
        ? "  face saved"
        : d !== undefined
          ? `  face ${d.toFixed(2)} ${face === true ? "✓" : face === false ? "✗" : "?"}`
          : face === true
            ? "  face ✓"
            : face === false
              ? "  face ✗"
              : "";
    const label = m.toFixed(2) + faceText;
    const lx = s.x + 4;
    const ly = Math.max(r.y + 4, s.y + 4);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(lx - 2, ly - 2, ctx.measureText(label).width + 8, 20);
    ctx.fillStyle = face === false ? "#ff8a8a" : face === true || m <= matchLimit ? "#3ddc97" : d !== undefined ? "#ffd84d" : "#ffffff";
    ctx.fillText(label, lx + 2, ly + 13);
  });

  // The target: thick coloured box, dashed when it's a guess (hidden under a cover).
  const color = MODE_STYLE[out.mode].stroke;
  if (out.target) {
    const s = toScreen(out.target);
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.setLineDash(out.mode === "hidden" ? [12, 8] : []);
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    ctx.setLineDash([]);
  }

  // Ran out of the picture, or the radar hears them off to one side: a big arrow on that
  // side (left/right of the upright picture).
  if ((out.mode === "following" || out.mode === "radar") && out.exitSide !== 0) {
    const left = out.exitSide < 0;
    const tip = pointToScreen(left ? 0.02 : 0.98, 0.5);
    const a = pointToScreen(left ? 0.1 : 0.9, 0.42);
    const b = pointToScreen(left ? 0.1 : 0.9, 0.58);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();
    ctx.fill();
  }
}

// Icon shapes from Lucide (lucide.dev, ISC licence).
const ICON = {
  flip: (
    <>
      <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
      <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
      <circle cx="12" cy="12" r="3" />
      <path d="m18 22-3-3 3-3" />
      <path d="m6 2 3 3-3 3" />
    </>
  ),
  bluetooth: <path d="m7 7 10 10-5 5V2l5 5L7 17" />,
  settings: (
    <>
      <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" />
      <path d="M14 2v4M8 10v4M16 18v4" />
    </>
  ),
  expand: <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />,
  shrink: <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
};

function Icon({ children, className = "size-6" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A half-circle dial showing where the stand is told to point. */
function PanDial({ aim }: { aim: Angles | null }) {
  const pan = aim?.pan ?? LIMITS.center;
  // 0 degrees on the dial = far left, 180 = far right.
  const angle = (Math.PI * (180 - pan)) / 180;
  const nx = 40 + 30 * Math.cos(angle);
  const ny = 40 - 30 * Math.sin(angle);
  return (
    <div
      className="flex items-center gap-1.5 rounded-2xl bg-black/65 px-2 py-1 text-sm"
      aria-label={`Stand pointing at ${pan.toFixed(0)} degrees`}
    >
      <svg width="56" height="32" viewBox="0 0 80 46" aria-hidden="true">
        <path d="M 6 40 A 34 34 0 0 1 74 40" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="4" />
        <line x1="40" y1="40" x2={nx} y2={ny} stroke="#ffd84d" strokeWidth="4" strokeLinecap="round" />
        <circle cx="40" cy="40" r="4" fill="#ffd84d" />
      </svg>
      <div className="leading-tight whitespace-nowrap">
        <div>Pan {pan.toFixed(0)}°</div>
        <div className="text-white/90">Tilt {(aim?.tilt ?? LIMITS.center).toFixed(0)}°</div>
      </div>
    </div>
  );
}

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "good" | "warn" }) {
  const toneClass = tone === "good" ? "bg-leaf text-white" : tone === "warn" ? "bg-sun text-ink" : "bg-black/65 text-white";
  return <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${toneClass}`}>{children}</span>;
}

function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  const { active, className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`min-h-11 rounded-2xl px-4 py-2 font-extrabold transition-transform active:scale-95 disabled:opacity-40 ${
        active ? "bg-brand text-on-brand hover:bg-brand-dark" : "bg-surface text-brand hover:bg-lilac"
      } ${className}`}
    />
  );
}

/** A square button for the bottom bar: an icon with a short word under it. */
function BarButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label: string; active?: boolean; good?: boolean },
) {
  const { icon, label, active, good, className = "", ...rest } = props;
  const color = active ? "bg-brand text-white" : good ? "bg-leaf text-white" : "bg-white/10 text-white";
  return (
    <button
      {...rest}
      className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1 text-sm leading-none font-bold transition-transform active:scale-95 disabled:opacity-40 ${color} ${className}`}
    >
      <Icon className="size-5">{icon}</Icon>
      <span>{label}</span>
    </button>
  );
}

/** Two or three choices side by side, one picked. */
function Choice<T extends string>(props: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const { label, options, value, onChange, disabled, icon } = props;
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 rounded-2xl bg-white/10 p-1">
      {icon && (
        <span className="flex items-center gap-1 px-1.5 text-sm font-bold">
          <Icon className="size-5">{icon}</Icon>
          {label}
        </span>
      )}
      {options.map(([v, text]) => (
        <button
          key={v}
          aria-pressed={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`min-h-10 rounded-xl px-3 text-sm font-bold transition-transform active:scale-95 disabled:opacity-40 ${
            value === v ? "bg-brand text-white" : "text-white"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** The emergency alert: "Are you OK?" with a countdown, then a pretend emergency call. */
function EmergencyScreen(props: { alarm: Alarm; familyAlerted: boolean; onOk: () => void; onCallNow: () => void; onEnd: () => void }) {
  const { alarm, familyAlerted, onOk, onCallNow, onEnd } = props;
  const what = alarm.kind === "fall" ? "Possible fall" : "Possible seizure";
  if (alarm.phase === "ask") {
    const left = Math.max(0, Math.ceil((alarm.endsAt - Date.now()) / 1000));
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`${what}. Are you OK?`}
        className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-red-700/95 px-4 py-6 text-center text-white"
        style={SAFE_ALL}
      >
        <p className="text-xl font-extrabold tracking-wide uppercase">{what} detected</p>
        <h2 className="text-4xl font-extrabold">Are you OK?</h2>
        <p className="text-7xl font-extrabold tabular-nums">{left}</p>
        <p className="px-4 text-lg">Calling emergency services in {left} s unless you press I'm OK.</p>
        <button
          onClick={onOk}
          className="min-h-16 w-full max-w-sm rounded-2xl bg-white px-8 text-3xl font-extrabold text-red-700 transition-transform active:scale-95"
        >
          I'm OK
        </button>
        <button onClick={onCallNow} className="min-h-12 rounded-xl px-4 text-lg font-bold underline">
          Call now
        </button>
      </div>
    );
  }
  const secs = Math.max(0, Math.floor((Date.now() - alarm.callStart) / 1000));
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Calling emergency services"
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-black/95 px-4 py-6 text-center text-white"
      style={SAFE_ALL}
    >
      <p className="rounded-full bg-sun px-4 py-1 text-base font-extrabold text-ink">Demo: no real call is made</p>
      <h2 className="px-4 text-3xl font-extrabold">Calling emergency services…</h2>
      <p className="text-lg text-white/90">
        {what} detected · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
      </p>
      {familyAlerted && <p className="text-base text-white/90">The family page has been alerted.</p>}
      <button
        onClick={onEnd}
        className="min-h-16 w-full max-w-sm rounded-2xl bg-red-600 px-8 text-2xl font-extrabold text-white transition-transform active:scale-95"
      >
        End call
      </button>
    </div>
  );
}

function ErrorBanner({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="pointer-events-auto flex max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl bg-red-700 px-4 py-2 text-sm font-semibold text-white"
    >
      <span>{text}</span>
      <button className="min-h-11 px-2 underline" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

export default function TrackerPage() {
  // Only the start screen is translated for now; the camera screen stays in English.
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const analysisRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<PersonDetector | null>(null);
  const detectorLoadRef = useRef<Promise<PersonDetector> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const deviceIdRef = useRef<string | undefined>(undefined);
  const cameraRequestRef = useRef(0); // only the newest camera request may finish
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const settingsRef = useRef<Settings>(loadSettings());
  // Up/down as last chosen by hand: the only one saved (the brain's own flips last this visit).
  const handTiltSignRef = useRef<Settings["tiltSign"]>(settingsRef.current.tiltSign);
  const brainRef = useRef<Brain>(new Brain(settingsRef.current));
  const standRef = useRef<Stand>(new Stand());
  const servoRef = useRef<ServoModel>(new ServoModel());
  const tapRef = useRef<{ x: number; y: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number; t: number }>());
  const lastAimRef = useRef<Angles | null>(null);
  const testingRef = useRef(false); // true while the motor test buttons are in charge
  const mirroredRef = useRef(settingsRef.current.camera === "front");
  const deviceTurnRef = useRef<Turn | null>(null); // which way the phone is turned, from its motion sensor
  const turnRef = useRef<Turn>(0); // how far the camera picture is turned for the AI right now
  const handheldRef = useRef(new HandheldCamera()); // where the camera points when the phone is moved by hand
  // Face recognition: the face AI (loaded the first time it's needed) and who to check when.
  const faceReaderRef = useRef<FaceReader | null>(null);
  const faceLoadRef = useRef<Promise<FaceReader> | null>(null);
  const faceWatcherRef = useRef<FaceWatcher | null>(null);
  if (!faceWatcherRef.current) {
    const source = document.createElement("canvas"); // the full camera picture, upright
    const crop = document.createElement("canvas"); // just the head
    faceWatcherRef.current = new FaceWatcher(async (box) => {
      const reader = faceReaderRef.current;
      const video = videoRef.current;
      if (!reader || !video?.videoWidth) return null;
      const turn = turnRef.current;
      const sideways = turn === 90 || turn === 270;
      const uw = sideways ? video.videoHeight : video.videoWidth;
      const uh = sideways ? video.videoWidth : video.videoHeight;
      const scale = Math.min(1, 1280 / Math.max(uw, uh));
      drawUpright(source, video, turn, Math.round(uw * scale), Math.round(uh * scale));
      const head = cropHead(source, box, crop);
      const face = await reader.read(head.canvas);
      // Too small a face (far away) gives an unreliable fingerprint.
      if (!face) return "none";
      return face.width / head.scale / scale >= FACE.minFacePx ? face.print : "small";
    });
  }
  const faceWatcher = faceWatcherRef.current;
  const reporterRef = useRef<Reporter>(new Reporter());
  const cloudRef = useRef<Cloud | null>(null);
  const sendChainRef = useRef<Promise<void>>(Promise.resolve());
  // When someone last moved, for the one "No movement for a while" event (see noMovement.ts).
  const stillWatchRef = useRef(startWatch(Date.now()));
  const watchingRef = useRef(false); // true from "Start watching" until "Stop watching" (flips don't count)
  const tabsRef = useRef<BroadcastChannel | null>(null);

  const [running, setRunning] = useState(false);
  const [account, setAccount] = useState<Account>(supabase ? "checking" : "no-database");
  const [lastSent, setLastSent] = useState("");
  const [sendError, setSendError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<Settings>(settingsRef.current);
  const [showSettings, setShowSettings] = useState(false);
  // The page always lays itself out for the iPhone on the stand, so the log starts folded away.
  const [showLog, setShowLog] = useState(false);
  const [standStatus, setStandStatus] = useState<StandStatus>(standRef.current.status);
  const [radar, setRadar] = useState<boolean | null>(null);
  const [radarEnergy, setRadarEnergy] = useState<RadarEnergy | null>(null);
  const [mirrored, setMirrored] = useState(mirroredRef.current);
  const [cameraCount, setCameraCount] = useState(0);
  const [cameraStopped, setCameraStopped] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  /** The care circle, once connected: its daily reminders show on this phone. */
  const [circleId, setCircleId] = useState("");
  /** Why the camera stopped by itself, shown on the start screen (English; translated when shown). */
  const [stopNote, setStopNote] = useState("");
  const [snap, setSnap] = useState<Snapshot>({
    mode: "idle",
    note: "Tap a person to lock on.",
    match: null,
    aim: null,
    fps: 0,
    people: 0,
    portrait: false,
    turn: 0,
    facesSaved: 0,
    aiMs: 0,
    posture: null,
    faceMiss: null,
    whereabouts: null,
  });
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("off");
  const [delegate, setDelegate] = useState(""); // "GPU" or "CPU": where the person detector runs

  const canFullscreen = !!document.fullscreenEnabled; // Android and PCs; not iPhone

  // The iPhone restarted CareNest while it was watching, and it came back here: say why it stopped.
  useEffect(() => {
    if (takeReopened()) setStopNote(REOPENED_NOTE);
  }, []);

  // Name the browser tab, like the other pages do.
  useEffect(() => {
    const previous = document.title;
    document.title = "Phone camera — CareNest";
    return () => {
      document.title = previous;
    };
  }, []);

  // Keep the screen showing the stand's state when Bluetooth or the radar changes.
  useEffect(() => {
    const stand = standRef.current;
    stand.onChange = () => {
      setStandStatus(stand.status);
      setRadar(stand.radar);
      setRadarEnergy(stand.energy);
    };
    return () => {
      stand.onChange = () => {};
    };
  }, []);

  // Which way the phone is really turned, from its motion sensor. Then a sideways picture
  // (phone sideways, auto-rotate off) can be turned upright for the AI. Android only:
  // iPhones ask permission first, so there the picture only turns with auto-rotate on.
  // The same sensor's gyroscope also says when the phone is turned by hand, so without
  // the stand the brain knows the camera moved, not everyone in the room.
  useEffect(() => {
    let lastT: number | null = null;
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (g?.x != null && g.y != null) deviceTurnRef.current = deviceTurn(g.x, g.y, deviceTurnRef.current);
      const now = performance.now();
      const r = e.rotationRate;
      if (r && lastT !== null) {
        const seconds = Math.min(0.2, (now - lastT) / 1000); // ignore gaps (page hidden)
        const s = settingsRef.current;
        const v = viewTurn(r, seconds, screenAngle(), mirroredRef.current, turnRef.current);
        handheldRef.current.move(now, s.panSign * v.right, s.tiltSign * v.down);
      }
      lastT = now;
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, []);

  /** Queue one small text event for the family page. Sent in order; failures are shown, not thrown. */
  const report = useCallback((event: MovementEvent) => {
    const cloud = cloudRef.current;
    if (!cloud) return;
    stillWatchRef.current = watchSaw(stillWatchRef.current, event.kind, Date.now());
    sendChainRef.current = sendChainRef.current.then(() =>
      cloud.send(event).then(
        () => {
          setLastSent(describe(event));
          setSendError("");
        },
        (e: unknown) => {
          // "inactive" is an extra: a database that hasn't been updated for it yet
          // (see supabase/migrations) shouldn't show an error.
          if (event.kind !== "inactive") setSendError(e instanceof Error ? e.message : String(e));
        },
      ),
    );
  }, []);

  // Once a minute while watching: if nobody has moved for 3 hours during the day
  // (8:00 to 21:00), send one "inactive" event so the family can be told, even
  // when nobody has the family page open. The next movement starts it over.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (!watchingRef.current || !shouldSendInactive(stillWatchRef.current, now)) return;
      stillWatchRef.current = { ...stillWatchRef.current, told: true };
      report({ kind: "inactive", zone: null, posture: null });
    }, 60_000);
    return () => clearInterval(timer);
  }, [running, report]);

  // Check whether someone is signed in (the family page only works for signed-in people).
  useEffect(() => {
    const db = supabase;
    if (!db) return;
    void db.auth.getSession().then(({ data }) => setAccount(data.session ? "signed-in" : "signed-out"));
    const { data } = db.auth.onAuthStateChange((_event, session) => {
      setAccount(session ? "signed-in" : "signed-out");
      // Signed out, or someone else signed in (maybe in another tab): forget the old
      // care circle, and if the camera is on, carry on in the new person's circle.
      if (!cloudRef.current || cloudRef.current.userId === session?.user.id) return;
      cloudRef.current = null;
      setCircleId("");
      if (!session || !watchingRef.current) return;
      // Later, not inside this callback: Supabase asks not to call it from here.
      setTimeout(() => {
        Cloud.connect(db).then(
          (cloud) => {
            if (cloudRef.current || !watchingRef.current) return;
            cloudRef.current = cloud;
            setCircleId(cloud.circleId);
            report(reporterRef.current.start(performance.now()));
          },
          (e: unknown) => setSendError(e instanceof Error ? e.message : String(e)),
        );
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [report]);

  // While this page is open: use the whole screen (under the notch too, with the
  // controls padded clear of it) and a black browser bar on Android.
  useEffect(() => {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const viewportBefore = viewport?.content;
    if (viewport) viewport.content = "width=device-width, initial-scale=1.0, viewport-fit=cover";
    const theme = document.createElement("meta");
    theme.name = "theme-color";
    theme.content = "#000000";
    document.head.appendChild(theme);
    return () => {
      if (viewport && viewportBefore !== undefined) viewport.content = viewportBefore;
      theme.remove();
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /**
   * Loads the face AI once (about 7 MB the first time, then a few seconds preparing the
   * graphics chip, which can freeze the picture). Started with the camera, before anyone is tapped.
   */
  // ---- The emergency alert (a fall or seizure of the person being followed; emergency.ts) ----
  const emergencyRef = useRef(new EmergencyWatch());
  const audioRef = useRef<AudioContext | null>(null);
  const ringRef = useRef<(() => void) | null>(null); // stops the ringing
  const alarmRef = useRef<Alarm | null>(null);
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const [, setTick] = useState(0); // redraws the countdown

  /** Sound needs a tap before it's allowed: called from Start watching and Test the alert. */
  const unlockSound = useCallback(() => {
    try {
      audioRef.current ??= new AudioContext();
      void audioRef.current.resume();
    } catch {
      // no sound on this browser; the alert still shows
    }
  }, []);

  const raiseAlarm = useCallback((kind: EmergencyKind) => {
    if (alarmRef.current) return;
    const a: Alarm = { kind, phase: "ask", endsAt: Date.now() + EMERGENCY.countdownS * 1000, callStart: 0 };
    alarmRef.current = a;
    setAlarm(a);
    navigator.vibrate?.([400, 200, 400]);
    beep(audioRef.current);
  }, []);

  /** The pretend emergency call (never dials anything), and the alert on the family page. */
  const startCall = useCallback(() => {
    const a = alarmRef.current;
    if (!a || a.phase === "calling") return;
    const next: Alarm = { ...a, phase: "calling", callStart: Date.now() };
    alarmRef.current = next;
    setAlarm(next);
    ringRef.current?.();
    ringRef.current = ring(audioRef.current);
    // The family page only knows "fall" so far; a seizure shows there as "Possible fall".
    report({ kind: "fall", zone: null, posture: "lying" });
  }, [report]);

  const endAlarm = useCallback(() => {
    ringRef.current?.();
    ringRef.current = null;
    alarmRef.current = null;
    setAlarm(null);
  }, []);

  // While the alert is up: tick the countdown, and call when it runs out.
  useEffect(() => {
    if (!alarm) return;
    const id = window.setInterval(() => {
      setTick((n) => n + 1);
      const a = alarmRef.current;
      if (a?.phase === "ask" && Date.now() >= a.endsAt) startCall();
    }, 250);
    return () => window.clearInterval(id);
  }, [alarm, startCall]);

  useEffect(() => () => ringRef.current?.(), []); // stop ringing when leaving the page

  const loadFaces = useCallback(() => {
    if (faceLoadRef.current) return;
    setFaceStatus("loading");
    faceLoadRef.current = createFaceReader();
    faceLoadRef.current.then(
      (reader) => {
        faceReaderRef.current = reader;
        setFaceStatus("ready");
      },
      (e: unknown) => {
        console.warn("Face recognition couldn't load:", e);
        setFaceStatus("failed");
      },
    );
  }, []);

  // Face recognition switched off: forget the saved face.
  useEffect(() => {
    if (!settings.faces) {
      faceWatcher.forget();
      brainRef.current.forgetFaces();
    }
  }, [settings.faces, faceWatcher]);

  // The tap ring fades by itself; remove it afterwards.
  useEffect(() => {
    if (!ripple) return;
    const id = window.setTimeout(() => setRipple(null), 500);
    return () => window.clearTimeout(id);
  }, [ripple]);

  /** Changes settings. `auto`: the brain flipped up/down by itself, which isn't saved (savedSettings.ts). */
  const updateSettings = useCallback((patch: Partial<Settings>, auto = false) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    brainRef.current.settings = next;
    if (!auto) {
      if (patch.tiltSign !== undefined) {
        handTiltSignRef.current = patch.tiltSign;
        rememberTiltChoice();
      }
      saveSettings(next, handTiltSignRef.current);
    }
    setSettings(next);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** Keeps the screen from dimming while tracking. The browser drops this whenever the page is hidden. */
  const keepScreenOn = useCallback(async () => {
    if (wakeLockRef.current && !wakeLockRef.current.released) return;
    try {
      wakeLockRef.current = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      // keeping the screen on is a nice-to-have
    }
  }, []);

  const startCamera = useCallback(
    async (avoidDeviceId?: string) => {
      unlockSound(); // the emergency alert can only make sound after a tap
      unlockVoice(); // and reminders can only be said out loud after one
      setError("");
      setStopNote("");
      setCameraStopped(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't open the camera. The page must be opened over https (or on localhost).");
        return;
      }
      const request = ++cameraRequestRef.current;
      setLoading(true);
      try {
        stopCamera(); // phones can only have one camera open at a time
        let stream: MediaStream;
        try {
          stream = await openCamera(settingsRef.current.camera, avoidDeviceId);
        } catch (e) {
          if (request === cameraRequestRef.current) setError(cameraErrorText(e));
          return;
        }
        if (request !== cameraRequestRef.current) {
          stream.getTracks().forEach((t) => t.stop()); // a newer request (another flip) took over
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const info = track?.getSettings() ?? {};
        deviceIdRef.current = info.deviceId;
        // Show the front camera mirrored, like a selfie. Phones say which way a camera
        // faces; PC webcams usually don't, so go by the setting.
        const mirror = info.facingMode ? info.facingMode === "user" : settingsRef.current.camera === "front";
        mirroredRef.current = mirror;
        setMirrored(mirror);
        track?.addEventListener("ended", () => {
          if (streamRef.current === stream) setCameraStopped(true);
        });
        const video = videoRef.current!;
        video.srcObject = stream;
        try {
          await video.play();
        } catch (e) {
          if (errorName(e) !== "AbortError") throw e; // replaced by a newer stream
        }
        void countCameras().then(setCameraCount);
        if (!detectorRef.current) {
          detectorLoadRef.current ??= createPersonDetector(preferredDelegate());
          try {
            detectorRef.current = await detectorLoadRef.current;
            setDelegate(detectorRef.current.delegate);
          } catch (e) {
            detectorLoadRef.current = null;
            stopCamera();
            setError(
              `Couldn't load the AI model. Check the internet connection and try again. (${e instanceof Error ? e.message : String(e)})`,
            );
            return;
          }
        }
        // First start (not a camera flip or a wake-up): connect to the family page and say so.
        if (!watchingRef.current) {
          if (supabase && !cloudRef.current) {
            try {
              cloudRef.current = await Cloud.connect(supabase);
              setCircleId(cloudRef.current.circleId);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              setSendError(msg);
              setError(`Your family won't see updates: ${msg}`);
            }
          }
          watchingRef.current = true;
          rememberWatching(true); // so the iPhone restarting CareNest comes back here (cameraPhone.ts)
          handheldRef.current.reset(); // the hand-held camera angle starts from straight ahead
          report(reporterRef.current.start(performance.now()));
          tabsRef.current?.postMessage("started");
        }
        void keepScreenOn();
        setRunning(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (request === cameraRequestRef.current) setLoading(false);
      }
    },
    [stopCamera, keepScreenOn, report, unlockSound],
  );

  /**
   * Stops watching: turns the camera off and (unless `tellFamily` is false) tells the
   * family page. `note` says why, when it stopped by itself. Safe to call twice.
   */
  const finishWatching = useCallback(
    (note: string, tellFamily: boolean) => {
      if (!watchingRef.current) return;
      watchingRef.current = false;
      if (tellFamily) report(reporterRef.current.stop());
      cameraRequestRef.current++; // cancel a camera start that's still under way
      stopCamera();
      brainRef.current.release();
      faceWatcher.forget();
      setRunning(false);
      setLoading(false);
      setCameraStopped(false);
      setStopNote(note);
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    },
    [stopCamera, report, faceWatcher],
  );

  const stopWatching = useCallback(() => {
    rememberWatching(false);
    finishWatching("", true);
  }, [finishWatching]);

  // Closing the tab (or the browser) doesn't run the clean-up below, so say
  // "stopped" here. The page is going away, so it is sent the keepalive way.
  useEffect(() => {
    const onPageHide = () => {
      if (!watchingRef.current) return;
      watchingRef.current = false;
      cloudRef.current?.sendOnClose(reporterRef.current.stop());
      stopCamera();
      setRunning(false);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [stopCamera]);

  // A hidden page (another tab, another app, screen off) is paused by the browser,
  // so it isn't really watching. After a short while, stop and tell the family.
  useEffect(() => {
    let hiddenAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        timer = setTimeout(() => finishWatching(HIDDEN_NOTE, true), HIDDEN_STOP_MS);
        return;
      }
      // A sleeping phone doesn't run timers, so check again when it wakes up.
      if (hiddenAt && Date.now() - hiddenAt >= HIDDEN_STOP_MS) finishWatching(HIDDEN_NOTE, true);
      hiddenAt = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [finishWatching]);

  // Only one tab watches: when another tab starts, this one stops quietly
  // (the new tab has already told the family it started).
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const tabs = new BroadcastChannel(TABS_CHANNEL);
    tabs.onmessage = (e) => {
      if (e.data === "started") finishWatching(OTHER_TAB_NOTE, false);
    };
    tabsRef.current = tabs;
    return () => {
      tabs.close();
      tabsRef.current = null;
    };
  }, [finishWatching]);

  /** Switch to the front or back camera. The picture changes completely, so let go of the target. */
  const chooseCamera = useCallback(
    (camera: Camera) => {
      if (camera === settingsRef.current.camera) return;
      updateSettings({ camera });
      if (!running) return;
      brainRef.current.release();
      faceWatcher.forget();
      void startCamera(deviceIdRef.current);
    },
    [running, updateSettings, startCamera],
  );

  // Coming back to the page (after switching apps or locking the phone): turn the
  // screen lock back on, and wake the camera if the phone paused or closed it.
  useEffect(() => {
    if (!running) return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void keepScreenOn();
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track || track.readyState === "ended") void startCamera();
      else if (videoRef.current?.paused) void videoRef.current.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [running, startCamera, keepScreenOn]);

  // Clean up when leaving the page.
  useEffect(() => {
    const stand = standRef.current;
    return () => {
      if (watchingRef.current) report(reporterRef.current.stop());
      watchingRef.current = false;
      rememberWatching(false); // left the camera page on purpose
      stopCamera();
      detectorRef.current?.close();
      detectorRef.current = null;
      detectorLoadRef.current = null;
      stand.disconnect();
      void wakeLockRef.current?.release();
    };
  }, [stopCamera, report]);

  // The main loop: once per new camera frame.
  useEffect(() => {
    if (!running) return;
    if (!analysisRef.current) analysisRef.current = document.createElement("canvas");
    const analysis = analysisRef.current;
    const actx = analysis.getContext("2d", { willReadFrequently: true });
    const detectCanvas = document.createElement("canvas");
    const dctx = detectCanvas.getContext("2d");
    let raf = 0;
    let lastVideoTime = -1;
    let lastDetectT = -Infinity;
    let aiMs = 0; // detector time per picture, smoothed
    let frames = 0;
    let fpsStart = performance.now();
    let fps = 0;
    let lastUi = 0;
    let lastNote = "";
    let lastError = "";
    let cameraSteering = false; // did the camera steer the stand last frame?
    // The last aim that's moving steadily (someone walking): moved on between camera frames.
    let moving: { aim: Angles; vel: Angles; t: number } | null = null;
    // Once the phone stops steering: the last aim, its tilt easing back to level (the pan stays put).
    let homing: Angles | null = null;
    let prevStepT = 0;

    // Runs once per animation frame. If anything inside throws, show it on screen
    // instead of silently freezing the boxes.
    const tick = () => {
      raf = requestAnimationFrame(tick);
      try {
        step();
        between();
      } catch (e) {
        const msg = `Tracker error: ${e instanceof Error ? e.message : String(e)}`;
        if (msg !== lastError) {
          lastError = msg;
          console.error(e);
          setError(msg);
        }
      }
    };

    // The camera finds people about 15 times a second, but the screen refreshes 60 times. In
    // between, move a moving aim on by its speed, so the stand turns smoothly, not in steps.
    const between = () => {
      const stand = standRef.current;
      if (!moving || !stand.connected || testingRef.current) return;
      const a = predictAim(moving.aim, moving.vel, performance.now() - moving.t);
      servoRef.current.setTarget(a, performance.now() + TUNING.bluetoothMs);
      stand.move(a.pan, a.tilt);
      lastAimRef.current = a;
    };

    const step = () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || !actx || !dctx || video.readyState < 2 || video.currentTime === lastVideoTime) return;
      if (!video.videoWidth || !video.videoHeight) return;
      const t = performance.now();
      // At most maxDetectFps frames a second: plenty for following people, and less heat and
      // memory on phones (an iPhone reloaded the page by itself after tracking a while).
      if (t - lastDetectT < 1000 / TUNING.maxDetectFps) return;
      lastDetectT = t;
      lastVideoTime = video.currentTime;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const s = settingsRef.current;

      // Turn the picture so people stand upright for the AI. With the phone sideways and
      // auto-rotate off, the camera picture arrives on its side; turned, the AI finds
      // people it would otherwise miss. Everything after this works in the upright picture.
      const turn: Turn =
        s.turn === "auto" ? pictureTurn(deviceTurnRef.current, screenAngle(), mirroredRef.current) : (Number(s.turn) as Turn);
      turnRef.current = turn;
      const sideways = turn === 90 || turn === 270;
      const uw = sideways ? vh : vw; // the upright picture's size
      const uh = sideways ? vw : vh;
      const longSide = Math.max(uw, uh);

      // The detector gets a smaller copy, 640 on its long side (faster than the full-size
      // frame). Measuring the long side keeps an upright phone as fast as a sideways one.
      const dScale = Math.min(1, DETECT_WIDTH / longSide);
      const dw = Math.max(1, Math.round(uw * dScale));
      const dh = Math.max(1, Math.round(uh * dScale));
      drawUpright(detectCanvas, video, turn, dw, dh);
      let found: Detection[] = [];
      const aiStart = performance.now();
      try {
        found = detector.detect(detectCanvas, t);
        aiMs = aiMs ? aiMs * 0.9 + (performance.now() - aiStart) * 0.1 : performance.now() - aiStart;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      // Sure detections are people. Unsure ones (covering their face, an odd pose) only
      // help the brain keep the target it already has; they aren't drawn or reported.
      const people: Box[] = found.filter((d) => d.score >= TUNING.personScore);
      const weak: Box[] = found.filter((d) => d.score < TUNING.personScore);

      // A smaller copy again (320 on its long side) for clothes colours and the cover tracker.
      const aScale = ANALYSIS_WIDTH / longSide;
      const aw = Math.max(1, Math.round(uw * aScale));
      const ah = Math.max(1, Math.round(uh * aScale));
      if (analysis.width !== aw || analysis.height !== ah) {
        analysis.width = aw;
        analysis.height = ah;
      }
      actx.drawImage(detectCanvas, 0, 0, aw, ah);
      const image = actx.getImageData(0, 0, aw, ah);

      // Where was the camera pointing when this frame was taken? Without a stand it never moves.
      const stand = standRef.current;
      const servo = servoRef.current;
      // When the radars are steering (SightLine stand), trust the angle the stand reports.
      if (stand.connected && !cameraSteering && stand.reported) servo.sync(stand.reported, t);
      servo.step(t);
      // While the camera steers, the stand (SightLine) still reports where it points. If the
      // up/down guess has been clearly off that for a moment, believe the stand's tilt; the
      // brain also checks up/down against it. Left/right keep the guess, exactly as before.
      const standTilt = stand.connected ? (stand.freshReport(t)?.tilt ?? null) : null;
      if (cameraSteering && standTilt !== null) servo.followReportedTilt(standTilt, t);
      // Without a stand, the phone's gyroscope says how it's been turned by hand (if it has one).
      const handheld = handheldRef.current;
      // While nobody is being followed, keep the hand-held angle at straight ahead, so a new pick
      // starts from the middle. (Never mid-tracking: every remembered position would jump.)
      if (!stand.connected && brainRef.current.currentMode === "idle") handheld.reset();
      // A computer's webcam beside the stand doesn't turn when the motor does: then the camera
      // always looks straight ahead, and the brain is told separately where the head points.
      const onStand = cameraTurnsWithStand(s);
      const head = servo.at(t - TUNING.latencyMs);
      const camera =
        stand.connected && onStand
          ? head
          : !stand.connected && handheld.active
            ? handheld.at(t - TUNING.latencyMs)
            : { pan: LIMITS.center, tilt: LIMITS.center };

      // Held upright, the picture's width is the camera's narrow side, so swap the two
      // camera angles. Then a step to the side counts the same either way up.
      const portrait = uh > uw;
      brainRef.current.settings = portrait ? { ...s, fovH: s.fovV, fovV: s.fovH } : s;

      const tap = tapRef.current;
      tapRef.current = null;
      const out = brainRef.current.update({
        t,
        people,
        image,
        radar: stand.connected ? stand.radar : null,
        radarEnergy: stand.connected ? stand.energy : null,
        camera,
        standTilt,
        head: stand.connected && !onStand ? head : undefined,
        tap,
        weak,
        faces: s.faces ? faceWatcher.takeVerdicts() : [],
      });

      // The brain flipped up/down (the motor turned the wrong way, or it took back such a flip):
      // keep that for this visit, but don't save it (savedSettings.ts).
      if (out.flippedTilt) updateSettings({ tiltSign: s.tiltSign === 1 ? -1 : 1 }, true);

      // A tap that picked someone new: forget the old target's face. (A tap on nobody keeps it.)
      if (out.picked) {
        faceWatcher.forget();
        emergencyRef.current.reset();
      }

      // Emergency: a fall or seizure of the person being followed raises the alert.
      if (s.emergency) {
        const kind = emergencyRef.current.update(t, out.mode === "tracking" ? out.target : null, uw / uh);
        if (kind) raiseAlarm(kind);
      }

      // Faces: once the face AI is ready, the watcher reads one face now and then in the background.
      if (s.faces) {
        loadFaces();
        if (faceReaderRef.current && out.mode !== "idle") faceWatcher.step(t, people, out, s.matchLimit);
      }

      for (const event of reporterRef.current.update(t, people, uw / uh)) report(event);

      // A short buzz when a tap locks on (Android phones; iPhones can't vibrate from a web page).
      if (tap && out.mode === "tracking" && out.target) {
        const b = out.target;
        if (contains(b, tap.x, tap.y) || Math.hypot(centerX(b) - tap.x, centerY(b) - tap.y) < 0.15) navigator.vibrate?.(25);
      }

      if (out.mode !== "idle") testingRef.current = false; // tracking takes over from the test buttons
      cameraSteering = !!out.aim && (CAMERA_STEERS_IN as readonly string[]).includes(out.mode);
      moving = cameraSteering && out.aim && out.aimVel ? { aim: out.aim, vel: out.aimVel, t } : null;
      if (out.aim && cameraSteering) {
        homing = null;
        lastAimRef.current = out.aim;
        if (stand.connected) {
          // Sent now, after the AI: the motor starts on it a Bluetooth hop later, not at time t.
          servo.setTarget(out.aim, performance.now() + TUNING.bluetoothMs);
          stand.move(out.aim.pan, out.aim.tilt);
        }
      } else if (!testingRef.current) {
        // Nobody to follow: first bring the tilt back to level (the pan stays where it was
        // last aimed), then stop steering so the stand holds still.
        homing ??= lastAimRef.current ? { ...lastAimRef.current } : null;
        if (homing && homing.tilt !== TILT.level && stand.connected) {
          homing = { pan: homing.pan, tilt: towardLevel(homing.tilt, t - prevStepT) };
          lastAimRef.current = homing;
          servo.setTarget(homing, performance.now() + TUNING.bluetoothMs);
          stand.move(homing.pan, homing.tilt);
        } else {
          stand.releaseControl();
          if (stand.reported) lastAimRef.current = stand.reported;
        }
      }
      prevStepT = t;

      if (overlayRef.current)
        drawOverlay(overlayRef.current, video, people, out, s.matchLimit, mirroredRef.current, turn, faceWatcher.labels, t);

      frames++;
      if (t - fpsStart > 1000) {
        fps = (frames * 1000) / (t - fpsStart);
        frames = 0;
        fpsStart = t;
      }
      if (out.note !== lastNote) {
        lastNote = out.note;
        const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setLog((l) => [{ time, mode: out.mode, note: out.note }, ...l].slice(0, 6));
      }
      if (t - lastUi > 150) {
        lastUi = t;
        setSnap({
          mode: out.mode,
          note: out.note,
          match: out.match,
          aim: lastAimRef.current,
          fps,
          people: people.length,
          portrait,
          turn,
          facesSaved: faceWatcher.saved,
          aiMs,
          posture: emergencyRef.current.posture,
          faceMiss: faceWatcher.miss,
          whereabouts: out.whereabouts ? whereaboutsText(out.whereabouts, mirroredRef.current) : null,
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, report, loadFaces, faceWatcher, raiseAlarm, updateSettings]);

  // Tapping a person. Only a quick, still touch counts: a thumb resting on the edge
  // while you hold the phone, a drag, or a pinch is ignored.
  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const down = pointersRef.current.get(e.pointerId);
    pointersRef.current.delete(e.pointerId);
    if (!down || performance.now() - down.t > TAP_MAX_MS) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_MAX_MOVE_PX) return;
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const r = contentRect(rect.width, rect.height, video.videoWidth, video.videoHeight);
    const sx = (down.x - rect.left - r.x) / r.w; // in the picture as shown on screen
    const sy = (down.y - rect.top - r.y) / r.h;
    if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return;
    // Undo the mirroring to get the camera's own picture, then turn it like the AI's picture.
    tapRef.current = toUpright(mirroredRef.current ? 1 - sx : sx, sy, turnRef.current);
    setRipple({ x: down.x - rect.left, y: down.y - rect.top, key: performance.now() });
  };

  const onPointerCancel = (e: PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
  };

  const connectStand = async () => {
    setError("");
    try {
      await standRef.current.connect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) setError(`Couldn't connect to the stand: ${msg}`);
    }
  };

  const closeSettings = useCallback(() => {
    testingRef.current = false;
    setShowSettings(false);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  };

  const testMove = (pan: number, tilt: number) => {
    const stand = standRef.current;
    testingRef.current = true;
    lastAimRef.current = { pan, tilt };
    setSnap((s) => ({ ...s, aim: { pan, tilt } }));
    if (stand.connected) {
      servoRef.current.setTarget({ pan, tilt }, performance.now() + TUNING.bluetoothMs);
      stand.move(pan, tilt);
    }
  };

  const tracking = snap.mode !== "idle";
  const connected = standStatus === "connected";
  const standButton =
    standStatus === "connected"
      ? { label: "Disconnect", onClick: () => standRef.current.disconnect() }
      : standStatus === "connecting"
        ? { label: "Connecting", onClick: undefined }
        : standStatus === "unsupported"
          ? { label: "No Bluetooth", onClick: undefined }
          : { label: "Connect stand", onClick: () => void connectStand() };

  return (
    <main
      className="on-dark fixed inset-0 touch-manipulation overflow-hidden bg-black text-white select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{TAP_RING_CSS}</style>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-contain"
        style={mirrored ? MIRROR : undefined}
        playsInline
        muted
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        aria-label="Camera view. Tap a person to follow them."
      />
      {ripple && <span key={ripple.key} className="tracker-tap" style={{ left: ripple.x, top: ripple.y }} aria-hidden="true" />}

      {running && loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/75 px-4 py-2 font-semibold">Switching camera...</span>
        </div>
      )}

      {/* Top: the privacy sign (always on screen while the camera is on), then what it's
          doing on the left and readings on the right */}
      <div className="pointer-events-none absolute inset-x-0 top-0">
        {running && (
          <div
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 bg-leaf px-3 py-1.5 text-center font-extrabold text-white"
            style={{ ...SIDES, paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
          >
            <span className="text-base">● Camera on - video stays on this phone</span>
            <span className="text-sm font-bold">
              {sendError
                ? "Family can't see updates right now"
                : cloudRef.current
                  ? `Family sees: ${lastSent || "starting..."}`
                  : "Not signed in: family can't see updates"}
            </span>
          </div>
        )}
      <div className="flex items-start justify-between gap-2 pt-2" style={running ? SIDES : SAFE_TOP}>
        <section className="pointer-events-auto max-w-[min(30rem,62vw)] min-w-0 rounded-2xl bg-black/70 px-3 py-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 font-mono text-sm font-extrabold ${MODE_STYLE[snap.mode].pill}`}>
              {MODE_LABEL[snap.mode]}
            </span>
            {tracking && (
              <button
                className="min-h-9 rounded-full bg-white/90 px-3 text-sm font-bold text-ink transition-transform active:scale-95"
                onClick={() => {
                  brainRef.current.release();
                  faceWatcher.forget();
                }}
              >
                Release
              </button>
            )}
          </div>
          {running && snap.whereabouts && <p className="mt-1 text-lg font-extrabold leading-snug">{snap.whereabouts}</p>}
          <p className="mt-1 text-base leading-snug">{running ? snap.note : "Start the camera to begin."}</p>
          {snap.match !== null && (snap.mode === "lost" || snap.mode === "searching" || snap.mode === "following" || snap.mode === "radar") && (
            <p className="text-sm text-white/90">
              Closest match {snap.match.toFixed(2)} (locks on below{" "}
              {(settings.matchLimit * (snap.mode === "following" ? TUNING.followLookSlack : 1)).toFixed(2)})
            </p>
          )}
          {log.length > 0 && (
            <button
              className="min-h-9 text-sm font-semibold text-white/90 underline underline-offset-2"
              onClick={() => setShowLog((v) => !v)}
              aria-expanded={showLog}
            >
              {showLog ? "Hide log" : "Show log"}
            </button>
          )}
          {showLog && (
            <ol className="space-y-0.5 border-t border-white/15 pt-1 text-sm" aria-label="What the tracker decided">
              {log.map((l, i) => (
                <li key={`${l.time}-${i}`} className={i === 0 ? "" : "text-white/80"}>
                  <span className="font-mono">{l.time}</span> {l.note}
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {running && (
            <Chip>
              {snap.fps.toFixed(0)} fps{delegate ? ` · ${delegate}` : ""}{snap.aiMs ? ` · AI ${snap.aiMs.toFixed(0)} ms` : ""}
            </Chip>
          )}
          {running && settings.faces && (snap.mode !== "idle" || faceStatus === "loading" || faceStatus === "failed") && (
            <Chip tone={faceStatus === "ready" && snap.facesSaved > 0 ? "good" : "plain"}>
              {faceStatus === "loading"
                ? "Face AI loading..."
                : faceStatus === "failed"
                  ? "Face AI unavailable"
                  : snap.facesSaved > 0
                    ? "Face saved"
                    : snap.faceMiss === "small"
                      ? "Face too far away"
                      : snap.faceMiss === "none"
                        ? "No face seen yet"
                        : "Looking for a face"}
            </Chip>
          )}
          {running && settings.emergency && snap.mode === "tracking" && snap.posture && <Chip>Posture: {snap.posture}</Chip>}
          {connected && (
            <Chip tone={radar ? "good" : "plain"}>
              {radar === null ? "Radar: -" : radar ? "Radar: someone" : "Radar: empty"}
              {/* How loud: one number with one radar, left and right with two. */}
              {radarEnergy &&
                (radarEnergy.radars === 2 ? ` (L ${radarEnergy.left} · R ${radarEnergy.right})` : ` (${radarEnergy.left})`)}
            </Chip>
          )}
          {running && <PanDial aim={snap.aim} />}
        </div>
      </div>
      </div>

      {/* Bottom: messages, then the controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2" style={SAFE_BOTTOM}>
        {snap.portrait && running && connected && (
          <p className="rounded-xl bg-sun px-3 py-1.5 text-center text-sm font-bold text-ink">
            Turn the phone sideways for the stand, and switch off rotation lock.
          </p>
        )}
        {cameraStopped && (
          <div
            role="alert"
            className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-red-700 px-3 py-2 text-sm font-semibold"
          >
            The camera stopped. Another app may be using it.
            <Button onClick={() => void startCamera()}>Restart camera</Button>
          </div>
        )}
        {error && running && <ErrorBanner text={error} onDismiss={() => setError("")} />}
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-3xl bg-black/65 p-1.5">
          <div className="flex items-center gap-1.5">
            {cameraCount > 1 && (
              <BarButton
                icon={ICON.flip}
                label="Flip"
                aria-label="Switch between the front and back camera"
                onClick={() => chooseCamera(settings.camera === "front" ? "back" : "front")}
                disabled={loading}
              />
            )}
            <BarButton
              icon={ICON.bluetooth}
              label={standButton.label}
              good={connected}
              onClick={standButton.onClick}
              disabled={!standButton.onClick}
            />
            <BarButton
              icon={ICON.settings}
              label="Settings"
              active={showSettings}
              onClick={() => {
                testingRef.current = false;
                setShowSettings((v) => !v);
              }}
            />
            {running && <BarButton icon={ICON.stop} label="Stop" aria-label="Stop watching" onClick={stopWatching} />}
          </div>
        </div>
      </div>

      {running && circleId && <ReminderPopup circleId={circleId} />}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          update={updateSettings}
          close={closeSettings}
          testMove={testMove}
          canTest={connected && !tracking}
          chooseCamera={chooseCamera}
          cameraBusy={loading}
          mirrored={mirrored}
          fullscreen={canFullscreen ? { on: fullscreen, toggle: toggleFullscreen } : null}
          turnNow={snap.turn}
          testAlarm={() => {
            closeSettings();
            unlockSound();
            raiseAlarm("fall");
          }}
        />
      )}

      {!running && (
        <div className="on-light absolute inset-0 z-10 overflow-y-auto bg-cream text-ink select-text" style={SAFE_ALL}>
          <div className="relative isolate flex min-h-full items-center justify-center p-4 sm:p-6">
            <Blobs fixed />
            <div className="w-full max-w-lg animate-slide-in space-y-5 rounded-[40px] bg-surface p-7 text-center shadow-lift sm:p-10">
              <div className="text-left">
                <BackButton />
              </div>
              <Link
                to="/"
                className="group mx-auto flex min-h-12 w-fit items-center gap-3 text-2xl font-black text-ink no-underline"
              >
                <LogoMark />
                CareNest
              </Link>
              <LanguagePicker className="justify-center" />
              <h1 className="text-4xl font-extrabold">
                <Highlight text={t("Phone *camera*")} />
              </h1>
              <p className="text-xl font-bold text-muted">
                {t(
                  "Stand this phone on a table, pointing at the room. It watches for movement and tells your family, in a few words, how things are going.",
                )}
              </p>
              <p className="rounded-2xl bg-mint px-4 py-3 text-lg font-bold text-ink">
                {t(
                  'Video stays on this phone. Only short notes like "moving around - left side" are sent. No video or pictures ever leave it.',
                )}
              </p>
              {stopNote && (
                <p role="status" className="rounded-2xl bg-sun px-4 py-3 text-lg font-bold text-ink">
                  {t(stopNote)}
                </p>
              )}
              {account !== "signed-out" && (
                <div className="flex justify-center">
                  <div className="rounded-2xl bg-ink text-white">
                    <Choice
                      label="Which camera"
                      options={[
                        ["front", "Front (screen side)"],
                        ["back", "Back"],
                      ]}
                      value={settings.camera}
                      onChange={(c) => updateSettings({ camera: c })}
                      disabled={loading}
                    />
                  </div>
                </div>
              )}
              {account === "signed-out" ? (
                <div className="space-y-3">
                  <p className="text-xl font-bold">{t("Please sign in first, so your family can see the updates.")}</p>
                  <Link to="/login?next=/tracker" className={`${buttonVariants.primary} min-h-16 w-full text-2xl`}>
                    {t("Sign in")}
                  </Link>
                </div>
              ) : (
                <button
                  onClick={() => void startCamera()}
                  disabled={loading || account === "checking"}
                  className={`${buttonVariants.primary} min-h-16 w-full text-2xl transition-transform active:scale-95 disabled:opacity-60`}
                >
                  {loading ? t("Starting... (the first time takes a little longer)") : t("Start watching")}
                </button>
              )}
              {error && (
                <p role="alert" className="rounded-2xl bg-red-700 px-4 py-3 text-lg font-bold text-white">
                  {error}{" "}
                  <button className="min-h-11 px-2 underline" onClick={() => setError("")}>
                    Dismiss
                  </button>
                </p>
              )}
              {account === "no-database" && (
                <p className="rounded-2xl bg-sun px-4 py-3 text-lg font-bold text-ink">
                  {t(
                    "The database isn't set up on this website yet, so you can try the camera but your family won't see anything.",
                  )}
                </p>
              )}
              {!Stand.supported() && (
                <p className="text-base font-bold text-muted">
                  {t(
                    "Have a motor stand? This browser can't use Bluetooth, so it can't move the stand. On iPhone, open this page in the Bluefy app.",
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {alarm && (
        <EmergencyScreen
          alarm={alarm}
          familyAlerted={!!cloudRef.current && !sendError}
          onOk={endAlarm}
          onCallNow={startCall}
          onEnd={endAlarm}
        />
      )}
    </main>
  );
}

function SettingsPanel(props: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  close: () => void;
  testMove: (pan: number, tilt: number) => void;
  canTest: boolean;
  chooseCamera: (camera: Camera) => void;
  cameraBusy: boolean;
  mirrored: boolean;
  /** Full screen on/off, where the browser allows it (Android and PCs, not iPhone). */
  fullscreen: { on: boolean; toggle: () => void } | null;
  /** How far the picture is turned for the AI right now. */
  turnNow: Turn;
  /** Shows the emergency alert now, for rehearsing the demo. */
  testAlarm: () => void;
}) {
  const { settings: s, update, close, testMove, canTest, chooseCamera, cameraBusy, mirrored, fullscreen, turnNow, testAlarm } = props;
  // The test buttons go by the screen. On a mirrored picture the screen's left is the camera's right.
  const side = mirrored ? -1 : 1;

  // Escape closes the panel on a PC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const slider = (
    label: string,
    key: "matchLimit" | "aimHeight" | "fovH" | "deadZoneDeg",
    min: number,
    max: number,
    step: number,
    help: string,
  ) => (
    <label className="block">
      <span className="flex justify-between font-semibold">
        <span>{label}</span>
        <span className="font-mono">{s[key]}</span>
      </span>
      <input
        type="range"
        className="h-12 w-full accent-[#3ddc97]"
        min={min}
        max={max}
        step={step}
        value={s[key]}
        onChange={(e) => update({ [key]: Number(e.target.value) } as Partial<Settings>)}
      />
      <span className="text-base text-white/90">{help}</span>
    </label>
  );

  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/40" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="flex h-full w-full max-w-sm flex-col bg-ink/95 text-white"
        style={SAFE_ALL}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2 py-2">
          <h2 className="text-xl font-extrabold">Settings</h2>
          <Button onClick={close}>Close</Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 py-4">
          <fieldset className="space-y-2">
            <legend className="font-semibold">Camera facing the person</legend>
            <div className="flex flex-wrap gap-2">
              {(["front", "back"] as const).map((c) => (
                <Button key={c} active={s.camera === c} disabled={cameraBusy} onClick={() => chooseCamera(c)}>
                  {c === "front" ? "Front (screen side)" : "Back"}
                </Button>
              ))}
            </div>
            <p className="text-base text-white/90">
              Front for the SightLine stand, where the screen faces the person. The front camera is shown mirrored, like
              a selfie.
            </p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-semibold">Camera turns with the stand</legend>
            <Choice
              label="Camera turns with the stand"
              options={[
                ["yes", "Yes"],
                ["no", "No"],
              ]}
              value={cameraTurnsWithStand(s) ? "yes" : "no"}
              onChange={(cameraOnStand) => update({ cameraOnStand })}
            />
            <p className="text-base text-white/90">
              Yes (the usual) when this phone sits on the stand: the camera turns left, right, up and down with the
              motor. No only when testing with a computer's webcam next to the stand: then the motor still turns toward
              you, but the page doesn't think the picture turned with it.
            </p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-semibold">Emergency alert</legend>
            <Choice
              label="Emergency alert"
              options={[
                ["on", "On"],
                ["off", "Off"],
              ]}
              value={s.emergency ? "on" : "off"}
              onChange={(v) => update({ emergency: v === "on" })}
            />
            <Button onClick={testAlarm}>Test the alert</Button>
            <p className="text-base text-white/90">
              Watches the person you follow for a fall (on the floor and not getting up) or a seizure (shaking while lying
              down). Then it asks "Are you OK?" for {EMERGENCY.countdownS} seconds before a pretend emergency call. No
              real number is ever dialled. A rough guess from the camera, not a medical device.
            </p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-semibold">Recognise faces</legend>
            <Choice
              label="Recognise faces"
              options={[
                ["on", "On"],
                ["off", "Off"],
              ]}
              value={s.faces ? "on" : "off"}
              onChange={(v) => {
                rememberFacesChoice();
                update({ faces: v === "on" });
              }}
            />
            <p className="text-base text-white/90">
              Saves a face fingerprint of the person you tap and uses it to re-find them, even in other clothes. It stays
              on this phone and is forgotten when you let go. The first time, it downloads about 7 MB.
              {isIPhone() && " Off at first on iPhones while a page-reload problem is checked."}
            </p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-semibold">Keep people upright for the AI</legend>
            <Choice
              label="Turn the picture"
              options={[
                ["auto", "Auto"],
                ["0", "0°"],
                ["90", "90°"],
                ["180", "180°"],
                ["270", "270°"],
              ]}
              value={s.turn}
              onChange={(turn) => update({ turn })}
            />
            <p className="text-base text-white/90">
              {s.turn === "auto"
                ? `Auto uses the phone's motion sensor, so a phone held sideways with auto-rotate off still works. Now: ${turnNow === 0 ? "not turned" : `turned ${turnNow}°`}.`
                : "Turned by hand. Pick the turn that finds people best, or go back to Auto."}
            </p>
          </fieldset>

          {fullscreen && (
            <fieldset className="space-y-2">
              <legend className="font-semibold">Screen</legend>
              <Button active={fullscreen.on} onClick={fullscreen.toggle}>
                {fullscreen.on ? "Leave full screen" : "Full screen"}
              </Button>
              <p className="text-base text-white/90">Hides the browser's bars, so the camera picture is bigger.</p>
            </fieldset>
          )}

          <fieldset className="space-y-2">
            <legend className="font-semibold">Motor directions</legend>
            <p className="text-base text-white/90">If the stand turns away from you, flip that direction.</p>
            <div className="flex flex-wrap gap-2">
              <Button active={s.panSign === -1} onClick={() => update({ panSign: s.panSign === 1 ? -1 : 1 })}>
                Flip left/right
              </Button>
              <Button active={s.tiltSign === -1} onClick={() => update({ tiltSign: s.tiltSign === 1 ? -1 : 1 })}>
                Flip up/down
              </Button>
            </div>
          </fieldset>

          {slider("Match strictness", "matchLimit", 0.15, 0.7, 0.01, "Lower = harder to fool, but slower to recognise you again. Set it between your own 'closest match' number and a friend's.")}
          {slider("Aim height", "aimHeight", 0.1, 0.7, 0.05, "Where the camera aims: 0.1 = head, 0.35 = chest, 0.6 = hips.")}
          {slider("Camera width (degrees)", "fovH", 40, 100, 1, "How wide the camera sees with the phone sideways. If the stand overshoots you, lower it; if it lags behind, raise it.")}
          {slider("Dead zone (degrees)", "deadZoneDeg", 0.5, 8, 0.5, "Ignore smaller moves. Raise it if the stand twitches while you sit still.")}

          <fieldset className="space-y-2">
            <legend className="font-semibold">Test the motors</legend>
            <p className="text-sm text-white/70">
              {canTest
                ? "Left should bring what was on the left of the screen toward the middle. If it does the opposite, flip left/right above. Same for Up."
                : "Connect the stand and press Release first."}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <span />
              <Button disabled={!canTest} onClick={() => testMove(LIMITS.center, LIMITS.center - TILT.range * s.tiltSign)}>
                Up
              </Button>
              <span />
              <Button disabled={!canTest} onClick={() => testMove(LIMITS.center - 50 * s.panSign * side, LIMITS.center)}>
                Left
              </Button>
              <Button disabled={!canTest} onClick={() => testMove(LIMITS.center, LIMITS.center)}>
                Center
              </Button>
              <Button disabled={!canTest} onClick={() => testMove(LIMITS.center + 50 * s.panSign * side, LIMITS.center)}>
                Right
              </Button>
              <span />
              <Button disabled={!canTest} onClick={() => testMove(LIMITS.center, LIMITS.center + TILT.range * s.tiltSign)}>
                Down
              </Button>
              <span />
            </div>
          </fieldset>

          {/* Resets the tuning; the camera choice stays as it is. */}
          <Button onClick={() => update({ ...defaultSettings(), camera: s.camera })}>Reset to defaults</Button>
        </div>
      </div>
    </div>
  );
}
