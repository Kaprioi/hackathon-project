// Tests for the emergency call, page side (call.ts). No network: fetch is replaced.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";
import { callSetup, requestCall } from "./call.ts";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test("a call request posts the kind of alert once, and Twilio taking it means sent", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return json({ result: "sent" });
  });
  assert.deepEqual(await requestCall("fall"), { result: "sent" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/emergency-call");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { kind: "fall" });
});

test("no calling on the server (not set up, or no server piece at all) means a pretend call", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json({ result: "off", problem: null }));
  assert.deepEqual(await requestCall("fall"), { result: "off" });
  t.mock.method(globalThis, "fetch", async () => new Response("Not found", { status: 404 }));
  assert.deepEqual(await requestCall("fall"), { result: "off" });
});

test("Twilio refusing comes back in Twilio's words", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json({ result: "failed", error: "Trial accounts cannot call unverified numbers." }));
  assert.deepEqual(await requestCall("fall"), { result: "failed", error: "Trial accounts cannot call unverified numbers." });
});

test("a page from something in between (Cloudflare's 502), no internet, or no answer in time: failed", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Bad gateway</html>", { status: 502 }));
  assert.deepEqual(await requestCall("fall"), { result: "failed", error: "The server said no (status 502)." });

  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal((await requestCall("fall")).result, "failed");

  t.mock.method(globalThis, "fetch", (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))));
  assert.equal((await requestCall("fall", null, 50)).result, "failed");
});

test("checking the setup: ready, not there at all, or unreachable", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json({ ready: true, to: "4567", problem: null }));
  assert.deepEqual(await callSetup(), { ready: true, to: "4567", problem: null, last: null, needsSignIn: false });
  t.mock.method(globalThis, "fetch", async () => new Response("Not found", { status: 404 }));
  assert.deepEqual(await callSetup(), { ready: false, to: null, problem: null, last: null, needsSignIn: false });
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(await callSetup(), null);
});

test("the login token goes along when signed in (the server only lets signed-in accounts call)", async (t) => {
  const seen = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    seen.push(init.headers ?? {});
    return json({ result: "sent", ready: true });
  });
  await requestCall("fall", "tok123");
  await callSetup("tok123");
  await requestCall("fall"); // signed out (or no accounts on this server): no token
  assert.equal(seen[0].Authorization, "Bearer tok123");
  assert.equal(seen[0]["Content-Type"], "application/json");
  assert.equal(seen[1].Authorization, "Bearer tok123");
  assert.equal(seen[2].Authorization, undefined);
});

test("a server that wants a sign-in says so", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json({ ready: true, to: null, problem: null, last: null, needsSignIn: true }));
  assert.equal((await callSetup()).needsSignIn, true);
});
