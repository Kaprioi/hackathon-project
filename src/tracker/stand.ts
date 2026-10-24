// Talks to the stand's ESP32 over Bluetooth (Web Bluetooth).
//
// Works in Chrome or Edge on Windows, Mac and Android, and in the Bluefy browser
// on iPhone. Safari can't do Bluetooth from a website.
//
// Bluetooth can only do one thing at a time, so every write goes through one
// queue. Moves are throttled to 20 per second and only the newest one is sent.

import { BLE, RADAR } from "./config.ts";
import type { RadarEnergy } from "./radarGuide.ts";

// Just enough of the Web Bluetooth types for this file (TypeScript doesn't ship them).
interface BleCharacteristic extends EventTarget {
  value?: DataView;
  writeValue(data: BufferSource): Promise<void>;
  writeValueWithoutResponse?(data: BufferSource): Promise<void>;
  startNotifications(): Promise<BleCharacteristic>;
  readValue(): Promise<DataView>;
}
interface BleService {
  getCharacteristic(uuid: string): Promise<BleCharacteristic>;
}
interface BleServer {
  connected: boolean;
  connect(): Promise<BleServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BleService>;
}
interface BleDevice extends EventTarget {
  name?: string;
  gatt?: BleServer;
}
interface BleBluetooth {
  requestDevice(options: {
    filters: Array<{ services?: string[]; name?: string }>;
    optionalServices?: string[];
  }): Promise<BleDevice>;
}

function bluetooth(): BleBluetooth | undefined {
  return (navigator as Navigator & { bluetooth?: BleBluetooth }).bluetooth;
}

export type StandStatus = "unsupported" | "disconnected" | "connecting" | "connected";

const MOVE_EVERY_MS = 50; // at most 20 moves a second
// While the camera is steering, repeat the aim this often even if it hasn't changed.
// A two-radar (SightLine) stand lets its radars steer once these stop arriving.
const MOVE_REPEAT_MS = 250;
const MIST_REPEAT_MS = 1000; // repeat the mist setting every second; the firmware turns mist off after 3 s of silence

export class Stand {
  status: StandStatus = bluetooth() ? "disconnected" : "unsupported";
  /** Radar reading: true = someone there, false = nobody, null = unknown. */
  radar: boolean | null = null;
  /** How loud the radar(s) hear someone (SightLine stand), or null if the stand only says yes/no. */
  energy: RadarEnergy | null = null;
  /** Where the stand says it's pointing (only stands that report it, like SightLine), else null. */
  reported: { pan: number; tilt: number } | null = null;
  /** False if the connected firmware is too old to have the mist switch. */
  hasMist = false;
  /** Called whenever status or radar changes. */
  onChange: () => void = () => {};
  lastError = "";

  private shownEnergy: RadarEnergy | null = null;
  private device: BleDevice | null = null;
  private moveChar: BleCharacteristic | null = null;
  private mistChar: BleCharacteristic | null = null;
  private wantMove: { pan: number; tilt: number } | null = null;
  private sentMove: { pan: number; tilt: number } | null = null;
  private lastMoveAt = 0;
  private wantMist = false;
  private sentMist: boolean | null = null;
  private lastMistAt = 0;
  private busy = false;
  private timer: number | null = null;
  private heartbeat: number | null = null;
  private userDisconnect = false;

  static supported(): boolean {
    return !!bluetooth();
  }

  get connected(): boolean {
    return this.status === "connected";
  }

  /** Opens the browser's device picker. Must be called from a button tap. */
  async connect(): Promise<void> {
    const bt = bluetooth();
    if (!bt) throw new Error("This browser can't use Bluetooth. On iPhone, open the page in Bluefy.");
    this.userDisconnect = false;
    this.setStatus("connecting");
    try {
      const device = await bt.requestDevice({
        filters: [{ services: [BLE.service] }, { name: BLE.name }],
        optionalServices: [BLE.service],
      });
      this.device = device;
      device.addEventListener("gattserverdisconnected", () => void this.onDropped());
      await this.attach();
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.setStatus("disconnected");
      throw e;
    }
  }

  disconnect(): void {
    this.userDisconnect = true;
    this.wantMist = false;
    this.device?.gatt?.disconnect();
  }

  /** Point the stand (servo degrees). Only the newest request is sent. */
  move(pan: number, tilt: number): void {
    this.wantMove = { pan, tilt };
    this.pump();
  }

  /** Stop steering. The stand stays put, or (on a two-radar stand) its radars take over. */
  releaseControl(): void {
    this.wantMove = null;
  }

  setMist(on: boolean): void {
    if (on !== this.wantMist) {
      this.wantMist = on;
      this.pump();
    }
  }

