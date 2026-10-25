// Tests for live video's relay servers (api/ice-servers.ts). Twilio and Supabase are
// replaced by stand-ins, so nothing real is called.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { PUBLIC_STUN, handleIceServers, resetIceCache } from "./ice-servers.ts";

const TWILIO = { TWILIO_ACCOUNT_SID: "AC" + "0123456789abcdef".repeat(2), TWILIO_AUTH_TOKEN: "secret-token" };
const SUPA = { VITE_SUPABASE_URL: "https://proj.supabase.co", VITE_SUPABASE_ANON_KEY: "anon-key" };
const GET = { method: "GET", headers: {} };
const signedIn = { method: "GET", headers: { authorization: "Bearer good" } };

/** A pretend Twilio (and Supabase, which knows the token "good"). */
function fake({ twilioStatus = 201 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/user")) {
      return new Response("{}", { status: init.headers?.Authorization === "Bearer good" ? 200 : 401 });
    }
    return new Response(
      JSON.stringify({
        ice_servers: [
          { url: "stun:global.stun.twilio.com:3478", urls: "stun:global.stun.twilio.com:3478" },
          { urls: "turn:global.turn.twilio.com:3478?transport=udp", username: "u1", credential: "c1" },
          { urls: "https://not-a-relay.example" },
        ],
      }),
      { status: twilioStatus },
    );
  };
  return { calls, fetch, twilio: () => calls.filter((c) => c.url.includes("twilio.com")) };
}

beforeEach((t) => {
  resetIceCache();
  t.mock.method(console, "log", () => {});
});

test("no Twilio settings: only the free public address finder", async () => {
  const f = fake();
  const r = await handleIceServers(GET, {}, { fetch: f.fetch });
  assert.deepEqual(r, { status: 200, body: { iceServers: PUBLIC_STUN, relay: false } });
  assert.equal(f.calls.length, 0);
});

test("with Twilio: a short-lived relay login, and only relay addresses are passed on", async () => {
  const f = fake();
  const r = await handleIceServers(GET, TWILIO, { fetch: f.fetch, now: 0 });
  assert.equal(r.body.relay, true);
  assert.deepEqual(r.body.iceServers, [
    { urls: "stun:global.stun.twilio.com:3478", username: undefined, credential: undefined },
    { urls: "turn:global.turn.twilio.com:3478?transport=udp", username: "u1", credential: "c1" },
  ]);
  const [call] = f.twilio();
  assert.equal(call.url, `https://api.twilio.com/2010-04-01/Accounts/${TWILIO.TWILIO_ACCOUNT_SID}/Tokens.json`);
  assert.equal(call.init.headers.Authorization, `Basic ${btoa(`${TWILIO.TWILIO_ACCOUNT_SID}:secret-token`)}`);
  assert.equal(new URLSearchParams(call.init.body).get("Ttl"), "3600");
});

test("the relay login is reused for a while, then renewed", async () => {
  const f = fake();
  await handleIceServers(GET, TWILIO, { fetch: f.fetch, now: 0 });
  await handleIceServers(GET, TWILIO, { fetch: f.fetch, now: 49 * 60_000 });
  assert.equal(f.twilio().length, 1);
  await handleIceServers(GET, TWILIO, { fetch: f.fetch, now: 51 * 60_000 });
  assert.equal(f.twilio().length, 2);
});

test("Twilio refusing (or unreachable): still works with the public one", async () => {
  const r = await handleIceServers(GET, TWILIO, { fetch: fake({ twilioStatus: 403 }).fetch });
  assert.deepEqual(r.body, { iceServers: PUBLIC_STUN, relay: false });
  const down = async () => {
    throw new TypeError("fetch failed");
  };
  assert.deepEqual((await handleIceServers(GET, TWILIO, { fetch: down })).body, { iceServers: PUBLIC_STUN, relay: false });
});

test("with accounts on the server: only signed-in people get the relay", async () => {
  const f = fake();
  const out = await handleIceServers(GET, { ...TWILIO, ...SUPA }, { fetch: f.fetch });
  assert.equal(out.status, 401);
  assert.equal(out.body.relay, false);
  assert.equal(f.twilio().length, 0);
  const inside = await handleIceServers(signedIn, { ...TWILIO, ...SUPA }, { fetch: f.fetch });
  assert.equal(inside.body.relay, true);
});

test("only GET", async () => {
  assert.equal((await handleIceServers({ method: "POST" }, TWILIO)).status, 405);
});
