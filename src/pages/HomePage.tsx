import { useEffect, useReducer, useRef, useState } from "react";
import ButtonLink from "../components/ButtonLink";
import Highlight from "../components/Highlight";
import Reveal, { useInView } from "../components/Reveal";
import SiteLayout, { Blobs, LivePill, LogoMark } from "../components/SiteLayout";
import {
  AlertIcon,
  CheckInIcon,
  DashboardIcon,
  FamilyIllustration,
  FamilyPhoneIcon,
  HeroIllustration,
  MovementIcon,
  PhoneOnTableIcon,
  UpdatesIcon,
} from "../components/illustrations";
import { useLanguage } from "../i18n/useLanguage";

// The About Us page at "/", copied from the Lovable design.
// "Get started" opens the login page on its "Create your account" form.
const GET_STARTED = "/login?mode=sign-up";
const LOG_IN = "/login";

export default function HomePage() {
  return (
    <SiteLayout>
      <Hero />
      <Ribbon />
      <HowItWorks />
      <Features />
      <Demo />
      <Family />
      <WhoWeAre />
      <Questions />
      <CallToAction />
    </SiteLayout>
  );
}

/** "HH:MM" for a time of day given in minutes. */
function clockFromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const heroCards = [
  { title: "Mum is okay", sub: "Moving about" },
  { title: "Mum is okay", sub: "Left side of room" },
  { title: "Mum is resting", sub: "Sitting still" },
];

