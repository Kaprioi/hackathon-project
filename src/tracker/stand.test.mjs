// Tests for how often stand.ts sends aims to the stand, with a fake Bluetooth stand and a
// fake clock. The SightLine firmware used to steer by radar on its own whenever aims
// stopped for 700 ms, so gaps matter.
//
// Run with:  npm run test:tracker

import assert from "node:assert/strict";
import { test } from "node:test";

// ---------- a fake clock, timers and Bluetooth stand ----------

let now = 0;
let timers = [];
let nextId = 1;
const schedule = (fn, ms, every) => {
  const id = nextId++;
  timers.push({ id, at: now + ms, fn, every });
  return id;
};
const cancel = (id) => {
  timers = timers.filter((x) => x.id !== id);
};
globalThis.window = {
  setTimeout: (fn, ms) => schedule(fn, ms, 0),
  clearTimeout: cancel,
  setInterval: (fn, ms) => schedule(fn, ms, ms),
  clearInterval: cancel,
};
Object.defineProperty(globalThis, "performance", { value: { now: () => now }, configurable: true });

const sent = []; // every aim the stand received: { t, text }
let radarText = "1,40,0,90.0,90.0,1"; // what the stand's radar report says when the page connects
const characteristic = (uuid) => ({
  uuid,
  addEventListener() {},
  startNotifications: async () => {},
  readValue: async () => new DataView(new TextEncoder().encode(radarText).buffer),
  writeValue: async (data) => {
    if (uuid.startsWith("6e400002")) sent.push({ t: now, text: new TextDecoder().decode(data) });
  },
  writeValueWithoutResponse: async (data) => {
    if (uuid.startsWith("6e400002")) sent.push({ t: now, text: new TextDecoder().decode(data) });
  },
});
const server = {
  connected: true,
  connect: async () => server,
  disconnect() {},
  getPrimaryService: async () => ({ getCharacteristic: async (uuid) => characteristic(uuid) }),
};
const device = { name: "PhoneTracker", gatt: server, addEventListener() {} };
Object.defineProperty(globalThis, "navigator", {
  value: { bluetooth: { requestDevice: async () => device } },
  configurable: true,
});

const { Stand } = await import("./stand.ts");

/** Moves the fake clock on by `ms`, firing timers, and lets the writes finish. */
async function advance(ms, eachFrame) {
  const end = now + ms;
  let nextFrame = now;
  while (now < end) {
    const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
    const frameAt = eachFrame ? nextFrame : Infinity;
    const at = Math.min(due ? due.at : Infinity, frameAt, end);
    now = at;
    if (eachFrame && at === frameAt) {
      eachFrame();
      nextFrame += 66; // a camera frame every 66 ms
    } else if (due && at === due.at) {
      if (due.every) due.at += due.every;
      else cancel(due.id);
      due.fn();
    }
    for (let i = 0; i < 5; i++) await Promise.resolve(); // let the writes finish
  }
}

const longestGap = (from, to) => {
  const times = [from, ...sent.filter((s) => s.t >= from && s.t <= to).map((s) => s.t), to];
  let gap = 0;
  for (let i = 1; i < times.length; i++) gap = Math.max(gap, times[i] - times[i - 1]);
  return gap;
};

// ---------- the tests ----------

test("holding one aim (the radar search listening at a stop): the stand still hears from the page every 250 ms", async () => {
  const stand = new Stand();
  await stand.connect();
  assert.equal(stand.status, "connected");
  assert.deepEqual(stand.energy, { left: 40, right: 0, radars: 1 }, "keeps the radar loudness and count");
  const from = now;
  // Every camera frame, the page asks for the same aim (the head stays put while it listens).
  await advance(3000, () => stand.move(60, 90));
  assert.ok(sent.length > 5, "aims were sent");
  const gap = longestGap(from, now);
  assert.ok(gap <= 350, `longest silence ${gap} ms: well under the firmware's 700 ms`);

  // Even if the page's frame loop stalls (a slow frame), the heartbeat keeps repeating it.
  const stall = now;
  await advance(2000);
  assert.ok(longestGap(stall, now) <= 450, `longest silence while the page stalled: ${longestGap(stall, now)} ms`);

  // Letting go (TAP A PERSON, LOST) really goes quiet: the old firmware then steered by
  // radar on its own after 700 ms. The firmware now holds still while the page is connected.
  stand.releaseControl();
  const quiet = now;
  await advance(2000);
  assert.equal(sent.filter((s) => s.t > quiet).length, 0, "no aims after letting go");
  stand.disconnect();
});

test("a stand whose radar isn't working says so: the radar reads as unknown, not as nobody", async () => {
  // Radar unplugged or switched off: the firmware reports 0 radars (and still says where it points).
  radarText = "0,0,0,82.5,103.0,0";
  const off = new Stand();
  await off.connect();
  assert.equal(off.radar, null, "unknown, like a stand without a radar");
  assert.equal(off.energy, null, "no loudness to steer by");
  assert.deepEqual(off.reported, { pan: 82.5, tilt: 103 }, "still knows where the head points");
  off.disconnect();

  // A working radar that hears nobody still means nobody.
  radarText = "0,0,0,90.0,90.0,1";
  const quiet = new Stand();
  await quiet.connect();
  assert.equal(quiet.radar, false);
  assert.deepEqual(quiet.energy, { left: 0, right: 0, radars: 1 });
  quiet.disconnect();
  radarText = "1,40,0,90.0,90.0,1";
});
