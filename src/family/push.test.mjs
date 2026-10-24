// Tests for the phone notification helpers (src/family/push.ts).
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { extrasFrom, isMissingTable, isPushKind, keyBytes, kindsFor, pushSupport, subscriptionRow } from "./push.ts";

const browser = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130",
  maxTouchPoints: 0,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  standalone: false,
};
const iphoneSafari = {
  ...browser,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1",
  maxTouchPoints: 5,
  hasPushManager: false,
  hasNotification: false,
};

test("only falls, camera stopped and no movement become notifications", () => {
  assert.ok(isPushKind("fall"));
  assert.ok(isPushKind("stopped"));
  assert.ok(isPushKind("inactive"));
  for (const kind of ["moving", "still", "nobody", "heartbeat", "started"]) assert.ok(!isPushKind(kind));
  assert.deepEqual(kindsFor({ cameraOff: false, noMovement: false }), ["fall"]);
  assert.deepEqual(kindsFor({ cameraOff: true, noMovement: false }), ["fall", "stopped"]);
  assert.deepEqual(kindsFor({ cameraOff: true, noMovement: true }), ["fall", "stopped", "inactive"]);
  assert.deepEqual(extrasFrom(["fall", "inactive"]), { cameraOff: false, noMovement: true });
});

test("iPhones are told to add CareNest to the Home Screen first", () => {
  assert.equal(pushSupport(browser), "ok");
  assert.equal(pushSupport(iphoneSafari), "home-screen");
  // An iPad says it is a Mac, but has a touch screen.
  assert.equal(pushSupport({ ...iphoneSafari, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605" }), "home-screen");
  // Opened from the Home Screen on iOS 16.4+, push is there.
  assert.equal(pushSupport({ ...iphoneSafari, standalone: true, hasPushManager: true, hasNotification: true }), "ok");
  // From the Home Screen on an older iPhone, it still can't.
  assert.equal(pushSupport({ ...iphoneSafari, standalone: true }), "unsupported");
  assert.equal(pushSupport({ ...browser, hasServiceWorker: false }), "unsupported");
});

test("the public key turns into the right bytes", () => {
  assert.deepEqual([...keyBytes("AQID")], [1, 2, 3]);
  assert.deepEqual([...keyBytes("-_8")], [251, 255]);
  assert.equal(keyBytes("BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U").length, 65);
});

test("a subscription becomes a tidy database row", () => {
  const row = subscriptionRow(
    { endpoint: "https://push.test/abc", keys: { p256dh: "pk", auth: "au" } },
    { circleId: "c1", userId: "u1", lang: "fr", timeZone: "", who: "  Mum  ", extras: { cameraOff: true, noMovement: false } },
  );
  assert.equal(row.endpoint, "https://push.test/abc");
  assert.equal(row.lang, "en");
  assert.equal(row.time_zone, "UTC");
  assert.equal(row.who, "Mum");
  assert.deepEqual(row.kinds, ["fall", "stopped"]);
  assert.throws(() => subscriptionRow({ endpoint: "https://push.test/abc" }, { circleId: "c", userId: "u", lang: "en", timeZone: "UTC", who: "", extras: { cameraOff: false, noMovement: false } }));
});

test("a missing table is recognised, other errors are not", () => {
  assert.ok(isMissingTable({ code: "PGRST205" }));
  assert.ok(isMissingTable({ code: "42P01" }));
  assert.ok(!isMissingTable({ code: "42501" }));
  assert.ok(!isMissingTable(null));
});
