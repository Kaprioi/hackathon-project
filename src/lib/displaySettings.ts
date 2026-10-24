import { useEffect, useState } from "react";

// The "Display" settings in the header: text size, less motion and high contrast.
// (There used to be a colour theme too; the whole site is CareNest blue now.) Remembered in this browser (not per account) and applied to the
// whole site through attributes on <html> that index.css reads.

export type TextSize = "normal" | "large" | "extra";

export interface DisplaySettings {
  textSize: TextSize;
  /** null = follow the device's own "reduce motion" setting. */
  reduceMotion: boolean | null;
  highContrast: boolean;
}

const KEY = "carenest-display";
const DEFAULTS: DisplaySettings = { textSize: "normal", reduceMotion: null, highContrast: false };

export function loadDisplaySettings(): DisplaySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      textSize: ["normal", "large", "extra"].includes(saved?.textSize) ? saved.textSize : "normal",
      reduceMotion: typeof saved?.reduceMotion === "boolean" ? saved.reduceMotion : null,
      highContrast: saved?.highContrast === true,
    };
  } catch {
    return DEFAULTS;
  }
}

function deviceAsks(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** Does the device itself ask for less motion? */
export function systemPrefersLessMotion(): boolean {
  return deviceAsks("(prefers-reduced-motion: reduce)");
}

/** Puts the settings on <html>, where index.css picks them up. */
export function applyDisplaySettings(settings: DisplaySettings) {
  const root = document.documentElement;
  root.dataset.textSize = settings.textSize;
  if (settings.reduceMotion === null) delete root.dataset.motion;
  else root.dataset.motion = settings.reduceMotion ? "reduce" : "full";
  if (settings.highContrast) root.dataset.contrast = "more";
  else delete root.dataset.contrast;
}

/** Applies the saved settings now, before the page is drawn. */
export function startDisplaySettings() {
  applyDisplaySettings(loadDisplaySettings());
}

/** The current settings, and a function to change them (saves and applies straight away). */
export function useDisplaySettings() {
  const [settings, setSettings] = useState(loadDisplaySettings);

  useEffect(() => {
    applyDisplaySettings(settings);
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Private browsing can block saving. The setting still works until the page closes.
    }
  }, [settings]);

  const update = (change: Partial<DisplaySettings>) => setSettings((old) => ({ ...old, ...change }));
  return [settings, update] as const;
}

/** Is "less motion" on right now (by the switch, or by the device)? */
export function motionIsReduced(): boolean {
  const choice = document.documentElement.dataset.motion;
  return choice ? choice === "reduce" : systemPrefersLessMotion();
}
