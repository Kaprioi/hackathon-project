// Tests for orientation.ts: turning a sideways camera picture upright for the AI.
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { boxFromUpright, deviceTurn, fromUpright, pictureTurn, toUpright } from "./orientation.ts";

const G = 9.81;

test("the motion sensor says which way the phone is turned", () => {
  assert.equal(deviceTurn(0, G, null), 0, "upright");
  assert.equal(deviceTurn(G, 0, null), 90, "top pointing left: its right edge is up");
  assert.equal(deviceTurn(0, -G, null), 180, "upside down");
  assert.equal(deviceTurn(-G, 0, null), 270, "top pointing right");
  assert.equal(deviceTurn(0.3, 0.5, 90), 90, "lying flat: keep the last answer");
  assert.equal(deviceTurn(6, 6, 0), 0, "near the diagonal: keep the last answer");
  assert.equal(deviceTurn(8, 3, 0), 90, "clearly tipped onto its side");
});

test("the picture is only turned when the phone turned but the screen didn't", () => {
  assert.equal(pictureTurn(90, 0), 90, "phone turned left, auto-rotate off");
  assert.equal(pictureTurn(270, 0), 270, "phone turned right, auto-rotate off");
  assert.equal(pictureTurn(90, 90), 0, "the screen turned with the phone: the picture is already upright");
  assert.equal(pictureTurn(0, 0), 0, "held upright");
  assert.equal(pictureTurn(null, 0), 0, "no motion sensor (PC, or an iPhone without permission)");
  assert.equal(pictureTurn(270, 90), 0, "never flip upside down on its own (sensor reported the other way)");
});

test("points survive the trip to the upright picture and back", () => {
  for (const turn of [0, 90, 180, 270]) {
    for (const [x, y] of [[0.1, 0.2], [0.9, 0.3], [0.5, 0.5], [0, 1]]) {
      const u = toUpright(x, y, turn);
      const back = fromUpright(u.x, u.y, turn);
      assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.y - y) < 1e-9, `turn ${turn}: (${x}, ${y})`);
    }
  }
});

test("a person lying on their side in a sideways picture stands upright after turning", () => {
  // Phone turned left with auto-rotate off (turn 90): the room's "up" is the right of
  // the camera's picture, so a standing person shows as a wide box, head on the right.
  const head = toUpright(0.88, 0.47, 90);
  const feet = toUpright(0.52, 0.47, 90);
  assert.ok(head.y < feet.y, "the head should be above the feet");
  assert.ok(Math.abs(head.x - feet.x) < 1e-9, "and straight above them");

  // The upright box for them is tall, and turning it back gives the wide box on screen.
  const upright = { x: 0.4, y: 0.1, w: 0.15, h: 0.4 };
  const shown = boxFromUpright(upright, 90);
  assert.ok(shown.w > shown.h, "on screen the box is wide again");
  assert.ok(Math.abs(shown.x - 0.5) < 1e-9 && Math.abs(shown.y - 0.4) < 1e-9, `got ${JSON.stringify(shown)}`);
});
