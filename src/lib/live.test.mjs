// Tests for live video (live.ts): the phone (LiveHost) and the family page (LiveViewer)
// talking through a pretend message channel with pretend browser connections. The real
// video path is checked in Chrome; this checks who says what, and when.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { LiveHost, LiveViewer, parseMessage } from "./live.ts";

const settle = async () => {
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
};

/** A pretend Supabase channel: everything sent reaches everyone else on it (not the sender). */
function hub() {
  const ends = [];
  return {
    end() {
      const me = { listeners: [], closed: false, sent: [] };
      ends.push(me);
      return {
        me,
        send(m) {
          me.sent.push(m);
          // through JSON, like the real network, so nothing is shared by accident
          const copy = JSON.parse(JSON.stringify(m));
          setImmediate(() => {
            for (const e of ends) if (e !== me && !e.closed) for (const l of e.listeners) l(parseMessage(copy));
          });
        },
        onMessage(l) {
          me.listeners.push(l);
        },
        close() {
          me.closed = true;
        },
      };
    },
  };
}

let nextTrack = 0;
const track = (kind) => ({ kind, id: `${kind}-${++nextTrack}`, enabled: true, stopped: false, stop() { this.stopped = true; } });

/** A pretend RTCPeerConnection with just what live.ts uses. */
class FakePeer {
  static all = [];
  constructor(config) {
    this.config = config;
    this.transceivers = [];
    this.localDescription = null;
    this.remoteDescription = null;
    this.added = [];
    this.connectionState = "new";
    this.closed = false;
    this.onicecandidate = null;
    this.ontrack = null;
    this.onconnectionstatechange = null;
    FakePeer.all.push(this);
  }
  transceiver(kind, sendTrack, direction) {
    const t = {
      direction,
      receiver: { track: track(kind) },
      sender: { track: sendTrack, replaceTrack: async (x) => void (t.sender.track = x) },
    };
    this.transceivers.push(t);
    return t;
  }
  addTransceiver(trackOrKind, { direction }) {
    const kind = typeof trackOrKind === "string" ? trackOrKind : trackOrKind.kind;
    return this.transceiver(kind, typeof trackOrKind === "string" ? null : trackOrKind, direction);
  }
  getTransceivers() {
    return this.transceivers;
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0 offer" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "v=0 answer" };
  }
  async setLocalDescription(d) {
    this.localDescription = d;
    setImmediate(() => this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `candidate:${d.type}`, sdpMid: "0", sdpMLineIndex: 0 }) } }));
  }
  async setRemoteDescription(d) {
    this.remoteDescription = d;
    if (d.type === "offer") {
      // The browser makes matching receivers for what the phone sends.
      this.transceiver("video", null, "recvonly");
      this.transceiver("audio", null, "recvonly");
      for (const t of this.transceivers) setImmediate(() => this.ontrack?.({ track: t.receiver.track }));
    } else {
      const audio = this.transceivers.find((t) => t.receiver.track.kind === "audio");
      setImmediate(() => this.ontrack?.({ track: audio.receiver.track }));
    }
  }
  async addIceCandidate(c) {
    if (!this.remoteDescription) throw new Error("InvalidStateError: no remote description");
    this.added.push(c);
  }
  connect() {
    this.connectionState = "connected";
    this.onconnectionstatechange?.();
  }
  close() {
    this.closed = true;
    this.connectionState = "closed";
  }
}

const fakeStream = () => ({ tracks: [], addTrack(t) { this.tracks.push(t); } });
const ice = async () => [{ urls: "stun:example" }];

function phone(h, opts = {}) {
  const voices = [];
  const watchers = [];
  const host = new LiveHost({
    signal: h.end(),
    iceServers: ice,
    createPeer: (c) => new FakePeer(c),
    playVoice: (t) => {
      voices.push(t);
      return () => {};
    },
    onWatchers: (w) => watchers.push(w),
    ...opts,
  });
  const video = track("video");
  const mic = track("audio");
  host.setTracks(video, mic);
  return { host, video, mic, voices, watchers, last: () => watchers[watchers.length - 1] ?? [] };
}

const viewers = [];
// Viewers left connecting keep a timer running; close them after each test.
afterEach(() => viewers.splice(0).forEach((v) => v.stop()));

function family(h, name = "Sam", opts = {}) {
  const states = [];
  let stream = null;
  const mic = track("audio");
  const viewer = new LiveViewer({
    signal: h.end(),
    iceServers: ice,
    viewer: `user-${name}`,
    name,
    createPeer: (c) => new FakePeer(c),
    makeStream: fakeStream,
    getMic: async () => mic,
    onState: (s) => states.push(s),
    onStream: (s) => (stream = s),
    timeoutMs: 5000,
    ...opts,
  });
  viewers.push(viewer);
  return { viewer, states, mic, stream: () => stream };
}


test("messages from the network: ours are kept, anything else is dropped", () => {
  assert.deepEqual(parseMessage({ type: "watch", session: "s1", viewer: "u1", name: "Sam" }), {
    type: "watch",
    session: "s1",
    viewer: "u1",
    name: "Sam",
  });
  assert.equal(parseMessage(null), null);
  assert.equal(parseMessage({ type: "watch", viewer: "u1", name: "Sam" }), null); // no session
  assert.equal(parseMessage({ type: "hack", session: "s1" }), null);
  assert.equal(parseMessage({ type: "offer", session: "s1", host: "h1", sdp: "x".repeat(30_000) }), null); // too big
  assert.equal(parseMessage({ type: "ice", session: "s1", host: "h1", from: "host", candidate: { candidate: 5 } }), null);
  assert.equal(parseMessage({ type: "bye", session: "s1", from: "someone" }), null);
  assert.deepEqual(parseMessage({ type: "bye", session: "s1", from: "viewer" }), { type: "bye", session: "s1", from: "viewer" });
});

