// Phone notifications for the family ("Possible fall at Mum's, 3:42 pm"), so they
// hear about a fall even when the family page isn't open.
//
// How it works: family press "Get alerts on this device" on the family page, which
// saves their browser's push address in the push_subscriptions table. When the
// phone camera notices a possible fall, it calls this function with the event's
// number. We check with Supabase that the event is real, fresh, and in a circle
// the caller belongs to, then send a notification to every device in that circle
// (except the camera phone itself). Each event is only ever sent once.
//
// The notification is written for each person: in their language, in their time
// zone, and with the name they call the person they care for.
//
// Only people logged in to CareNest can use it (we check their login token with
// Supabase), and each person can call it at most 30 times every 10 minutes.
//
// Needs these Vercel environment variables:
//   VAPID_PUBLIC_KEY           the public half of the notification keys
//   VAPID_PRIVATE_KEY          the secret half (stays on the server)
//   VAPID_SUBJECT              a contact for the push services, like mailto:team@example.com
//   SUPABASE_SERVICE_ROLE_KEY  the Supabase service role key (secret, stays on the server)
//   VITE_SUPABASE_URL          the Supabase project (the same one the site uses)
//   VITE_VAPID_PUBLIC_KEY      the same public key again, for the family page in the browser

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Vercel provides `process` on the server; this tells TypeScript about the part we use.
declare const process: { env: Record<string, string | undefined> };

/** The kinds of news that can be sent as a notification. Possible falls always are. */
export const ALERT_KINDS = ["fall", "stopped", "inactive"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Older news than this is never sent, so an old fall can't be replayed. */
export const FRESH_MS = 10 * 60 * 1000;

/** How many calls one person may make in each window of time. */
export const LIMIT = 30;
export const WINDOW_MS = 10 * 60 * 1000;

export type PushLang = "en" | "es" | "zh";

// ---------------------------------------------------------------------------
// The words of each notification
// ---------------------------------------------------------------------------

// Notifications are written here on the server, so their translations live here
// too (the site's own word lists are in src/i18n/).
const WORDS: Record<"es" | "zh", Record<string, string>> = {
  es: {
    "{h}:{m} am": "{h}:{m} a. m.",
    "{h}:{m} pm": "{h}:{m} p. m.",
    "Possible fall at {who}'s, {time}": "Posible caída en casa de {who}, {time}",
    "Possible fall, {time}": "Posible caída, {time}",
    "Tap to open the family page, then call or visit to check they are okay.":
      "Toque para abrir la página familiar y luego llame o visite para comprobar que está bien.",
    "Camera stopped at {who}'s, {time}": "La cámara dejó de vigilar en casa de {who}, {time}",
    "The phone camera stopped watching, {time}": "La cámara del teléfono dejó de vigilar, {time}",
    "Tap to open the family page.": "Toque para abrir la página familiar.",
    "No movement at {who}'s for a while, {time}": "No hay movimiento en casa de {who} desde hace un rato, {time}",
    "No movement for a while, {time}": "Sin movimiento desde hace un rato, {time}",
    "Nobody has moved in view of the phone camera for a while. Maybe give them a call.":
      "Nadie se ha movido delante de la cámara del teléfono desde hace un rato. Quizá podría llamarle.",
    "CareNest test alert": "Aviso de prueba de CareNest",
    "Alerts are working on this device.": "Los avisos funcionan en este dispositivo.",
  },
  zh: {
    "{h}:{m} am": "{h24}:{m}",
    "{h}:{m} pm": "{h24}:{m}",
    "Possible fall at {who}'s, {time}": "{who}家可能有人跌倒，{time}",
    "Possible fall, {time}": "可能跌倒，{time}",
    "Tap to open the family page, then call or visit to check they are okay.":
      "点按打开家人页面，然后打电话或上门确认他们是否安好。",
    "Camera stopped at {who}'s, {time}": "{who}家的摄像头停止看护，{time}",
    "The phone camera stopped watching, {time}": "手机摄像头停止看护，{time}",
    "Tap to open the family page.": "点按打开家人页面。",
    "No movement at {who}'s for a while, {time}": "{who}家已有一段时间没有动静，{time}",
    "No movement for a while, {time}": "已有一段时间没有动静，{time}",
    "Nobody has moved in view of the phone camera for a while. Maybe give them a call.":
      "手机摄像头前已有一段时间没有人走动。也许可以给他们打个电话。",
    "CareNest test alert": "CareNest 测试提醒",
    "Alerts are working on this device.": "此设备上的提醒可以正常使用。",
  },
};

function t(lang: PushLang, text: string, vars: Record<string, string | number> = {}): string {
  const words = lang === "en" ? text : WORDS[lang][text] || text;
  return words.replace(/\{(\w+)\}/g, (gap, name: string) => (name in vars ? String(vars[name]) : gap));
}

/** "3:42 pm" (or "15:42" in Chinese) for `iso`, in the person's own time zone. */
export function alertTime(iso: string, lang: PushLang, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(
      new Date(iso),
    );
  } catch {
    // A time zone we don't know: fall back to UTC rather than send nothing.
    return alertTime(iso, lang, "UTC");
  }
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  const time = { h: h % 12 === 0 ? 12 : h % 12, m, h24: h };
  return h < 12 ? t(lang, "{h}:{m} am", time) : t(lang, "{h}:{m} pm", time);
}

