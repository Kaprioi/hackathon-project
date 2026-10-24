// Tests for read aloud, alert settings and "I'm checking on it".
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { summarise } from "./status.ts";
import {
  DEFAULT_ALERT_SETTINGS,
  canCheckOn,
  checkingLine,
  cleanAlertSettings,
  highlightFor,
  isQuietTime,
  shortName,
  spokenEvent,
  spokenStatus,
  whoToSpeakOf,
} from "./alerts.ts";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const at = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();
let nextId = 1;
const ev = (kind, minutesAgo, zone = null, posture = null) => ({ id: nextId++, kind, zone, posture, created_at: at(minutesAgo) });
const clock = () => "10:38";
// A time in the viewer's own time zone, like the page uses.
const local = (h, m = 0) => new Date(2026, 9, 24, h, m);

test("read aloud speaks a natural sentence", () => {
  assert.equal(spokenStatus(summarise([ev("moving", 1, "left")], NOW), "Mum", clock), "Mum is okay, moving about. Last update at 10:38.");
  assert.equal(
    spokenStatus(summarise([ev("still", 1, "middle", "lying")], NOW), "Mum", clock),
    "Mum is okay, lying down, resting. Last update at 10:38.",
  );
  assert.match(spokenStatus(summarise([ev("fall", 1)], NOW), "Mum", clock), /may have fallen, at 10:38\. Please call/);
  assert.equal(spokenStatus(summarise([], NOW), "Mum", clock), "There is no news from the phone yet.");
  assert.match(spokenStatus(summarise([ev("moving", 10)], NOW), "Mum", clock), /has not checked in since/);
});

test("read aloud for one line of news", () => {
  assert.equal(spokenEvent(ev("fall", 1, "left"), clock), "Possible fall, left side, at 10:38.");
  assert.equal(spokenEvent(ev("nobody", 1, "right"), clock), "Nobody in view, at 10:38.");
});

test("the spoken name comes from the Care profile, or a kind default", () => {
  assert.equal(whoToSpeakOf(" Grandpa Joe "), "Grandpa Joe");
  assert.equal(whoToSpeakOf(""), "Your loved one");
  assert.equal(whoToSpeakOf(undefined), "Your loved one");
  assert.equal(whoToSpeakOf(["Mum"]), "Your loved one");
});

test("broken saved alert settings fall back to the defaults", () => {
  assert.deepEqual(cleanAlertSettings(null), DEFAULT_ALERT_SETTINGS);
  assert.deepEqual(cleanAlertSettings("nonsense"), DEFAULT_ALERT_SETTINGS);
  assert.deepEqual(cleanAlertSettings({ falls: false, quietFrom: "25:00", quietTo: "06:30", quietHours: "yes" }), {
    ...DEFAULT_ALERT_SETTINGS,
    falls: false,
    quietTo: "06:30",
  });
});

test("quiet hours work overnight and during the day", () => {
  const night = { ...DEFAULT_ALERT_SETTINGS, quietHours: true, quietFrom: "22:00", quietTo: "07:00" };
  assert.equal(isQuietTime(night, local(23)), true);
  assert.equal(isQuietTime(night, local(3)), true);
  assert.equal(isQuietTime(night, local(7)), false);
  assert.equal(isQuietTime(night, local(12)), false);
  const nap = { ...night, quietFrom: "13:00", quietTo: "14:30" };
  assert.equal(isQuietTime(nap, local(14, 15)), true);
  assert.equal(isQuietTime(nap, local(15)), false);
  assert.equal(isQuietTime({ ...night, quietHours: false }, local(23)), false);
});

test("alert settings decide what is highlighted", () => {
  const e = (kind, h) => ({ id: nextId++, kind, zone: null, posture: null, created_at: local(h).toISOString() });
  assert.equal(highlightFor(e("fall", 12), DEFAULT_ALERT_SETTINGS), "highlight");
  assert.equal(highlightFor(e("nobody", 12), DEFAULT_ALERT_SETTINGS), "highlight");
  assert.equal(highlightFor(e("moving", 12), DEFAULT_ALERT_SETTINGS), "none");
  assert.equal(highlightFor(e("nobody", 12), { ...DEFAULT_ALERT_SETTINGS, outOfSight: false }), "none");
  assert.equal(highlightFor(e("fall", 23), { ...DEFAULT_ALERT_SETTINGS, quietHours: true }), "quiet");
});

test("'I'm checking on it' is offered on possible falls", () => {
  assert.equal(canCheckOn({ kind: "fall" }), true);
  assert.equal(canCheckOn({ kind: "moving" }), false);
});

test("who is checking on it reads naturally", () => {
  assert.equal(checkingLine([]), "");
  assert.equal(checkingLine(["Sam"]), "Sam is checking on it");
  assert.equal(checkingLine(["You"]), "You are checking on it");
  assert.equal(checkingLine(["You", "Sam"]), "You and Sam are checking on it");
  assert.equal(checkingLine(["Sam", "Ali", "Jo"]), "Sam, Ali and Jo are checking on it");
  assert.equal(shortName({ display_name: "Sam", email: "s@x.com" }), "Sam");
  assert.equal(shortName({ display_name: null, email: "ali.k@x.com" }), "ali.k");
  assert.equal(shortName(undefined), "Someone");
});
