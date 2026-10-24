import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Session } from "@supabase/supabase-js";
import ButtonLink from "../components/ButtonLink";
import { supabase } from "../lib/supabase";
import { describe, summarise, timeAgo, whatHappened, whereInRoom, type EventRow, type Mood } from "../family/status";

// The family page: the latest news from the phone camera in big words, a short
// timeline, and live updates through Supabase Realtime.

const EVENT_COLUMNS = "id, kind, zone, posture, created_at";
const HOW_MANY = 50;

// Dark red that passes WCAG AA contrast on white and on the cream background.
const ERROR_RED = "text-[#a61b1b]";

const moodStyles: Record<Mood, string> = {
  ok: "border-leaf bg-mint",
  alert: "border-[#a61b1b] bg-peach",
  quiet: "border-muted bg-white",
};

const smallButton =
  "inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-white px-5 text-lg font-extrabold text-brand transition-colors hover:bg-lilac";

interface Circle {
  id: string;
  name: string;
  owner_id: string;
}

export default function DashboardPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = still checking

  useEffect(() => {
    if (!supabase) return setSession(null);
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Centered><p className="text-xl text-muted">Loading…</p></Centered>;
  if (!supabase)
    return (
      <Centered>
        <h1 className="text-4xl font-extrabold">The family page isn't set up yet</h1>
        <p className="text-xl text-muted">The website needs its Supabase keys first. See "Run the app" in the README.</p>
        <ButtonLink to="/">Back to About Us</ButtonLink>
      </Centered>
    );
  if (!session)
    return (
      <Centered>
        <h1 className="text-4xl font-extrabold">Please sign in first</h1>
        <p className="text-xl text-muted">You need to sign in to see how your family is doing.</p>
        <ButtonLink to="/login">Go to sign in</ButtonLink>
      </Centered>
    );
  return <Family userId={session.user.id} email={session.user.email ?? ""} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      {children}
    </main>
  );
}

function Family({ userId, email }: { userId: string; email: string }) {
  const navigate = useNavigate();
  const [circle, setCircle] = useState<Circle | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Refresh "2 minutes ago" every 20 seconds.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  // Find the care circle: the one you own first, otherwise the first one you were added to.
  useEffect(() => {
    let cancelled = false;
    supabase!
      .from("care_circles")
      .select("id, name, owner_id")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) return setProblem("We couldn't reach the database. Please check your internet and reload the page.");
        const mine = data?.find((c) => c.owner_id === userId) ?? data?.[0];
        if (!mine) return setProblem("Your account has no care circle yet. Has the database been set up? See the README.");
        setCircle(mine as Circle);
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

  async function signOut() {
    await supabase!.auth.signOut();
    navigate("/");
  }

  const summary = summarise(events, now);
  const { latest } = summary;

  return (
    <div className="min-h-screen">
      <header className="border-b-[3px] border-lilac bg-white">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="inline-flex min-h-12 items-center text-2xl font-extrabold text-brand no-underline">
            CareNest
          </Link>
          <div className="flex flex-wrap gap-3">
            <Link to="/tracker" className={smallButton}>
              Phone camera
            </Link>
            <button type="button" onClick={signOut} className={smallButton}>
              Sign out
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
        <div>
          <h1 className="text-4xl font-extrabold">Family page</h1>
          <p className="text-lg text-muted">
            Signed in as <strong className="text-ink">{email}</strong>
          </p>
        </div>

        {problem && (
          <p role="alert" className={`rounded-2xl border-[3px] border-[#a61b1b] bg-white p-5 text-xl font-bold ${ERROR_RED}`}>
            {problem}
          </p>
        )}

        <section aria-labelledby="now-title" className={`rounded-3xl border-[3px] p-6 ${moodStyles[summary.mood]}`}>
          <h2 id="now-title" className="text-xl font-extrabold text-muted">
            Right now
          </h2>
          <p aria-live="polite" className="mt-2 text-3xl leading-tight font-extrabold sm:text-4xl">
            {latest ? describe(latest, now) : circle ? "No news yet" : "Loading…"}
          </p>
          {summary.mood === "alert" && (
            <p className={`mt-4 text-xl font-bold ${ERROR_RED}`}>
              The phone thinks someone may have fallen. Please call or visit to check they are okay.
            </p>
          )}
          {summary.phoneSilent && summary.lastHeard && (
            <p className="mt-4 text-xl font-bold">
              The phone last checked in {timeAgo(summary.lastHeard.created_at, now)}.
              Check that it is switched on, charging, and showing the "Camera on" sign.
            </p>
          )}
          {!latest && circle && (
            <p className="mt-4 text-xl">
              Stand a phone on a table, sign in on it with this account, open{" "}
              <Link to="/tracker" className="font-bold text-brand underline">
                Phone camera
              </Link>{" "}
              and press "Start watching". News will appear here by itself.
            </p>
          )}
          <p className="mt-4 text-lg text-muted">
            {live ? "This page updates by itself." : "Connecting for live updates…"}
          </p>
        </section>

        {summary.timeline.length > 0 && (
          <section aria-labelledby="timeline-title">
            <h2 id="timeline-title" className="text-2xl font-extrabold">
              Recent news
            </h2>
            <ol className="mt-4 flex flex-col gap-3">
              {summary.timeline.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 rounded-2xl border-[3px] border-lilac bg-white px-5 py-3">
                  <span className="min-w-20 text-xl font-extrabold text-brand">{clock(e.created_at)}</span>
                  <span className="text-xl">
                    {whatHappened(e)}
                    {e.kind !== "nobody" && whereInRoom(e.zone) ? ` - ${whereInRoom(e.zone)}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {circle && circle.owner_id === userId && <AddFamily circleId={circle.id} />}
      </main>
    </div>
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
    const { data, error } = await supabase!.rpc("add_family_member", { target_circle: circleId, member_email: email });
    setBusy(false);
    if (error) setMessage({ ok: false, text: "Sorry, that didn't work. Please try again." });
    else if (!data)
      setMessage({ ok: false, text: "We couldn't find an account with that email. Ask them to create one on the Sign in page first." });
    else {
      setMessage({ ok: true, text: `Done! ${email} can now see this family page.` });
      setEmail("");
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-3xl border-[3px] border-lilac bg-white p-6">
      <h2 id={`${id}-title`} className="text-2xl font-extrabold">
        Add a family member
      </h2>
      <p className="mt-2 text-lg text-muted">They need their own CareNest account first. Then type their email here.</p>
      <form onSubmit={add} className="mt-4 flex flex-col gap-3">
        <label htmlFor={`${id}-email`} className="text-xl font-extrabold">
          Their email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-14 w-full rounded-2xl border-[3px] border-muted bg-white px-5 text-xl text-ink"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-14 items-center justify-center rounded-2xl border-[3px] border-brand bg-brand px-7 text-xl font-extrabold text-white shadow-[0_6px_0_var(--color-brand-dark)] hover:bg-brand-dark disabled:opacity-70"
        >
          {busy ? "Adding…" : "Add to family"}
        </button>
        {message && (
          <p role="status" className={`text-lg font-bold ${message.ok ? "text-leaf" : ERROR_RED}`}>
            {message.text}
          </p>
        )}
      </form>
    </section>
  );
}
