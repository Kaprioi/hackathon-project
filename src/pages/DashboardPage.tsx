import { useEffect, useId, useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { ERROR_RED, Message } from "../components/AuthLayout";
import { primaryButton, textLink } from "../components/ButtonLink";
import { inputBox } from "../components/FormFields";
import { Footer, SkipLink, Wordmark } from "../components/SiteLayout";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";
import { describe, summarise, timeAgo, whatHappened, whereInRoom, type EventRow, type Mood } from "../family/status";

// The family page: the latest news from the phone camera in big words, a short
// timeline, and live updates through Supabase Realtime.

const EVENT_COLUMNS = "id, kind, zone, posture, created_at";
const HOW_MANY = 50;

// How the "Right now" block looks for each mood: a plain rule when all is well,
// a pale red notice for a possible fall, amber words when the phone is quiet.
const moodStyles: Record<Mood, { box: string; square: string; label: string; words: string }> = {
  ok: { box: "border-t-2 border-ink pt-6", square: "bg-ok", label: "text-ok", words: "No alerts" },
  alert: {
    box: "border-t-4 border-alert bg-alert-tint p-6",
    square: "bg-alert",
    label: "text-alert",
    words: "Please check on them",
  },
  quiet: { box: "border-t-2 border-ink pt-6", square: "bg-amber", label: "text-amber", words: "No news from the phone" },
};

interface Circle {
  id: string;
  name: string;
  owner_id: string;
}

export default function DashboardPage() {
  const session = useSession();
  const [loggingOut, setLoggingOut] = useState(false);

  // Not logged in (or Supabase isn't set up): send people to the log in page.
  if (session === null) return <Navigate to="/login" replace state={loggingOut ? { loggedOut: true } : undefined} />;
  if (session === undefined)
    return (
      <Centered>
        <p className="text-lead text-muted">Loading…</p>
      </Centered>
    );
  return (
    <Family
      userId={session.user.id}
      email={session.user.email ?? ""}
      loggingOut={loggingOut}
      setLoggingOut={setLoggingOut}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-6 px-4 sm:px-6">
      {children}
    </main>
  );
}

function Family({
  userId,
  email,
  loggingOut,
  setLoggingOut,
}: {
  userId: string;
  email: string;
  loggingOut: boolean;
  setLoggingOut: (value: boolean) => void;
}) {
  const location = useLocation();
  const [logOutError, setLogOutError] = useState("");
  const [circle, setCircle] = useState<Circle | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Name the browser tab after the page, like the log in pages do.
  useEffect(() => {
    const previous = document.title;
    document.title = "Family page — CareNest";
    return () => {
      document.title = previous;
    };
  }, []);

  // Refresh "2 minutes ago" every 20 seconds.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  // Find the care circle: the one with the newest news (so family members see the
  // circle they were added to), otherwise the one you own.
  useEffect(() => {
    let cancelled = false;
    const db = supabase!;
    Promise.all([
      db.from("care_circles").select("id, name, owner_id").order("created_at", { ascending: true }),
      db.from("movement_events").select("circle_id").order("created_at", { ascending: false }).limit(1),
    ]).then(([circles, newest]) => {
      if (cancelled) return;
      if (circles.error || newest.error)
        return setProblem("We couldn't reach the database. Please check your internet and reload the page.");
      const data = circles.data ?? [];
      const withNews = data.find((c) => c.id === newest.data?.[0]?.circle_id);
      const chosen = withNews ?? data.find((c) => c.owner_id === userId) ?? data[0];
      if (!chosen) return setProblem("Your account has no care circle yet. Has the database been set up? See the README.");
      setCircle(chosen as Circle);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Load the latest events, then listen for new ones as they arrive.
  useEffect(() => {
    if (!circle) return;
    const db = supabase!;
    let cancelled = false;

    function load() {
      db.from("movement_events")
        .select(EVENT_COLUMNS)
        .eq("circle_id", circle!.id)
        .order("created_at", { ascending: false })
        .limit(HOW_MANY)
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) return setProblem("We couldn't load the latest news. Please reload the page.");
          setProblem(null);
          setEvents((old) => merge(old, (data ?? []) as EventRow[]));
        });
    }

    const channel = db
      .channel(`family-${circle.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "movement_events", filter: `circle_id=eq.${circle.id}` },
        (payload) => {
          setEvents((old) => merge(old, [payload.new as EventRow]));
          setNow(Date.now());
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        setLive(status === "SUBSCRIBED");
        // (Re)load whenever we (re)connect, so nothing sent while offline is missed.
        if (status === "SUBSCRIBED") load();
      });

    load();
    return () => {
      cancelled = true;
      db.removeChannel(channel);
    };
  }, [circle]);

  async function logOut() {
    setLoggingOut(true);
    setLogOutError("");
    // Once the session is gone, DashboardPage takes people to the log in page.
    const { error } = await supabase!.auth.signOut();
    if (error) {
      setLoggingOut(false);
      setLogOutError("Sorry, we couldn't sign you out. Please check your internet connection and try again.");
    }
  }

  const summary = summarise(events, now);
  const { latest } = summary;
  const mood = moodStyles[summary.mood];

  return (
    <>
      <SkipLink />
      <header className="border-b-2 border-ink">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 sm:px-6"
        >
          <Wordmark />
          <div className="ml-auto flex flex-wrap items-center gap-x-6">
            <Link to="/tracker" className={textLink}>
              Phone camera
            </Link>
            <button type="button" onClick={logOut} disabled={loggingOut} className={textLink}>
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </nav>
      </header>

      <main id="main" className="mx-auto grid max-w-6xl gap-12 px-4 pt-10 sm:px-6 md:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-8 md:col-span-8">
          <div>
            <h1 className="text-h1 md:text-h1-lg">Family page</h1>
            <p className="mt-2 text-muted">
              {circle ? `${circle.name} · ` : ""}signed in as <strong className="break-all text-ink">{email}</strong>
            </p>
          </div>

          {location.state?.passwordChanged && <Message kind="success">Your new password is saved.</Message>}
          {logOutError && <Message kind="error">{logOutError}</Message>}

          {problem && (
            <p role="alert" className={`border-l-4 border-alert bg-alert-tint p-5 font-bold ${ERROR_RED}`}>
              {problem}
            </p>
          )}

          <section aria-labelledby="now-title" className={mood.box}>
            <h2 id="now-title" className="text-h3">
              Right now
            </h2>
            <p className={`mt-3 flex items-center gap-3 font-bold ${mood.label}`}>
              <span aria-hidden="true" className={`inline-block h-3 w-3 shrink-0 ${mood.square}`} />
              {mood.words}
            </p>
            <p aria-live="polite" className="mt-2 font-serif text-h2 leading-tight font-semibold">
              {latest ? describe(latest, now) : circle ? "No news yet" : "Loading…"}
            </p>
            {summary.mood === "alert" && (
              <p className={`mt-4 text-lead font-bold ${ERROR_RED}`}>
                The phone thinks someone may have fallen. Please call or visit to check they are okay.
              </p>
            )}
            {summary.phoneSilent && summary.lastHeard && (
              <p className="mt-4 text-lead font-bold">
                The phone last checked in {timeAgo(summary.lastHeard.created_at, now)}.
                Check that it is switched on, charging, and showing the "Camera on" sign.
              </p>
            )}
            {!latest && circle && (
              <p className="mt-4">
                Stand a phone on a table, sign in on it with this account, open{" "}
                <Link to="/tracker">Phone camera</Link> and press "Start watching". News will appear here by itself.
              </p>
            )}
          </section>

          {summary.timeline.length > 0 && (
            <section aria-labelledby="timeline-title">
              <h2 id="timeline-title" className="text-h2">
                Recent news
              </h2>
              <ol className="mt-4 border-t border-rule">
                {summary.timeline.map((e) => (
                  <li key={e.id} className="grid grid-cols-[6rem_1fr] gap-4 border-b border-rule py-3">
                    <span className="font-serif text-lead font-semibold tabular-nums">{clock(e.created_at)}</span>
                    <span>
                      {whatHappened(e)}
                      {e.kind !== "nobody" && whereInRoom(e.zone) ? ` - ${whereInRoom(e.zone)}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-10 md:col-span-4" aria-label="About this page">
          <section aria-labelledby="phone-title" className="border-t border-rule pt-6">
            <h2 id="phone-title" className="text-h3">
              The phone
            </h2>
            <dl className="mt-3 flex flex-col gap-2">
              <div>
                <dt className="inline font-bold">Live updates: </dt>
                <dd className="inline">{live ? "on, this page updates by itself" : "connecting…"}</dd>
              </div>
              {summary.lastHeard && (
                <div>
                  <dt className="inline font-bold">Last checked in: </dt>
                  <dd className="inline">{timeAgo(summary.lastHeard.created_at, now)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-muted">
              The camera picture stays on the phone. Only short notes like “moving around, left side” come here.
            </p>
          </section>

          {circle && circle.owner_id === userId && <AddFamily circleId={circle.id} />}
        </aside>
      </main>
      <Footer />
    </>
  );
}

/** Adds new events to the list without duplicates, newest first, keeping it short. */
function merge(old: EventRow[], incoming: EventRow[]): EventRow[] {
  const byId = new Map(old.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id).slice(0, HOW_MANY);
}

/** "14:05" in the viewer's own time. */
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AddFamily({ circleId }: { circleId: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase!.rpc("add_family_member", { target_circle: circleId, member_email: email });
    setBusy(false);
    if (error) setMessage({ ok: false, text: "Sorry, that didn't work. Please try again." });
    else {
      setMessage({ ok: true, text: "If that person has a CareNest account, they can now see this family page." });
      setEmail("");
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="border-t border-rule pt-6">
      <h2 id={`${id}-title`} className="text-h3">
        Add a family member
      </h2>
      <p className="mt-2 text-muted">They need their own CareNest account first. Then type their email here.</p>
      <form onSubmit={add} className="mt-4 flex flex-col items-start gap-3">
        <label htmlFor={`${id}-email`} className="font-bold">
          Their email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${inputBox} border-ink`}
        />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Adding…" : "Add to family"}
        </button>
        {message && (
          <p role="status" className={`font-bold ${message.ok ? "text-ok" : ERROR_RED}`}>
            {message.text}
          </p>
        )}
      </form>
    </section>
  );
}
