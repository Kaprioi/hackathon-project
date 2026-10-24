// Tests for the saved "Display" settings, especially older saves that still hold
// a colour theme or "Light"/"Dark" from before the whole site was one CareNest colour (blue).
//
// Run with:  npm test

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadDisplaySettings, motionIsReduced } from "./displaySettings.ts";

// A pretend browser storage holding whatever this browser saved before.
function saved(value) {
  globalThis.localStorage = { getItem: () => value, setItem() {} };
}

test("an old saved colour (Ocean blue, Dark...) is ignored, other choices are kept", () => {
  for (const theme of ["dark", "light", "system", "ocean", "slate"]) {
    saved(JSON.stringify({ textSize: "large", theme, highContrast: true }));
    assert.deepEqual(loadDisplaySettings(), { textSize: "large", reduceMotion: null, highContrast: true });
  }
});

test("nothing saved, or a broken save, gives the normal settings", () => {
  for (const value of [null, "not json", "null", "[]"]) {
    saved(value);
    assert.deepEqual(loadDisplaySettings(), { textSize: "normal", reduceMotion: null, highContrast: false });
  }
});

// A pretend page: the "Reduce motion" switch (data-motion on <html>) and the device's own setting.
function page(motion, deviceAsksForLessMotion) {
  globalThis.document = { documentElement: { dataset: motion ? { motion } : {} } };
  globalThis.window = { matchMedia: () => ({ matches: deviceAsksForLessMotion }) };
}

test("the Reduce motion switch wins over the device; with no choice, the device decides", () => {
  page("reduce", false);
  assert.equal(motionIsReduced(), true);
  page("full", true);
  assert.equal(motionIsReduced(), false);
  page(undefined, true);
  assert.equal(motionIsReduced(), true);
  page(undefined, false);
  assert.equal(motionIsReduced(), false);
});

// With Reduce motion on, animations stop, so these shapes show their resting look. Without
// one, the camera's scan cone was a solid block over the demo room ("Left side" / "Right side").
test("the scan cone stays faint and the ping rings hide when they are not animating", () => {
  const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
  const resting = (name) => Number(css.match(new RegExp(`^\\.animate-${name} \\{\\s*opacity: ([\\d.]+);`, "m"))?.[1]);
  assert.ok(resting("scan") > 0 && resting("scan") <= 0.25, "the scan cone should be faint");
  assert.equal(resting("pulse-ring"), 0);
});
