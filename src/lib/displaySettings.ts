import { useEffect, useState } from "react";

// The "Display" settings in the header: text size, less motion, colour theme and
// high contrast. Remembered in this browser (not per account) and applied to the
// whole site through attributes on <html> that index.css reads.

export type TextSize = "normal" | "large" | "extra";
export type Theme = "carenest" | "ocean" | "forest" | "sunset" | "rose" | "slate";

/** The colour themes, in the order the "Color" picker shows them. Their colours are in index.css. */
export const THEMES: { value: Theme; label: string; brand: string }[] = [
  { value: "carenest", label: "CareNest purple", brand: "#5b3cc4" },
  { value: "ocean", label: "Ocean blue", brand: "#1a5fb4" },
  { value: "forest", label: "Forest green", brand: "#22703f" },
  { value: "sunset", label: "Sunset orange", brand: "#a63c16" },
  { value: "rose", label: "Rose pink", brand: "#b4235a" },
  { value: "slate", label: "Slate gray", brand: "#3f4b5e" },
];

export interface DisplaySettings {
  textSize: TextSize;
  /** null = follow the device's own "reduce motion" setting. */
  reduceMotion: boolean | null;
  /** The colour theme. Older saves said "system", "light" or "dark"; those get CareNest purple. */
  theme: Theme;
  highContrast: boolean;
}

const KEY = "carenest-display";
const DEFAULTS: DisplaySettings = { textSize: "normal", reduceMotion: null, theme: "carenest", highContrast: false };

export function loadDisplaySettings(): DisplaySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      textSize: ["normal", "large", "extra"].includes(saved?.textSize) ? saved.textSize : "normal",
      reduceMotion: typeof saved?.reduceMotion === "boolean" ? saved.reduceMotion : null,
      theme: THEMES.some((t) => t.value === saved?.theme) ? saved.theme : "carenest",
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
  root.dataset.theme = settings.theme;
  // The browser's own bar on phones takes the theme's colour too.
  const brand = THEMES.find((t) => t.value === settings.theme)?.brand;
  if (brand) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", brand);
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
