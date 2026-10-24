import { useEffect, useId, useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { Message } from "../components/AuthLayout";
import { buttonVariants } from "../components/ButtonLink";
import Highlight from "../components/Highlight";
import SiteLayout, { Blobs, LivePill } from "../components/SiteLayout";
import { useLanguage } from "../i18n/useLanguage";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";
import { cleanContacts, cleanPhone, telHref, type Contact, type Contacts } from "../family/contacts";
import { startOfLocalDay, summariseDay } from "../family/dailySummary";
import { describe, summarise, timeAgo, whatHappened, whereInRoom, type EventRow, type Mood } from "../family/status";
import {
  alertType,
  canCheckOn,
  cleanAlertSettings,
  highlightFor,
  spokenEvent,
  spokenStatus,
  whoToSpeakOf,
  type AlertSettings,
} from "../family/alerts";
import { useCheckingOnIt } from "../family/useCheckingOnIt";
import { AlertSettingsPanel, CheckingOnIt, ReadAloudButton, SimpleViewToggle } from "../components/FamilyTools";

// The family page: the latest news from the phone camera in big words, a short
// timeline, and live updates through Supabase Realtime.

const EVENT_COLUMNS = "id, kind, zone, posture, created_at";
const HOW_MANY = 50;
// Today's news for "Today so far" (heartbeats left out, so this is a whole day).
const TODAY_MAX = 1000;

// Dark red that passes WCAG AA contrast on white and on the cream background
// (a lighter red in dark mode, see index.css).
const ERROR_RED = "text-error";

// The "Right now" card looks like the pretend family page on the homepage:
// mint when all is well, red when someone may have fallen, white when quiet.
const moodStyles: Record<Mood, string> = {
  ok: "bg-mint text-ink",
  alert: "bg-alert text-on-brand",
  quiet: "border-[3px] border-lilac bg-surface text-ink",
};

// The coloured dot next to each piece of news.
function dotColour(kind: EventRow["kind"]): string {
  if (kind === "fall") return "bg-alert";
  if (kind === "moving") return "bg-leaf";
  if (kind === "still") return "bg-coral";
  return "bg-brand";
}

const smallButton =
  "inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-surface px-5 text-lg font-extrabold text-brand no-underline transition-all duration-200 hover:-translate-y-0.5 hover:bg-lilac disabled:cursor-not-allowed disabled:opacity-70";

// Saved in this browser only. Private browsing can block saving; the page still works.
const SIMPLE_VIEW_KEY = "carenest-simple-view";
const alertSettingsKey = (userId: string) => `carenest-alert-settings-${userId}`;

function readSaved<T>(key: string, clean: (saved: unknown) => T): T {
  try {
    return clean(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return clean(null);
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Can't save (e.g. private browsing). It just forgets next time.
  }
}

interface Circle {
  id: string;
  name: string;
  owner_id: string;
}

export default function DashboardPage() {
  const session = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const { t } = useLanguage();

  // Not logged in (or Supabase isn't set up): send people to the log in page.
  if (session === null) return <Navigate to="/login" replace state={loggingOut ? { loggedOut: true } : undefined} />;
  if (session === undefined)
    return (
      <Centered>
        <p className="text-xl text-muted">{t("Loading…")}</p>
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
    <SiteLayout title="Family page">
      {/* As tall as the screen, so the footer doesn't jump when the page appears. */}
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
        {children}
      </div>
    </SiteLayout>
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
  const { t } = useLanguage();
  const [logOutError, setLogOutError] = useState("");
  const [circle, setCircle] = useState<Circle | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [todayEvents, setTodayEvents] = useState<EventRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Simple view: only the big status and read aloud, in extra-large text.
  const [simple, setSimpleState] = useState(() => readSaved(SIMPLE_VIEW_KEY, (v) => v === true));
  const [alertSettings, setAlertSettingsState] = useState(() => readSaved(alertSettingsKey(userId), cleanAlertSettings));
  // The name "Read aloud" uses, from the Care profile page (saved in this browser).
  const [savedName] = useState(() => readSaved(careProfileKey(userId), (v) => (v as { name?: unknown } | null)?.name));
  const who = whoToSpeakOf(savedName, t);
  const checking = useCheckingOnIt(circle?.id, userId);

  function setSimple(on: boolean) {
    setSimpleState(on);
    save(SIMPLE_VIEW_KEY, on);
  }

  function setAlertSettings(next: AlertSettings) {
    setAlertSettingsState(next);
    save(alertSettingsKey(userId), next);
  }

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
      db.from("movement_events")
        .select(EVENT_COLUMNS)
        .eq("circle_id", circle!.id)
        .neq("kind", "heartbeat")
        .gte("created_at", new Date(startOfLocalDay(Date.now())).toISOString())
        .order("created_at", { ascending: false })
        .limit(TODAY_MAX)
        .then(({ data, error }) => {
          // The rest of the page still works without it, so no error message here.
          if (cancelled || error) return;
          setTodayEvents((old) => merge(old, (data ?? []) as EventRow[], TODAY_MAX));
        });
    }

    const channel = db
      .channel(`family-${circle.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "movement_events", filter: `circle_id=eq.${circle.id}` },
        (payload) => {
          const row = payload.new as EventRow;
          setEvents((old) => merge(old, [row]));
          if (row.kind !== "heartbeat") setTodayEvents((old) => merge(old, [row], TODAY_MAX));
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
      setLogOutError("Sorry, we couldn't log you out. Please check your internet connection and try again.");
    }
  }

  const summary = summarise(events, now);
  const day = summariseDay(todayEvents, now, { t });
  const { latest } = summary;

  return (
    <SiteLayout title="Family page">
      {/* At least as tall as the screen, so the footer doesn't jump as the news loads in. */}
      <section className="relative isolate min-h-screen px-4 pb-24 pt-6 sm:px-6">
        <Blobs fixed />
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-3 rounded-full bg-surface px-4 py-2 text-base font-extrabold uppercase tracking-wide text-brand shadow-soft">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-leaf" />
                  <span className="relative h-3 w-3 rounded-full bg-leaf" />
                </span>
                {circle?.name ?? t("Your family")}
              </p>
              <h1 className="mt-4 text-4xl font-extrabold md:text-5xl">
                <Highlight text={t("Family *page*")} />
              </h1>
              {!simple && (
                <p className="mt-2 text-lg text-muted">
                  {t("Signed in as")} <strong className="text-ink">{email}</strong>
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <SimpleViewToggle on={simple} onChange={setSimple} />
              <Link to="/help" className={smallButton}>
                {t("Need help?")}
              </Link>
              <Link to="/account" className={smallButton}>
                {t("Your account")}
              </Link>
              <button type="button" onClick={logOut} disabled={loggingOut} className={smallButton}>
                {loggingOut ? t("Logging out…") : t("Log out")}
              </button>
            </div>
          </div>

          {location.state?.passwordChanged && <Message kind="success">{t("Your new password is saved.")}</Message>}
          {logOutError && <Message kind="error">{t(logOutError)}</Message>}

          {problem && (
            <p
              role="alert"
              className={`rounded-2xl border-[3px] border-error bg-surface p-5 text-xl font-bold ${ERROR_RED}`}
            >
              {t(problem)}
            </p>
          )}

          <section
            aria-labelledby="now-title"
            className={`rounded-[32px] p-6 shadow-lift transition-colors duration-500 sm:p-8 ${moodStyles[summary.mood]} ${summary.mood === "alert" ? "animate-shake" : ""}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="now-title" className="text-xl font-extrabold">
                {t("Right now")}
              </h2>
              <LivePill>{live ? t("Live") : t("Connecting…")}</LivePill>
            </div>
            <p
              aria-live="polite"
              className={`mt-3 leading-tight font-black ${simple ? "text-5xl sm:text-6xl" : "text-3xl sm:text-4xl"}`}
            >
              <span key={latest?.id ?? "none"} className="block animate-pop">
                {latest ? describe(latest, now, t) : circle ? t("No news yet") : t("Loading…")}
              </span>
            </p>
            {summary.mood === "alert" && (
              <p className={`mt-4 font-bold ${simple ? "text-3xl" : "text-xl"}`}>
                {t("The phone thinks someone may have fallen. Please call or visit to check they are okay.")}{" "}
                {t("The Call buttons are just below.")}
              </p>
            )}
            {latest && (
              <div className="mt-5">
                <ReadAloudButton text={spokenStatus(summary, who, clock, t)} big={simple} />
              </div>
            )}
            {!simple && latest && canCheckOn(latest) && (
              <div className="mt-4">
                <CheckingOnIt
                  names={checking.whoIsChecking(latest.id)}
                  mine={checking.isMine(latest.id)}
                  busy={checking.isBusy(latest.id)}
                  message={checking.messageFor(latest.id)}
                  onCheck={() => checking.check(latest.id)}
                />
              </div>
            )}
            {summary.phoneSilent && summary.lastHeard && (
              <p className="mt-4 text-xl font-bold">
                {t("The phone last checked in {when}.", { when: timeAgo(summary.lastHeard.created_at, now, t) })}{" "}
                {t('Check that it is switched on, charging, and showing the "Camera on" sign.')}
              </p>
            )}
            {!simple && !latest && circle && (
              <p className="mt-4 text-xl">
                {t("Stand a phone on a table, sign in on it with this account, open")}{" "}
                <Link to="/tracker" className="font-bold text-brand underline">
                  {t("Phone camera")}
                </Link>{" "}
                {t('and press "Start watching". News will appear here by itself.')}
              </p>
            )}
            <p className={`mt-4 font-bold ${simple ? "text-2xl" : "text-lg"}`}>
              {live ? t("This page updates by itself.") : t("Connecting for live updates…")}
            </p>
          </section>

          {/* Call buttons stay in simple view too: they matter most. */}
          <CallCard userId={userId} />

          {!simple && circle && <TodaySoFar lines={day.lines} hasNews={day.hasNews} fallLine={day.fallLine} />}

          {!simple && summary.timeline.length > 0 && (
            <section aria-labelledby="timeline-title">
              <h2 id="timeline-title" className="text-2xl font-extrabold">
                {t("Recent news")}
              </h2>
              <ol className="mt-4 flex flex-col gap-3">
                {summary.timeline.map((e) => {
                  const look = highlightFor(e, alertSettings);
                  return (
                    <li
                      key={e.id}
                      className={`flex animate-slide-in flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-5 py-4 shadow-soft ${look === "highlight" ? "border-[3px] border-alert bg-peach" : "bg-surface"}`}
                    >
                      <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded-full ${dotColour(e.kind)}`} />
                      <span className="flex-1 text-xl font-bold">
                        {look === "highlight" && <span className="sr-only">{t("Needs a look:")} </span>}
                        {whatHappened(e, t)}
                        {e.kind !== "nobody" && whereInRoom(e.zone) ? ` - ${whereInRoom(e.zone, t)}` : ""}
                        {look === "quiet" && (
                          <span className="block text-lg font-bold text-muted">{t("During quiet hours")}</span>
                        )}
                      </span>
                      <span className="text-lg font-bold text-muted">{clock(e.created_at)}</span>
                      {alertType(e) && (
                        <div className="flex basis-full flex-wrap items-center gap-3">
                          <ReadAloudButton text={spokenEvent(e, clock, t)} />
                          {canCheckOn(e) && (
                            <CheckingOnIt
                              names={checking.whoIsChecking(e.id)}
                              mine={checking.isMine(e.id)}
                              busy={checking.isBusy(e.id)}
                              message={checking.messageFor(e.id)}
                              onCheck={() => checking.check(e.id)}
                            />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {!simple && <AlertSettingsPanel settings={alertSettings} onChange={setAlertSettings} />}

          {!simple && circle && circle.owner_id === userId && <AddFamily circleId={circle.id} />}
        </div>
      </section>
    </SiteLayout>
  );
}

/** Adds new events to the list without duplicates, newest first, keeping it short. */
function merge(old: EventRow[], incoming: EventRow[], keep = HOW_MANY): EventRow[] {
  const byId = new Map(old.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id).slice(0, keep);
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
  const { t } = useLanguage();

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
    <section aria-labelledby={`${id}-title`} className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <h2 id={`${id}-title`} className="text-3xl font-extrabold">
        <Highlight text={t("Everyone in the *loop*")} />
      </h2>
      <p className="mt-1 text-xl font-extrabold">{t("Add a family member")}</p>
      <p className="mt-2 text-lg text-muted">{t("They need their own CareNest account first. Then type their email here.")}</p>
      <form onSubmit={add} className="mt-4 flex flex-col gap-3">
        <label htmlFor={`${id}-email`} className="text-xl font-extrabold">
          {t("Their email")}
        </label>
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-14 w-full rounded-2xl border-[3px] border-muted bg-surface px-5 text-xl text-ink transition-colors hover:border-brand focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy}
          className={`${buttonVariants.primary} mt-2 text-xl disabled:opacity-70`}
        >
          {busy ? t("Adding…") : t("Add to family")}
        </button>
        {message && (
          <p role="status" className={`text-lg font-bold ${message.ok ? "text-leaf" : ERROR_RED}`}>
            {t(message.text)}
          </p>
        )}
      </form>
    </section>
  );
}

/** A calm, plain-words summary of today, from the same news as the timeline. */
function TodaySoFar({ lines, hasNews, fallLine }: { lines: string[]; hasNews: boolean; fallLine: string | null }) {
  const { t } = useLanguage();
  return (
    <section aria-labelledby="today-title" className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <h2 id="today-title" className="text-2xl font-extrabold">
        <Highlight text={t("Today so *far*")} />
      </h2>
      {hasNews ? (
        <ul className="mt-4 flex flex-col gap-3">
          {lines.map((line) => (
            <li
              key={line}
              className={`flex items-start gap-3 text-xl font-bold ${line === fallLine ? ERROR_RED : ""}`}
            >
              <span aria-hidden="true" className="mt-2.5 h-3 w-3 shrink-0 rounded-full bg-brand" />
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xl text-muted">
          {t(
            "Nothing from the phone camera yet today. A short summary of the day will build up here once it starts watching.",
          )}
        </p>
      )}
    </section>
  );
}

// The Call numbers are saved in this browser, one set per account.
const contactsKey = (userId: string) => `carenest-call-numbers-${userId}`;
// The Care profile page saves the person's name under this key (see CareProfilePage.tsx).
const careProfileKey = (userId: string) => `carenest-care-profile-${userId}`;

function loadContacts(userId: string): Contacts {
  try {
    return cleanContacts(JSON.parse(localStorage.getItem(contactsKey(userId)) ?? "{}"));
  } catch {
    return {};
  }
}

function saveContacts(userId: string, contacts: Contacts) {
  try {
    localStorage.setItem(contactsKey(userId), JSON.stringify(contacts));
  } catch {
    // Private browsing can block saving. The buttons still work until the page closes.
  }
}

/** The name given on the Care profile page, if any, like "Mum". */
function careProfileName(userId: string): string {
  try {
    const name = JSON.parse(localStorage.getItem(careProfileKey(userId)) ?? "{}")?.name;
    return typeof name === "string" ? name.trim() : "";
  } catch {
    return "";
  }
}

function PhoneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Big one-tap "Call" buttons: the person being cared for, and an emergency contact. */
function CallCard({ userId }: { userId: string }) {
  const id = useId();
  const [contacts, setContacts] = useState(() => loadContacts(userId));
  const [editing, setEditing] = useState(false);
  const { t } = useLanguage();
  const hasAny = Boolean(contacts.person || contacts.emergency);

  function save(next: Contacts) {
    setContacts(next);
    saveContacts(userId, next);
    setEditing(false);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-2xl font-extrabold">
          {t("Call")}
        </h2>
        {hasAny && !editing && (
          <button type="button" onClick={() => setEditing(true)} className={smallButton}>
            {t("Change numbers")}
          </button>
        )}
      </div>

      {editing ? (
        <ContactsForm
          initial={contacts}
          suggestedName={careProfileName(userId)}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : hasAny ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {contacts.person && <CallLink contact={contacts.person} fallback="them" primary />}
          {contacts.emergency && <CallLink contact={contacts.emergency} fallback="emergency contact" />}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-xl text-muted">
            {t("Add a phone number, so you can ring them (or an emergency contact) with one tap from this page.")}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`${buttonVariants.primary} mt-4 w-full text-xl sm:w-auto`}
          >
            {t("Add a phone number")}
          </button>
        </div>
      )}
    </section>
  );
}

function CallLink({ contact, fallback, primary = false }: { contact: Contact; fallback: string; primary?: boolean }) {
  const { t } = useLanguage();
  return (
    <a
      href={telHref(contact.phone)}
      className={`${primary ? buttonVariants.primary : buttonVariants.outline} flex-1 flex-col gap-0 py-3 text-xl`}
    >
      <span className="flex items-center gap-2">
        <PhoneIcon />
        {t("Call {name}", { name: contact.name || t(fallback) })}
      </span>
      <span className={`text-base font-bold ${primary ? "text-on-brand" : "text-muted"}`}>{contact.phone}</span>
    </a>
  );
}

function ContactsForm({
  initial,
  suggestedName,
  onSave,
  onCancel,
}: {
  initial: Contacts;
  suggestedName: string;
  onSave: (contacts: Contacts) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [personName, setPersonName] = useState(initial.person?.name ?? suggestedName);
  const [personPhone, setPersonPhone] = useState(initial.person?.phone ?? "");
  const [emergencyName, setEmergencyName] = useState(initial.emergency?.name ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(initial.emergency?.phone ?? "");
  const [error, setError] = useState("");
  const { t } = useLanguage();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const bad = [personPhone, emergencyPhone].some((p) => p.trim() && !cleanPhone(p));
    if (bad) return setError("That doesn't look like a phone number. Please use only numbers, spaces and a + sign.");
    const next: Contacts = {};
    if (personPhone.trim()) next.person = { name: personName.trim(), phone: cleanPhone(personPhone) };
    if (emergencyPhone.trim()) next.emergency = { name: emergencyName.trim(), phone: cleanPhone(emergencyPhone) };
    onSave(next);
  }

  const input =
    "min-h-14 w-full rounded-2xl border-[3px] border-muted bg-surface px-5 text-xl text-ink transition-colors hover:border-brand focus:border-brand";

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-5" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xl font-extrabold">{t("The person you care for")}</legend>
        <label htmlFor={`${id}-pname`} className="mt-1 text-lg font-bold">
          {t("Their name")}
        </label>
        <input
          id={`${id}-pname`}
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          placeholder={t("For example: Mum")}
          className={input}
        />
        <label htmlFor={`${id}-pphone`} className="text-lg font-bold">
          {t("Their phone number")}
        </label>
        <input
          id={`${id}-pphone`}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={personPhone}
          onChange={(e) => setPersonPhone(e.target.value)}
          className={input}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xl font-extrabold">{t("Emergency contact (optional)")}</legend>
        <label htmlFor={`${id}-ename`} className="mt-1 text-lg font-bold">
          {t("Name")}
        </label>
        <input
          id={`${id}-ename`}
          value={emergencyName}
          onChange={(e) => setEmergencyName(e.target.value)}
          placeholder={t("For example: Neighbour Sam")}
          className={input}
        />
        <label htmlFor={`${id}-ephone`} className="text-lg font-bold">
          {t("Phone number")}
        </label>
        <input
          id={`${id}-ephone`}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={emergencyPhone}
          onChange={(e) => setEmergencyPhone(e.target.value)}
          className={input}
        />
      </fieldset>
      {error && (
        <p role="alert" className={`text-lg font-bold ${ERROR_RED}`}>
          {t(error)}
        </p>
      )}
      <p className="text-base text-muted">
        {t("Saved in this browser only. To remove a number, clear the box and save.")}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" className={`${buttonVariants.primary} text-xl`}>
          {t("Save numbers")}
        </button>
        <button type="button" onClick={onCancel} className={`${buttonVariants.outline} text-xl`}>
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
