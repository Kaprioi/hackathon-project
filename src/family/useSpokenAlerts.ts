import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang, Translate } from "../i18n/translate";
import { useLanguage } from "../i18n/useLanguage";
import { accessToken } from "../lib/supabase";
import { REPEAT_FALL_AFTER_MS, shouldSpeak, shouldSpeakSilence, type AlertSettings } from "./alerts";
import type { EventRow } from "./status";
import { playChime, speak, stopVoice, unlockVoice } from "./voice";

// Spoken alerts: when switched on, the family page says new alerts out loud by
// itself (a chime, then e.g. "Possible fall, left side, at 3:42 pm"), so a tablet
// left in the kitchen works like an alarm. Which news is spoken is decided by
// shouldSpeak() in alerts.ts. Only one thing is spoken at a time, always in our
// ElevenLabs voice (see voice.ts).

/** What to say: the page builds the sentence, in the language given. */
export type AlertWords = (e: EventRow, again: boolean, lang: Lang, t: Translate) => string;

const hasBeenTapped = () =>
  typeof navigator !== "undefined" && (navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === true;

export function useSpokenAlerts({
  on,
  settings,
  words,
  isBeingChecked,
}: {
  on: boolean;
  settings: AlertSettings;
  words: AlertWords;
  /** True once someone has pressed "I'm checking on it" for this event. */
  isBeingChecked: (eventId: number) => boolean;
}) {
  const { lang, t } = useLanguage();
  // Browsers block sound until the page has been tapped. After a reload the
  // switch can be on but sound blocked, so the page asks for a tap.
  const [unlocked, setUnlocked] = useState(hasBeenTapped);
  // A short message when the voice couldn't be reached or played.
  const [note, setNote] = useState("");
  const unlockedRef = useRef(unlocked);
  // The newest values, for timers and live news that arrive later.
  const latest = useRef({ on, settings, words, isBeingChecked, lang, t });
  latest.current = { on, settings, words, isBeingChecked, lang, t };
  const spoken = useRef(new Set<number>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /** Chime, then speak. Waits for anything spoken alerts are already saying. */
  const say = useCallback((build: (lang: Lang, t: Translate) => string, alert: boolean) => {
    queue.current = queue.current.then(async () => {
      const now = latest.current;
      if (!now.on) return;
      // Stop any "Read aloud" so two things aren't said over each other.
      stopVoice();
      if (alert) await playChime();
      if (!latest.current.on) return;
      const outcome = await speak(build(now.lang, now.t), now.lang, accessToken);
      if (outcome === "failed") setNote("Read aloud isn't available right now. Please try again in a moment.");
      else if (outcome === "ended") setNote("");
    });
  }, []);

  const unlock = useCallback(() => {
    unlockVoice();
    unlockedRef.current = true;
    setUnlocked(true);
  }, []);

  /** Call from the switch's (or the "tap to turn back on" button's) tap: wakes up sound and says it worked. */
  const turnedOn = useCallback(() => {
    latest.current.on = true; // the page catches up a moment later
    unlock();
    say((_, t) => t("Spoken alerts are on."), true);
  }, [unlock, say]);

  // After a reload, the first tap anywhere on the page quietly switches sound
  // back on (without talking over whatever that tap was for).
  useEffect(() => {
    let primed = false;
    const wake = () => {
      // Some phones (iPhones) need this once per visit even when the page counts as tapped.
      if (!primed || !unlockedRef.current) unlock();
      primed = true;
    };
    window.addEventListener("click", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("click", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [unlock]);

  // Switched off (or leaving the page): forget the reminders and stop talking.
  useEffect(() => {
    if (on) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    stopVoice();
  }, [on]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      if (latest.current.on) stopVoice();
    },
    [],
  );

  /** Call with each piece of news as it arrives live. */
  const heard = useCallback(
    (e: EventRow) => {
      const now = latest.current;
      if (!now.on || !shouldSpeak(e, now.settings, Date.now(), spoken.current)) return;
      spoken.current.add(e.id);
      say((lang, t) => latest.current.words(e, false, lang, t), true);
      if (e.kind !== "fall") return;
      // Say a possible fall once more, unless someone is already checking on it.
      timers.current.push(
        setTimeout(() => {
          if (latest.current.on && !latest.current.isBeingChecked(e.id))
            say((lang, t) => latest.current.words(e, true, lang, t), true);
        }, REPEAT_FALL_AFTER_MS),
      );
    },
    [say],
  );

  /**
   * Call once when the phone goes quiet while the page is open (a closed tab or a
   * flat battery can't send "stopped"), with the last news heard from it. Says
   * "Phone stopped watching, at 3:42 pm" once for that silence.
   */
  const silent = useCallback(
    (lastHeard: EventRow) => {
      const now = latest.current;
      // Negative ids can't clash with real news, so each silence is said only once.
      const e: EventRow = { ...lastHeard, id: -lastHeard.id, kind: "stopped", zone: null, posture: null };
      if (!now.on || spoken.current.has(e.id) || !shouldSpeakSilence(now.settings, Date.now())) return;
      spoken.current.add(e.id);
      say((lang, t) => latest.current.words(e, false, lang, t), true);
    },
    [say],
  );

  /**
   * Call for a gentle heads-up the page worked out by itself, like "No movement
   * for 3 hours". Said once per `key`; the page checks the settings and quiet hours.
   */
  const saidHeadsUp = useRef(new Set<string>());
  const headsUp = useCallback(
    (key: string, build: (lang: Lang, t: Translate) => string) => {
      if (!latest.current.on || saidHeadsUp.current.has(key)) return;
      saidHeadsUp.current.add(key);
      say(build, true);
    },
    [say],
  );

  return { heard, silent, headsUp, turnedOn, needsTap: on && !unlocked, note };
}