function Hero() {
  const { t } = useLanguage();
  const [card, setCard] = useState(0);
  const [time, setTime] = useState("10:38");
  // How far the mouse is from the middle of the picture, for a gentle 3D feel.
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const t = window.setInterval(() => setCard((c) => (c + 1) % heroCards.length), 3200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(clockFromMinutes(now.getHours() * 60 + now.getMinutes()));
    };
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, []);

  const shown = heroCards[card] ?? heroCards[0];

  return (
    <section className="relative isolate overflow-hidden px-6 pb-24 pt-8" aria-labelledby="hero-title">
      <Blobs />
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <div>
          <Reveal>
            <p className="inline-flex items-center gap-3 rounded-full bg-surface px-4 py-2 text-base font-extrabold uppercase tracking-wide text-brand shadow-soft">
              <span className="relative flex h-3 w-3">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-leaf" />
                <span className="relative h-3 w-3 rounded-full bg-leaf" />
              </span>
              {t("About Us")}
            </p>
          </Reveal>
          <Reveal delay={100}>
            <h1 id="hero-title" className="mt-5 text-4xl font-extrabold leading-tight">
              <Highlight
                text={t("Stay close to the people you love, *even from far away*.")}
                wrap={(part) => <mark className="highlight-sweep bg-transparent px-1 text-inherit">{part}</mark>}
              />
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-6 max-w-[36ch] text-xl text-muted">
              {t(
                "CareNest turns a spare phone on the table into a gentle helper. It notices movement in the room, and family can see on their own phone that all is well — so Grandma can stay independent at home.",
              )}
            </p>
          </Reveal>
          <Reveal delay={300}>
            <div className="mt-8 flex flex-wrap gap-4">
              <ButtonLink to={GET_STARTED} arrow>
                {t("Get started")}
              </ButtonLink>
              <ButtonLink to={LOG_IN} variant="outline">
                {t("Sign in")}
              </ButtonLink>
            </div>
          </Reveal>
          <Reveal delay={400}>
            <a href="#demo" className="mt-8 inline-flex items-center gap-3 font-extrabold text-leaf no-underline hover:underline">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-mint">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
                </svg>
              </span>
              {t("Try the family page below")}
            </a>
          </Reveal>
        </div>
        <Reveal delay={150}>
          <div
            className="relative"
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setTilt({ x: (e.clientX - box.left) / box.width - 0.5, y: (e.clientY - box.top) / box.height - 0.5 });
            }}
            onMouseLeave={() => setTilt({ x: 0, y: 0 })}
          >
            <HeroIllustration
              title={t(shown.title)}
              sub={t(shown.sub)}
              time={time}
              cardKey={card}
              className="transition-transform duration-300 ease-out"
              style={{ transform: `translate(${tilt.x * -16}px, ${tilt.y * -16}px)` }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 transition-transform duration-300 ease-out"
              style={{ transform: `translate(${tilt.x * 24}px, ${tilt.y * 24}px)` }}
            >
              <span className="absolute left-[6%] top-[55%] animate-float text-3xl text-coral [animation-delay:-2s]">♥</span>
              <span className="absolute right-[4%] top-[48%] animate-float text-2xl text-brand [animation-delay:-4s]">✦</span>
              <span className="absolute left-[40%] top-[2%] animate-float text-xl text-leaf">✦</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const reasons = [
  "Just a phone on a table",
  "Nothing to wear",
  "Video stays on the phone",
  "Only invited family can see",
  "Updates by itself",
  "Fall & quiet alerts",
  "Big, plain words",
];

/** A slowly scrolling ribbon of reasons. It pauses while the mouse is over it. */
function Ribbon() {
  const { t } = useLanguage();
  return (
    <div
      className="group relative overflow-hidden border-y-2 border-mint bg-surface py-4 mask-fade-x"
      aria-label={t("Why families choose CareNest")}
    >
      <ul className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
        {/* The list is shown twice so the scrolling loops without a gap. */}
        {[...reasons, ...reasons].map((reason, i) => (
          <li
            key={i}
            aria-hidden={i >= reasons.length || undefined}
            className="mr-4 flex items-center gap-2 whitespace-nowrap rounded-full border-2 border-mint bg-cream px-5 py-2 font-bold text-leaf"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-mint text-sm">✓</span>
            {t(reason)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const steps = [
  {
    icon: <PhoneOnTableIcon />,
    bubble: "bg-peach",
    title: "Stand a phone on a table",
    text: "Put a phone on a table where it can see the room. Nothing to wear, nothing to charge on the wrist.",
  },
  {
    icon: <MovementIcon />,
    bubble: "bg-lilac",
    title: "CareNest watches for movement",
    text: "The phone notices if someone is moving, sitting still, or may have fallen, and which side of the room they are in.",
  },
  {
    icon: <FamilyPhoneIcon />,
    bubble: "bg-mint",
    title: "Family sees how things are",
    text: "Family open the CareNest family page and see, in plain words, what is happening right now.",
  },
];

/** The three steps light up one after another. Tapping a step stops on it. */
function HowItWorks() {
  const { t } = useLanguage();
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const [ref, inView] = useInView<HTMLDivElement>(0.3);

  useEffect(() => {
    if (held || !inView) return;
    const t = window.setInterval(() => setActive((a) => (a + 1) % steps.length), 3500);
    return () => window.clearInterval(t);
  }, [held, inView]);

  return (
    <section className="px-6 py-24" aria-labelledby="how-title">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 id="how-title" className="text-center text-4xl font-extrabold md:text-5xl">
            <Highlight text={t("How it *works*")} />
          </h2>
          <p className="mx-auto mb-14 mt-3 max-w-[40ch] text-center text-xl text-muted">
            {t("From a phone on the table to an update on your phone.")}
          </p>
        </Reveal>
        <div ref={ref} className="relative">
          <div className="absolute left-[17%] right-[17%] top-[90px] hidden md:block" aria-hidden="true">
            <div className="border-t-[5px] border-dashed border-brand/25" />
            <div
              className="absolute left-0 top-0 h-[5px] rounded-full bg-brand transition-all duration-700 ease-out"
              style={{ width: `${(active / (steps.length - 1)) * 100}%` }}
            />
          </div>
          <ol className="relative grid gap-12 md:grid-cols-3">
            {steps.map((step, i) => {
              const current = i === active;
              return (
                <li key={step.title} className="text-center">
                  <Reveal delay={i * 120}>
                    <button
                      type="button"
                      aria-pressed={current}
                      onClick={() => {
                        setActive(i);
                        setHeld(true);
                      }}
                      className="mx-auto block w-full rounded-[32px] p-2 text-center"
                    >
                      <div
                        className={`${step.bubble} relative mx-auto mb-5 grid h-[180px] w-[180px] place-items-center rounded-full border-[5px] border-surface shadow-soft transition-all duration-500 ${i <= active ? "scale-105 opacity-100" : "scale-95 opacity-60"} ${current ? "ring-4 ring-brand/40" : ""}`}
                      >
                        {current && (
                          <span aria-hidden="true" className="absolute inset-0 animate-pulse-ring rounded-full bg-brand/15" />
                        )}
                        <div className={current ? "animate-float" : ""}>{step.icon}</div>
                      </div>
                      <span
                        className={`mb-2 inline-block rounded-full px-4 py-1 font-extrabold text-on-brand transition-colors duration-300 ${current ? "bg-brand" : "bg-ink"}`}
                      >
                        {t("Step {n}", { n: i + 1 })}
                      </span>
                      <h3 className="text-2xl font-extrabold">{t(step.title)}</h3>
                      <p
                        className={`mx-auto mt-2 max-w-[28ch] text-muted transition-opacity duration-300 ${current ? "opacity-100" : "opacity-70"}`}
                      >
                        {t(step.text)}
                      </p>
                    </button>
                    <div className="mx-auto mt-4 h-1.5 w-32 overflow-hidden rounded-full bg-brand/10" aria-hidden="true">
                      {current && (
                        <div
                          key={`${active}-${held}`}
                          className={`h-full origin-left rounded-full bg-brand ${held ? "" : "animate-grow-x"}`}
                        />
                      )}
                    </div>
                  </Reveal>
                </li>
              );
            })}
          </ol>
          {held && (
            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={() => setHeld(false)}
                className="rounded-full bg-lilac px-5 py-2 font-extrabold text-brand transition-colors hover:bg-brand hover:text-on-brand"
              >
                ▶ {t("Keep playing the steps")}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: <AlertIcon />,
    bg: "bg-peach",
    title: "Fall & quiet alerts",
    text: "If the phone thinks someone may have fallen, or it stops checking in, the family page says so in big letters.",
  },
  {
    icon: <CheckInIcon />,
    bg: "bg-mint",
    title: "Video stays on the phone",
    text: "The camera picture never leaves the phone. Only short notes like “moving around, left side” are sent.",
  },
  {
    icon: <DashboardIcon />,
    bg: "bg-lilac",
    title: "Family page",
    text: "One simple page shows what is happening right now and a short list of today’s news.",
  },
  {
    icon: <UpdatesIcon />,
    bg: "bg-sun",
    title: "Updates by itself",
    text: "The family page changes the moment something happens. No need to reload or ring round.",
  },
];

/** A card that tilts towards the mouse and lifts up a little. */
function TiltCard({ className, children }: { className: string; children: React.ReactNode }) {
  const [angle, setAngle] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        setAngle({
          x: ((e.clientY - box.top) / box.height - 0.5) * -10,
          y: ((e.clientX - box.left) / box.width - 0.5) * 12,
        });
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setAngle({ x: 0, y: 0 });
      }}
      className={`group h-full rounded-[32px] p-7 transition-[transform,box-shadow] duration-300 ease-out ${hover ? "shadow-lift" : "shadow-none"} ${className}`}
      style={{
        transform: `perspective(900px) rotateX(${angle.x}deg) rotateY(${angle.y}deg) translateY(${hover ? -6 : 0}px)`,
      }}
    >
      {children}
    </div>
  );
}

function Features() {
  const { t } = useLanguage();
  return (
    <section className="mx-4 rounded-[48px] bg-surface px-6 py-24 shadow-soft" aria-labelledby="features-title">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 id="features-title" className="text-center text-4xl font-extrabold md:text-5xl">
            <Highlight text={t("Little helpers, *big comfort*")} />
          </h2>
          <p className="mx-auto mb-12 mt-3 max-w-[40ch] text-center text-xl text-muted">
            {t("Made to be simple for everyone — grandparents included.")}
          </p>
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 110} className="h-full">
              <TiltCard className={f.bg}>
                <div className="inline-block group-hover:animate-wiggle">{f.icon}</div>
                <h3 className="mt-4 text-2xl font-extrabold">{t(f.title)}</h3>
                <p className="mt-2">{t(f.text)}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----- The pretend family page demo -----

type DemoMode = "moving" | "sitting" | "fall";
type DemoAction = "left" | "right" | "sit" | "fall" | "okay";

const demoLooks: Record<DemoMode, { label: string; detail: string; card: string; dot: string }> = {
  moving: { label: "All is well", detail: "Moving about", card: "bg-mint text-ink", dot: "bg-leaf" },
  sitting: { label: "Resting", detail: "Sitting still", card: "bg-sun text-ink", dot: "bg-coral" },
  fall: { label: "Please check in", detail: "May have fallen", card: "bg-alert text-on-brand", dot: "bg-alert" },
};

const demoButtons: { id: DemoAction; label: string; icon: string; tone: string }[] = [
  { id: "left", label: "Walk to the left", icon: "←", tone: "bg-mint" },
  { id: "right", label: "Walk to the right", icon: "→", tone: "bg-mint" },
  { id: "sit", label: "Sit down", icon: "◡", tone: "bg-sun" },
  { id: "fall", label: "Possible fall", icon: "!", tone: "bg-peach" },
  { id: "okay", label: "Up and about", icon: "✓", tone: "bg-lilac" },
];

// What happens, in order, while the demo plays by itself.
const demoScript: DemoAction[] = ["right", "sit", "okay", "left", "fall", "okay", "right", "left"];

interface DemoState {
  mode: DemoMode;
  side: "left" | "right";
  minutes: number;
  nextId: number;
  shake: number;
  // `text` is English with a {side} gap, so it can be translated when shown.
  feed: { id: number; time: string; text: string; side: "left" | "right"; mode: DemoMode }[];
}

const demoStart: DemoState = {
  mode: "moving",
  side: "left",
  minutes: 638,
  nextId: 3,
  shake: 0,
  feed: [
    { id: 2, time: "10:38", text: "Moving around, {side} side", side: "left", mode: "moving" },
    { id: 1, time: "10:21", text: "Sitting still, {side} side", side: "right", mode: "sitting" },
  ],
};

function demoStep(state: DemoState, action: DemoAction): DemoState {
  const side = action === "left" ? "left" : action === "right" ? "right" : state.side;
  const mode: DemoMode = action === "sit" ? "sitting" : action === "fall" ? "fall" : "moving";
  const minutes = state.minutes + (action === "fall" ? 1 : 4);
  const text =
    action === "sit"
      ? "Sitting still, {side} side"
      : action === "fall"
        ? "May have fallen, {side} side"
        : action === "okay"
          ? "Up and moving again, {side} side"
          : "Moving around, {side} side";
  return {
    mode,
    side,
    minutes,
    nextId: state.nextId + 1,
    shake: action === "fall" ? state.shake + 1 : state.shake,
    feed: [{ id: state.nextId, time: clockFromMinutes(minutes), text, side, mode }, ...state.feed].slice(0, 4),
  };
}

function Demo() {
  const { t } = useLanguage();
  const [state, act] = useReducer(demoStep, demoStart);
  const [playing, setPlaying] = useState(true);
  const scriptPosition = useRef(0);
  const [ref, inView] = useInView<HTMLDivElement>(0.3);

  // Plays the script by itself while it is on screen, until someone taps a button.
  useEffect(() => {
    if (!playing || !inView) return;
    const t = window.setInterval(() => {
      act(demoScript[scriptPosition.current % demoScript.length] ?? "left");
      scriptPosition.current += 1;
    }, 2600);
    return () => window.clearInterval(t);
  }, [playing, inView]);

  const look = demoLooks[state.mode];

  return (
    <section id="demo" className="scroll-mt-24 px-6 py-24" aria-labelledby="demo-title">
      <div ref={ref} className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Reveal>
            <p className="text-lg font-extrabold uppercase tracking-wide text-brand">{t("Try it yourself")}</p>
            <h2 id="demo-title" className="mt-2 text-4xl font-extrabold md:text-5xl">
              <Highlight text={t("See the family page *come alive*")} />
            </h2>
            <p className="mt-4 max-w-[44ch] text-xl text-muted">
              {t(
                "Tap a button to play out Grandma’s morning and watch the family page update by itself. This is a pretend demo — no camera needed.",
              )}
            </p>
          </Reveal>

          {/* The room, seen from above, with the phone at the top. */}
          <Reveal delay={120}>
            <div
              className="relative mt-8 h-56 overflow-hidden rounded-[28px] border-[3px] border-lilac bg-surface"
              aria-hidden="true"
            >
              <div className="absolute inset-y-6 left-1/2 border-l-[3px] border-dashed border-brand/20" />
              <span className="absolute bottom-3 left-4 text-sm font-extrabold uppercase tracking-wide text-muted">
                {t("Left side")}
              </span>
              <span className="absolute bottom-3 right-4 text-sm font-extrabold uppercase tracking-wide text-muted">
                {t("Right side")}
              </span>
              <svg className="absolute inset-x-0 top-0 h-full w-full" viewBox="0 0 400 220" preserveAspectRatio="none">
                <path className="animate-scan" d="M200 40 L20 220 L380 220 Z" fill="#5b3cc4" />
              </svg>
              <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center">
                <div className="grid h-9 w-6 place-items-center rounded-md bg-ink">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />
                </div>
                <div className="mt-0.5 h-1.5 w-16 rounded-full bg-coral" />
              </div>
              <div className="absolute bottom-10 right-8 h-10 w-24 rounded-2xl bg-peach" />
              <div className="absolute bottom-10 left-8 h-12 w-12 rounded-full bg-mint" />
              <div
                className="absolute bottom-12 -translate-x-1/2 transition-[left] duration-700 ease-out"
                style={{ left: state.side === "left" ? "28%" : "72%" }}
              >
                <div className="relative">
                  {state.mode === "fall" && (
                    <span className="absolute left-1/2 top-1/2 -ml-8 -mt-8 h-16 w-16 animate-pulse-ring rounded-full bg-alert/40" />
                  )}
                  <div
                    className={`relative flex flex-col items-center transition-transform duration-500 ${state.mode === "fall" ? "rotate-90" : state.mode === "sitting" ? "scale-y-75" : "animate-bob"}`}
                  >
                    <span className="h-6 w-6 rounded-full bg-peach ring-2 ring-coral/40" />
                    <span
                      className={`mt-0.5 h-10 w-9 rounded-t-full transition-colors ${state.mode === "fall" ? "bg-alert" : "bg-coral"}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {demoButtons.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    act(b.id);
                  }}
                  className="flex min-h-14 items-center gap-3 rounded-2xl border-[3px] border-lilac bg-surface px-3 py-2 text-left text-base font-extrabold leading-tight text-ink transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-soft active:translate-y-0.5"
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg ${b.tone}`}>{b.icon}</span>
                  {t(b.label)}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={playing}
                onClick={() => setPlaying((p) => !p)}
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-brand px-4 font-extrabold text-on-brand transition-colors hover:bg-brand-dark"
              >
                {playing ? `❚❚ ${t("Pause demo")}` : `▶ ${t("Play demo")}`}
              </button>
            </div>
          </Reveal>
        </div>

        {/* The pretend family page, on a phone. It shakes when someone may have fallen. */}
        <Reveal delay={150}>
          <p className="sr-only" role="status" aria-live="polite">
            {playing
              ? ""
              : t("Grandma right now: {label}. {detail}, {side} side.", {
                  label: t(look.label),
                  detail: t(look.detail),
                  side: t(state.side),
                })}
          </p>
          <div key={state.shake} className={state.shake > 0 && state.mode === "fall" ? "animate-shake" : ""}>
            <div className="mx-auto w-full max-w-[340px] rounded-[48px] border-[10px] border-ink bg-cream p-4 shadow-lift">
              <div className="mx-auto mb-4 h-5 w-24 rounded-full bg-ink" />
              <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-2 font-extrabold">
                  <LogoMark size={28} /> {t("Family page")}
                </span>
                <LivePill />
              </div>
              <div className={`mt-4 rounded-[28px] p-5 transition-colors duration-500 ${look.card}`}>
                <p className="text-sm font-bold opacity-80">{t("Grandma · right now")}</p>
                <p key={state.nextId} className="mt-1 animate-pop text-3xl font-black">
                  {t(look.label)}
                </p>
                <p className="mt-1 text-lg font-bold">
                  {t("{detail}, {side} side", { detail: t(look.detail), side: t(state.side) })}
                </p>
                <p className="mt-3 text-sm font-bold opacity-80">
                  {t("Updated {time}", { time: clockFromMinutes(state.minutes) })}
                </p>
              </div>
              <p className="mt-5 px-1 text-sm font-extrabold uppercase tracking-wide text-muted">{t("Today’s news")}</p>
              <ul className="mt-2 space-y-2">
                {state.feed.map((item) => (
                  <li key={item.id} className="flex animate-slide-in items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                    <span className={`h-3 w-3 shrink-0 rounded-full ${demoLooks[item.mode].dot}`} />
                    <span className="flex-1 text-sm font-bold">{t(item.text, { side: t(item.side) })}</span>
                    <span className="text-xs font-bold text-muted">{item.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const invitees = [
  { name: "Daughter", color: "bg-coral" },
  { name: "Grandson", color: "bg-brand" },
  { name: "Neighbour", color: "bg-leaf" },
  { name: "Carer", color: "bg-sun" },
];

function Family() {
  const { t } = useLanguage();
  const [invited, setInvited] = useState(["Daughter", "Grandson"]);
  const toggle = (name: string) =>
    setInvited((list) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]));

  return (
    <section className="px-6 py-24" aria-labelledby="family-title">
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
        <Reveal>
          <div className="relative">
            <FamilyIllustration />
            <div className="absolute -left-2 top-6 animate-float rounded-2xl bg-surface px-4 py-2 text-sm font-extrabold text-leaf shadow-soft md:-left-6">
              ✓ {t("All is well")}
            </div>
            <div className="absolute -right-2 bottom-8 animate-float rounded-2xl bg-surface px-4 py-2 text-sm font-extrabold text-brand shadow-soft [animation-delay:-3s] md:-right-6">
              ♥ {t("Seen by {n}", { n: invited.length + 1 })}
            </div>
          </div>
        </Reveal>
        <div>
          <Reveal>
            <h2 id="family-title" className="text-4xl font-extrabold md:text-5xl">
              <Highlight text={t("Everyone in the *loop*")} />
            </h2>
            <p className="mb-6 mt-4 text-xl text-muted">
              {t(
                "Add children, grandchildren, neighbours or a carer to your CareNest home. Everyone sees the same simple update, so nobody has to ring round to check.",
              )}
            </p>
          </Reveal>
          <Reveal delay={120}>
            <p className="font-extrabold">{t("Who would you invite?")}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {invitees.map((person) => {
                const on = invited.includes(person.name);
                return (
                  <button
                    key={person.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(person.name)}
                    className={`inline-flex min-h-12 items-center gap-2 rounded-full border-[3px] px-4 font-extrabold transition-all duration-200 hover:-translate-y-0.5 ${on ? "border-brand bg-lilac text-brand" : "border-lilac bg-surface text-muted"}`}
                  >
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs transition-transform duration-300 ${on ? `${person.color} scale-110 text-on-brand` : "bg-lilac text-brand"}`}
                    >
                      {on ? "✓" : "+"}
                    </span>
                    {t(person.name)}
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex items-center gap-4">
              <div className="flex -space-x-3">
                <span className="grid h-12 w-12 place-items-center rounded-full border-4 border-cream bg-peach font-black text-ink">
                  G
                </span>
                {invited.map((name) => (
                  <span
                    key={name}
                    className={`grid h-12 w-12 animate-pop place-items-center rounded-full border-4 border-cream font-black text-on-brand ${invitees.find((p) => p.name === name)?.color ?? "bg-brand"}`}
                  >
                    {t(name)[0]}
                  </span>
                ))}
              </div>
              <p className="font-bold text-muted">
                {invited.length === 0
                  ? t("Invite someone to share the updates")
                  : invited.length === 1
                    ? t("1 person sees the same update")
                    : t("{n} people see the same update", { n: invited.length })}
              </p>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <ButtonLink to={GET_STARTED} arrow className="mt-8">
              {t("Get started")}
            </ButtonLink>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function WhoWeAre() {
  const { t } = useLanguage();
  return (
    <section className="px-6 pb-24" aria-labelledby="team-title">
      <Reveal>
        <div className="mx-auto max-w-3xl animate-gradient rounded-[40px] bg-cta-gradient p-[3px] shadow-lift">
          <div className="rounded-[37px] bg-surface px-8 py-12 text-center">
            <span className="mx-auto mb-4 grid h-14 w-14 animate-heartbeat place-items-center rounded-full bg-peach text-2xl text-alert">
              ♥
            </span>
            <h2 id="team-title" className="text-4xl font-extrabold">
              {t("Who we are")}
            </h2>
            <p className="mt-4 text-xl text-muted">
              {t(
                "We are a small hackathon team. Many of us have parents and grandparents who live alone, and we wanted a simple, kind way to stay close without cameras sending pictures anywhere or gadgets to wear.",
              )}
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const questions = [
  {
    q: "Does any video leave the phone?",
    a: "No. The camera picture never leaves the phone. Only short notes like “moving around, left side” are sent to your family page.",
  },
  {
    q: "What do I need to get started?",
    a: "Just a spare phone standing on a table where it can see the room. Nothing to wear, nothing to charge on the wrist.",
  },
  {
    q: "Who can see what is happening?",
    a: "Only the people you invite — children, grandchildren, neighbours or a carer. Everyone sees the same simple update.",
  },
  {
    q: "What happens if something seems wrong?",
    a: "If the phone thinks someone may have fallen, or it stops checking in, the family page says so in big letters — no need to reload.",
  },
];

function Questions() {
  const [open, setOpen] = useState<number | null>(0);
  const { t } = useLanguage();
  return (
    <section className="px-6 pb-24" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl">
        <Reveal>
          <h2 id="faq-title" className="mb-8 text-center text-4xl font-extrabold">
            {t("Good questions")}
          </h2>
        </Reveal>
        <div className="space-y-3">
          {questions.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} delay={i * 80}>
                <div
                  className={`rounded-[28px] border-[3px] bg-surface transition-colors duration-300 ${isOpen ? "border-brand" : "border-lilac"}`}
                >
                  <h3>
                    <button
                      type="button"
                      id={`faq-q-${i}`}
                      aria-expanded={isOpen}
                      aria-controls={`faq-a-${i}`}
                      onClick={() => setOpen(isOpen ? null : i)}
                      className="flex min-h-16 w-full items-center justify-between gap-4 px-6 py-4 text-left text-xl font-extrabold"
                    >
                      {t(item.q)}
                      <span
                        aria-hidden="true"
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl transition-all duration-300 ${isOpen ? "rotate-45 bg-brand text-on-brand" : "bg-lilac text-brand"}`}
                      >
                        +
                      </span>
                    </button>
                  </h3>
                  <div
                    id={`faq-a-${i}`}
                    role="region"
                    aria-labelledby={`faq-q-${i}`}
                    className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-6 pb-6 text-lg text-muted">{t(item.a)}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const risingHearts = [
  { left: "6%", delay: "0s", size: 22 },
  { left: "18%", delay: "-3s", size: 14 },
  { left: "32%", delay: "-6s", size: 18 },
  { left: "48%", delay: "-1.5s", size: 12 },
  { left: "62%", delay: "-4.5s", size: 20 },
  { left: "76%", delay: "-2s", size: 16 },
  { left: "90%", delay: "-5.5s", size: 24 },
];

function CallToAction() {
  const { t } = useLanguage();
  return (
    <section className="px-6 pb-20" aria-labelledby="cta-title">
      <Reveal>
        <div className="on-dark relative mx-auto max-w-6xl animate-gradient overflow-hidden rounded-[40px] bg-cta-gradient px-8 py-16 text-center text-on-brand shadow-lift">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-full">
            {risingHearts.map((h, i) => (
              <svg
                key={i}
                className="absolute -bottom-8 animate-rise text-on-brand/30"
                style={{ left: h.left, animationDelay: h.delay }}
                width={h.size}
                height={h.size}
                viewBox="0 0 24 24"
              >
                <path d="M12 21s-9-5.5-9-12a5 5 0 0 1 9-2.8A5 5 0 0 1 21 9c0 6.5-9 12-9 12z" fill="currentColor" />
              </svg>
            ))}
          </div>
          <div className="relative">
            <h2 id="cta-title" className="text-4xl font-extrabold md:text-5xl">
              {t("Ready to feel closer?")}
            </h2>
            <p className="mt-3 text-xl">{t("Make an account, stand a phone on the table and press “Start watching”.")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <ButtonLink to={GET_STARTED} variant="inverse" arrow>
                {t("Get started")}
              </ButtonLink>
              <ButtonLink to={LOG_IN} variant="inverse-outline">
                {t("Sign in")}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
