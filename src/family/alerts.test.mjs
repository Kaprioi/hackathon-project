// Tests for read aloud, alert settings and "I'm checking on it".
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { summarise } from "./status.ts";
import { speechParts } from "./readAloud.ts";
import { translate } from "../i18n/translate.ts";
import es from "../i18n/es.ts";
import zh from "../i18n/zh.ts";
import {
  DEFAULT_ALERT_SETTINGS,
  canCheckOn,
  checkingLine,
  cleanAlertSettings,
  cleanSpokenAlerts,
  highlightFor,
  isQuietTime,
  shortName,
  shouldSpeak,
  spokenAlert,
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

// Spoken alerts take a time in the viewer's own clock, like the page.
const evAt = (kind, when) => ({ id: nextId++, kind, zone: "left", posture: null, created_at: when.toISOString() });

test("spoken alerts say new alerts only, never old ones or the same one twice", () => {
  const settings = DEFAULT_ALERT_SETTINGS;
  const none = new Set();
  const fresh = ev("fall", 0.5);
  assert.equal(shouldSpeak(fresh, settings, NOW, none), true);
  // Already in the list when the page opened (or a reload brought it back): stay quiet.
  assert.equal(shouldSpeak(ev("fall", 10), settings, NOW, none), false);
  assert.equal(shouldSpeak(fresh, settings, NOW, new Set([fresh.id])), false);
  // Ordinary news is never spoken.
  for (const kind of ["moving", "still", "started", "stopped", "heartbeat"])
    assert.equal(shouldSpeak(ev(kind, 0), settings, NOW, none), false, kind);
});

test("possible falls are always spoken; other alerts follow the Alert settings and quiet hours", () => {
  const night = local(23, 30);
  const quiet = { ...DEFAULT_ALERT_SETTINGS, quietHours: true, quietFrom: "22:00", quietTo: "07:00" };
  const none = new Set();
  // A fall in quiet hours, or with fall highlights switched off, is still said out loud.
  assert.equal(shouldSpeak(evAt("fall", night), quiet, night.getTime(), none), true);
  assert.equal(shouldSpeak(evAt("fall", night), { ...quiet, falls: false }, night.getTime(), none), true);
  // "Nobody in view" is quiet in quiet hours, or when its highlight is off.
  assert.equal(shouldSpeak(evAt("nobody", night), quiet, night.getTime(), none), false);
  assert.equal(shouldSpeak(evAt("nobody", night), DEFAULT_ALERT_SETTINGS, night.getTime(), none), true);
  const noon = local(12, 0);
  assert.equal(shouldSpeak(evAt("nobody", noon), quiet, noon.getTime(), none), true);
  assert.equal(shouldSpeak(evAt("nobody", noon), { ...quiet, outOfSight: false }, noon.getTime(), none), false);
});

test("spoken alerts sound like an alarm, in each language", () => {
  const fall = { id: 1, kind: "fall", zone: "left", posture: null, created_at: at(0) };
  assert.equal(spokenAlert(fall, "Mum", () => "3:42 PM"), "CareNest alert. Possible fall, left side, at 3:42 PM. Please check on Mum.");
  assert.equal(
    spokenAlert(fall, "Mum", () => "3:42 PM", undefined, true),
    "Reminder from CareNest. Possible fall, left side, at 3:42 PM. Please check on Mum.",
  );
  assert.equal(spokenAlert({ ...fall, kind: "nobody" }, "Mum", () => "3:42 PM"), "CareNest alert. Nobody in view, at 3:42 PM.");
  assert.equal(
    spokenAlert(fall, "Mamá", () => "15:42", (text, vars) => translate(es, text, vars)),
    "Aviso de CareNest. Posible caída, lado izquierdo, a las 15:42. Compruebe que Mamá está bien, por favor.",
  );
  // Chinese is tidied (no stray spaces, Chinese commas) before it is spoken.
  assert.deepEqual(speechParts(spokenAlert(fall, "妈妈", () => "15点42分", (text, vars) => translate(zh, text, vars)), "zh"), [
    "CareNest提醒。",
    "15点42分，可能跌倒，左边。",
    "请看看妈妈是否安好。",
  ]);
});

test("spoken alerts are off unless they were switched on", () => {
  assert.equal(cleanSpokenAlerts(true), true);
  for (const saved of [false, null, undefined, "yes", 1]) assert.equal(cleanSpokenAlerts(saved), false);
});