/** Who a notification goes to, and how to write it for them. */
export interface Recipient {
  lang: string;
  time_zone: string;
  /** What they call the person they care for, like "Mum". May be empty. */
  who: string;
}

/** The title and words of one notification, written for one person. */
export function alertText(kind: AlertKind | "test", iso: string, to: Recipient): { title: string; body: string } {
  const lang: PushLang = to.lang === "es" || to.lang === "zh" ? to.lang : "en";
  const time = alertTime(iso, lang, to.time_zone || "UTC");
  const who = (to.who ?? "").trim().slice(0, 60);
  if (kind === "fall")
    return {
      title: who ? t(lang, "Possible fall at {who}'s, {time}", { who, time }) : t(lang, "Possible fall, {time}", { time }),
      body: t(lang, "Tap to open the family page, then call or visit to check they are okay."),
    };
  if (kind === "stopped")
    return {
      title: who
        ? t(lang, "Camera stopped at {who}'s, {time}", { who, time })
        : t(lang, "The phone camera stopped watching, {time}", { time }),
      body: t(lang, "Tap to open the family page."),
    };
  if (kind === "inactive")
    return {
      title: who
        ? t(lang, "No movement at {who}'s for a while, {time}", { who, time })
        : t(lang, "No movement for a while, {time}", { time }),
      body: t(lang, "Nobody has moved in view of the phone camera for a while. Maybe give them a call."),
    };
  return { title: t(lang, "CareNest test alert"), body: t(lang, "Alerts are working on this device.") };
}

// ---------------------------------------------------------------------------
// What the page sends us
// ---------------------------------------------------------------------------

export type NotifyRequest =
  /** The camera recorded an event: send it to the family (if it's an alert). */
  | { eventId: number; skipEndpoint: string | null }
  /** The camera page is closing and couldn't wait for the event's number: use its newest one of this kind. */
  | { circleId: string; kind: AlertKind; skipEndpoint: string | null }
  /** "Send a test alert" on the family page: only to this device. */
  | { test: true; circleId: string; endpoint: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks what the page sent. Gives the cleaned-up request, or a plain error. */
export function checkRequest(body: unknown): NotifyRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "Send JSON like {\"eventId\": 123}." };
  const b = body as Record<string, unknown>;
  const skip = typeof b.skipEndpoint === "string" && b.skipEndpoint.startsWith("https://") ? b.skipEndpoint : null;
  if (b.test === true) {
    if (typeof b.circleId !== "string" || !UUID.test(b.circleId)) return { error: "Which care circle is this for?" };
    if (typeof b.endpoint !== "string" || !b.endpoint.startsWith("https://")) return { error: "Which device is this for?" };
    return { test: true, circleId: b.circleId, endpoint: b.endpoint };
  }
  if (b.eventId !== undefined) {
    if (typeof b.eventId !== "number" || !Number.isSafeInteger(b.eventId) || b.eventId <= 0)
      return { error: "The event number isn't right." };
    return { eventId: b.eventId, skipEndpoint: skip };
  }
  if (typeof b.circleId === "string" && UUID.test(b.circleId) && (ALERT_KINDS as readonly unknown[]).includes(b.kind))
    return { circleId: b.circleId, kind: b.kind as AlertKind, skipEndpoint: skip };
  return { error: "Send JSON like {\"eventId\": 123}." };
}

