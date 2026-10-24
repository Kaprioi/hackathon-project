// Tests for phone notifications on the server (api/notify.ts), with the database
// and push service pretended (no real requests, no real keys). The file name
// starts with "_" so Vercel doesn't turn it into a web address.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { FRESH_MS, POST, alertText, alertTime, checkRequest, notify, services } from "./notify.ts";

const CIRCLE = "11111111-2222-3333-4444-555555555555";
const OTHER_CIRCLE = "99999999-2222-3333-4444-555555555555";
const NOW = Date.parse("2026-10-24T15:42:30Z");

/** A pretend database: one circle with Ann (camera) and Bo (family), and a few devices. */
function fakeStore({ events = [], subs } = {}) {
  const sent = new Set();
  const removed = [];
  const members = new Set([`${CIRCLE}:ann`, `${CIRCLE}:bo`]);
  const allSubs = subs ?? [
    { id: 1, user_id: "ann", endpoint: "https://push.test/ann-phone", p256dh: "k", auth: "a", lang: "en", time_zone: "UTC", who: "", kinds: ["fall"] },
    { id: 2, user_id: "bo", endpoint: "https://push.test/bo-laptop", p256dh: "k", auth: "a", lang: "es", time_zone: "Europe/Madrid", who: "Mamá", kinds: ["fall", "stopped", "inactive"] },
    { id: 3, user_id: "bo", endpoint: "https://push.test/bo-phone", p256dh: "k", auth: "a", lang: "zh", time_zone: "Asia/Shanghai", who: "妈妈", kinds: ["fall"] },
  ];
  return {
    removed,
    store: {
      event: async (id) => events.find((e) => e.id === id) ?? null,
      latestEvent: async (circleId, kind, since) =>
        events
          .filter((e) => e.circle_id === circleId && e.kind === kind && e.created_at >= since)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
      isMember: async (circleId, userId) => members.has(`${circleId}:${userId}`),
      markSent: async (id) => (sent.has(id) ? false : (sent.add(id), true)),
      subscriptions: async (circleId, kind) => allSubs.filter((s) => circleId === CIRCLE && s.kinds.includes(kind)),
      ownSubscription: async (circleId, userId, endpoint) =>
        allSubs.find((s) => circleId === CIRCLE && s.user_id === userId && s.endpoint === endpoint) ?? null,
      remove: async (id) => {
        removed.push(id);
      },
    },
  };
}

/** A pretend push service that remembers what it was asked to send. */
function fakeSend(fail = () => null) {
  const calls = [];
  const send = async (to, payload, urgent) => {
    const status = fail(to);
    if (status) throw Object.assign(new Error("push failed"), { statusCode: status });
    calls.push({ endpoint: to.endpoint, payload: JSON.parse(payload), urgent });
  };
  return { calls, send };
}

const ago = (ms) => new Date(NOW - ms).toISOString();
const fall = { id: 7, circle_id: CIRCLE, kind: "fall", created_at: ago(30_000) };

test("the time is written in each person's own time zone and language", () => {
  const iso = "2026-10-24T15:42:00Z";
  assert.equal(alertTime(iso, "en", "UTC"), "3:42 pm");
  assert.equal(alertTime(iso, "en", "America/New_York"), "11:42 am");
  assert.equal(alertTime(iso, "es", "Europe/Madrid"), "5:42 p. m.");
  assert.equal(alertTime(iso, "zh", "Asia/Shanghai"), "23:42");
  assert.equal(alertTime("2026-10-24T00:05:00Z", "en", "UTC"), "12:05 am");
  assert.equal(alertTime("2026-10-24T12:05:00Z", "en", "UTC"), "12:05 pm");
  // A made-up time zone falls back to UTC instead of failing.
  assert.equal(alertTime(iso, "en", "Not/AZone"), "3:42 pm");
});