test("Watch live: the phone sends its camera and microphone, and the family page goes live", async () => {
  const h = hub();
  const p = phone(h);
  const f = family(h, "Sam");
  f.viewer.start();
  await settle();
  // The phone made one connection, sending the camera and the room's sound, and receiving the family's voice.
  const hostPeer = FakePeer.all.find((x) => x.transceivers.some((t) => t.sender.track === p.video));
  assert.ok(hostPeer, "the phone offered its camera");
  assert.deepEqual(hostPeer.config, { iceServers: [{ urls: "stun:example" }] });
  const hostAudio = hostPeer.transceivers.find((t) => t.receiver.track.kind === "audio");
  assert.equal(hostAudio.sender.track, p.mic);
  assert.equal(hostAudio.direction, "sendrecv");
  assert.equal(hostPeer.remoteDescription?.type, "answer");
  // Network addresses went both ways, and none were tried too early (that would have dropped the session).
  assert.equal(hostPeer.added.length, 1);
  const viewerPeer = FakePeer.all.find((x) => x !== hostPeer && x.remoteDescription?.type === "offer");
  assert.equal(viewerPeer.added.length, 1);
  // The family page answered ready to talk back later, without starting over.
  assert.equal(viewerPeer.transceivers.find((t) => t.receiver.track.kind === "audio").direction, "sendrecv");
  assert.deepEqual(
    f.stream().tracks.map((t) => t.kind).sort(),
    ["audio", "video"],
  );
  assert.equal(p.voices.length, 1, "the phone is ready to play the family's voice");
  hostPeer.connect();
  viewerPeer.connect();
  assert.equal(f.viewer.state, "live");
  assert.deepEqual(p.last(), [{ session: f.viewer.session, name: "Sam", connected: true, talking: false }]);
});

test("Talk: the family member's microphone goes on and off, and the phone shows they're talking", async () => {
  const h = hub();
  const p = phone(h);
  const f = family(h, "Jo");
  f.viewer.start();
  await settle();
  FakePeer.all.slice(-2).forEach((x) => x.connect());
  await f.viewer.setTalking(true);
  await settle();
  const viewerPeer = FakePeer.all.filter((x) => x.remoteDescription?.type === "offer" && !x.closed).at(-1);
  assert.equal(viewerPeer.transceivers.find((t) => t.receiver.track.kind === "audio").sender.track, f.mic);
  assert.equal(f.mic.enabled, true);
  assert.equal(p.last()[0].talking, true);
  await f.viewer.setTalking(false);
  await settle();
  assert.equal(f.mic.enabled, false);
  assert.equal(p.last()[0].talking, false);
});

test("flipping the phone's camera: whoever is watching gets the new camera", async () => {
  const h = hub();
  const p = phone(h);
  const f = family(h);
  f.viewer.start();
  await settle();
  const hostPeer = FakePeer.all.find((x) => x.transceivers.some((t) => t.sender.track === p.video));
  const back = track("video");
  p.host.setTracks(back, p.mic);
  await settle();
  assert.equal(hostPeer.transceivers.find((t) => t.receiver.track.kind === "video").sender.track, back);
});

test("live video switched off on the phone: new requests are turned down, and watchers are disconnected", async () => {
  const h = hub();
  const p = phone(h);
  const first = family(h, "Sam");
  first.viewer.start();
  await settle();
  p.host.setEnabled(false);
  await settle();
  assert.equal(first.viewer.state, "ended");
  assert.deepEqual(p.host.watchers, []);
  const second = family(h, "Jo");
  second.viewer.start();
  await settle();
  assert.equal(second.viewer.state, "off");
});

test("too many watching: the next one is told the phone is busy", async () => {
  const h = hub();
  phone(h, { maxViewers: 1 });
  const a = family(h, "Sam");
  a.viewer.start();
  await settle();
  const b = family(h, "Jo");
  b.viewer.start();
  await settle();
  assert.equal(a.viewer.state, "connecting"); // still connecting fine
  assert.equal(b.viewer.state, "busy");
});

test("no phone answers (the camera isn't on): the family page says so instead of spinning", async () => {
  const h = hub();
  const f = family(h, "Sam", { timeoutMs: 50 });
  f.viewer.start();
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(f.viewer.state, "no-phone");
});

test("two phones in one family: the family page watches the first, and the other one lets go", async () => {
  const h = hub();
  const p1 = phone(h);
  const p2 = phone(h);
  const f = family(h);
  f.viewer.start();
  await settle();
  const watched = [p1, p2].filter((p) => p.host.watchers.length === 1);
  assert.equal(watched.length, 1, "exactly one phone keeps the session");
});

test("closing it on the family page frees the phone; the phone stopping ends it on the family page", async () => {
  const h = hub();
  const p = phone(h);
  const f = family(h);
  f.viewer.start();
  await settle();
  const hostPeer = FakePeer.all.find((x) => x.transceivers.some((t) => t.sender.track === p.video));
  f.viewer.stop();
  await settle();
  assert.deepEqual(p.host.watchers, []);
  assert.equal(hostPeer.closed, true);
  assert.equal(f.viewer.state, "ended");

  const g = family(h, "Jo");
  g.viewer.start();
  await settle();
  p.host.stop();
  await settle();
  assert.equal(g.viewer.state, "ended");
  assert.equal(g.mic.stopped, false); // it was never switched on
});
