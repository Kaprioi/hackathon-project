// Tests for the emergency call's server side (api/emergency-call.ts). Twilio is replaced by a
// stand-in, so nothing is really called.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { CALL_GAP_MS, callMessage, callScript, handleEmergencyCall, publicBase, resetCallLimits } from "../../api/emergency-call.ts";

const ENV = {
  TWILIO_ACCOUNT_SID: "AC" + "0123456789abcdef".repeat(2),
  TWILIO_AUTH_TOKEN: "secret-token",
  TWILIO_FROM: "+15550001111",
  ALERT_CALL_TO: "+15552224567",
  ALERT_PERSON_NAME: "Grandma",
};
const SITE = "https://demo-link.trycloudflare.com";
/** A request from the page, the way it arrives through the phone test link (Cloudflare). */
const post = (body) => ({
  method: "POST",
  url: "/",
  headers: { host: "127.0.0.1:5176", "x-forwarded-host": "demo-link.trycloudflare.com", "x-forwarded-proto": "https" },
  body,
});

/** A pretend Twilio: remembers each request and answers with `status` (and `json`). */
function fakeTwilio(status = 201, json = { sid: "CA123" }) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, form: new URLSearchParams(init.body) });
    return new Response(JSON.stringify(json), { status });
  };
  return { calls, fetch };
}

beforeEach((t) => {
  resetCallLimits();
  t.mock.method(console, "log", () => {}); // the server notes each call in its log
});

test("not set up: GET says so, and POST answers off so the page shows a pretend call", async () => {
  const twilio = fakeTwilio();
  const get = await handleEmergencyCall({ method: "GET" }, {});
  assert.deepEqual(get.body, { ready: false, to: null, problem: null, last: null });
  const r = await handleEmergencyCall(post({ kind: "fall" }), {}, { fetch: twilio.fetch });
  assert.deepEqual([r.status, r.body.result], [200, "off"]);
  assert.equal(twilio.calls.length, 0);
});

test("half set up: it says what's wrong, in plain words", async () => {
  const r = await handleEmergencyCall({ method: "GET" }, { ...ENV, ALERT_CALL_TO: "555 222 4567" });
  assert.equal(r.body.ready, false);
  assert.match(r.body.problem, /ALERT_CALL_TO/);
});

test("set up: GET shows only the last 4 digits of who it calls", async () => {
  const r = await handleEmergencyCall({ method: "GET" }, ENV);
  assert.deepEqual(r.body, { ready: true, to: "4567", problem: null, last: null });
});

test("a fall makes one Twilio call to the contact, which fetches the words from this site", async () => {
  // Twilio trial accounts refuse words sent inside the call request ("disallowed parameters"),
  // so the request only says where to fetch them.
  const twilio = fakeTwilio();
  const r = await handleEmergencyCall(post({ kind: "fall" }), ENV, { fetch: twilio.fetch });
  assert.deepEqual([r.status, r.body.result], [200, "sent"]);
  assert.equal(twilio.calls.length, 1);
  const { url, init, form } = twilio.calls[0];
  assert.equal(url, `https://api.twilio.com/2010-04-01/Accounts/${ENV.TWILIO_ACCOUNT_SID}/Calls.json`);
  assert.equal(init.headers.Authorization, `Basic ${btoa(`${ENV.TWILIO_ACCOUNT_SID}:${ENV.TWILIO_AUTH_TOKEN}`)}`);
  assert.deepEqual([...form.keys()].sort(), ["From", "To", "Url"]);
  assert.equal(form.get("To"), ENV.ALERT_CALL_TO);
  assert.equal(form.get("From"), ENV.TWILIO_FROM);
  assert.equal(form.get("Url"), `${SITE}/api/emergency-call?say=fall`);
});

test("when Twilio asks for the words (?say=fall), it gets the message twice, as Twilio's XML", async () => {
  // Twilio asks with a POST of its own (a form, not JSON).
  const r = await handleEmergencyCall({ method: "POST", url: "/?say=fall", body: null }, ENV);
  assert.equal(r.status, 200);
  assert.match(r.xml, /^<\?xml/);
  assert.equal(r.xml.match(/<Say>/g).length, 2);
  assert.match(r.xml, /Grandma may have fallen/);
  assert.equal((await handleEmergencyCall({ method: "GET", url: "/?say=prank" }, ENV)).status, 400);
});

test("the message can't break Twilio's instructions, whatever the name", () => {
  const xml = callScript(callMessage("seizure", `Bob <b> & "Al"`));
  assert.match(xml, /Bob &lt;b&gt; &amp; &quot;Al&quot; may be having a seizure/);
  assert.match(callMessage("fall"), /Your family member may have fallen/);
});

