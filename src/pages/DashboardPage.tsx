import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import AuthLayout, { Message, outlineButton } from "../components/AuthLayout";
import { supabase } from "../lib/supabase";
import { type CareEvent, useEvents } from "../lib/useEvents";
import { useSession } from "../lib/useSession";

// The family dashboard: is everyone okay, when was the person last seen, and
// the latest alerts from the stand. New alerts show up without reloading.
export default function DashboardPage() {
  const session = useSession();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  async function logOut() {
    setLoggingOut(true);
    setError("");
    // Once the session is gone, the redirect below takes people to the log in page.
    const result = await supabase?.auth.signOut();
    if (result?.error) {
      setLoggingOut(false);
      setError("Sorry, we couldn't log you out. Please check your internet connection and try again.");
    }
  }

  // Not logged in: send people to the log in page.
  if (session === null) return <Navigate to="/login" replace state={loggingOut ? { loggedOut: true } : undefined} />;

  return (
    <AuthLayout title="Your dashboard">
      {session === undefined ? (
        <p className="text-xl text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {location.state?.passwordChanged && <Message kind="success">Your new password is saved.</Message>}
          <div>
            <h1 className="text-4xl font-extrabold">How the day is going</h1>
            <p className="mt-1 break-all text-lg text-muted">Logged in as {session.user.email}</p>
          </div>
          <Alerts />
          {error && <Message kind="error">{error}</Message>}
          <button type="button" onClick={logOut} disabled={loggingOut} className={outlineButton}>
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      )}
    </AuthLayout>
  );
}

function Alerts() {
  const events = useEvents();
  const now = useNow();

  if (events.status === "loading") return <p className="text-xl text-muted">Checking on everyone…</p>;

  if (events.status === "not-set-up")
    return (
      <div className="flex flex-col gap-4">
        <StatusCard tone="waiting" title="No stand connected yet" text="Alerts will show up here once the stand is set up." />
        <p className="rounded-2xl bg-sun p-4 text-lg">
          <strong>For the team:</strong> the alerts table isn't in Supabase yet. Run <code>hardware/supabase.sql</code>{" "}
          in Supabase (SQL Editor → New query → paste → Run).
        </p>
      </div>
    );

  if (events.status === "error")
    return (
      <Message kind="error">
        Sorry, we couldn't load the latest news. Please check your internet connection and reload the page.
      </Message>
    );

  if (events.events.length === 0)
    return (
      <StatusCard
        tone="waiting"
        title="No news yet"
        text="The stand hasn't sent anything yet. Alerts will show up here by themselves."
      />
    );

  // The newest event from each stand tells us how things are right now.
  const latestPerStand = new Map<string, CareEvent>();
  for (const event of events.events) if (!latestPerStand.has(event.device)) latestPerStand.set(event.device, event);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {[...latestPerStand.values()].map((latest) =>
          latest.type === "out_of_sight" ? (
            <StatusCard
              key={latest.device}
              tone="attention"
              title="Needs a look"
              text={`Last seen ${timeAgo(latest.created_at, now)}. Maybe give them a call.`}
              stand={latestPerStand.size > 1 ? latest.device : undefined}
            />
          ) : (
            <StatusCard
              key={latest.device}
              tone="okay"
              title="All okay"
              text={`Last seen ${timeAgo(latest.created_at, now)}.`}
              stand={latestPerStand.size > 1 ? latest.device : undefined}
            />
          ),
        )}
      </div>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="mb-3 text-2xl font-extrabold">
          Recent alerts
        </h2>
        <ul className="flex flex-col gap-3">
          {events.events.map((event) => (
            <li key={event.id} className="flex gap-4 rounded-2xl border-2 border-[#dfe7e3] p-4">
              <span aria-hidden="true" className="text-2xl">
                {event.type === "out_of_sight" ? "🟠" : "🟢"}
              </span>
              <div className="min-w-0">
                <p className="text-lg font-bold">{describe(event.type)}</p>
                {event.message && <p className="text-muted">{event.message}</p>}
                <p className="text-muted">
                  <time dateTime={event.created_at} title={new Date(event.created_at).toLocaleString()}>
                    {timeAgo(event.created_at, now)}
                  </time>
                  {latestPerStand.size > 1 && <> · {event.device}</>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const TONES = {
  okay: { box: "border-leaf bg-mint", icon: "✅" },
  attention: { box: "border-coral bg-peach", icon: "⚠️" },
  waiting: { box: "border-[#dfe7e3] bg-cream", icon: "⏳" },
};

function StatusCard({
  tone,
  title,
  text,
  stand,
}: {
  tone: keyof typeof TONES;
  title: string;
  text: string;
  stand?: string;
}) {
  return (
    <div role="status" className={`flex items-center gap-4 rounded-3xl border-[3px] p-5 ${TONES[tone].box}`}>
      <span aria-hidden="true" className="text-4xl">
        {TONES[tone].icon}
      </span>
      <div className="min-w-0">
        {stand && <p className="break-all font-bold text-muted">{stand}</p>}
        <p className="text-2xl font-extrabold">{title}</p>
        <p className="text-lg">{text}</p>
      </div>
    </div>
  );
}

function describe(type: string) {
  if (type === "out_of_sight") return "Out of view for a while";
  if (type === "back_in_view") return "Back in view";
  return type.replaceAll("_", " ");
}

// "just now", "5 minutes ago", "3 hours ago", or the date for older alerts.
function timeAgo(when: string, now: number) {
  const minutes = Math.round((now - new Date(when).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(when).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// The current time, updated every 30 seconds so "5 minutes ago" stays right.
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
