// The browser side of speaking out loud, shared by the "Read aloud" buttons and
// spoken alerts: the voices, turning words into speech, and a short chime made
// by the browser itself (no sound files). The plain logic is in readAloud.ts.

import type { Lang } from "../i18n/translate";
import { speechLocale, speechParts } from "./readAloud";

/** True when this browser can read text out loud (most can; some older ones can't). */
export const canSpeak =
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** The browser's voices. Chrome loads them a moment after the page, so wait briefly for them. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, 1500);
    synth.addEventListener("voiceschanged", done);
  });
}

/** The text as sentences to speak one at a time, in the language's voice. */
export function utterancesFor(text: string, lang: Lang, voice: SpeechSynthesisVoice | null): SpeechSynthesisUtterance[] {
  return speechParts(text, lang).map((sentence) => {
    const u = new SpeechSynthesisUtterance(sentence);
    u.lang = lang === "en" ? document.documentElement.lang || "en" : speechLocale(lang);
    if (voice && lang !== "en") u.voice = voice;
    // A little slower is easier to follow in English. Other voices can sound
    // stretched when slowed, so they keep their natural speed.
    if (lang === "en") u.rate = 0.9;
    return u;
  });
}

// The sentences being spoken by spoken alerts. Holding on to them stops Chrome
// from throwing them away (and going quiet) partway through.
let speaking: SpeechSynthesisUtterance[] | null = null;

/** Speaks the sentences and resolves when they finish (or fail, or stop). */
export function speakAndWait(parts: SpeechSynthesisUtterance[]): Promise<void> {
  if (parts.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    // In case the browser never says it has finished, give up after a while.
    const timer = setTimeout(finish, 8000 * parts.length);
    function finish() {
      clearTimeout(timer);
      if (speaking === parts) speaking = null;
      resolve();
    }
    parts[parts.length - 1].onend = finish;
    for (const u of parts) u.onerror = finish;
    speaking = parts;
    const synth = window.speechSynthesis;
    synth.resume(); // in case the browser left speech paused
    for (const u of parts) synth.speak(u);
  });
}

let audio: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (audio) return audio;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audio = Ctx ? new Ctx() : null;
  } catch {
    audio = null;
  }
  return audio;
}

/**
 * Browsers only allow sound and speech after someone has tapped the page.
 * Call this from a tap or key press: it wakes up sound and speech for later.
 */
export function unlockSound() {
  audioContext()
    ?.resume()
    .catch(() => {});
  if (canSpeak) {
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  }
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
