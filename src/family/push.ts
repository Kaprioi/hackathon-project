// Helpers for phone notifications ("Get alerts on this device"). No React here,
// so it can be tested with `npm test`. The server side is api/notify.ts.

/** The kinds of news a device can get as a notification. Possible falls always are. */
export const PUSH_KINDS = ["fall", "stopped", "inactive"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

/** True for the kinds of news the camera page should tell the server about. */
export function isPushKind(kind: string): kind is PushKind {
  return (PUSH_KINDS as readonly string[]).includes(kind);
}

/**
 * Can this browser get notifications?
 *   "ok"           yes
 *   "home-screen"  an iPhone or iPad: only after adding CareNest to the Home Screen (iOS 16.4+)
 *   "unsupported"  no
 */
export function pushSupport(b: {
  userAgent: string;
  /** "maxTouchPoints" > 1 on a Mac means an iPad pretending to be a Mac. */
  maxTouchPoints: number;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  /** Opened from the Home Screen (not in a browser tab). */
  standalone: boolean;
}): "ok" | "home-screen" | "unsupported" {
  const apple = /iPhone|iPad|iPod/.test(b.userAgent) || (/Macintosh/.test(b.userAgent) && b.maxTouchPoints > 1);
  if (b.hasServiceWorker && b.hasPushManager && b.hasNotification) return "ok";
  if (apple && !b.standalone) return "home-screen";
  return "unsupported";
}

/** The public key as the bytes the browser wants (it comes "URL-safe base64" encoded). */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.trim().replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.trim().length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The extra alerts a device can choose, on top of possible falls. */
export interface PushExtras {
  /** The phone camera stopped watching. */
  cameraOff: boolean;
  /** No movement for a while during the day. */
  noMovement: boolean;
}

/** The kinds to save for a device: falls always, the others if wanted. */
export function kindsFor(extras: PushExtras): PushKind[] {
  const kinds: PushKind[] = ["fall"];
  if (extras.cameraOff) kinds.push("stopped");
  if (extras.noMovement) kinds.push("inactive");
  return kinds;
}

/** Which extras a saved row asked for. */
export function extrasFrom(kinds: readonly string[]): PushExtras {
  return { cameraOff: kinds.includes("stopped"), noMovement: kinds.includes("inactive") };
}

/** The push_subscriptions row for a browser's subscription (from PushSubscription.toJSON()). */
export function subscriptionRow(
  sub: { endpoint?: string; keys?: Record<string, string> },
  extra: { circleId: string; userId: string; lang: string; timeZone: string; who: string; extras: PushExtras },
) {
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("The browser gave an incomplete subscription.");
  return {
    circle_id: extra.circleId,
    user_id: extra.userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    lang: ["en", "es", "zh"].includes(extra.lang) ? extra.lang : "en",
    time_zone: extra.timeZone || "UTC",
    who: extra.who.trim().slice(0, 60),
    kinds: kindsFor(extra.extras),
    updated_at: new Date().toISOString(),
  };
}

/** This browser's push subscription, if it has one (never throws). */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  try {
    if (!("serviceWorker" in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration("/");
    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** True for Supabase's "that table doesn't exist" errors (the database update hasn't been run yet). */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));
}
