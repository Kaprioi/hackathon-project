// The Phone Tracker page (/tracker). Shows the camera, draws a box around each
// person, lets you tap one to follow, and drives the stand and its humidifier.
//
// How the pieces fit:
//   camera frame -> detector.ts (find people) -> brain.ts (decide) -> stand.ts (Bluetooth to the ESP32)
//                                               -> events.ts (small text events) -> cloud.ts (Supabase, for the family page)

import { useCallback, useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, PointerEvent, ReactNode } from "react";
import { Link } from "react-router";
import { supabase } from "../lib/supabase";
import type { BrainOutput, Mode } from "./brain.ts";
import { Brain, MODE_LABEL } from "./brain.ts";
import type { Settings } from "./config.ts";
import {
  ANALYSIS_WIDTH,
  CAMERA_STEERS_IN,
  DEFAULT_SETTINGS,
  DETECT_WIDTH,
  LIMITS,
  MIST_FOLLOW_MODES,
  TUNING,
} from "./config.ts";
import type { PersonDetector } from "./detector.ts";
import { createPersonDetector } from "./detector.ts";
import { Cloud } from "./cloud.ts";
import type { MovementEvent } from "./events.ts";
import { Reporter } from "./events.ts";
import type { Angles, Box } from "./geometry.ts";
import { ServoModel } from "./servoModel.ts";
import type { StandStatus } from "./stand.ts";
import { Stand } from "./stand.ts";

type MistMode = "off" | "on" | "follow";

/** Is someone signed in, so updates can go to the family page? */
type Account = "checking" | "signed-in" | "signed-out" | "no-database";

/** Plain words for the "last update sent" line. */
const EVENT_WORDS: Record<MovementEvent["kind"], string> = {
  moving: "Moving around",
  still: "Staying still",
  nobody: "Nobody in view",
  fall: "Possible fall",
  heartbeat: "Still watching",
  started: "Started watching",
  stopped: "Stopped watching",
};

function describe(e: MovementEvent): string {
  return [EVENT_WORDS[e.kind], e.zone && `${e.zone} side`, e.posture && e.posture !== "unknown" && e.posture]
    .filter(Boolean)
    .join(" - ");
}

interface Snapshot {
  mode: Mode;
  note: string;
  match: number | null;
  aim: Angles | null;
  fps: number;
  people: number;
  mistOn: boolean;
  portrait: boolean;
}

interface LogLine {
  time: string;
  mode: Mode;
  note: string;
}

const SETTINGS_KEY = "phoneTracker.settings.v1";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // private browsing or blocked storage: just use the defaults
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // not saved; fine
  }
}

const MODE_STYLE: Record<Mode, { pill: string; stroke: string }> = {
  idle: { pill: "bg-white text-ink", stroke: "#ffffff" },
  tracking: { pill: "bg-leaf text-white", stroke: "#3ddc97" },
  hidden: { pill: "bg-sun text-ink", stroke: "#ffd84d" },
  following: { pill: "bg-coral text-ink", stroke: "#ff9f7a" },
  searching: { pill: "bg-coral text-ink", stroke: "#ff9f7a" },
  lost: { pill: "bg-red-700 text-white", stroke: "#ff6b6b" },
};

/** Where the video actually appears inside an element using object-fit: contain. */
function contentRect(cw: number, ch: number, vw: number, vh: number) {
  const scale = Math.min(cw / vw, ch / vh);
  const w = vw * scale;
  const h = vh * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

function drawOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement, people: Box[], out: BrainOutput): void {
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
  const toScreen = (b: Box) => ({ x: r.x + b.x * r.w, y: r.y + b.y * r.h, w: b.w * r.w, h: b.h * r.h });

  // Everyone the detector sees: thin white boxes.
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  for (const p of people) {
    const s = toScreen(p);
    ctx.strokeRect(s.x, s.y, s.w, s.h);
  }

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

  // Ran out of the picture: a big arrow on that side.
  if (out.mode === "following" && out.exitSide !== 0) {
    const x = out.exitSide < 0 ? r.x + 40 : r.x + r.w - 40;
    const y = r.y + r.h / 2;
    const d = out.exitSide < 0 ? -1 : 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + d * 24, y);
    ctx.lineTo(x - d * 16, y - 34);
    ctx.lineTo(x - d * 16, y + 34);
    ctx.closePath();
    ctx.fill();
  }
}

