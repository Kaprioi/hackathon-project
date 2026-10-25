// Tests for Gemini's look at the picture on an alert (api/scene-check.ts) and for the call
// reading its sentence out (api/emergency-call.ts). Gemini and Twilio are replaced by
// stand-ins, so nothing is really sent.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  CHECK_GAP_MS,
  DEFAULT_MODEL,
  GEMINI_URL,
  cleanSummary,
  handleSceneCheck,
  resetSceneLimits,
} from "../../api/scene-check.ts";
import { callMessage, cleanNote, handleEmergencyCall, resetCallLimits } from "../../api/emergency-call.ts";

const KEY = "test-gemini-key";
const IMAGE = "/9j/4AAQSkZJRgABAQAAAQABAAD="; // a few bytes of JPEG header, as base64
const post = (body, headers = {}) => ({ method: "POST", headers, body });

/** Gemini's answer the way the interactions API sends it: steps, with the JSON in a model_output's text. */
function geminiAnswer(json) {
  return {
    id: "int_123",
    status: "completed",
    steps: [
      { type: "user_input", content: [{ type: "text", text: "..." }] },
      { type: "model_output", content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }] },
    ],
  };
}

const GOOD = { person_visible: true, on_floor: true, looks_hurt: "unsure", summary: "A person is lying on the kitchen floor next to a chair" };

/** A pretend Gemini (and Supabase, for sign-in checks): remembers each request. */
function fakeServers({ status = 200, answer = geminiAnswer(GOOD), signedIn = true } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init, json: init.body ? JSON.parse(init.body) : null });
    if (String(url).includes("/auth/v1/user")) return new Response("{}", { status: signedIn ? 200 : 401 });
    return new Response(JSON.stringify(answer), { status });
  };
  return { calls, fetch, gemini: () => calls.filter((c) => c.url === GEMINI_URL) };
}

beforeEach((t) => {
  resetSceneLimits();
  resetCallLimits();
  t.mock.method(console, "log", () => {});
});

test("without a Gemini key it's off, and nothing is sent", async () => {
  const s = fakeServers();
  const r = await handleSceneCheck(post({ kind: "fall", image: IMAGE }), {}, { fetch: s.fetch });
  assert.equal(r.body.result, "off");
  assert.equal(s.calls.length, 0);
  const g = await handleSceneCheck({ method: "GET" }, {}, { fetch: s.fetch });
  assert.deepEqual(g.body, { ready: false, needsSignIn: false });
});

test("asks Gemini with the picture, a fixed answer form, and storing turned off", async () => {
  const s = fakeServers();
  const r = await handleSceneCheck(post({ kind: "fall", image: IMAGE }), { GEMINI_API_KEY: KEY }, { fetch: s.fetch });
  assert.equal(r.status, 200);
  assert.equal(r.body.result, "ok");
  assert.equal(r.body.summary, "A person is lying on the kitchen floor next to a chair.");
  assert.equal(r.body.onFloor, true);
  assert.equal(r.body.looksHurt, "unsure");

  const [req] = s.gemini();
  assert.equal(req.init.method, "POST");
  assert.equal(req.init.headers["x-goog-api-key"], KEY);
  assert.equal(req.json.model, DEFAULT_MODEL);
  assert.equal(req.json.store, false);
  assert.equal(req.json.generation_config.thinking_level, "low");
  assert.equal(req.json.response_format.mime_type, "application/json");
  assert.deepEqual(req.json.response_format.schema.required, ["person_visible", "on_floor", "looks_hurt", "summary"]);
  const image = req.json.input.find((p) => p.type === "image");
  assert.deepEqual(image, { type: "image", data: IMAGE, mime_type: "image/jpeg" });
  assert.match(req.json.input[0].text, /may have fallen/);
});

test("GEMINI_MODEL picks another model; a data: prefix on the picture is removed", async () => {
  const s = fakeServers();
  await handleSceneCheck(post({ kind: "seizure", image: `data:image/jpeg;base64,${IMAGE}` }), { GEMINI_API_KEY: KEY, GEMINI_MODEL: "gemini-3.8-flash" }, { fetch: s.fetch });
  const [req] = s.gemini();
  assert.equal(req.json.model, "gemini-3.8-flash");
  assert.equal(req.json.input[1].data, IMAGE);
  assert.match(req.json.input[0].text, /seizure/);
});

test("an answer wrapped in a code fence still reads", async () => {
  const s = fakeServers({ answer: geminiAnswer("```json\n" + JSON.stringify(GOOD) + "\n```") });
  const r = await handleSceneCheck(post({ kind: "test", image: IMAGE }), { GEMINI_API_KEY: KEY }, { fetch: s.fetch });
  assert.equal(r.body.result, "ok");
});

