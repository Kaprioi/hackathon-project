// Tests for the "Read aloud" voice on the server (api/tts.ts), with ElevenLabs
// pretended (no real requests, no real key). The file name starts with "_" so
// Vercel doesn't turn it into a web address.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMIT, MAX_CHARS, MODEL_ID, POST, checkRequest, voiceFor } from "./tts.ts";

const ENV = {
  ELEVENLABS_API_KEY: "test-key",
  ELEVENLABS_VOICE_EN: "voice-en",
  ELEVENLABS_VOICE_ES: "voice-es",
  ELEVENLABS_VOICE_ZH: "voice-zh",
  VITE_SUPABASE_URL: "https://project.supabase.test",
  VITE_SUPABASE_ANON_KEY: "anon-key",
};

// Pretend login tokens, each for a different person, so the cap in one test doesn't affect another.
let people = 0;
const goodTokens = new Map();
function newLogin() {
  people += 1;
  const token = `token-${people}`;
  goodTokens.set(token, `user-${people}`);
  return token;
}

const ask = (body, token = newLogin()) =>
  POST(
    new Request("http://localhost/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

/** Pretend Supabase: answers who a login token belongs to, like the real /auth/v1/user. */
function fakeSupabase(url, init) {
  const auth = new Headers(init?.headers).get("Authorization") ?? "";
  const user = goodTokens.get(auth.replace(/^Bearer /, ""));
  if (!user) return Response.json({ code: 403, msg: "invalid JWT" }, { status: 403 });
  return Response.json({ id: user, aud: "authenticated", role: "authenticated" });
}

/** Runs `fn` with our pretend settings, Supabase and ElevenLabs. Gives back what was sent to ElevenLabs. */
async function withFakeElevenLabs(fn, answer = () => new Response("MP3", { headers: { "Content-Type": "audio/mpeg" } })) {
  const calls = [];
  const savedFetch = globalThis.fetch;
  const savedEnv = { ...process.env };
  Object.assign(process.env, ENV);
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(`${ENV.VITE_SUPABASE_URL}/auth/v1/user`)) return fakeSupabase(url, init);
    calls.push({ url: String(url), init });
    return answer();
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of Object.keys(ENV)) delete process.env[name];
    Object.assign(process.env, savedEnv);
  }
}

test("each language uses its own ElevenLabs voice", () => {
  assert.equal(voiceFor("en", ENV), "voice-en");
  assert.equal(voiceFor("es", ENV), "voice-es");
  assert.equal(voiceFor("zh", ENV), "voice-zh");
  assert.equal(voiceFor("es", { ELEVENLABS_VOICE_ES: "  " }), null);
  assert.equal(voiceFor("zh", {}), null);
});

test("only real text in a language we support is accepted", () => {
  assert.deepEqual(checkRequest({ text: "  Mum is fine.  ", lang: "en" }), { text: "Mum is fine.", lang: "en" });
  assert.deepEqual(checkRequest({ text: "妈妈很好。", lang: "zh" }), { text: "妈妈很好。", lang: "zh" });
  assert.ok("error" in checkRequest({ text: "", lang: "en" }));
  assert.ok("error" in checkRequest({ text: "   ", lang: "en" }));
  assert.ok("error" in checkRequest({ text: 42, lang: "en" }));
  assert.ok("error" in checkRequest({ text: "Hola", lang: "fr" }));
  assert.ok("error" in checkRequest({ text: "Hola" }));
  assert.ok("error" in checkRequest(null));
  assert.ok("error" in checkRequest({ text: "a".repeat(MAX_CHARS + 1), lang: "en" }));
  assert.ok(!("error" in checkRequest({ text: "a".repeat(MAX_CHARS), lang: "en" })));
});

test("a good request asks ElevenLabs for the right voice and sends the sound back", async () => {
  for (const [lang, voice] of [
    ["en", "voice-en"],
    ["es", "voice-es"],
    ["zh", "voice-zh"],
  ]) {
    await withFakeElevenLabs(async (calls) => {
      const res = await ask({ text: "Hello there.", lang });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("Content-Type"), "audio/mpeg");
      assert.equal(await res.text(), "MP3");
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, new RegExp(`^https://api\\.elevenlabs\\.io/v1/text-to-speech/${voice}\\?`));
      assert.equal(calls[0].init.headers["xi-api-key"], "test-key");
      assert.deepEqual(JSON.parse(calls[0].init.body), { text: "Hello there.", model_id: MODEL_ID });
    });
  }
});

test("bad requests get a clear error and never reach ElevenLabs", async () => {
  await withFakeElevenLabs(async (calls) => {
    for (const body of ["not json", { text: "", lang: "en" }, { text: "Hi", lang: "de" }, { text: "a".repeat(5000), lang: "en" }]) {
      const res = await ask(body);
      assert.equal(res.status, 400);
      assert.ok((await res.json()).error);
    }
    assert.equal(calls.length, 0);
  });
});

test("the key never goes back to the browser, even when ElevenLabs fails", async () => {
  const savedError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(" "));
  try {
    await withFakeElevenLabs(
      async () => {
        const res = await ask({ text: "Hello.", lang: "en" });
        assert.equal(res.status, 502);
        const text = await res.text();
        assert.ok(!text.includes("test-key"));
        assert.ok(JSON.parse(text).error);
      },
      () => new Response("quota exceeded", { status: 401 }),
    );
  } finally {
    console.error = savedError;
  }
  assert.ok(logged.every((line) => !line.includes("test-key") && !line.includes("Hello.")));
});

test("a missing voice or key says the server isn't set up", async () => {
  await withFakeElevenLabs(async (calls) => {
    delete process.env.ELEVENLABS_API_KEY;
    const res = await ask({ text: "Hello.", lang: "en" });
    assert.equal(res.status, 503);
    assert.equal(calls.length, 0);
  });
});

test("without a login token the voice is refused", async () => {
  await withFakeElevenLabs(async (calls) => {
    const res = await ask({ text: "Hello.", lang: "en" }, null);
    assert.equal(res.status, 401);
    assert.ok((await res.json()).error);
    assert.equal(calls.length, 0);
  });
});

test("a made-up login token is refused, and never shown back", async () => {
  await withFakeElevenLabs(async (calls) => {
    const res = await ask({ text: "Hello.", lang: "en" }, "not-a-real-token");
    assert.equal(res.status, 401);
    const text = await res.text();
    assert.ok(!text.includes("not-a-real-token"));
    assert.ok(!text.includes("test-key"));
    assert.equal(calls.length, 0);
  });
});

test("each person gets at most 30 readings every 10 minutes", async () => {
  await withFakeElevenLabs(async (calls) => {
    const token = newLogin();
    for (let i = 0; i < LIMIT; i++) {
      assert.equal((await ask({ text: "Hello.", lang: "en" }, token)).status, 200);
    }
    const res = await ask({ text: "Hello.", lang: "en" }, token);
    assert.equal(res.status, 429);
    assert.ok((await res.json()).error);
    assert.equal(calls.length, LIMIT);
    assert.equal((await ask({ text: "Hello.", lang: "en" })).status, 200);
  });
});
