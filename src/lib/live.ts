// Live video: family watch the phone camera, hear the room, and talk back.
//
// The video and sound go straight between the phone and the family member's browser
// (WebRTC, encrypted); nothing is recorded or stored. Supabase only passes the short
// "let's connect" messages, on a private channel that only members of that family
// (care circle) can join: see supabase/migrations/20261025000000_live_video.sql.
// When the two devices can't reach each other directly (some Wi-Fi blocks it), the
// video goes through a relay from /api/ice-servers, still encrypted.
//
//   family page (LiveViewer)  --"watch"-->            phone (LiveHost)
//                             <--"offer"--  camera + microphone
//                             --"answer"-->
//                             <--"ice"-->   (network addresses, both ways)
//                             === video and sound, both ways for talking ===
//
// Used by the phone camera page (src/tracker/TrackerPage.tsx) and the family page
// (src/components/LiveView.tsx). Tested by src/lib/live.test.mjs.

import type { SupabaseClient } from "@supabase/supabase-js";

/** The messages the phone and the family page send each other. */
export type LiveMessage =
  /** Family page -> phones: "I'd like to watch." */
  | { type: "watch"; session: string; viewer: string; name: string }
  /** Phone -> family page: how to connect (WebRTC offer). */
  | { type: "offer"; session: string; host: string; sdp: string }
  /** Family page -> phone: the reply (WebRTC answer). */
  | { type: "answer"; session: string; host: string; sdp: string }
  /** A network address to try, either way. */
  | { type: "ice"; session: string; host: string; from: "host" | "viewer"; candidate: RTCIceCandidateInit }
  /** Phone -> family page: "not now" (live video switched off on the phone, or too many watching). */
  | { type: "off" | "busy"; session: string; host: string }
  /** Family page -> phone: "I'm speaking now" (or not), for the sign on the phone. */
  | { type: "talk"; session: string; host: string; on: boolean }
  /** Either way: "this one is over". A family page that says bye without a host leaves every phone. */
  | { type: "bye"; session: string; host?: string; from: "host" | "viewer" };

/** How the messages travel: Supabase on the site; something simpler in tests. */
export interface LiveSignal {
  send(message: LiveMessage): void;
  onMessage(listener: (message: LiveMessage) => void): void;
  close(): void;
}

/** The free public address finder, used when the server has no relay to offer. */
export const PUBLIC_STUN: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
/** At most this many family members watch at once (each one is a separate video stream from the phone). */
export const MAX_VIEWERS = 3;
/** The family page gives up if no phone answers within this long. */
export const ANSWER_TIMEOUT_MS = 10_000;

const MAX_SDP = 20_000;
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

/** Checks a message from the network. Anything that isn't one of ours becomes null. */
export function parseMessage(raw: unknown): LiveMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!id(m.session)) return null;
  switch (m.type) {
    case "watch":
      return id(m.viewer) && typeof m.name === "string"
        ? { type: "watch", session: m.session, viewer: m.viewer, name: m.name.slice(0, 60) }
        : null;
    case "offer":
    case "answer":
      return id(m.host) && typeof m.sdp === "string" && m.sdp.length <= MAX_SDP
        ? { type: m.type, session: m.session, host: m.host, sdp: m.sdp }
        : null;
    case "ice": {
      const c = m.candidate as Record<string, unknown> | null;
      if (!id(m.host) || (m.from !== "host" && m.from !== "viewer") || !c || typeof c.candidate !== "string") return null;
      const candidate: RTCIceCandidateInit = { candidate: c.candidate.slice(0, 1000) };
      if (typeof c.sdpMid === "string") candidate.sdpMid = c.sdpMid;
      if (typeof c.sdpMLineIndex === "number") candidate.sdpMLineIndex = c.sdpMLineIndex;
      return { type: "ice", session: m.session, host: m.host, from: m.from, candidate };
    }
    case "off":
    case "busy":
      return id(m.host) ? { type: m.type, session: m.session, host: m.host } : null;
    case "talk":
      return id(m.host) && typeof m.on === "boolean" ? { type: "talk", session: m.session, host: m.host, on: m.on } : null;
    case "bye":
      if (m.from !== "host" && m.from !== "viewer") return null;
      if (m.host !== undefined && !id(m.host)) return null;
      return m.host === undefined
        ? { type: "bye", session: m.session, from: m.from }
        : { type: "bye", session: m.session, host: m.host as string, from: m.from };
    default:
      return null;
  }
}

export function randomId(): string {
  return crypto.randomUUID();
}

type PeerMaker = (config: RTCConfiguration) => RTCPeerConnection;
const realPeer: PeerMaker = (config) => new RTCPeerConnection(config);