/** A half-circle dial showing where the stand is told to point. */
function PanDial({ aim }: { aim: Angles | null }) {
  const pan = aim?.pan ?? LIMITS.center;
  // 0 degrees on the dial = far left, 180 = far right.
  const angle = (Math.PI * (180 - pan)) / 180;
  const nx = 40 + 30 * Math.cos(angle);
  const ny = 40 - 30 * Math.sin(angle);
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-black/60 px-3 py-2 text-base" aria-label={`Stand pointing at ${pan.toFixed(0)} degrees`}>
      <svg width="80" height="46" viewBox="0 0 80 46" aria-hidden="true">
        <path d="M 6 40 A 34 34 0 0 1 74 40" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="4" />
        <line x1="40" y1="40" x2={nx} y2={ny} stroke="#ffd84d" strokeWidth="4" strokeLinecap="round" />
        <circle cx="40" cy="40" r="4" fill="#ffd84d" />
      </svg>
      <div className="leading-tight">
        <div>Pan {pan.toFixed(0)}°</div>
        <div className="text-white/90">Tilt {(aim?.tilt ?? LIMITS.center).toFixed(0)}°</div>
      </div>
    </div>
  );
}

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "good" | "warn" }) {
  const toneClass = tone === "good" ? "bg-leaf text-white" : tone === "warn" ? "bg-sun text-ink" : "bg-black/60 text-white";
  return <span className={`rounded-full px-3 py-1 text-base font-semibold ${toneClass}`}>{children}</span>;
}

function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  const { active, className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`min-h-11 rounded-xl px-4 py-2 font-bold disabled:opacity-40 ${
        active ? "bg-brand text-white" : "bg-white/90 text-ink"
      } ${className}`}
    />
  );
}