// ---------------------------------------------------------------------------
// Sending (the database and push service are passed in, so tests can pretend)
// ---------------------------------------------------------------------------

export interface EventInfo {
  id: number;
  circle_id: string;
  kind: string;
  created_at: string;
}

export interface Subscription extends Recipient {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What we need from the database. */
export interface Store {
  event(id: number): Promise<EventInfo | null>;
  /** The newest event of this kind in the circle since `sinceIso`. */
  latestEvent(circleId: string, kind: AlertKind, sinceIso: string): Promise<EventInfo | null>;
  isMember(circleId: string, userId: string): Promise<boolean>;
  /** Notes that this event has been sent. False if it already had been. */
  markSent(eventId: number): Promise<boolean>;
  /** Every device in the circle that wants this kind of alert. */
  subscriptions(circleId: string, kind: AlertKind): Promise<Subscription[]>;
  ownSubscription(circleId: string, userId: string, endpoint: string): Promise<Subscription | null>;
  remove(subscriptionId: number): Promise<void>;
}

/** Sends one notification. Throws an error with `statusCode` when the push service says no. */
export type Send = (to: Subscription, payload: string, urgent: boolean) => Promise<void>;

/** The database hasn't been updated with supabase/migrations/20261024040000_push_alerts.sql yet. */
export class NotSetUp extends Error {}

export interface Answer {
  status: number;
  body: Record<string, unknown>;
}

const isAlertKind = (kind: string): kind is AlertKind => (ALERT_KINDS as readonly string[]).includes(kind);

async function sendAll(subs: Subscription[], kind: AlertKind | "test", event: { id: number; created_at: string }, store: Store, send: Send) {
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      const words = alertText(kind, event.created_at, sub);
      const payload = JSON.stringify({ ...words, url: "/dashboard", tag: `carenest-${event.id}`, urgent: kind === "fall" });
      try {
        await send(sub, payload, kind === "fall");
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404 or 410: the device turned alerts off or the address ran out. Forget it.
        if (status === 404 || status === 410) await store.remove(sub.id).catch(() => {});
        // Only the status code is logged: never the address or the keys.
        else console.error(`Sending a notification failed with status ${status ?? "unknown"}`);
      }
    }),
  );
  return sent;
}

/** Does the work of one request from a logged-in person. */
export async function notify(req: NotifyRequest, userId: string, store: Store, send: Send, now = Date.now()): Promise<Answer> {
  if ("test" in req) {
    if (!(await store.isMember(req.circleId, userId))) return { status: 403, body: { error: "That isn't your care circle." } };
    const sub = await store.ownSubscription(req.circleId, userId, req.endpoint);
    if (!sub) return { status: 404, body: { error: "Alerts aren't turned on for this device yet." } };
    const sent = await sendAll([sub], "test", { id: 0, created_at: new Date(now).toISOString() }, store, send);
    return sent ? { status: 200, body: { sent } } : { status: 502, body: { error: "The test alert couldn't be sent." } };
  }

  let event: EventInfo | null;
  if ("eventId" in req) {
    event = await store.event(req.eventId);
  } else {
    if (!(await store.isMember(req.circleId, userId))) return { status: 403, body: { error: "That isn't your care circle." } };
    event = await store.latestEvent(req.circleId, req.kind, new Date(now - 60_000).toISOString());
  }
  // The same answer for "no such event" and "not your circle", so nobody can fish for events.
  if (!event || !(await store.isMember(event.circle_id, userId))) return { status: 404, body: { error: "There is no such event." } };
  if (!isAlertKind(event.kind)) return { status: 200, body: { sent: 0, reason: "not an alert" } };
  if (now - Date.parse(event.created_at) > FRESH_MS) return { status: 200, body: { sent: 0, reason: "too old" } };
  if (!(await store.markSent(event.id))) return { status: 200, body: { sent: 0, reason: "already sent" } };

  const subs = (await store.subscriptions(event.circle_id, event.kind)).filter(
    (s) => !("skipEndpoint" in req) || s.endpoint !== req.skipEndpoint,
  );
  return { status: 200, body: { sent: await sendAll(subs, event.kind, event, store, send) } };
}

// ---------------------------------------------------------------------------
// The real database and push service
// ---------------------------------------------------------------------------

const SUB_COLUMNS = "id, user_id, endpoint, p256dh, auth, lang, time_zone, who";
const EVENT_COLUMNS = "id, circle_id, kind, created_at";