/** Plays a family member's voice on the phone. Returns a function that stops it. */
function playVoice(track: MediaStreamTrack): () => void {
  const audio = new Audio();
  audio.srcObject = new MediaStream([track]);
  void audio.play().catch(() => {
    // The browser wants a tap first; Start watching usually counts as one.
  });
  return () => {
    audio.pause();
    audio.srcObject = null;
  };
}

/** Someone watching, for the sign on the phone. */
export interface Watcher {
  session: string;
  name: string;
  /** Video is flowing (not just connecting). */
  connected: boolean;
  /** They pressed Talk. */
  talking: boolean;
}

export interface HostOptions {
  signal: LiveSignal;
  iceServers: () => Promise<RTCIceServer[]>;
  /** Called whenever who's watching changes. */
  onWatchers?: (watchers: Watcher[]) => void;
  createPeer?: PeerMaker;
  playVoice?: (track: MediaStreamTrack) => () => void;
  maxViewers?: number;
}

interface HostPeer {
  pc: RTCPeerConnection;
  watcher: Watcher;
  remoteSet: boolean;
  waitingIce: RTCIceCandidateInit[];
  stopVoice?: () => void;
}

/**
 * The phone's side: answers "watch" requests from the family page with the camera
 * and microphone, and plays what family members say.
 */
export class LiveHost {
  readonly id = randomId();
  private peers = new Map<string, HostPeer>();
  private video: MediaStreamTrack | null = null;
  private audio: MediaStreamTrack | null = null;
  private enabled = true;
  private stopped = false;

  private opts: HostOptions;

  constructor(opts: HostOptions) {
    this.opts = opts;
    opts.signal.onMessage((m) => void this.handle(m));
  }

  /** The camera and microphone to send (the camera changes when it flips). */
  setTracks(video: MediaStreamTrack | null, audio: MediaStreamTrack | null): void {
    this.video = video;
    this.audio = audio;
    for (const p of this.peers.values()) {
      for (const t of p.pc.getTransceivers()) {
        const kind = t.receiver.track?.kind;
        const track = kind === "video" ? video : kind === "audio" ? audio : undefined;
        if (track !== undefined && t.sender.track !== track) void t.sender.replaceTrack(track).catch(() => {});
      }
    }
  }

  /** Live video switched off on the phone: everyone watching is disconnected, and new requests get "off". */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) for (const session of [...this.peers.keys()]) this.drop(session, true);
  }

  get watchers(): Watcher[] {
    return [...this.peers.values()].map((p) => ({ ...p.watcher }));
  }

  /** Stops for good (the camera stopped): says bye to everyone and leaves the channel. */
  stop(): void {
    if (this.stopped) return;
    for (const session of [...this.peers.keys()]) this.drop(session, true);
    this.stopped = true;
    this.opts.signal.close();
  }

  private send(m: LiveMessage): void {
    if (!this.stopped) this.opts.signal.send(m);
  }

  private changed(): void {
    this.opts.onWatchers?.(this.watchers);
  }

  private drop(session: string, tellThem: boolean): void {
    const p = this.peers.get(session);
    if (!p) return;
    this.peers.delete(session);
    p.stopVoice?.();
    p.pc.onicecandidate = null;
    p.pc.ontrack = null;
    p.pc.onconnectionstatechange = null;
    p.pc.close();
    if (tellThem) this.send({ type: "bye", session, host: this.id, from: "host" });
    this.changed();
  }

  private async handle(m: LiveMessage): Promise<void> {
    if (this.stopped) return;
    if (m.type === "watch") return this.watch(m.session, m.name);
    // Everything else is about one of this phone's sessions (a bye without a host is for every phone).
    const host = "host" in m ? m.host : undefined;
    if (host !== undefined && host !== this.id) return;
    const p = this.peers.get(m.session);
    if (!p) return;
    try {
      if (m.type === "answer") {
        await p.pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
        p.remoteSet = true;
        for (const c of p.waitingIce.splice(0)) await p.pc.addIceCandidate(c);
      } else if (m.type === "ice" && m.from === "viewer") {
        if (p.remoteSet) await p.pc.addIceCandidate(m.candidate);
        else p.waitingIce.push(m.candidate);
      } else if (m.type === "talk") {
        p.watcher.talking = m.on;
        this.changed();
      } else if (m.type === "bye" && m.from === "viewer") {
        this.drop(m.session, false);
      }
    } catch {
      this.drop(m.session, true); // a broken connection: start over from the family page
    }
  }

  private async watch(session: string, name: string): Promise<void> {
    if (this.peers.has(session)) return;
    if (!this.enabled || !this.video) return this.send({ type: "off", session, host: this.id });
    if (this.peers.size >= (this.opts.maxViewers ?? MAX_VIEWERS)) return this.send({ type: "busy", session, host: this.id });

    const pc = (this.opts.createPeer ?? realPeer)({ iceServers: await this.opts.iceServers() });
    if (this.stopped || !this.enabled) return pc.close();
    const p: HostPeer = { pc, watcher: { session, name: name.trim() || "Family", connected: false, talking: false }, remoteSet: false, waitingIce: [] };
    this.peers.set(session, p);
    this.changed();

    pc.addTransceiver(this.video, { direction: "sendonly" });
    // Sound goes both ways: the room to the family, the family's voice to the phone.
    pc.addTransceiver(this.audio ?? "audio", { direction: "sendrecv" });
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ type: "ice", session, host: this.id, from: "host", candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (e.track.kind === "audio" && !p.stopVoice) p.stopVoice = (this.opts.playVoice ?? playVoice)(e.track);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        p.watcher.connected = true;
        this.changed();
      } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.drop(session, true);
      }
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      if (!this.peers.has(session)) return;
      this.send({ type: "offer", session, host: this.id, sdp: pc.localDescription?.sdp ?? "" });
    } catch {
      this.drop(session, true);
    }
  }
}