export default function TrackerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const analysisRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<PersonDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const settingsRef = useRef<Settings>(loadSettings());
  const brainRef = useRef<Brain>(new Brain(settingsRef.current));
  const standRef = useRef<Stand>(new Stand());
  const servoRef = useRef<ServoModel>(new ServoModel());
  const tapRef = useRef<{ x: number; y: number } | null>(null);
  const mistModeRef = useRef<MistMode>("off");
  const lastAimRef = useRef<Angles | null>(null);
  const testingRef = useRef(false); // true while the motor test buttons are in charge
  const reporterRef = useRef<Reporter>(new Reporter());
  const cloudRef = useRef<Cloud | null>(null);
  const sendChainRef = useRef<Promise<void>>(Promise.resolve());

  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<Settings>(settingsRef.current);
  const [showSettings, setShowSettings] = useState(false);
  const [mistMode, setMistMode] = useState<MistMode>("off");
  const [standStatus, setStandStatus] = useState<StandStatus>(standRef.current.status);
  const [radar, setRadar] = useState<boolean | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [account, setAccount] = useState<Account>(supabase ? "checking" : "no-database");
  const [lastSent, setLastSent] = useState("");
  const [sendError, setSendError] = useState("");
  const [snap, setSnap] = useState<Snapshot>({
    mode: "idle",
    note: "Tap a person to lock on.",
    match: null,
    aim: null,
    fps: 0,
    people: 0,
    mistOn: false,
    portrait: false,
  });

  // Keep the screen showing the stand's state when Bluetooth or the radar changes.
  useEffect(() => {
    const stand = standRef.current;
    stand.onChange = () => {
      setStandStatus(stand.status);
      setRadar(stand.radar);
    };
    return () => {
      stand.onChange = () => {};
    };
  }, []);

  // Check whether someone is signed in (the family page only works for signed-in people).
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setAccount(data.session ? "signed-in" : "signed-out"));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAccount(session ? "signed-in" : "signed-out"));
    return () => data.subscription.unsubscribe();
  }, []);

  /** Queue one small text event for the family page. Sent in order; failures are shown, not thrown. */
  const report = useCallback((event: MovementEvent) => {
    const cloud = cloudRef.current;
    if (!cloud) return;
    sendChainRef.current = sendChainRef.current.then(() =>
      cloud.send(event).then(
        () => {
          setLastSent(describe(event));
          setSendError("");
        },
        (e: unknown) => setSendError(e instanceof Error ? e.message : String(e)),
      ),
    );
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    brainRef.current.settings = next;
    saveSettings(next);
    setSettings(next);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't open the camera. The page must be opened over https (or on localhost).");
      return;
    }
    setLoading(true);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: settingsRef.current.camera === "front" ? "user" : "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      if (!detectorRef.current) detectorRef.current = await createPersonDetector();
      if (supabase && !cloudRef.current) {
        try {
          cloudRef.current = await Cloud.connect(supabase);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setSendError(msg);
          setError(`Your family won't see updates: ${msg}`);
        }
      }
      report(reporterRef.current.start(performance.now()));
      try {
        wakeLockRef.current = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // keeping the screen on is a nice-to-have
      }
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [stopCamera, report]);

  const stopWatching = useCallback(() => {
    report(reporterRef.current.stop());
    stopCamera();
    setRunning(false);
    void wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, [stopCamera, report]);

  // Clean up when leaving the page.
  useEffect(() => {
    const stand = standRef.current;
    return () => {
      if (streamRef.current) report(reporterRef.current.stop());
      stopCamera();
      detectorRef.current?.close();
      detectorRef.current = null;
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
    let frames = 0;
    let fpsStart = performance.now();
    let fps = 0;
    let lastUi = 0;
    let lastNote = "";

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || !actx || !dctx || video.readyState < 2 || video.currentTime === lastVideoTime) return;
      if (!video.videoWidth || !video.videoHeight) return;
      lastVideoTime = video.currentTime;
      const t = performance.now();
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // The detector gets a 640-wide copy (faster than the full-size frame).
      const dw = Math.min(DETECT_WIDTH, vw);
      const dh = Math.max(1, Math.round((dw * vh) / vw));
      if (detectCanvas.width !== dw || detectCanvas.height !== dh) {
        detectCanvas.width = dw;
        detectCanvas.height = dh;
      }
      dctx.drawImage(video, 0, 0, dw, dh);
      let people: Box[] = [];
      try {
        people = detector.detect(detectCanvas, t);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }

      // A smaller copy again for clothes colours and the cover tracker.
      const aw = ANALYSIS_WIDTH;
      const ah = Math.max(1, Math.round((aw * vh) / vw));
      if (analysis.width !== aw || analysis.height !== ah) {
        analysis.width = aw;
        analysis.height = ah;
      }
      actx.drawImage(detectCanvas, 0, 0, aw, ah);
      const image = actx.getImageData(0, 0, aw, ah);

      // Where was the camera pointing when this frame was taken? Without a stand it never moves.
      const stand = standRef.current;
      const servo = servoRef.current;
      const cameraSteering = (CAMERA_STEERS_IN as readonly string[]).includes(brainRef.current.currentMode);
      // When the radars are steering (SightLine stand), trust the angle the stand reports.
      if (stand.connected && !cameraSteering && stand.reported) servo.sync(stand.reported, t);
      servo.step(t);
      const camera = stand.connected ? servo.at(t - TUNING.latencyMs) : { pan: LIMITS.center, tilt: LIMITS.center };

      const tap = tapRef.current;
      tapRef.current = null;
      const out = brainRef.current.update({
        t,
        people,
        image,
        radar: stand.connected ? stand.radar : null,
        camera,
        tap,
      });

      for (const event of reporterRef.current.update(t, people, vw / vh)) report(event);

      if (out.mode !== "idle") testingRef.current = false; // tracking takes over from the test buttons
      if (out.aim && (CAMERA_STEERS_IN as readonly string[]).includes(out.mode)) {
        lastAimRef.current = out.aim;
        if (stand.connected) {
          servo.setTarget(out.aim);
          stand.move(out.aim.pan, out.aim.tilt);
        }
      } else if (!testingRef.current) {
        stand.releaseControl();
        if (stand.reported) lastAimRef.current = stand.reported;
      }

      const mode = mistModeRef.current;
      const mistOn =
        mode === "on" || (mode === "follow" && (MIST_FOLLOW_MODES as readonly string[]).includes(out.mode));
      stand.setMist(mistOn);

      if (overlayRef.current) drawOverlay(overlayRef.current, video, people, out);

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
          mistOn,
          portrait: vh > vw,
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, report]);

  const onTap = (e: PointerEvent<HTMLCanvasElement>) => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const r = contentRect(rect.width, rect.height, video.videoWidth, video.videoHeight);
    const x = (e.clientX - rect.left - r.x) / r.w;
    const y = (e.clientY - rect.top - r.y) / r.h;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) tapRef.current = { x, y };
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

  const chooseMist = (m: MistMode) => {
    mistModeRef.current = m;
    setMistMode(m);
  };

  const testMove = (pan: number, tilt: number) => {
    const stand = standRef.current;
    testingRef.current = true;
    lastAimRef.current = { pan, tilt };
    setSnap((s) => ({ ...s, aim: { pan, tilt } }));
    if (stand.connected) {
      servoRef.current.setTarget({ pan, tilt });
      stand.move(pan, tilt);
    }
  };

  const tracking = snap.mode !== "idle";
  const standLabel =
    standStatus === "connected"
      ? "Stand connected"
      : standStatus === "connecting"
        ? "Connecting..."
        : standStatus === "unsupported"
          ? "No Bluetooth here"
          : "No stand";

  return (
    <main className="on-dark fixed inset-0 overflow-hidden bg-black text-white select-none">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-contain" playsInline muted />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onTap}
        aria-label="Camera view. Tap a person to follow them."
      />

      {/* The privacy sign: always on screen while the camera is on */}
      {running && (
        <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-leaf px-4 py-2 text-center text-lg font-extrabold text-white">
          <span>● Camera on - video stays on this phone</span>
          <span className="text-base font-bold">
            {sendError
              ? "Family can't see updates right now"
              : cloudRef.current
                ? `Family sees: ${lastSent || "starting..."}`
                : "Not signed in: family can't see updates"}
          </span>
        </div>
      )}

      {/* Top: what it's doing, and the stand's status */}
      <div className={`pointer-events-none absolute inset-x-0 flex flex-wrap ${running ? "top-20 sm:top-12" : "top-0"} items-start justify-between gap-2 p-3`}>
        <div className="pointer-events-auto max-w-xl rounded-2xl bg-black/60 px-4 py-2" aria-live="polite">
          <span className={`rounded-full px-3 py-1 font-mono text-base font-extrabold ${MODE_STYLE[snap.mode].pill}`}>
            {MODE_LABEL[snap.mode]}
          </span>
          <p className="mt-1 text-base leading-snug">{running ? snap.note : "Start the camera to begin."}</p>
          {snap.match !== null && (snap.mode === "lost" || snap.mode === "searching" || snap.mode === "following") && (
            <p className="text-base text-white/90">
              Closest match {snap.match.toFixed(2)} (locks on below {(settings.matchLimit * (snap.mode === "following" ? TUNING.followLookSlack : 1)).toFixed(2)})
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip tone={standStatus === "connected" ? "good" : "plain"}>{standLabel}</Chip>
          <Chip tone={radar ? "good" : "plain"}>{radar === null ? "Radar: -" : radar ? "Radar: someone there" : "Radar: empty"}</Chip>
          <Chip tone={snap.mistOn ? "good" : "plain"}>Mist {snap.mistOn ? "on" : "off"}</Chip>
          {running && <Chip>{snap.fps.toFixed(0)} fps</Chip>}
        </div>
      </div>

      {snap.portrait && running && (
        <div className="absolute inset-x-0 top-1/3 mx-auto w-fit rounded-2xl bg-sun px-4 py-2 font-bold text-ink">
          Turn the phone sideways and switch off rotation lock.
        </div>
      )}

      {/* Bottom: the log on the left, controls on the right */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-3">
        <ol className="max-w-md space-y-0.5 rounded-2xl bg-black/70 px-3 py-2 text-base empty:hidden" aria-label="What the tracker decided">
          {log.map((l, i) => (
            <li key={`${l.time}-${i}`} className={i === 0 ? "" : "text-white/85"}>
              <span className="font-mono">{l.time}</span> {l.note}
            </li>
          ))}
        </ol>
        <div className="pointer-events-auto ml-auto flex flex-col items-end gap-2">
          <PanDial aim={snap.aim} />
          <div className="flex flex-wrap justify-end gap-2 rounded-2xl bg-black/60 p-2" role="group" aria-label="Humidifier">
            <span className="self-center px-1 text-base font-semibold">Mist</span>
            <Button active={mistMode === "off"} onClick={() => chooseMist("off")}>Off</Button>
            <Button active={mistMode === "on"} onClick={() => chooseMist("on")}>On</Button>
            <Button active={mistMode === "follow"} onClick={() => chooseMist("follow")}>Follow me</Button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {standStatus !== "connected" ? (
              <Button onClick={connectStand} disabled={standStatus === "unsupported" || standStatus === "connecting"}>
                Connect stand
              </Button>
            ) : (
              <Button onClick={() => standRef.current.disconnect()}>Disconnect</Button>
            )}
            {tracking && <Button onClick={() => brainRef.current.release()}>Release</Button>}
            {running && (
              <Button onClick={stopWatching} className="min-h-12 text-lg">
                Stop watching
              </Button>
            )}
            <Button
              onClick={() => {
                testingRef.current = false;
                setShowSettings((v) => !v);
              }}
              active={showSettings}
            >
              Settings
            </Button>
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          update={updateSettings}
          close={() => {
            testingRef.current = false;
            setShowSettings(false);
          }}
          testMove={testMove}
          canTest={standStatus === "connected" && !tracking}
          restartCamera={running ? startCamera : null}
        />
      )}

      {!running && (
        <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-black p-6">
          <div className="max-w-lg space-y-5 text-center">
            <h1 className="text-3xl font-extrabold">Phone camera</h1>
            <p className="text-xl">
              Stand this phone on a table, pointing at the room. It watches for movement and tells your family, in a
              few words, how things are going.
            </p>
            <p className="rounded-2xl bg-white px-4 py-3 text-lg font-bold text-ink">
              Video stays on this phone. Only short notes like "moving around - left side" are sent. No video or
              pictures ever leave it.
            </p>
            {account === "signed-out" ? (
              <div className="space-y-3">
                <p className="text-xl">Please sign in first, so your family can see the updates.</p>
                <Link
                  to="/login"
                  className="inline-flex min-h-16 items-center justify-center rounded-2xl bg-white px-8 text-2xl font-extrabold text-brand no-underline"
                >
                  Sign in
                </Link>
              </div>
            ) : (
              <button
                onClick={startCamera}
                disabled={loading || account === "checking"}
                className="min-h-16 w-full rounded-2xl bg-white px-8 text-2xl font-extrabold text-brand disabled:opacity-60"
              >
                {loading ? "Starting... (the first time takes a little longer)" : "Start watching"}
              </button>
            )}
            {account === "no-database" && (
              <p className="text-lg text-sun">
                The database isn't set up on this website yet, so you can try the camera but your family won't see
                anything.
              </p>
            )}
            {!Stand.supported() && (
              <p className="text-base text-white/90">
                Have a motor stand? This browser can't use Bluetooth, so it can't move the stand. On iPhone, open this
                page in the Bluefy app.
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="absolute inset-x-0 bottom-28 mx-auto w-fit max-w-[90%] rounded-2xl bg-red-700 px-4 py-2 font-semibold">
          {error}{" "}
          <button className="ml-2 min-h-12 px-2 underline" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
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
  restartCamera: (() => Promise<void>) | null;
}) {
  const { settings: s, update, close, testMove, canTest, restartCamera } = props;
  const slider = (label: string, key: "matchLimit" | "aimHeight" | "fovH" | "deadZoneDeg", min: number, max: number, step: number, help: string) => (
    <label className="block">
      <span className="flex justify-between font-semibold">
        <span>{label}</span>
        <span className="font-mono">{s[key]}</span>
      </span>
      <input
        type="range"
        className="h-12 w-full"
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
    <div className="absolute inset-y-0 right-0 w-full max-w-sm space-y-4 overflow-y-auto bg-ink/95 p-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold">Settings</h2>
        <Button onClick={close}>Close</Button>
      </div>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Camera facing the person</legend>
        <div className="flex gap-2">
          {(["front", "back"] as const).map((c) => (
            <Button
              key={c}
              active={s.camera === c}
              onClick={() => {
                update({ camera: c });
                void restartCamera?.();
              }}
            >
              {c === "front" ? "Front (screen side)" : "Back"}
            </Button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Motor directions</legend>
        <p className="text-base text-white/90">If the stand turns away from you, flip that direction.</p>
        <div className="flex gap-2">
          <Button active={s.panSign === -1} onClick={() => update({ panSign: s.panSign === 1 ? -1 : 1 })}>
            Flip left/right
          </Button>
          <Button active={s.tiltSign === -1} onClick={() => update({ tiltSign: s.tiltSign === 1 ? -1 : 1 })}>
            Flip up/down
          </Button>
        </div>
      </fieldset>

      {slider("Match strictness", "matchLimit", 0.15, 0.7, 0.01, "Lower = harder to fool, but slower to recognise you again. Set it between your own 'closest match' number and a friend's.")}
      {slider("Aim height", "aimHeight", 0.1, 0.7, 0.05, "Where the camera and mist aim: 0.1 = head, 0.35 = chest, 0.6 = hips.")}
      {slider("Camera width (degrees)", "fovH", 40, 100, 1, "How wide the camera sees. If the stand overshoots you, lower it; if it lags behind, raise it.")}
      {slider("Dead zone (degrees)", "deadZoneDeg", 0.5, 8, 0.5, "Ignore smaller moves. Raise it if the stand twitches while you sit still.")}

      <fieldset className="space-y-2">
        <legend className="font-semibold">Test the motors</legend>
        <p className="text-base text-white/90">
          {canTest
            ? "Left should bring what was on the left of the screen toward the middle. If it does the opposite, flip left/right above. Same for Up."
            : "Connect the stand and press Release first."}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <span />
          <Button disabled={!canTest} onClick={() => testMove(LIMITS.center, LIMITS.center - 30 * s.tiltSign)}>Up</Button>
          <span />
          <Button disabled={!canTest} onClick={() => testMove(LIMITS.center - 50 * s.panSign, LIMITS.center)}>Left</Button>
          <Button disabled={!canTest} onClick={() => testMove(LIMITS.center, LIMITS.center)}>Center</Button>
          <Button disabled={!canTest} onClick={() => testMove(LIMITS.center + 50 * s.panSign, LIMITS.center)}>Right</Button>
          <span />
          <Button disabled={!canTest} onClick={() => testMove(LIMITS.center, LIMITS.center + 30 * s.tiltSign)}>Down</Button>
          <span />
        </div>
      </fieldset>

      <Button onClick={() => update({ ...DEFAULT_SETTINGS })}>Reset to defaults</Button>
    </div>
  );
}
