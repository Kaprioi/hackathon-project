import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router";
import Highlight from "../components/Highlight";
import SiteLayout, { Blobs } from "../components/SiteLayout";
import { ReadAloudButton } from "../components/FamilyTools";
import { whoToSpeakOf } from "../family/alerts";
import { cleanAnswers } from "../family/careProfile";
import type { EventRow } from "../family/status";
import {
  dayStarts,
  duration,
  exampleEvents,
  nightFrom,
  nightWords,
  spokenWeek,
  weeklyReport,
  type DayReport,
  type WeekReport,
} from "../family/weeklyReport";
import { LANGUAGES, type Translate } from "../i18n/translate";
import { useLanguage } from "../i18n/useLanguage";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";

// The "This week" report: the last 7 days from the phone camera as two simple
// charts (moving around each day, and when in the day they are up and about),
// a few numbers, and plain words comparing with the week before.
// The sums are worked out in src/family/weeklyReport.ts.

const EVENT_COLUMNS = "id, kind, zone, posture, created_at";
// Supabase sends at most 1000 rows at a time, so a week of heartbeats comes in pages.
const PAGE = 1000;
// A whole week of watching with a heartbeat every 30 seconds is about 20 pages.
const MAX_PAGES = 25;

const smallButton =
  "inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-surface px-5 text-lg font-extrabold text-brand no-underline transition-all duration-200 hover:-translate-y-0.5 hover:bg-lilac";

export default function ReportPage() {
  const session = useSession();
  const { t } = useLanguage();
  // Not logged in (or Supabase isn't set up): send people to the log in page, like the family page.
  if (session === null) return <Navigate to="/login" replace />;
  if (session === undefined)
    return (
      <SiteLayout title="This week">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
          <p className="text-xl text-muted">{t("Loading…")}</p>
        </div>
      </SiteLayout>
    );
  return <Report key={session.user.id} userId={session.user.id} />;
}

/** The Care profile answers saved in this browser (see CareProfilePage.tsx). */
function careProfile(userId: string) {
  try {
    return cleanAnswers(JSON.parse(localStorage.getItem(`carenest-care-profile-${userId}`) ?? "{}"));
  } catch {
    return {};
  }
}

type Rows = PromiseLike<{ data: unknown[] | null; error: unknown; count?: number | null }>;

/** Every row a query matches, a page at a time (all pages asked for at once). */
async function allPages(count: () => Rows, page: (from: number, to: number) => Rows): Promise<EventRow[] | null> {
  const head = await count();
  if (head.error) return null;
  const pages = Math.min(MAX_PAGES, Math.ceil((head.count ?? 0) / PAGE));
  const results = await Promise.all(Array.from({ length: pages }, (_, i) => page(i * PAGE, i * PAGE + PAGE - 1)));
  if (results.some((r) => r.error)) return null;
  return results.flatMap((r) => (r.data ?? []) as EventRow[]);
}

