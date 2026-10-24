// "Get alerts on this device": asks the browser for permission to show
// notifications, and saves this device's push address in the push_subscriptions
// table, so api/notify.ts can send it "Possible fall at Mum's, 3:42 pm" even
// when the family page isn't open. The words are in src/components/PushAlerts.tsx.

import { useCallback, useEffect, useState } from "react";
import { accessToken, supabase } from "../lib/supabase";
import { currentPushSubscription, extrasFrom, isMissingTable, keyBytes, kindsFor, pushSupport, subscriptionRow, type PushExtras } from "./push";

/** The public notification key. Without it, the site can't offer alerts yet. */
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim() ?? "";

export type PushState =
  | "checking"
  | "not-set-up" // the site has no notification key yet
  | "needs-database" // the database update hasn't been run yet
  | "home-screen" // an iPhone that needs CareNest on the Home Screen first
  | "unsupported"
  | "blocked" // notifications were refused for this site
  | "off"
  | "on";

function supportHere() {
  return pushSupport({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    standalone: window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
  });
}

const timeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export function usePushAlerts({ circleId, userId, lang, who }: { circleId: string; userId: string; lang: string; who: string }) {
  const [state, setState] = useState<PushState>("checking");
  const [extras, setExtrasState] = useState<PushExtras>({ cameraOff: false, noMovement: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  /** Saves (or updates) this device's row. Gives back the new state. */
  const saveRow = useCallback(
    async (sub: PushSubscription, wanted: PushExtras): Promise<PushState> => {
      const row = subscriptionRow(sub.toJSON(), { circleId, userId, lang, timeZone: timeZone(), who, extras: wanted });
      const { error } = await supabase!.from("push_subscriptions").upsert(row, { onConflict: "circle_id,user_id,endpoint" });
      if (isMissingTable(error)) return "needs-database";
      if (error) throw new Error(error.message);
      return "on";
    },
    [circleId, userId, lang, who],
  );

  // On opening the page: is this device already getting alerts for this circle?
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!VAPID_PUBLIC_KEY) return setState("not-set-up");
      const support = supportHere();
      if (support !== "ok") return setState(support);
      if (Notification.permission === "denied") return setState("blocked");
      const sub = await currentPushSubscription();
      if (!sub) return !cancelled && setState("off");
      const { data, error } = await supabase!
        .from("push_subscriptions")
        .select("kinds")
        .eq("circle_id", circleId)
        .eq("user_id", userId)
        .eq("endpoint", sub.endpoint)
        .maybeSingle();
      if (cancelled) return;
      if (isMissingTable(error)) return setState("needs-database");
      if (error || !data) return setState("off");
      setEndpoint(sub.endpoint);
      setExtrasState(extrasFrom(data.kinds as string[]));
      setState("on");
    })();
    return () => {
      cancelled = true;
    };
  }, [circleId, userId]);

  // Keep the language, time zone and name up to date while alerts are on.
  useEffect(() => {
    if (state !== "on") return;
    void currentPushSubscription().then((sub) => sub && saveRow(sub, extras).catch(() => {}));
    // Only when the words change, not on every switch flip (turnOn and setExtra save then).
  }, [lang, who]);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        if (permission !== "denied") setMessage({ ok: false, text: "Alerts stay off until you press Allow." });
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
      const next = await saveRow(sub, extras);
      setState(next);
      if (next === "on") {
        setEndpoint(sub.endpoint);
        setMessage({ ok: true, text: "Done! You will get a notification here if the camera sees a possible fall." });
      }
    } catch {
      setMessage({ ok: false, text: "Sorry, alerts couldn't be turned on. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    const sub = await currentPushSubscription();
    const { error } = sub
      ? await supabase!.from("push_subscriptions").delete().eq("circle_id", circleId).eq("user_id", userId).eq("endpoint", sub.endpoint)
      : { error: null };
    setBusy(false);
    if (error) return setMessage({ ok: false, text: "Sorry, that didn't work. Please try again." });
    setState("off");
    setMessage({ ok: true, text: "Alerts are off for this device." });
  }

  /** Turns one extra alert (camera stopped, no movement) on or off for this device. */
  async function setExtra(name: keyof PushExtras, on: boolean) {
    const before = extras;
    const next = { ...extras, [name]: on };
    setExtrasState(next);
    setMessage(null);
    const { error } = await supabase!
      .from("push_subscriptions")
      .update({ kinds: kindsFor(next), updated_at: new Date().toISOString() })
      .eq("circle_id", circleId)
      .eq("user_id", userId)
      .eq("endpoint", endpoint ?? "");
    if (error) {
      setExtrasState(before);
      setMessage({ ok: false, text: "Sorry, that didn't work. Please try again." });
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const token = await accessToken();
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ test: true, circleId, endpoint }),
      });
      setMessage(
        res.ok
          ? { ok: true, text: "Test alert sent. It should appear in a few seconds." }
          : { ok: false, text: "The test alert couldn't be sent right now. Phone alerts may not be set up on the server yet." },
      );
    } catch {
      setMessage({ ok: false, text: "The test alert couldn't be sent right now. Phone alerts may not be set up on the server yet." });
    } finally {
      setBusy(false);
    }
  }

  return { state, extras, busy, message, turnOn, turnOff, setExtra, sendTest };
}
