// Sends the small text events from events.ts to Supabase, so the family page can
// show them. Nothing else goes to the database: no video, no pictures, no boxes. (Live
// video, when family press "Watch live", goes straight to them: see src/lib/live.ts.)
//
// The tables are in supabase/migrations/. Each signed-in person has a care circle;
// this phone registers itself once as a `devices` row in it (the id is kept in
// localStorage) and then adds `movement_events` rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import type { MovementEvent } from "./events.ts";

const DEVICE_KEY = "carenest.deviceId.v1";

export class Cloud {
  /** The signed-in person's access key, kept for sendOnClose (which can't wait to look it up). */
  private token = "";

  private constructor(
    private db: SupabaseClient,
    /** Who was signed in when this connected. */
    readonly userId: string,
    /** This phone's care circle (family). */
    readonly circleId: string,
    private deviceId: string,
  ) {}

  /** Finds this person's care circle and this phone's device row (making it the first time). */
  static async connect(db: SupabaseClient): Promise<Cloud> {
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) throw new Error("Please sign in first.");
    // Prefer the circle you own (your home); otherwise the first one you were added to.
    const { data: circles, error } = await db
      .from("care_circles")
      .select("id, owner_id")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Couldn't reach the database: ${error.message}`);
    const mine = circles?.find((c) => c.owner_id === auth.user.id) ?? circles?.[0];
    const circleId = mine?.id as string | undefined;
    if (!circleId) throw new Error("Your account has no care circle yet. Has the database been set up (see README)?");

    let deviceId = readDeviceId(circleId);
    if (deviceId) {
      const { data } = await db.from("devices").select("id").eq("id", deviceId).maybeSingle();
      if (!data) deviceId = null; // deleted, or belongs to someone else
    }
    if (!deviceId) {
      const { data, error: insertError } = await db
        .from("devices")
        .insert({ circle_id: circleId, name: "Phone camera" })
        .select("id")
        .single();
      if (insertError || !data) throw new Error(`Couldn't register this phone: ${insertError?.message ?? "unknown error"}`);
      deviceId = data.id as string;
      saveDeviceId(circleId, deviceId);
    }
    const cloud = new Cloud(db, auth.user.id, circleId, deviceId);
    await cloud.refreshToken();
    return cloud;
  }

  /** Sends one event. Throws a plain-words error if it didn't go through. */
  async send(event: MovementEvent): Promise<void> {
    const { error } = await this.db.from("movement_events").insert(this.row(event));
    if (error) throw new Error(`Couldn't send an update: ${error.message}`);
    // Let the family page know the phone is alive (best effort).
    await this.db.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", this.deviceId);
    await this.refreshToken();
  }

  /**
   * Sends one event while the page is closing (best effort, never throws). A normal
   * request is cancelled when a tab closes, so this uses a "keepalive" request,
   * which the browser finishes sending even after the page is gone.
   */
  sendOnClose(event: MovementEvent): void {
    if (!supabaseUrl || !supabaseAnonKey || !this.token) return;
    fetch(`${supabaseUrl}/rest/v1/movement_events`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(this.row(event)),
    }).catch(() => {});
  }

  private row(event: MovementEvent) {
    return { circle_id: this.circleId, device_id: this.deviceId, kind: event.kind, zone: event.zone, posture: event.posture };
  }

  private async refreshToken(): Promise<void> {
    const { data } = await this.db.auth.getSession();
    this.token = data.session?.access_token ?? "";
  }
}

function readDeviceId(circleId: string): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "null") as { circleId: string; deviceId: string } | null;
    return saved?.circleId === circleId ? saved.deviceId : null;
  } catch {
    return null;
  }
}

function saveDeviceId(circleId: string, deviceId: string): void {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ circleId, deviceId }));
  } catch {
    // not saved: a new device row next time, which is fine
  }
}
