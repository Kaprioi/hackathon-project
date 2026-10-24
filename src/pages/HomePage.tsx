import { Link } from "react-router";
import ButtonLink from "../components/ButtonLink";
import {
  AlertIcon,
  CheckInIcon,
  DashboardIcon,
  FamilyIllustration,
  FamilyPhoneIcon,
  HeroIllustration,
  MovementIcon,
  PhoneOnTableIcon,
  PillIcon,
} from "../components/illustrations";

// "Get started" opens the login page on its "Create your account" form.
const GET_STARTED = "/login?mode=sign-up";
const LOG_IN = "/login";

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
    text: "The phone follows movement around the room — left and right, up and down — and learns what a normal day looks like.",
  },
  {
    icon: <FamilyPhoneIcon />,
    bubble: "bg-mint",
    title: "Family hears first",
    text: "If something seems wrong, family and carers get a message on their phone right away.",
  },
];

const features = [
  {
    icon: <AlertIcon />,
    bg: "bg-peach",
    title: "Fall & quiet alerts",
    text: "If the phone sees a fall, or no movement for too long, family is told at once.",
  },
  {
    icon: <CheckInIcon />,
    bg: "bg-mint",
    title: "“I’m okay” button",
    text: "One big, happy tap to say good morning to everyone.",
  },
  {
    icon: <PillIcon />,
    bg: "bg-sun",
    title: "Pill reminders",
    text: "Gentle reminders at the right time, ticked off when taken.",
  },
  {
    icon: <DashboardIcon />,
    bg: "bg-lilac",
    title: "Family dashboard",
    text: "One simple page shows how the day is going, for the whole family.",
  },
];

function Logo() {
  return (
    <Link to="/" className="flex min-h-12 items-center gap-3 text-2xl font-black text-ink no-underline">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="22" fill="#c9f0df" />
        <path d="M22 33s-11-6.5-11-14a6 6 0 0 1 11-3.4A6 6 0 0 1 33 19c0 7.5-11 14-11 14z" fill="#5b3cc4" />
      </svg>
      CareNest
    </Link>
  );
}

export default function HomePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-xl focus:bg-white focus:px-5 focus:py-3 focus:font-bold"
      >
        Skip to main content
      </a>

      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <Logo />
        <nav aria-label="Account">
          <ButtonLink to={LOG_IN} variant="outline">
            Log in
          </ButtonLink>
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="px-6 pb-20 pt-8" aria-labelledby="hero-title">
          <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
            <div>
              <h1 id="hero-title" className="text-4xl font-extrabold leading-tight md:text-5xl">
                Stay close to the people you love,{" "}
                <mark className="bg-transparent bg-[linear-gradient(transparent_55%,var(--color-sun)_55%)] px-1 text-inherit">
                  even from far away
                </mark>
                .
              </h1>
              <p className="mt-5 max-w-[34ch] text-xl text-muted">
                A phone on the table quietly keeps an eye on the room. If Grandma has a fall or a very quiet day, you'll
                know straight away — and she stays independent at home.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <ButtonLink to={GET_STARTED}>Get started</ButtonLink>
                <ButtonLink to={LOG_IN} variant="outline">
                  Log in
                </ButtonLink>
              </div>
              <ul className="mt-8 flex flex-wrap gap-3" aria-label="Why families choose CareNest">
                {["Just a phone on a table", "Easy 10-minute setup", "Private by default"].map((item) => (
                  <li key={item} className="rounded-full border-2 border-mint bg-white px-4 py-2 font-bold text-leaf">
                    <span aria-hidden="true">✓ </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <HeroIllustration />
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 py-20" aria-labelledby="how-title">
          <div className="mx-auto max-w-6xl">
            <h2 id="how-title" className="text-center text-4xl font-extrabold">
              How it works
            </h2>
            <p className="mx-auto mb-12 mt-3 max-w-[40ch] text-center text-xl text-muted">
              From a phone on the table to a message on your phone.
            </p>
            <div className="relative">
              {/* Dashed line joining the three steps (wide screens only) */}
              <div
                aria-hidden="true"
                className="absolute left-[17%] right-[17%] top-[90px] hidden border-t-[5px] border-dashed border-[#b7a6ef] md:block"
              />
              <ol className="relative grid gap-10 md:grid-cols-3">
                {steps.map((step, i) => (
                  <li key={step.title} className="relative text-center">
                    <div
                      className={`${step.bubble} mx-auto mb-5 grid h-[180px] w-[180px] place-items-center rounded-full border-[5px] border-white shadow-[0_10px_30px_rgba(31,42,55,0.08)]`}
                    >
                      {step.icon}
                    </div>
                    <span className="mb-2 inline-block rounded-full bg-ink px-4 py-1 font-extrabold text-white">
                      Step {i + 1}
                    </span>
                    <h3 className="text-2xl font-extrabold">{step.title}</h3>
                    <p className="mx-auto mt-2 max-w-[28ch] text-muted">{step.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-4 rounded-[48px] bg-white px-6 py-20" aria-labelledby="features-title">
          <div className="mx-auto max-w-6xl">
            <h2 id="features-title" className="text-center text-4xl font-extrabold">
              Little helpers, big comfort
            </h2>
            <p className="mx-auto mb-10 mt-3 max-w-[40ch] text-center text-xl text-muted">
              Made to be simple for everyone — grandparents included.
            </p>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <li key={feature.title} className={`${feature.bg} rounded-[32px] p-7`}>
                  {feature.icon}
                  <h3 className="mt-4 text-2xl font-extrabold">{feature.title}</h3>
                  <p className="mt-2">{feature.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Family */}
        <section className="px-6 py-20" aria-labelledby="family-title">
          <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
            <FamilyIllustration />
            <div>
              <h2 id="family-title" className="text-4xl font-extrabold">
                Everyone in the loop
              </h2>
              <p className="mb-8 mt-4 text-xl text-muted">
                Invite children, grandchildren, neighbours or a carer. Everyone sees the same simple update, so nobody
                has to ring round to check.
              </p>
              <ButtonLink to={GET_STARTED}>Get started</ButtonLink>
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="px-6 pb-20" aria-labelledby="cta-title">
          <div className="on-dark mx-auto max-w-6xl rounded-[40px] bg-brand px-8 py-14 text-center text-white">
            <h2 id="cta-title" className="text-4xl font-extrabold">
              Ready to feel closer?
            </h2>
            <p className="mt-3 text-xl">Set up in about 10 minutes. We'll guide you every step.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <ButtonLink to={GET_STARTED} variant="inverse">
                Get started
              </ButtonLink>
              <ButtonLink to={LOG_IN} variant="inverse-outline">
                Log in
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-6 pb-10 text-muted">
        <span>© {new Date().getFullYear()} CareNest</span>
        <span>Only the people you invite can see anything.</span>
      </footer>
    </>
  );
}
