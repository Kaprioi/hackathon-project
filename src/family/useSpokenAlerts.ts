import { useCallback, useEffect, useRef, useState } from "react";
import { english, type Lang, type Translate } from "../i18n/translate";
import { useLanguage } from "../i18n/useLanguage";
import { REPEAT_FALL_AFTER_MS, shouldSpeak, type AlertSettings } from "./alerts";
import { pickVoice } from "./readAloud";
import { canSpeak, loadVoices, playChime, speakAndWait, unlockSound, utterancesFor } from "./speech";
import type { EventRow } from "./status";

// Spoken alerts: when switched on, the family page says new alerts out loud by
// itself (a chime, then e.g. "Possible fall, left side, at 3:42 pm"), so a tablet
// left in the kitchen works like an alarm. Which news is spoken is decided by
// shouldSpeak() in alerts.ts. Only one thing is spoken at a time.

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
  // Browsers block speech until the page has been tapped. After a reload the
  // switch can be on but speech blocked, so the page asks for a tap.
  const [unlocked, setUnlocked] = useState(hasBeenTapped);
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
      const voices = await loadVoices();
      let voice = pickVoice(voices, now.lang);
      let useLang = now.lang;
      let useT = now.t;
      // No Spanish or Chinese voice on this device: an alarm in English beats silence.
      if (useLang !== "en" && !voice && voices.length > 0) {
        useLang = "en";
        useT = english;
        voice = null;
      }
      const synth = window.speechSynthesis;
      // Stop any "Read aloud" so two voices don't talk over each other.
      if (synth.speaking || synth.pending) {
        synth.cancel();
        await new Promise((r) => setTimeout(r, 100));
      }
      if (alert) await playChime();
      if (!latest.current.on) return;
      await speakAndWait(utterancesFor(build(useLang, useT), useLang, voice));
    });
  }, []);

  const unlock = useCallback(() => {
    unlockSound();
    unlockedRef.current = true;
    setUnlocked(true);
  }, []);

  /** Call from the switch's (or the "tap to turn back on" button's) tap: wakes up speech and says it worked. */
  const turnedOn = useCallback(() => {
    latest.current.on = true; // the page catches up a moment later
    unlock();
    say((_, t) => t("Spoken alerts are on."), true);
  }, [unlock, say]);

  // After a reload, the first tap anywhere on the page quietly switches speech
  // back on (without talking over whatever that tap was for).
  useEffect(() => {
    if (!canSpeak) return;
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
    if (canSpeak) window.speechSynthesis.cancel();
  }, [on]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      if (canSpeak && latest.current.on) window.speechSynthesis.cancel();
    },
    [],
  );

  /** Call with each piece of news as it arrives live. */
  const heard = useCallback(
    (e: EventRow) => {
      const now = latest.current;
      if (!canSpeak || !now.on || !shouldSpeak(e, now.settings, Date.now(), spoken.current)) return;
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

  return { heard, turnedOn, needsTap: canSpeak && on && !unlocked };
}
