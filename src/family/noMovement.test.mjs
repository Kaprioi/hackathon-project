// Tests for "No movement for a while".
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { translate } from "../i18n/translate.ts";
import es from "../i18n/es.ts";
import zh from "../i18n/zh.ts";
import {
  checkNoMovement,
  cleanNoMovementSettings,
  daytimeStart,
  noMovementLine,
  shouldSendInactive,
  startWatch,
  stillFor,
  watchSaw,
} from "./noMovement.ts";

// Times in the viewer's own time zone, so the tests pass anywhere.
const at = (h, m = 0, day = 24) => new Date(2026, 9, day, h, m).getTime();
const HOUR = 3_600_000;
let nextId = 1;
const ev = (kind, ms) => ({ id: nextId++, kind, zone: null, posture: null, created_at: new Date(ms).toISOString() });
const settings = (patch = {}) => ({ on: true, hours: 3, dayFrom: "08:00", dayTo: "21:00", ...patch });

test("settings: broken or missing values fall back, Care profile times are used for daytime", () => {
  assert.deepEqual(cleanNoMovementSettings(null), settings());
  assert.deepEqual(cleanNoMovementSettings("nonsense"), settings());
  assert.deepEqual(cleanNoMovementSettings({ on: false, hours: 5, dayFrom: "25:00", dayTo: "20:30" }), {
    on: false,
    hours: 3,
    dayFrom: "08:00",
    dayTo: "20:30",
  });
  assert.deepEqual(cleanNoMovementSettings({ hours: 6 }, "07:30:00", "22:15"), settings({ hours: 6, dayFrom: "07:30", dayTo: "22:15" }));
  assert.deepEqual(cleanNoMovementSettings({}, "never", 7), settings());
  // Something already chosen here wins over the Care profile.
  assert.equal(cleanNoMovementSettings({ dayFrom: "09:00" }, "06:00").dayFrom, "09:00");
});

test("daytime: inside, outside, past midnight and all day", () => {
  assert.equal(daytimeStart(at(11), "08:00", "21:00"), at(8));
  assert.equal(daytimeStart(at(7, 59), "08:00", "21:00"), null);
  assert.equal(daytimeStart(at(21), "08:00", "21:00"), null);
  // Daytime running past midnight (a night owl, 10:00 to 01:00).
  assert.equal(daytimeStart(at(23), "10:00", "01:00"), at(10));
  assert.equal(daytimeStart(at(0, 30, 25), "10:00", "01:00"), at(10, 0, 24));
  assert.equal(daytimeStart(at(3, 0, 25), "10:00", "01:00"), null);
  assert.equal(daytimeStart(at(15), "09:00", "09:00"), at(0));
});

test("only daytime counts towards the quiet time", () => {
  const day = settings();
  // Last moved at 20:00 the night before: at 10:00 it has only been 2 hours of daytime.
  assert.equal(stillFor(at(10), day, at(20, 0, 23), false), 2 * HOUR);
  assert.equal(stillFor(at(10), day, at(9), false), HOUR);
  assert.equal(stillFor(at(10), day, at(9), true), 0);
  assert.equal(stillFor(at(23), day, at(9), false), 0);
  assert.equal(stillFor(at(10), day, null, false), 2 * HOUR);
});

test("shows after the chosen number of hours with the camera on", () => {
  const events = [ev("started", at(7)), ev("moving", at(8, 30)), ev("still", at(9)), ev("heartbeat", at(11, 59))];
  assert.equal(checkNoMovement(events, at(11, 59), true, settings()).show, false);
  assert.deepEqual(checkNoMovement(events, at(12), true, settings()), { show: true, since: at(9) });
  assert.equal(checkNoMovement(events, at(10, 30), true, settings({ hours: 1 })).show, true);
  assert.equal(checkNoMovement(events, at(14, 59), true, settings({ hours: 6 })).show, false);
  assert.equal(checkNoMovement(events, at(15), true, settings({ hours: 6 })).show, true);
  // Switched off in Alert settings.
  assert.equal(checkNoMovement(events, at(12), true, settings({ on: false })).show, false);
});

test("camera off is not 'no movement'", () => {
  const events = [ev("started", at(7)), ev("still", at(8, 5)), ev("stopped", at(9))];
  assert.equal(checkNoMovement(events, at(13), false, settings()).show, false);
});

