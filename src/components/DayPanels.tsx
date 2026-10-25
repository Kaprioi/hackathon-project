// The family page's picture of today: four quick tiles and a coloured strip of the day
// (moving, still, nobody in view, camera off, possible falls). Worked out from the
// phone's short events by src/family/dayPicture.ts.

import type { DayPicture, DayState } from "../family/dayPicture";
import { durationWords } from "../family/dayPicture";
import { timeAgo, whereInRoom } from "../family/status";
import { useLanguage } from "../i18n/useLanguage";

const STATE_STYLE: Record<DayState, string> = {
  moving: "bg-leaf",
  still: "bg-coral",
  nobody: "bg-lilac",
  // Diagonal stripes: "no news", rather than a colour that means something happened.
  off: "bg-[repeating-linear-gradient(135deg,var(--color-lilac)_0_6px,transparent_6px_12px)] opacity-70",
};

const STATE_NAME: Record<DayState, string> = {
  moving: "Moving",
  still: "Still",
  nobody: "Nobody in view",
  off: "Camera off",
};

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Four quick numbers about today. */
export function QuickTiles({ picture, now }: { picture: DayPicture; now: number }) {
  const { t } = useLanguage();
  const none = "—";
  const falls = picture.falls.length;
  const tiles: { label: string; value: string; style: string }[] = [
    {
      label: t("Moving today"),
      value: picture.hasData ? durationWords(picture.movingMs, t) : none,
      style: "bg-mint text-ink",
    },
    {
      label: t("Last moved"),
      value: !picture.hasData
        ? none
        : picture.movingNow
          ? t("Moving now")
          : picture.lastMovedAt
            ? capital(timeAgo(new Date(picture.lastMovedAt).toISOString(), now, t))
            : t("Not yet today"),
      style: "bg-lilac text-ink",
    },
    {
      label: t("Spent most time"),
      value: picture.mostlyZone ? capital(whereInRoom(picture.mostlyZone, t) ?? none) : none,
      style: "bg-sun text-ink",
    },
    {
      label: t("Alerts today"),
      value: !picture.hasData ? none : falls === 0 ? t("None") : falls === 1 ? t("1 possible fall") : t("{n} possible falls", { n: falls }),
      style: falls > 0 ? "bg-alert text-on-brand" : "bg-surface text-ink",
    },
  ];
  return (
    <section aria-label={t("Today at a glance")} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className={`rounded-[24px] p-5 shadow-soft ${tile.style}`}>
          <p className="text-base font-extrabold uppercase tracking-wide opacity-80">{tile.label}</p>
          <p className="mt-1 text-2xl font-black leading-tight sm:text-3xl">{tile.value}</p>
        </div>
      ))}
    </section>
  );
}

/** Today as one coloured bar, oldest on the left, now on the right. */
export function DayStrip({ picture }: { picture: DayPicture }) {
  const { t } = useLanguage();
  const span = Math.max(1, picture.to - picture.from);
  const left = (ms: number) => `${((ms - picture.from) / span) * 100}%`;
  const width = (from: number, to: number) => `${((to - from) / span) * 100}%`;
  const total: Record<DayState, number> = { moving: 0, still: 0, nobody: 0, off: 0 };
  for (const s of picture.segments) total[s.state] += s.to - s.from;
  const described = t("Today: moving {moving}, still {still}, nobody in view {nobody}, camera off {off}.", {
    moving: durationWords(total.moving, t),
    still: durationWords(total.still, t),
    nobody: durationWords(total.nobody, t),
    off: durationWords(total.off, t),
  });
  const middle = picture.from + span / 2;

  return (
    <div className="mt-5">
      <div role="img" aria-label={described} className="relative h-12 w-full overflow-hidden rounded-2xl bg-cream ring-2 ring-lilac">
        {picture.segments.map((s) => (
          <div
            key={`${s.from}-${s.state}`}
            title={`${t(STATE_NAME[s.state])}: ${clock(s.from)} - ${clock(s.to)}`}
            className={`absolute inset-y-0 ${STATE_STYLE[s.state]}`}
            style={{ left: left(s.from), width: width(s.from, s.to) }}
          />
        ))}
        {picture.falls.map((f) => (
          <div
            key={f}
            title={`${t("Possible fall")}: ${clock(f)}`}
            className="absolute inset-y-0 w-1.5 -translate-x-1/2 bg-alert"
            style={{ left: left(f) }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-base font-bold text-muted">
        <span>{clock(picture.from)}</span>
        <span>{clock(middle)}</span>
        <span>{t("Now")}</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-base font-bold">
        {(["moving", "still", "nobody", "off"] as const).map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-4 w-4 rounded ${STATE_STYLE[s]} ring-1 ring-lilac`} />
            {t(STATE_NAME[s])}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-4 w-1.5 rounded bg-alert" />
          {t("Possible fall")}
        </li>
      </ul>
    </div>
  );
}
