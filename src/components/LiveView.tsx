// The "Watch live" card on the family page: see and hear the phone camera, and talk
// back through the phone. The video comes straight from the phone, encrypted, and
// nothing is recorded (src/lib/live.ts). The phone shows a red "LIVE" bar while anyone
// watches, so the person on camera always knows.

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n/useLanguage";
import type { ViewerState } from "../lib/live";
import { LiveSetupError, LiveViewer, MAX_VIEWERS, fetchIceServers, supabaseSignal } from "../lib/live";
import { supabase } from "../lib/supabase";
import { shortName } from "../family/alerts";
import { buttonVariants } from "./ButtonLink";

const talkingButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-[3px] border-alert bg-alert px-5 text-lg font-extrabold text-on-brand transition-all duration-200 hover:-translate-y-0.5";
const smallButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-[3px] border-brand bg-surface px-5 text-lg font-extrabold text-brand transition-all duration-200 hover:-translate-y-0.5 hover:bg-lilac disabled:cursor-not-allowed disabled:opacity-70";

/** Why it stopped or couldn't start, in plain words (English; translated when shown). */
const STATE_NOTES: Partial<Record<ViewerState, string>> = {
  "no-phone": 'The phone camera isn\'t on right now. Ask them to open Phone camera and press "Start watching".',
  off: "Live video is switched off on the phone (Settings, Live video for family).",
  busy: `${MAX_VIEWERS} family members are already watching. Try again in a little while.`,
  failed: "Couldn't connect to the phone. The network may be blocking video. Try again, or try another Wi-Fi.",
  ended: "The live video ended (the phone stopped watching).",
};

export default function LiveView({
  circleId,
  userId,
  cameraOn,
  startSignal,
  big,
}: {
  circleId: string;
  userId: string;
  /** Has the phone checked in lately? If not, say so before anyone tries. */
  cameraOn: boolean;
  /** Goes up by one when another part of the page (the fall alert) wants the video started. */
  startSignal: number;
  /** Simple view: bigger text and buttons. */
  big?: boolean;
}) {
  const { t } = useLanguage();
  const [state, setState] = useState<ViewerState | "joining">("idle");
  const [problem, setProblem] = useState("");
  const [talking, setTalking] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const viewerRef = useRef<LiveViewer | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const watching = state === "joining" || state === "connecting" || state === "live";

  async function start() {
    const db = supabase;
    if (!db || viewerRef.current) return;
    setProblem("");
    setTalking(false);
    setState("joining");
    try {
      const token = (await db.auth.getSession()).data.session?.access_token ?? null;
      const { data: me } = await db.from("profiles").select("display_name, email").eq("id", userId).maybeSingle();
      const signal = await supabaseSignal(db, circleId);
      const viewer = new LiveViewer({
        signal,
        iceServers: () => fetchIceServers(token),
        viewer: userId,
        name: shortName(me ?? undefined),
        onState: (s) => {
          setState(s);
          if (s !== "connecting" && s !== "live") {
            viewerRef.current = null;
            setTalking(false);
          }
        },
        onStream: (stream) => {
          const video = videoRef.current;
          if (!video) return;
          if (video.srcObject !== stream) video.srcObject = stream;
          void video.play().catch(() => {
            // the browser wants a tap: the controls below give one
          });
        },
      });
      viewerRef.current = viewer;
      viewer.start();
    } catch (e) {
      setState("idle");
      setProblem(e instanceof LiveSetupError ? e.message : "Couldn't start live video. Check the internet and try again.");
    }
  }

  function stop() {
    viewerRef.current?.stop();
    viewerRef.current = null;
    setTalking(false);
    setState("idle");
  }

  async function toggleTalk() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      await viewer.setTalking(!talking);
      setTalking(!talking);
      setProblem("");
    } catch {
      setProblem("Your microphone is blocked. Allow it for this site in the browser to talk.");
    }
  }

  // Leaving the page ends the video.
  useEffect(() => () => viewerRef.current?.stop(), []);

  // The fall alert's "Watch live now" button.
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (startSignal === 0) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    void startRef.current();
  }, [startSignal]);

  const note = state === "idle" || state === "joining" || state === "connecting" || state === "live" ? "" : STATE_NOTES[state] ?? "";
  const text = big ? "text-2xl" : "text-lg";

  return (
    <section ref={cardRef} aria-labelledby="live-title" className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="live-title" className={`${big ? "text-3xl" : "text-2xl"} font-extrabold`}>
          {t("Watch live")}
        </h2>
        {state === "live" && (
          <span className="inline-flex items-center gap-2 rounded-full bg-alert px-3 py-1 text-base font-extrabold text-on-brand">
            <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
            {t("Live")}
          </span>
        )}
      </div>

      {watching ? (
        <div className="mt-4 space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-black">
            {/* Sound comes with the video; family can mute it here. */}
            <video ref={videoRef} playsInline autoPlay muted={!soundOn} className="aspect-video w-full object-contain" />
            {state !== "live" && (
              <p role="status" className="absolute inset-0 flex items-center justify-center p-4 text-center text-xl font-bold text-white">
                {t("Connecting to the phone…")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void toggleTalk()}
              disabled={state !== "live"}
              aria-pressed={talking}
              className={talking ? talkingButton : smallButton}
            >
              {talking ? t("Stop talking") : t("Talk")}
            </button>
            <button type="button" onClick={() => setSoundOn(!soundOn)} aria-pressed={!soundOn} className={smallButton}>
              {soundOn ? t("Mute sound") : t("Sound on")}
            </button>
            <button type="button" onClick={stop} className={smallButton}>
              {t("Stop watching")}
            </button>
          </div>
          <p className={`${text} font-bold text-muted`}>
            {talking
              ? t("They can hear you now through the phone.")
              : t("The phone shows a red LIVE sign while you watch. Nothing is recorded.")}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <p className={`${text} font-bold text-muted`}>
            {t("See and hear the room through the phone camera, and talk to them. Nothing is recorded.")}
          </p>
          {!cameraOn && <p className={`${text} font-bold`}>{t("The phone camera seems to be off right now.")}</p>}
          <button type="button" onClick={() => void start()} className={`${buttonVariants.primary} w-full sm:w-auto`}>
            {state === "idle" ? t("Watch live") : t("Try again")}
          </button>
        </div>
      )}

      {(note || problem) && (
        <p role="alert" className={`mt-4 rounded-2xl bg-sun px-4 py-3 ${text} font-bold text-ink`}>
          {t(problem || note)}
        </p>
      )}
    </section>
  );
}
