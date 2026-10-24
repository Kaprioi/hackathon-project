// Tests for the saved "Display" settings, especially older saves from before the
// colour themes (when the choice was "Same as my device", "Light" or "Dark").
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadDisplaySettings, THEMES } from "./displaySettings.ts";

// A pretend browser storage holding whatever this browser saved before.
function saved(value) {
  globalThis.localStorage = { getItem: () => value, setItem() {} };
}

test("someone who chose Dark (or Light, or Same as my device) gets CareNest purple", () => {
  for (const theme of ["dark", "light", "system"]) {
    saved(JSON.stringify({ textSize: "large", theme, highContrast: true }));
    const settings = loadDisplaySettings();
    assert.equal(settings.theme, "carenest");
    // Their other choices are kept.
    assert.equal(settings.textSize, "large");
    assert.equal(settings.highContrast, true);
  }
});

test("a chosen colour theme is remembered", () => {
  for (const { value } of THEMES) {
    saved(JSON.stringify({ theme: value }));
    assert.equal(loadDisplaySettings().theme, value);
  }
});

test("nothing saved, or a broken save, gives the normal settings", () => {
  for (const value of [null, "not json", "null", "[]"]) {
    saved(value);
    assert.deepEqual(loadDisplaySettings(), { textSize: "normal", reduceMotion: null, theme: "carenest", highContrast: false });
  }
});
