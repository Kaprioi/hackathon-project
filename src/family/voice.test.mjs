// Tests for the shared voice player (voice.ts) used by "Read aloud" and spoken
// alerts, with a pretend /api/tts and a pretend audio player (no real network,
// no real sound).
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";

// A pretend browser audio player. `blocked` makes play() fail, like a browser that won't allow sound.
const players = [];
class FakeAudio {
  src = "";
  onended = null;
  onerror = null;
  played = [];
  paused = true;
  blocked = false;
  constructor() {
    players.push(this);
  }
  play() {
    this.played.push(this.src);
    if (this.blocked && this.src.startsWith("blob:")) return Promise.reject(new Error("NotAllowedError"));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}
globalThis.Audio = FakeAudio;

const { speak, stopVoice, unlockVoice } = await import("./voice.ts");

const token = async () => "user-token";
const noToken = async () => null;
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Runs `fn` with a pretend /api/tts. `answer` decides what it replies. Gives back what was sent. */
async function withFakeServer(fn, answer = () => new Response(new Blob(["MP3"], { type: "audio/mpeg" }))) {
  const calls = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return answer(init);
  };
  try {
    await fn(calls);
  } finally {
    stopVoice();
    globalThis.fetch = savedFetch;
  }
}

/** Waits until the player has been given the real sound, then pretends it finished playing. */
async function finishPlaying(player) {
  for (let i = 0; i < 50 && !player.src.startsWith("blob:"); i++) await tick();
  assert.ok(player.src.startsWith("blob:"), "the ElevenLabs sound was never played");
  player.onended();
}

test("the words go to our ElevenLabs voice with the login token, and the sound is played", async () => {
  await withFakeServer(async (calls) => {
    let started = false;
    const reading = speak("Mum is fine — sitting in the kitchen.", "es", token, () => (started = true));
    const player = players[0];
    // The silent sound plays straight away, inside the tap, so iPhones allow the voice later.
    assert.match(player.played[0], /^data:audio\/wav/);
    await finishPlaying(player);
    assert.equal(await reading, "ended");
    assert.ok(started);
    assert.equal(players.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/tts");
    assert.equal(calls[0].init.headers.Authorization, "Bearer user-token");
    assert.deepEqual(JSON.parse(calls[0].init.body), { text: "Mum is fine, sitting in the kitchen.", lang: "es" });
    assert.ok(player.paused);
  });
});

test("without a login nothing is sent and it says it failed", async () => {
  await withFakeServer(async (calls) => {
    assert.equal(await speak("Hello.", "en", noToken), "failed");
    assert.equal(calls.length, 0);
  });
});

test("a server problem (like too many readings) says it failed", async () => {
  for (const status of [401, 429, 502, 503]) {
    await withFakeServer(async () => {
      assert.equal(await speak("Hello.", "en", token), "failed");
    }, () => Response.json({ error: "no" }, { status }));
  }
});

test("a browser that blocks the sound says it failed", async () => {
  await withFakeServer(async () => {
    players[0].blocked = true;
    try {
      assert.equal(await speak("Hello.", "en", token), "failed");
    } finally {
      players[0].blocked = false;
    }
  });
});

test("only one thing is said at a time: a new reading stops the one before", async () => {
  await withFakeServer(async (calls) => {
    const first = speak("A possible fall.", "en", token);
    const second = speak("Mum is fine.", "en", token);
    assert.equal(await first, "stopped");
    await finishPlaying(players[0]);
    assert.equal(await second, "ended");
    assert.equal(players.length, 1);
    assert.ok(calls.at(-1).init.body.includes("Mum is fine."));
  });
});

test("stopping while the voice is on its way cancels it", async () => {
  let release;
  await withFakeServer(
    async (calls) => {
      const reading = speak("Hello.", "en", token);
      await tick();
      stopVoice();
      assert.equal(await reading, "stopped");
      assert.ok(calls[0].init.signal.aborted);
      release();
      await tick();
      assert.ok(!players[0].src.startsWith("blob:"));
    },
    () => new Promise((resolve) => (release = () => resolve(new Response("MP3")))),
  );
});

test("unlocking plays the silent sound, but never interrupts something being said", async () => {
  await withFakeServer(async () => {
    const player = players[0];
    player.src = "";
    unlockVoice();
    assert.match(player.src, /^data:audio\/wav/);

    const reading = speak("Hello.", "en", token);
    for (let i = 0; i < 50 && !player.src.startsWith("blob:"); i++) await tick();
    const playing = player.src;
    unlockVoice();
    assert.equal(player.src, playing);
    player.onended();
    assert.equal(await reading, "ended");
  });
});

test("nothing to say means nothing is sent", async () => {
  await withFakeServer(async (calls) => {
    assert.equal(await speak("  🙂  ", "en", token), "ended");
    assert.equal(calls.length, 0);
  });
});