test("the camera starting again is a fresh start", () => {
  const events = [ev("still", at(8, 5)), ev("stopped", at(9)), ev("started", at(11))];
  assert.equal(checkNoMovement(events, at(13), true, settings()).show, false);
  assert.deepEqual(checkNoMovement(events, at(14), true, settings()), { show: true, since: at(11) });
});

test("clears by itself on the next movement, and while they keep moving", () => {
  const quiet = [ev("started", at(7)), ev("still", at(8))];
  assert.equal(checkNoMovement(quiet, at(12), true, settings()).show, true);
  const moved = [...quiet, ev("moving", at(12, 1))];
  assert.equal(checkNoMovement(moved, at(12, 2), true, settings()).show, false);
  // Still "moving" as the latest news: they are moving right now.
  assert.equal(checkNoMovement(moved, at(16), true, settings()).show, false);
  // Moving until the "still" news at 12:30, so quiet counts from then.
  const stopped = [...moved, ev("still", at(12, 30))];
  assert.deepEqual(checkNoMovement(stopped, at(15, 30), true, settings()), { show: true, since: at(12, 30) });
});

test("nights never count, even after a long sleep", () => {
  const events = [ev("started", at(19, 0, 23)), ev("moving", at(20, 0, 23)), ev("still", at(20, 30, 23))];
  assert.equal(checkNoMovement(events, at(3), true, settings()).show, false);
  assert.equal(checkNoMovement(events, at(10, 59), true, settings()).show, false);
  assert.deepEqual(checkNoMovement(events, at(11), true, settings()), { show: true, since: at(8) });
  // Daytime past midnight: news from the evening before still counts.
  const owl = settings({ dayFrom: "10:00", dayTo: "01:00" });
  assert.equal(checkNoMovement(events, at(0, 30), true, owl).show, true);
  assert.equal(checkNoMovement([...events, ev("moving", at(22, 0, 23)), ev("still", at(22, 10, 23))], at(0, 30), true, owl).show, false);
});

test("a possible fall has its own alert, and the camera's own 'inactive' news doesn't count as movement", () => {
  const fell = [ev("started", at(7)), ev("fall", at(8, 30))];
  assert.equal(checkNoMovement(fell, at(13), true, settings()).show, false);
  const told = [ev("started", at(7)), ev("still", at(8)), ev("inactive", at(11))];
  assert.equal(checkNoMovement(told, at(11, 1), true, settings()).show, true);
});

test("the words, in each language", () => {
  assert.equal(noMovementLine(at(9), at(12, 20), "Mum"), "No movement for 3 hours - maybe give Mum a call.");
  assert.equal(noMovementLine(at(9), at(10, 5), "Mum"), "No movement for 1 hour - maybe give Mum a call.");
  const t = (list) => (text, values) => translate(list, text, values);
  assert.notEqual(noMovementLine(at(9), at(12), "Mamá", t(es)), noMovementLine(at(9), at(12), "Mamá"));
  assert.match(noMovementLine(at(9), at(12), "妈妈", t(zh)), /3/);
});

test("the camera sends one 'inactive' per quiet spell, in the daytime only", () => {
  let w = startWatch(at(7));
  w = watchSaw(w, "moving", at(8));
  w = watchSaw(w, "still", at(8, 30));
  assert.equal(shouldSendInactive(w, at(11, 29)), false);
  assert.equal(shouldSendInactive(w, at(11, 30)), true);
  w = { ...w, told: true };
  assert.equal(shouldSendInactive(w, at(14)), false);
  // Heartbeats and its own "inactive" change nothing; movement starts over.
  assert.deepEqual(watchSaw(w, "heartbeat", at(14)), w);
  assert.deepEqual(watchSaw(w, "inactive", at(14)), w);
  w = watchSaw(w, "moving", at(14));
  assert.equal(w.told, false);
  w = watchSaw(w, "nobody", at(14, 10));
  assert.equal(shouldSendInactive(w, at(17, 10)), true);
  // Not at night: started at 19:00, nothing until daytime the next morning.
  const night = startWatch(at(19, 0, 23));
  assert.equal(shouldSendInactive(night, at(23, 0, 23)), false);
  assert.equal(shouldSendInactive(night, at(10, 59)), false);
  assert.equal(shouldSendInactive(night, at(11)), true);
});