/** What the family page shows. */
export type ViewerState =
  | "idle"
  | "connecting"
  | "live"
  /** No phone answered: the camera isn't on. */
  | "no-phone"
  /** The phone has live video switched off. */
  | "off"
  /** Too many family members are watching already. */
  | "busy"
  /** The two couldn't connect (the network may block video). */
  | "failed"
  /** The phone stopped watching. */
  | "ended";

export interface ViewerOptions {
  signal: LiveSignal;
  iceServers: () => Promise<RTCIceServer[]>;
  /** Who's asking, for the sign on the phone. */
  viewer: string;
  name: string;
  onState?: (state: ViewerState) => void;
  /** The phone's video and sound, ready for a <video> element. */
  onStream?: (stream: MediaStream) => void;
  createPeer?: PeerMaker;
  makeStream?: () => MediaStream;
  getMic?: () => Promise<MediaStreamTrack>;
  timeoutMs?: number;
}

/** The family page's side: asks to watch, shows the video and sound, and talks back. */
export class LiveViewer {
  readonly session = randomId();
  state: ViewerState = "idle";
  private host: string | null = null;
  private pc: RTCPeerConnection | null = null;
  private waitingIce: RTCIceCandidateInit[] = [];
  private mic: MediaStreamTrack | null = null;
  private talking = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stream: MediaStream | null = null;

  private opts: ViewerOptions;

  constructor(opts: ViewerOptions) {
    this.opts = opts;
    opts.signal.onMessage((m) => void this.handle(m));
  }

  /** Asks the phones in this family to start sending. */
  start(): void {
    if (this.state !== "idle") return;
    this.set("connecting");
    this.opts.signal.send({ type: "watch", session: this.session, viewer: this.opts.viewer, name: this.opts.name });
    this.timer = setTimeout(() => {
      if (this.state === "connecting" && !this.host) this.finish("no-phone", false);
    }, this.opts.timeoutMs ?? ANSWER_TIMEOUT_MS);
  }

  /**
   * Talk through the phone (true) or stop (false). The microphone is asked for the
   * first time; afterwards it's switched on and off. Throws if the microphone is refused.
   */
  async setTalking(on: boolean): Promise<void> {
    if (on && !this.mic) {
      const mic = await (this.opts.getMic ?? defaultMic)();
      if (this.state !== "live" && this.state !== "connecting") {
        mic.stop();
        return;
      }
      this.mic = mic;
      const sender = this.pc?.getTransceivers().find((t) => t.receiver.track?.kind === "audio")?.sender;
      await sender?.replaceTrack(mic);
    }
    if (this.mic) this.mic.enabled = on;
    this.talking = on;
    if (this.host) this.opts.signal.send({ type: "talk", session: this.session, host: this.host, on });
  }

  get isTalking(): boolean {
    return this.talking;
  }

  /** Stops watching (the family member closed it). */
  stop(): void {
    this.finish("ended", true);
  }

  private set(state: ViewerState): void {
    this.state = state;
    this.opts.onState?.(state);
  }

  private finish(state: ViewerState, tellPhone: boolean): void {
    if (this.state === "idle" || this.isOver()) return;
    clearTimeout(this.timer);
    if (tellPhone) this.opts.signal.send({ type: "bye", session: this.session, ...(this.host ? { host: this.host } : {}), from: "viewer" });
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.mic?.stop();
    this.mic = null;
    this.talking = false;
    this.set(state);
    this.opts.signal.close();
  }

  private isOver(): boolean {
    return this.state !== "connecting" && this.state !== "live";
  }