  private async attach(): Promise<void> {
    const server = await this.device!.gatt!.connect();
    const service = await server.getPrimaryService(BLE.service);
    this.moveChar = await service.getCharacteristic(BLE.move);
    try {
      this.mistChar = await service.getCharacteristic(BLE.mist);
      this.hasMist = true;
    } catch {
      this.mistChar = null; // older firmware without the humidifier switch
      this.hasMist = false;
    }
    try {
      const radar = await service.getCharacteristic(BLE.radar);
      radar.addEventListener("characteristicvaluechanged", () => {
        if (radar.value) this.readRadar(radar.value);
      });
      await radar.startNotifications();
      this.readRadar(await radar.readValue());
    } catch {
      this.radar = null; // no radar: the page still works, Hidden just times out on its own
    }
    this.sentMove = null;
    this.sentMist = null;
    this.setStatus("connected");
    if (this.heartbeat === null) this.heartbeat = window.setInterval(() => this.pump(), 200);
    this.pump();
  }

  /**
   * Reads "1" or "0" (old one-radar Phone Tracker stand), or
   * "1,42,13,95.0,90.0" = presence, left and right radar loudness, pan, tilt (SightLine stand),
   * maybe followed by ",1" or ",2": how many radars it has (else RADAR.count in config.ts).
   */
  private readRadar(v: DataView): void {
    const parts = new TextDecoder().decode(v).trim().split(",");
    const present = parts[0] === "1";
    if (parts.length >= 5) {
      const pan = Number(parts[3]);
      const tilt = Number(parts[4]);
      if (Number.isFinite(pan) && Number.isFinite(tilt)) this.reported = { pan, tilt };
      const left = Number(parts[1]);
      const right = Number(parts[2]);
      const radars = parts[5] === "1" || parts[5] === "2" ? (Number(parts[5]) as 1 | 2) : RADAR.count;
      this.energy = Number.isFinite(left) && Number.isFinite(right) ? { left, right, radars } : null;
    }
    // Tell the page when presence changes, or the loudness changes enough to show.
    const e = this.energy;
    const shown = this.shownEnergy;
    const moved =
      !!e !== !!shown || (!!e && !!shown && (Math.abs(e.left - shown.left) >= 5 || Math.abs(e.right - shown.right) >= 5));
    if (present !== this.radar || moved) {
      this.radar = present;
      this.shownEnergy = e;
      this.onChange();
    }
  }

  private async onDropped(): Promise<void> {
    this.moveChar = null;
    this.mistChar = null;
    this.radar = null;
    this.energy = null;
    this.reported = null;
    if (this.userDisconnect || !this.device) {
      this.stopHeartbeat();
      this.setStatus("disconnected");
      return;
    }
    // Try to reconnect a few times, waiting a little longer each time.
    this.setStatus("connecting");
    for (let attempt = 1; attempt <= 5; attempt++) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
      if (this.userDisconnect) break;
      try {
        await this.attach();
        return;
      } catch (e) {
        this.lastError = e instanceof Error ? e.message : String(e);
      }
    }
    this.stopHeartbeat();
    this.setStatus("disconnected");
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private setStatus(s: StandStatus): void {
    this.status = s;
    this.onChange();
  }

  /** Sends whatever is waiting, one write at a time. */
  private pump(): void {
    if (this.busy || !this.connected) return;
    const now = performance.now();

    const mistDue =
      this.mistChar && (this.sentMist !== this.wantMist || (this.wantMist && now - this.lastMistAt > MIST_REPEAT_MS));
    if (mistDue) {
      const on = this.wantMist;
      void this.write(this.mistChar!, on ? "1" : "0", true).then((ok) => {
        if (ok) {
          this.sentMist = on;
          this.lastMistAt = performance.now();
        }
      });
      return;
    }

    const m = this.wantMove;
    const changed =
      m && (!this.sentMove || Math.abs(m.pan - this.sentMove.pan) > 0.3 || Math.abs(m.tilt - this.sentMove.tilt) > 0.3);
    const repeatDue = m && now - this.lastMoveAt > MOVE_REPEAT_MS;
    if (m && (changed || repeatDue) && this.moveChar) {
      const wait = MOVE_EVERY_MS - (now - this.lastMoveAt);
      if (wait > 0) {
        // Too soon: send the newest move once the throttle allows.
        if (this.timer === null) {
          this.timer = window.setTimeout(() => {
            this.timer = null;
            this.pump();
          }, wait);
        }
        return;
      }
      void this.write(this.moveChar, `${m.pan.toFixed(1)},${m.tilt.toFixed(1)}`, false).then((ok) => {
        if (ok) {
          this.sentMove = m;
          this.lastMoveAt = performance.now();
        }
      });
    }
  }

  private async write(c: BleCharacteristic, text: string, reliable: boolean): Promise<boolean> {
    this.busy = true;
    try {
      const data = new TextEncoder().encode(text);
      if (!reliable && c.writeValueWithoutResponse) await c.writeValueWithoutResponse(data);
      else await c.writeValue(data);
      return true;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      this.busy = false;
      // Something else may have been asked for while we were busy.
      queueMicrotask(() => this.pump());
    }
  }
}