test("a possible fall says where and when, in plain words", () => {
  const iso = "2026-10-24T15:42:00Z";
  assert.equal(alertText("fall", iso, { lang: "en", time_zone: "UTC", who: "Mum" }).title, "Possible fall at Mum's, 3:42 pm");
  assert.equal(alertText("fall", iso, { lang: "en", time_zone: "UTC", who: "  " }).title, "Possible fall, 3:42 pm");
  assert.equal(
    alertText("fall", iso, { lang: "es", time_zone: "UTC", who: "Mamá" }).title,
    "Posible caída en casa de Mamá, 3:42 p. m.",
  );
  assert.equal(alertText("fall", iso, { lang: "zh", time_zone: "UTC", who: "" }).title, "可能跌倒，15:42");
  assert.match(alertText("fall", iso, { lang: "en", time_zone: "UTC", who: "" }).body, /call or visit/);
  assert.equal(alertText("stopped", iso, { lang: "en", time_zone: "UTC", who: "Dad" }).title, "Camera stopped at Dad's, 3:42 pm");
  assert.equal(
    alertText("inactive", iso, { lang: "en", time_zone: "UTC", who: "Mum" }).title,
    "No movement at Mum's for a while, 3:42 pm",
  );
  assert.equal(alertText("inactive", iso, { lang: "zh", time_zone: "UTC", who: "" }).title, "已有一段时间没有动静，15:42");
  assert.equal(alertText("test", iso, { lang: "fr", time_zone: "UTC", who: "" }).title, "CareNest test alert");
});

test("only sensible requests are accepted", () => {
  assert.deepEqual(checkRequest({ eventId: 7 }), { eventId: 7, skipEndpoint: null });
  assert.deepEqual(checkRequest({ eventId: 7, skipEndpoint: "https://push.test/x" }), { eventId: 7, skipEndpoint: "https://push.test/x" });
  assert.deepEqual(checkRequest({ circleId: CIRCLE, kind: "stopped" }), { circleId: CIRCLE, kind: "stopped", skipEndpoint: null });
  assert.deepEqual(checkRequest({ test: true, circleId: CIRCLE, endpoint: "https://push.test/x" }), {
    test: true,
    circleId: CIRCLE,
    endpoint: "https://push.test/x",
  });
  for (const bad of [null, "7", {}, { eventId: "7" }, { eventId: -1 }, { eventId: 1.5 }, { circleId: "nope", kind: "fall" }, { circleId: CIRCLE, kind: "moving" }, { test: true, circleId: CIRCLE }])
    assert.ok("error" in checkRequest(bad), JSON.stringify(bad));
});

test("a fall goes to every device in the circle except the camera phone, each in its own words", async () => {
  const { store } = fakeStore({ events: [fall] });
  const { calls, send } = fakeSend();
  const answer = await notify({ eventId: 7, skipEndpoint: "https://push.test/ann-phone" }, "ann", store, send, NOW);
  assert.deepEqual(answer, { status: 200, body: { sent: 2 } });
  assert.deepEqual(calls.map((c) => c.endpoint).sort(), ["https://push.test/bo-laptop", "https://push.test/bo-phone"]);
  const laptop = calls.find((c) => c.endpoint.endsWith("bo-laptop"));
  assert.equal(laptop.payload.title, "Posible caída en casa de Mamá, 5:42 p. m.");
  assert.equal(laptop.payload.url, "/dashboard");
  assert.equal(laptop.urgent, true);
  assert.equal(calls.find((c) => c.endpoint.endsWith("bo-phone")).payload.title, "妈妈家可能有人跌倒，23:42");
});

test("the same fall is only ever sent once", async () => {
  const { store } = fakeStore({ events: [fall] });
  const { calls, send } = fakeSend();
  await notify({ eventId: 7, skipEndpoint: null }, "ann", store, send, NOW);
  const again = await notify({ eventId: 7, skipEndpoint: null }, "bo", store, send, NOW);
  assert.deepEqual(again.body, { sent: 0, reason: "already sent" });
  assert.equal(calls.length, 3);
});

test("camera stopped only goes to devices that asked for it", async () => {
  const stopped = { id: 8, circle_id: CIRCLE, kind: "stopped", created_at: ago(5_000) };
  const { store } = fakeStore({ events: [stopped] });
  const { calls, send } = fakeSend();
  const answer = await notify({ circleId: CIRCLE, kind: "stopped", skipEndpoint: null }, "ann", store, send, NOW);
  assert.equal(answer.body.sent, 1);
  assert.equal(calls[0].endpoint, "https://push.test/bo-laptop");
  assert.equal(calls[0].urgent, false);
});

