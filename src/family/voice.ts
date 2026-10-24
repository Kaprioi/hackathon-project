// The browser side of speaking out loud, shared by the "Read aloud" buttons and
// spoken alerts. Every voice is one of our ElevenLabs voices: the words go to
// /api/tts (with the person's login token) and the sound comes back. There is
// one player for the whole page, so only one thing is said at a time. Also a
// short chime made by the browser itself (no sound files).

import type { Lang } from "../i18n/translate.ts";
import { speechParts } from "./readAloud.ts";

/** How a reading ended: it finished, someone stopped it, or the voice couldn't be reached or played. */
export type Outcome = "ended" | "stopped" | "failed";

/** Gives the logged-in person's token, or nothing when nobody is logged in. */
export type GetToken = () => Promise<string | null | undefined>;

// A tiny silent sound. Playing it straight from a tap "unlocks" the player on
// iPhones, so the voice can start later, once it has arrived.
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

let player: HTMLAudioElement | null = null;
// How to stop whatever is being said right now.
let stopCurrent: (() => void) | null = null;

let chimes: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (chimes) return chimes;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    chimes = Ctx ? new Ctx() : null;
  } catch {
    chimes = null;
  }
  return chimes;
}

/**
 * Browsers only allow sound after someone has tapped the page. Call this from
 * a tap or key press: it wakes up the voice player and the chime for later.
 */
export function unlockVoice() {
  audioContext()
    ?.resume()
    .catch(() => {});
  if (stopCurrent) return; // already playing, so already unlocked
  const audio = (player ??= new Audio());
  audio.src = SILENCE;
  audio.play().catch(() => {});
}

/** Stops whatever is being said. */
export function stopVoice() {
  const stop = stopCurrent;
  stopCurrent = null;
  stop?.();
}

/**
 * Says `text` in our ElevenLabs voice for `lang`, stopping anything else first.
 * `onPlaying` is called once the voice has started. Resolves when it is over.
 */
export function speak(text: string, lang: Lang, getToken: GetToken, onPlaying?: () => void): Promise<Outcome> {
  const words = speechParts(text, lang).join(" ");
  if (!words) return Promise.resolve("ended");
  stopVoice();
  unlockVoice();
  const audio = (player ??= new Audio());
  const controller = new AbortController();
  let url = "";
  let over = false;

  return new Promise((resolve) => {
    const finish = (how: Outcome) => {
      if (over) return;
      over = true;
      if (stopCurrent === stop) stopCurrent = null;
      controller.abort();
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      if (url) URL.revokeObjectURL(url);
      resolve(how);
    };
    const stop = () => finish("stopped");
    stopCurrent = stop;

    (async () => {
      const token = await getToken();
      if (!token) throw new Error("not logged in");
      if (over) return;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: words, lang }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const sound = await res.blob();
      if (over) return;
      url = URL.createObjectURL(sound);
      audio.onended = () => finish("ended");
      audio.onerror = () => finish("failed");
      audio.src = url;
      await audio.play();
      if (!over) onPlaying?.();
    })().catch(() => finish("failed"));
  });
}

/** A short two-note "ding-dong" to get attention. Resolves when it has finished. */
export async function playChime(): Promise<void> {
  const ctx = audioContext();
  if (!ctx) return;
  // If sound isn't allowed yet this can wait forever, so only wait a moment.
  await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
  if (ctx.state !== "running") return;
  const start = ctx.currentTime + 0.05;
  [880, 660].forEach((pitch, i) => {
    const note = ctx.createOscillator();
    const volume = ctx.createGain();
    note.frequency.value = pitch;
    const from = start + i * 0.4;
    volume.gain.setValueAtTime(0.0001, from);
    volume.gain.exponentialRampToValueAtTime(0.35, from + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, from + 0.6);
    note.connect(volume).connect(ctx.destination);
    note.start(from);
    note.stop(from + 0.65);
  });
  await new Promise((r) => setTimeout(r, 1200));
}
