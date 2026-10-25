// Tests for savedSettings.ts: the camera page's starting settings.
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "./config.ts";
import { startSettings } from "./savedSettings.ts";

test("nothing saved: faces start off on iPhones and on elsewhere", () => {
  assert.equal(startSettings(null, true, false).faces, false);
  assert.equal(startSettings(null, false, false).faces, true);
  assert.equal(startSettings(null, true, false).camera, DEFAULT_SETTINGS.camera);
});

test("an iPhone's older saved settings can't switch the heavy face AI back on", () => {
  // Saved before faces started off on iPhones (any change, like picking a camera, saved them all).
  const old = { ...DEFAULT_SETTINGS, faces: true, camera: "back" };
  const s = startSettings(old, true, false);
  assert.equal(s.faces, false);
  assert.equal(s.camera, "back"); // the rest of the saved settings still count
});

test("faces switched on by hand on an iPhone stay on", () => {
  assert.equal(startSettings({ faces: true }, true, true).faces, true);
  assert.equal(startSettings({ faces: false }, true, true).faces, false);
});

test("other phones keep whatever they saved", () => {
  assert.equal(startSettings({ faces: false }, false, false).faces, false);
  assert.equal(startSettings({ faces: true }, false, false).faces, true);
});
