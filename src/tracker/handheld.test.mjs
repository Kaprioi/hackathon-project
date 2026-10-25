// Tests for handheld.ts: knowing which way the phone turned, from its gyroscope.
// rotationRate: alpha = around the phone's right-hand (x) axis, beta = around its top (y)
// axis, gamma = around the axis out of the screen (z), as browsers report them.
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { HandheldCamera, viewTurn } from "./handheld.ts";

const near = (a, b) => Math.abs(a - b) < 1e-9;

test("turning the phone right while holding it upright turns the view right, with either camera", () => {
  // Turning right (clockwise seen from above) is a negative turn around the phone's top axis (beta).
  const back = viewTurn({ alpha: 0, beta: -30, gamma: 0 }, 1, 0, false, 0);
  const front = viewTurn({ alpha: 0, beta: -30, gamma: 0 }, 1, 0, true, 0);
  assert.ok(near(back.right, 30) && near(back.down, 0), `back camera: ${JSON.stringify(back)}`);
  assert.ok(near(front.right, 30) && near(front.down, 0), `front camera: ${JSON.stringify(front)}`);
});

test("tipping the phone so the camera looks down turns the view down", () => {
  // Back camera looks down when the top tips away from you (negative turn around the right-hand
  // axis, alpha); the front camera looks down when the top tips toward you.
  const back = viewTurn({ alpha: -20, beta: 0, gamma: 0 }, 1, 0, false, 0);
  const front = viewTurn({ alpha: 20, beta: 0, gamma: 0 }, 1, 0, true, 0);
  assert.ok(near(back.down, 20) && near(back.right, 0), `back camera: ${JSON.stringify(back)}`);
  assert.ok(near(front.down, 20) && near(front.right, 0), `front camera: ${JSON.stringify(front)}`);
});

test("held sideways, turning right still turns the view right, with auto-rotate on or off", () => {
  // Top of the phone pointing left: the room's "up" is the phone's right-hand axis,
  // so turning right is a negative turn around that axis (alpha).
  const rate = { alpha: -30, beta: 0, gamma: 0 };
  const lockOff = viewTurn(rate, 1, 90, false, 0); // the screen turned with the phone
  const lockOn = viewTurn(rate, 1, 0, false, 90); // the screen didn't; the page turns the picture instead
  assert.ok(near(lockOff.right, 30) && near(lockOff.down, 0), `auto-rotate on: ${JSON.stringify(lockOff)}`);
  assert.ok(near(lockOn.right, 30) && near(lockOn.down, 0), `auto-rotate off: ${JSON.stringify(lockOn)}`);
});

test("twisting the phone like a steering wheel doesn't count as turning the view", () => {
  // Apple's video: with the axes mixed up, small twists and tips pushed the dial to its limits.
  const v = viewTurn({ alpha: 0, beta: 0, gamma: 45 }, 1, 0, false, 90);
  assert.ok(near(v.right, 0) && near(v.down, 0), `got ${JSON.stringify(v)}`);
});

test("the pretend camera remembers where it pointed a moment ago", () => {
  const cam = new HandheldCamera();
  assert.equal(cam.active, false);
  cam.move(1000, 5, 0);
  cam.move(1100, 5, -2);
  cam.move(1200, 5, 0);
  assert.equal(cam.active, true);
  assert.deepEqual(cam.at(1150), { pan: 100, tilt: 88 });
  assert.deepEqual(cam.at(5000), { pan: 105, tilt: 88 });
  cam.reset();
  assert.equal(cam.active, false);
  assert.deepEqual(cam.at(5000), { pan: 90, tilt: 90 });
});
