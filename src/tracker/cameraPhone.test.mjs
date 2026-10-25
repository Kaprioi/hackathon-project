// Tests for cameraPhone.ts: CareNest on the Home Screen comes back to the camera
// after the iPhone restarts it, instead of landing on the family page.
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { rememberWatching, reopenCameraIfNeeded, reopenCameraPath, takeReopened } from "./cameraPhone.ts";

// A pretend browser: this phone's saved values, the address, and whether it's the Home Screen app.
const saved = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k) => (saved.has(k) ? saved.get(k) : null),
    setItem: (k, v) => saved.set(k, String(v)),
    removeItem: (k) => saved.delete(k),
  },
});

/** Starts the site at `path`, like the iPhone opening it; returns the address it ends up on. */
function launch(path, homeScreenApp) {
  let address = path;
  globalThis.window = {
    location: { pathname: path },
    matchMedia: () => ({ matches: homeScreenApp }),
    history: { replaceState: (_state, _title, to) => (address = to) },
  };
  reopenCameraIfNeeded();
  return address;
}

test("only a Home Screen app that was watching goes from the family page to the camera", () => {
  assert.equal(reopenCameraPath("/dashboard", true, true), "/tracker");
  assert.equal(reopenCameraPath("/dashboard/", true, true), "/tracker");
  assert.equal(reopenCameraPath("/dashboard", true, false), null); // a family member's phone
  assert.equal(reopenCameraPath("/dashboard", false, true), null); // a browser tab keeps its own page
  assert.equal(reopenCameraPath("/tracker", true, true), null); // already there
  assert.equal(reopenCameraPath("/help", true, true), null);
});

test("the iPhone restarting CareNest while it watches opens the camera page again, not the family page", () => {
  saved.clear();
  rememberWatching(true); // Start watching
  // iOS closes the Home Screen app to free memory, then opens it again at its start page.
  assert.equal(launch("/dashboard", true), "/tracker");
  assert.equal(takeReopened(), true); // the camera page says why it stopped...
  assert.equal(takeReopened(), false); // ...only once
});

test("after Stop or leaving the camera page, the Home Screen icon opens the family page again", () => {
  saved.clear();
  rememberWatching(true);
  rememberWatching(false); // Stop watching, or Go back from the camera page
  assert.equal(launch("/dashboard", true), "/dashboard");
  assert.equal(takeReopened(), false);
});

test("a phone that never watched keeps the family page", () => {
  saved.clear();
  assert.equal(launch("/dashboard", true), "/dashboard");
});

test("blocked storage just keeps the family page", () => {
  const storage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    },
  });
  try {
    rememberWatching(true); // doesn't throw
    assert.equal(launch("/dashboard", true), "/dashboard");
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  }
});