function Report({ userId }: { userId: string }) {
  const { lang, t } = useLanguage();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [example, setExample] = useState(false);
  // Worked out once when the page opens, so the charts don't shift while you read them.
  const [now] = useState(() => Date.now());
  const profile = useMemo(() => careProfile(userId), [userId]);
  const night = nightFrom(profile.bed, profile.wake);
  const fromProfile = Boolean(profile.bed && profile.wake);
  const who = whoToSpeakOf(profile.name, t);
  const hasName = typeof profile.name === "string" && profile.name.trim() !== "";

  // Find the care circle the same way the family page does, then load two weeks of news:
  // everything from this week (heartbeats too, for the camera-off time), and last
  // week without heartbeats (for the comparison).
  useEffect(() => {
    let cancelled = false;
    const db = supabase;
    if (!db) return;
    const starts = dayStarts(now, 14);
    const lastWeekStart = new Date(starts[0]).toISOString();
    const weekStart = new Date(starts[7]).toISOString();
    (async () => {
      const [circles, newest] = await Promise.all([
        db.from("care_circles").select("id, name, owner_id").order("created_at", { ascending: true }),
        db.from("movement_events").select("circle_id").order("created_at", { ascending: false }).limit(1),
      ]);
      if (cancelled) return;
      if (circles.error || newest.error)
        return setProblem("We couldn't reach the database. Please check your internet and reload the page.");
      const data = circles.data ?? [];
      const circle =
        data.find((c) => c.id === newest.data?.[0]?.circle_id) ?? data.find((c) => c.owner_id === userId) ?? data[0];
      if (!circle) return setEvents([]);
      const counted = () =>
        db.from("movement_events").select("id", { count: "exact", head: true }).eq("circle_id", circle.id);
      const rows = () => db.from("movement_events").select(EVENT_COLUMNS).eq("circle_id", circle.id);
      const [thisWeek, lastWeek] = await Promise.all([
        allPages(
          () => counted().gte("created_at", weekStart),
          (from, to) => rows().gte("created_at", weekStart).order("created_at", { ascending: false }).order("id").range(from, to),
        ),
        allPages(
          () => counted().gte("created_at", lastWeekStart).lt("created_at", weekStart).neq("kind", "heartbeat"),
          (from, to) =>
            rows()
              .gte("created_at", lastWeekStart)
              .lt("created_at", weekStart)
              .neq("kind", "heartbeat")
              .order("created_at", { ascending: false })
              .order("id")
              .range(from, to),
        ),
      ]);
      if (cancelled) return;
      if (!thisWeek || !lastWeek) return setProblem("We couldn't load this week's news. Please reload the page.");
      setEvents([...thisWeek, ...lastWeek]);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, now]);

  const shown = useMemo(() => (example ? exampleEvents(now) : events), [example, events, now]);
  const report = useMemo(() => (shown ? weeklyReport(shown, now, { t, night }) : null), [shown, now, t, night.from, night.to]);
  const htmlLang = LANGUAGES.find((l) => l.code === lang)?.htmlLang ?? "en";
  const dayName = (d: DayReport, style: "short" | "long") =>
    d.start === report?.days.at(-1)?.start ? t("Today") : new Date(d.start).toLocaleDateString(htmlLang, { weekday: style });

  return (
    <SiteLayout title="This week">
      <section className="relative isolate min-h-screen px-4 pb-24 pt-6 sm:px-6">
        <Blobs fixed />
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-extrabold md:text-5xl">
                <Highlight text={t("This *week*")} />
              </h1>
              <p className="mt-2 text-xl text-muted">
                {hasName
                  ? t("The last 7 days from the phone camera, for {who}.", { who })
                  : t("The last 7 days from the phone camera.")}
              </p>
            </div>
            <Link to="/dashboard" className={smallButton}>
              {t("Back to the family page")}
            </Link>
          </div>

          <ExampleSwitch on={example} onChange={setExample} />
          {example && (
            <p role="status" className="rounded-2xl bg-sun px-5 py-4 text-xl font-bold text-ink">
              {t("This is a pretend week, so you can see how the report looks. Switch it off to see the real one.")}
            </p>
          )}

          {problem && !example && (
            <p role="alert" className="rounded-2xl border-[3px] border-error bg-surface p-5 text-xl font-bold text-error">
              {t(problem)}
            </p>
          )}

          {!report && !problem && !example && <p className="text-xl text-muted">{t("Loading this week's news…")}</p>}

          {report && !report.hasEnough && (
            <section className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
              <h2 className="text-2xl font-extrabold">{t("Not enough news yet")}</h2>
              <p className="mt-3 text-xl">
                {t("The report fills in once the phone camera has been watching for a day or so.")}{" "}
                {t("Press \"Show example week\" above to see what it will look like.")}
              </p>
            </section>
          )}

          {report?.hasEnough && (
            <>
              <Summary report={report} spoken={spokenWeek(report, who, t)} />
              <Numbers report={report} night={nightWords(night, t)} fromProfile={fromProfile} />
              <ActivityChart report={report} dayName={dayName} />
              <HeatStrip report={report} dayName={dayName} htmlLang={htmlLang} />
            </>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}

function ExampleSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="inline-flex min-h-12 items-center gap-3 self-start rounded-2xl border-[3px] border-brand bg-surface px-4 text-lg font-extrabold text-brand transition-colors hover:bg-lilac"
    >
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full border-[3px] border-brand transition-colors ${on ? "bg-brand" : "bg-surface"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${on ? "left-6 bg-on-brand" : "left-0.5 bg-brand"}`}
        />
      </span>
      {t("Show example week")}
    </button>
  );
}

function Summary({ report, spoken }: { report: WeekReport; spoken: string }) {
  const { t } = useLanguage();
  return (
    <section aria-labelledby="week-summary" className="rounded-[32px] bg-surface p-6 shadow-lift sm:p-8">
      <h2 id="week-summary" className="text-2xl font-extrabold">
        {t("How the week went")}
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {report.lines.map((line) => (
          <li key={line} className={`flex items-start gap-3 text-xl font-bold ${line === report.fallLine ? "text-error" : ""}`}>
            <span aria-hidden="true" className="mt-2.5 h-3 w-3 shrink-0 rounded-full bg-brand" />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <ReadAloudButton text={spoken} label="Read the week aloud" stopLabel="Stop" />
      </div>
    </section>
  );
}

function Numbers({ report, night, fromProfile }: { report: WeekReport; night: string; fromProfile: boolean }) {
  const { t } = useLanguage();
  const w = report.thisWeek;
  const tiles: { label: string; value: string; note?: string; alert?: boolean }[] = [
    { label: t("Moving around"), value: duration(w.activeMinutes, t), note: t("A rough guess from the camera") },
    {
      label: t("Night-time trips"),
      value: String(w.nightTrips),
      note: fromProfile ? t("At night: {hours} (from the Care profile)", { hours: night }) : t("At night: {hours}", { hours: night }),
    },
    { label: t("Possible falls"), value: String(w.falls), alert: w.falls > 0 },
    { label: t("Camera off"), value: duration(w.cameraOffMinutes, t) },
  ];
  return (
    <section aria-labelledby="week-numbers">
      <h2 id="week-numbers" className="sr-only">
        {t("This week in numbers")}
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <li
            key={tile.label}
            className={`rounded-3xl p-5 shadow-soft ${tile.alert ? "border-[3px] border-alert bg-peach" : "bg-surface"}`}
          >
            <p className="text-lg font-bold text-muted">{tile.label}</p>
            <p className={`mt-1 text-3xl font-black ${tile.alert ? "text-error" : "text-ink"}`}>{tile.value}</p>
            {tile.note && <p className="mt-1 text-base text-muted">{tile.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

type DayName = (d: DayReport, style: "short" | "long") => string;

/** Bars for how long they were moving around each day. Drawn in SVG, with the words in HTML so they follow the text size. */
function ActivityChart({ report, dayName }: { report: WeekReport; dayName: DayName }) {
  const { t } = useLanguage();
  const most = Math.max(60, ...report.days.map((d) => d.activeMinutes));
  const hours = (m: number) => t("{n} h", { n: Math.round(m / 6) / 10 });
  return (
    <section aria-labelledby="chart-days" className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <h2 id="chart-days" className="text-2xl font-extrabold">
        {t("Moving around each day")}
      </h2>
      <p className="mt-1 text-lg text-muted">{t("Longer bars mean more time up and about.")}</p>
      <figure className="mt-5">
        {/* Sideways bars, one row per day, so the words fit at any text size on a phone. */}
        <div aria-hidden="true" className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
          {report.days.map((d) => (
            <Fragment key={d.start}>
              <span className="text-lg font-extrabold">{dayName(d, "short")}</span>
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-8 w-full min-w-0">
                <rect
                  x="0"
                  y="0"
                  width="100"
                  height="10"
                  rx="2"
                  fill="var(--color-lilac)"
                  stroke="var(--color-muted)"
                  strokeOpacity="0.35"
                  vectorEffect="non-scaling-stroke"
                />
                <rect x="0" y="0" width={(d.activeMinutes / most) * 100} height="10" rx="2" fill="var(--color-brand)" />
              </svg>
              <span className="flex items-center gap-2 text-lg font-bold">
                {d.hasNews ? hours(d.activeMinutes) : "–"}
                {d.falls > 0 && <span className="rounded-full bg-alert px-2 font-extrabold text-on-brand">!</span>}
              </span>
            </Fragment>
          ))}
        </div>
        <figcaption className="mt-4 text-lg text-muted">
          {t("A red ! marks a day with a possible fall.")}
        </figcaption>
        <table className="sr-only">
          <caption>{t("Moving around each day")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Day")}</th>
              <th scope="col">{t("Moving around")}</th>
              <th scope="col">{t("Night-time trips")}</th>
              <th scope="col">{t("Possible falls")}</th>
              <th scope="col">{t("Camera off")}</th>
            </tr>
          </thead>
          <tbody>
            {report.days.map((d) => (
              <tr key={d.start}>
                <th scope="row">{dayName(d, "long")}</th>
                <td>{d.hasNews ? duration(d.activeMinutes, t) : t("No news")}</td>
                <td>{d.nightTrips}</td>
                <td>{d.falls}</td>
                <td>{duration(d.cameraOffMinutes, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </section>
  );
}

/** How busy each hour was: 0 (none) to 4 (busy). */
function level(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes < 10) return 1;
  if (minutes < 20) return 2;
  if (minutes < 40) return 3;
  return 4;
}
const SHADES = [0, 0.3, 0.55, 0.8, 1];

/** One row per day, one square per hour, darker when they were moving around more. */
function HeatStrip({ report, dayName, htmlLang }: { report: WeekReport; dayName: DayName; htmlLang: string }) {
  const { t } = useLanguage();
  const hourName = (h: number) => new Date(2026, 0, 1, h).toLocaleTimeString(htmlLang, { hour: "numeric" });
  const busiestHours = (d: DayReport, tr: Translate) => {
    const top = d.hours
      .map((m, h) => ({ m, h }))
      .filter((x) => x.m > 0)
      .sort((a, b) => b.m - a.m)
      .slice(0, 3)
      .sort((a, b) => a.h - b.h);
    return top.length ? top.map((x) => hourName(x.h)).join(", ") : tr("No movement seen");
  };
  return (
    <section aria-labelledby="chart-hours" className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <h2 id="chart-hours" className="text-2xl font-extrabold">
        {t("When they are up and about")}
      </h2>
      <p className="mt-1 text-lg text-muted">{t("Each square is one hour. Darker squares mean more moving around.")}</p>
      <figure className="mt-5">
        <div aria-hidden="true" className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
          {report.days.map((d) => (
            <Fragment key={d.start}>
              <span className="text-lg font-extrabold">{dayName(d, "short")}</span>
              <svg viewBox="0 0 240 10" preserveAspectRatio="none" className="h-7 w-full min-w-0">
                {d.hours.map((m, h) => (
                  <rect
                    key={h}
                    x={h * 10 + 0.5}
                    y="0.5"
                    width="9"
                    height="9"
                    fill={level(m) === 0 ? "var(--color-lilac)" : "var(--color-brand)"}
                    fillOpacity={level(m) === 0 ? 1 : SHADES[level(m)]}
                    stroke="var(--color-muted)"
                    strokeOpacity="0.35"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            </Fragment>
          ))}
          <span />
          <div className="grid min-w-0 grid-cols-4 text-base font-bold text-muted">
            {[0, 6, 12, 18].map((h) => (
              <span key={h}>{hourName(h)}</span>
            ))}
          </div>
        </div>
        <figcaption className="mt-4 flex flex-wrap items-center gap-2 text-lg text-muted">
          <span>{t("Less")}</span>
          <svg aria-hidden="true" viewBox="0 0 50 10" className="h-6 w-28">
            {SHADES.map((s, i) => (
              <rect
                key={i}
                x={i * 10 + 0.5}
                y="0.5"
                width="9"
                height="9"
                fill={i === 0 ? "var(--color-lilac)" : "var(--color-brand)"}
                fillOpacity={i === 0 ? 1 : s}
                stroke="var(--color-muted)"
                strokeOpacity="0.35"
              />
            ))}
          </svg>
          <span>{t("More")}</span>
        </figcaption>
        <table className="sr-only">
          <caption>{t("Their busiest hours each day")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Day")}</th>
              <th scope="col">{t("Busiest hours")}</th>
            </tr>
          </thead>
          <tbody>
            {report.days.map((d) => (
              <tr key={d.start}>
                <th scope="row">{dayName(d, "long")}</th>
                <td>{busiestHours(d, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </section>
  );
}