test("the site's public address: from the tunnel or hosting, never localhost", () => {
  assert.equal(publicBase(post({}), {}), SITE);
  assert.equal(publicBase({ method: "POST", url: "https://carenest.vercel.app/api/emergency-call" }, {}), "https://carenest.vercel.app");
  assert.equal(publicBase({ method: "POST", headers: { host: "127.0.0.1:5176" } }, {}), null);
  assert.equal(publicBase({ method: "POST", headers: { host: "localhost:5173" } }, {}), null);
  assert.equal(publicBase({ method: "POST", headers: { host: "bad host/../x" } }, {}), null);
  assert.equal(publicBase({ method: "POST", headers: { host: "127.0.0.1:5176" } }, { PUBLIC_URL: "https://my.site/" }), "https://my.site");
});

test("opened on localhost (Twilio can't reach it): a clear error, and no call", async () => {
  const twilio = fakeTwilio();
  const r = await handleEmergencyCall({ method: "POST", headers: { host: "127.0.0.1:5176" }, body: { kind: "fall" } }, ENV, { fetch: twilio.fetch });
  assert.equal(r.body.result, "failed");
  assert.match(r.body.error, /public link/);
  assert.equal(twilio.calls.length, 0);
});

test("only known kinds of alert, and only GET or POST", async () => {
  const twilio = fakeTwilio();
  assert.equal((await handleEmergencyCall(post({ kind: "prank" }), ENV, { fetch: twilio.fetch })).status, 400);
  assert.equal((await handleEmergencyCall(post(null), ENV, { fetch: twilio.fetch })).status, 400);
  assert.equal((await handleEmergencyCall({ method: "DELETE" }, ENV)).status, 405);
  assert.equal(twilio.calls.length, 0);
});

test("at most one call every 30 seconds, so a public page can't run up calls", async () => {
  const twilio = fakeTwilio();
  const t0 = 1_000_000;
  assert.equal((await handleEmergencyCall(post({ kind: "test" }), ENV, { fetch: twilio.fetch, now: t0 })).body.result, "sent");
  const soon = await handleEmergencyCall(post({ kind: "fall" }), ENV, { fetch: twilio.fetch, now: t0 + 5000 });
  assert.equal(soon.body.result, "failed");
  assert.match(soon.body.error, /30 seconds/);
  assert.equal((await handleEmergencyCall(post({ kind: "fall" }), ENV, { fetch: twilio.fetch, now: t0 + CALL_GAP_MS })).body.result, "sent");
  assert.equal(twilio.calls.length, 2);
});

test("every answer to the page is 200 with the outcome inside (Cloudflare replaces 502 answers)", async () => {
  const refusing = fakeTwilio(400, { message: "Invalid or disallowed parameters provided" });
  const r = await handleEmergencyCall(post({ kind: "fall" }), ENV, { fetch: refusing.fetch });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { result: "failed", error: "Invalid or disallowed parameters provided" });
});

test("Twilio refusing (an unverified number on a trial) comes back in words, with the number hidden", async () => {
  const twilio = fakeTwilio(400, { message: "The number +1 555 222 4567 is unverified. Trial accounts cannot call unverified numbers." });
  const r = await handleEmergencyCall(post({ kind: "fall" }), ENV, { fetch: twilio.fetch });
  assert.equal(r.body.result, "failed");
  assert.match(r.body.error, /unverified/);
  assert.doesNotMatch(r.body.error, /4567/);
  // A call that didn't go through doesn't count toward the 30-second gap: Try again works at once.
  const again = await handleEmergencyCall(post({ kind: "fall" }), ENV, { fetch: fakeTwilio().fetch });
  assert.equal(again.body.result, "sent");
});

test("GET tells how the last call went (for Settings), without any numbers", async () => {
  const t0 = 5_000_000;
  await handleEmergencyCall(post({ kind: "test" }), ENV, { fetch: fakeTwilio().fetch, now: t0 });
  let r = await handleEmergencyCall({ method: "GET" }, ENV, { now: t0 + 90_000 });
  assert.deepEqual(r.body.last, { secondsAgo: 90, kind: "test", ok: true, error: undefined });
  const refusing = fakeTwilio(400, { message: "The number +15550003626 is unverified." });
  await handleEmergencyCall(post({ kind: "fall" }), ENV, { fetch: refusing.fetch, now: t0 + 100_000 });
  r = await handleEmergencyCall({ method: "GET" }, ENV, { now: t0 + 100_000 });
  assert.equal(r.body.last.ok, false);
  assert.match(r.body.last.error, /unverified/);
  assert.doesNotMatch(r.body.last.error, /3626/);
});

test("Twilio unreachable: a clear error, not a crash", async () => {
  const fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const r = await handleEmergencyCall(post({ kind: "fall" }), ENV, { fetch });
  assert.equal(r.body.result, "failed");
  assert.match(r.body.error, /Couldn't reach Twilio/);
});