/** True for Supabase's "that table doesn't exist" errors. */
export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));
}

function supabaseStore(url: string, serviceKey: string): Store {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = <T>({ data, error }: { data: T; error: { code?: string; message?: string } | null }): T => {
    if (isMissingTable(error)) throw new NotSetUp();
    if (error) throw new Error(`Database error ${error.code ?? ""}`);
    return data;
  };
  return {
    event: async (id) => check(await db.from("movement_events").select(EVENT_COLUMNS).eq("id", id).maybeSingle()),
    latestEvent: async (circleId, kind, sinceIso) =>
      check(
        await db
          .from("movement_events")
          .select(EVENT_COLUMNS)
          .eq("circle_id", circleId)
          .eq("kind", kind)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    isMember: async (circleId, userId) =>
      Boolean(
        check(
          await db.from("care_circle_members").select("user_id").eq("circle_id", circleId).eq("user_id", userId).maybeSingle(),
        ),
      ),
    markSent: async (eventId) => {
      const { error } = await db.from("push_alerts_sent").insert({ event_id: eventId });
      if (error?.code === "23505") return false; // already there
      check({ data: null, error });
      return true;
    },
    subscriptions: async (circleId, kind) =>
      check(await db.from("push_subscriptions").select(SUB_COLUMNS).eq("circle_id", circleId).contains("kinds", [kind])) ?? [],
    ownSubscription: async (circleId, userId, endpoint) =>
      check(
        await db
          .from("push_subscriptions")
          .select(SUB_COLUMNS)
          .eq("circle_id", circleId)
          .eq("user_id", userId)
          .eq("endpoint", endpoint)
          .maybeSingle(),
      ),
    remove: async (id) => {
      check(await db.from("push_subscriptions").delete().eq("id", id));
    },
  };
}

function problem(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** The logged-in person's ID for the token in the request, or null if there is no good token. */
async function whoIsAsking(request: Request, url: string, serviceKey: string): Promise<string | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    return error ? null : (data.user?.id ?? null);
  } catch {
    return null;
  }
}

// When each person last called. Kept in memory, so it starts again when the
// server restarts; that's fine for a simple cap.
const recent = new Map<string, number[]>();

/** True (and counts this one) if the person is still under the cap. */
function underLimit(userId: string, now = Date.now()): boolean {
  const times = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) {
    recent.set(userId, times);
    return false;
  }
  times.push(now);
  recent.set(userId, times);
  return true;
}

/** Hooks so tests can swap in a pretend database and push service. */
export const services = {
  store: supabaseStore,
  send: ((to, payload, urgent) =>
    webpush
      .sendNotification({ endpoint: to.endpoint, keys: { p256dh: to.p256dh, auth: to.auth } }, payload, {
        TTL: 60 * 60,
        urgency: urgent ? "high" : "normal",
      })
      .then(() => {})) as Send,
};

/** POST /api/notify, logged in. See NotifyRequest for what to send. */
export async function POST(request: Request): Promise<Response> {
  const env = process.env;
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!supabaseUrl || !serviceKey || !publicKey || !privateKey || !subject)
    return problem(503, "Phone alerts aren't set up on the server yet.");

  const userId = await whoIsAsking(request, supabaseUrl, serviceKey);
  if (!userId) return problem(401, "Please log in to send alerts.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "Send JSON like {\"eventId\": 123}.");
  }
  const checked = checkRequest(body);
  if ("error" in checked) return problem(400, checked.error);
  if (!underLimit(userId)) return problem(429, "Too many alerts in a short time. Please wait a few minutes.");

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    return problem(503, "Phone alerts aren't set up on the server properly (check the VAPID keys).");
  }

  const store = services.store(supabaseUrl, serviceKey);
  try {
    let answer = await notify(checked, userId, store, services.send);
    // A closing camera page sends its "stopped" news and this call at the same
    // moment, so the news may not be saved yet. Look once more after a moment.
    if (answer.status === 404 && "kind" in checked) {
      await new Promise((r) => setTimeout(r, 1500));
      answer = await notify(checked, userId, store, services.send);
    }
    return Response.json(answer.body, { status: answer.status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NotSetUp) return problem(503, "Phone alerts need the database update in the README first.");
    console.error(`Phone alerts failed: ${e instanceof Error ? e.message : "unknown error"}`);
    return problem(500, "Something went wrong sending the alerts.");
  }
}