test("Gemini errors and odd answers come back as 'failed' with words, never a crash", async () => {
  const env = { GEMINI_API_KEY: KEY };
  let s = fakeServers({ status: 429, answer: { error: { message: "Quota exceeded" } } });
  let r = await handleSceneCheck(post({ kind: "fall", image: IMAGE }), env, { fetch: s.fetch });
  assert.deepEqual(r.body, { result: "failed", error: "Quota exceeded" });

  resetSceneLimits();
  s = fakeServers({ answer: geminiAnswer("not json") });
  r = await handleSceneCheck(post({ kind: "fall", image: IMAGE }), env, { fetch: s.fetch });
  assert.equal(r.body.result, "failed");

  resetSceneLimits();
  s = fakeServers({ answer: geminiAnswer({ ...GOOD, summary: "" }) });
  r = await handleSceneCheck(post({ kind: "fall", image: IMAGE }), env, { fetch: s.fetch });
  assert.equal(r.body.result, "failed");

  resetSceneLimits();
  const offline = async () => {
    throw new Error("offline");
  };
  r = await handleSceneCheck(post({ kind: "fall", image: IMAGE }), env, { fetch: offline });
  assert.equal(r.body.result, "failed");
  assert.equal(r.status, 200);
});

test("bad requests are refused before anything is sent", async () => {
  const s = fakeServers();
  const env = { GEMINI_API_KEY: KEY };
  assert.equal((await handleSceneCheck(post({ kind: "party", image: IMAGE }), env, { fetch: s.fetch })).status, 400);
  assert.equal((await handleSceneCheck(post({ kind: "fall" }), env, { fetch: s.fetch })).status, 400);
  assert.equal((await handleSceneCheck(post({ kind: "fall", image: "<script>" }), env, { fetch: s.fetch })).status, 400);
  assert.equal((await handleSceneCheck({ method: "PUT" }, env, { fetch: s.fetch })).status, 405);
  assert.equal(s.gemini().length, 0);
});

test("where the server has Supabase, only a signed-in page can use it", async () => {
  const env = { GEMINI_API_KEY: KEY, VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "anon" };
  let s = fakeServers({ signedIn: false });
  let r = await handleSceneCheck(post({ kind: "fall", image: IMAGE }), env, { fetch: s.fetch });
  assert.equal(r.body.result, "failed");
  assert.equal(s.gemini().length, 0);

  s = fakeServers();
  r = await handleSceneCheck(post({ kind: "fall", image: IMAGE }, { authorization: "Bearer token" }), env, { fetch: s.fetch });
  assert.equal(r.body.result, "ok");
  const g = await handleSceneCheck({ method: "GET", headers: {} }, env, { fetch: s.fetch });
  assert.deepEqual(g.body, { ready: true, needsSignIn: true });
});

test("at most one check every few seconds", async () => {
  const s = fakeServers();
  const env = { GEMINI_API_KEY: KEY };
  const at = (now) => handleSceneCheck(post({ kind: "fall", image: IMAGE }), env, { fetch: s.fetch, now });
  assert.equal((await at(1000)).body.result, "ok");
  assert.equal((await at(1000 + CHECK_GAP_MS - 1)).body.result, "failed");
  assert.equal((await at(1000 + CHECK_GAP_MS)).body.result, "ok");
  assert.equal(s.gemini().length, 2);
});

test("summaries are kept to one short, plain line", () => {
  assert.equal(cleanSummary("  A person\n is <b>lying</b>  down "), "A person is b lying /b down.");
  assert.ok(cleanSummary("word ".repeat(80)).length <= 160);
  assert.equal(cleanSummary(""), "");
  assert.equal(cleanNote("Lying by the sofa!"), "Lying by the sofa!");
});

test("the call reads Gemini's sentence out, and stays the same without one", async () => {
  assert.equal(
    callMessage("fall", "Grandma", "A person is lying on the floor"),
    "This is a CareNest alert. Grandma may have fallen and isn't getting up. What the camera sees: A person is lying on the floor. Please check on them right away.",
  );
  assert.equal(
    callMessage("fall", "Grandma"),
    "This is a CareNest alert. Grandma may have fallen and isn't getting up. Please check on them right away.",
  );

  // The page sends the sentence with the call; it rides along in the address Twilio fetches the words from.
  const env = {
    TWILIO_ACCOUNT_SID: "AC" + "0123456789abcdef".repeat(2),
    TWILIO_AUTH_TOKEN: "secret-token",
    TWILIO_FROM: "+15550001111",
    ALERT_CALL_TO: "+15552224567",
    ALERT_PERSON_NAME: "Grandma",
  };
  const forms = [];
  const twilio = async (_url, init) => {
    forms.push(new URLSearchParams(init.body));
    return new Response('{"sid":"CA1"}', { status: 201 });
  };
  const req = {
    method: "POST",
    url: "/",
    headers: { "x-forwarded-host": "demo-link.trycloudflare.com", "x-forwarded-proto": "https" },
    body: { kind: "fall", note: "A person is lying on the floor <next> to a chair" },
  };
  const r = await handleEmergencyCall(req, env, { fetch: twilio });
  assert.equal(r.body.result, "sent");
  const url = new URL(forms[0].get("Url"));
  assert.equal(url.searchParams.get("say"), "fall");
  assert.equal(url.searchParams.get("note"), "A person is lying on the floor next to a chair.");

  const words = await handleEmergencyCall({ method: "POST", url: `${url.pathname}${url.search}` }, env);
  assert.match(words.xml, /What the camera sees: A person is lying on the floor next to a chair\./);
});