test("no movement goes, gently, to devices that asked for it", async () => {
  const inactive = { id: 12, circle_id: CIRCLE, kind: "inactive", created_at: ago(5_000) };
  const { store } = fakeStore({ events: [inactive] });
  const { calls, send } = fakeSend();
  const answer = await notify({ eventId: 12, skipEndpoint: null }, "ann", store, send, NOW);
  assert.equal(answer.body.sent, 1);
  assert.equal(calls[0].endpoint, "https://push.test/bo-laptop");
  assert.equal(calls[0].payload.title, "No hay movimiento en casa de Mamá desde hace un rato, 5:42 p. m.");
  assert.equal(calls[0].urgent, false);
});

test("ordinary news, old news and other people's circles send nothing", async () => {
  const moving = { id: 9, circle_id: CIRCLE, kind: "moving", created_at: ago(1000) };
  const old = { id: 10, circle_id: CIRCLE, kind: "fall", created_at: ago(FRESH_MS + 1000) };
  const elsewhere = { id: 11, circle_id: OTHER_CIRCLE, kind: "fall", created_at: ago(1000) };
  const { store } = fakeStore({ events: [moving, old, elsewhere] });
  const { calls, send } = fakeSend();
  assert.equal((await notify({ eventId: 9, skipEndpoint: null }, "ann", store, send, NOW)).body.reason, "not an alert");
  assert.equal((await notify({ eventId: 10, skipEndpoint: null }, "ann", store, send, NOW)).body.reason, "too old");
  assert.equal((await notify({ eventId: 11, skipEndpoint: null }, "ann", store, send, NOW)).status, 404);
  assert.equal((await notify({ eventId: 404, skipEndpoint: null }, "ann", store, send, NOW)).status, 404);
  assert.equal((await notify({ eventId: 7, skipEndpoint: null }, "stranger", fakeStore({ events: [fall] }).store, send, NOW)).status, 404);
  assert.equal((await notify({ circleId: OTHER_CIRCLE, kind: "stopped", skipEndpoint: null }, "ann", store, send, NOW)).status, 403);
  assert.equal(calls.length, 0);
});

test("devices that turned alerts off are forgotten", async () => {
  const { store, removed } = fakeStore({ events: [fall] });
  const savedError = console.error;
  console.error = () => {};
  try {
    const { send } = fakeSend((to) => (to.endpoint.endsWith("bo-phone") ? 410 : to.endpoint.endsWith("ann-phone") ? 500 : null));
    const answer = await notify({ eventId: 7, skipEndpoint: null }, "ann", store, send, NOW);
    assert.equal(answer.body.sent, 1);
    assert.deepEqual(removed, [3]);
  } finally {
    console.error = savedError;
  }
});

test("a test alert only goes to your own device", async () => {
  const { store } = fakeStore();
  const { calls, send } = fakeSend();
  const ok = await notify({ test: true, circleId: CIRCLE, endpoint: "https://push.test/bo-phone" }, "bo", store, send, NOW);
  assert.deepEqual(ok, { status: 200, body: { sent: 1 } });
  assert.equal(calls[0].payload.title, "CareNest 测试提醒");
  const notMine = await notify({ test: true, circleId: CIRCLE, endpoint: "https://push.test/bo-phone" }, "ann", store, send, NOW);
  assert.equal(notMine.status, 404);
  const notMyCircle = await notify({ test: true, circleId: OTHER_CIRCLE, endpoint: "https://push.test/bo-phone" }, "bo", store, send, NOW);
  assert.equal(notMyCircle.status, 403);
  assert.equal(calls.length, 1);
});

test("without the keys the server says it isn't set up, and never sends", async () => {
  const { calls, send } = fakeSend();
  const savedSend = services.send;
  services.send = send;
  try {
    const res = await POST(
      new Request("http://localhost/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
        body: JSON.stringify({ eventId: 7 }),
      }),
    );
    assert.equal(res.status, 503);
    assert.ok((await res.json()).error);
    assert.equal(calls.length, 0);
  } finally {
    services.send = savedSend;
  }
});