  private async handle(m: LiveMessage): Promise<void> {
    if (m.session !== this.session || this.isOver() || m.type === "watch") return;
    if (!("host" in m) || !m.host) return;
    // A second phone in the same family answered too: watch the first one only.
    if (this.host && m.host !== this.host) {
      if (m.type === "offer") this.opts.signal.send({ type: "bye", session: this.session, host: m.host, from: "viewer" });
      return;
    }
    if (m.type === "off" || m.type === "busy") {
      if (!this.host) this.finish(m.type, false);
      return;
    }
    if (m.type === "bye" && m.from === "host") return this.finish("ended", false);
    try {
      if (m.type === "offer" && !this.pc) await this.answer(m.host, m.sdp);
      else if (m.type === "ice" && m.from === "host" && this.pc) {
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(m.candidate);
        else this.waitingIce.push(m.candidate);
      }
    } catch {
      this.finish("failed", true);
    }
  }

  private async answer(host: string, sdp: string): Promise<void> {
    this.host = host;
    clearTimeout(this.timer);
    const pc = (this.opts.createPeer ?? realPeer)({ iceServers: await this.opts.iceServers() });
    if (this.isOver()) return pc.close();
    this.pc = pc;
    this.stream = (this.opts.makeStream ?? (() => new MediaStream()))();
    pc.ontrack = (e) => {
      this.stream!.addTrack(e.track);
      this.opts.onStream?.(this.stream!);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.opts.signal.send({ type: "ice", session: this.session, host, from: "viewer", candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") this.set("live");
      else if (pc.connectionState === "failed") this.finish("failed", true);
    };
    // No connection within this long: say so instead of spinning forever.
    this.timer = setTimeout(() => {
      if (this.state === "connecting") this.finish("failed", true);
    }, 2 * (this.opts.timeoutMs ?? ANSWER_TIMEOUT_MS));
    await pc.setRemoteDescription({ type: "offer", sdp });
    // Ready to talk back later without starting over: the sound goes both ways from the start.
    for (const t of pc.getTransceivers()) {
      if (t.receiver.track?.kind !== "audio") continue;
      t.direction = "sendrecv";
      if (this.mic) await t.sender.replaceTrack(this.mic); // Talk was pressed while connecting
    }
    await pc.setLocalDescription(await pc.createAnswer());
    for (const c of this.waitingIce.splice(0)) await pc.addIceCandidate(c);
    this.opts.signal.send({ type: "answer", session: this.session, host, sdp: pc.localDescription?.sdp ?? "" });
  }
}

function defaultMic(): Promise<MediaStreamTrack> {
  return navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .then((s) => s.getAudioTracks()[0]);
}

/** Why live video can't start, in plain words, from an error while joining the channel. */
export class LiveSetupError extends Error {}

/**
 * The messages go through Supabase Realtime on the private channel `live:<care circle id>`.
 * Only members of that care circle can join it (the database rule in the live video migration).
 */
export async function supabaseSignal(db: SupabaseClient, circleId: string): Promise<LiveSignal> {
  const topic = `live:${circleId}`;
  // An old channel with the same name that's still closing would never connect: remove it first.
  for (const old of db.getChannels()) if (old.topic === `realtime:${topic}`) await db.removeChannel(old);
  await db.realtime.setAuth(); // join as the signed-in person, so the database rule can check the family
  const listeners: ((m: LiveMessage) => void)[] = [];
  const channel = db.channel(topic, { config: { private: true, broadcast: { self: false } } });
  channel.on("broadcast", { event: "live" }, ({ payload }) => {
    const m = parseMessage(payload);
    if (m) for (const l of listeners) l(m);
  });
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        void db.removeChannel(channel);
        const why = err?.message ?? "";
        reject(
          new LiveSetupError(
            /unauthori|permission|denied/i.test(why)
              ? "Live video isn't switched on in the database yet (see README: Live video)."
              : "Couldn't connect for live video. Check the internet and try again.",
          ),
        );
      }
    });
  });
  return {
    send: (m) => void channel.send({ type: "broadcast", event: "live", payload: m }),
    onMessage: (l) => listeners.push(l),
    close: () => void db.removeChannel(channel),
  };
}

/** The relay servers from /api/ice-servers (signed in), or the free public one if that fails. */
export async function fetchIceServers(token: string | null): Promise<RTCIceServer[]> {
  try {
    const res = await fetch("/api/ice-servers", { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) {
      const body = (await res.json()) as { iceServers?: unknown };
      if (Array.isArray(body.iceServers) && body.iceServers.length > 0) return body.iceServers as RTCIceServer[];
    }
  } catch {
    // no server piece (or offline): the public one still works on most networks
  }
  return PUBLIC_STUN;
}
