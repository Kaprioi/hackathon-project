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
} from "../components/illustrations";

// The About Us page at "/". "Get started" opens the login page on its "Create your account" form.
const GET_STARTED = "/login?mode=sign-up";
const LOG_IN = "/login";

// The only pages in the app. Shown in the header on every screen size.
const navLinks = [
  { to: "/", label: "About Us" },
  { to: "/login", label: "Sign in" },
  { to: "/tracker", label: "Phone camera" },
  { to: "/dashboard", label: "Family" },
];

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
    icon: <MovementIcon />,
    bg: "bg-sun",
    title: "Updates by itself",
    text: "The family page changes the moment something happens. No need to reload or ring round.",
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

      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Logo />
        <nav aria-label="Main">
          <ul className="flex flex-wrap gap-2">
            {navLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  aria-current={link.to === "/" ? "page" : undefined}
                  className="inline-flex min-h-12 items-center rounded-2xl px-4 text-lg font-extrabold text-brand no-underline hover:bg-lilac aria-[current=page]:bg-lilac aria-[current=page]:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="px-6 pb-20 pt-8" aria-labelledby="hero-title">
          <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
            <div>
              <p className="text-lg font-extrabold uppercase tracking-wide text-brand">About Us</p>
              <h1 id="hero-title" className="mt-2 text-4xl font-extrabold leading-tight md:text-5xl">
                Stay close to the people you love,{" "}
                <mark className="bg-transparent bg-[linear-gradient(transparent_55%,var(--color-sun)_55%)] px-1 text-inherit">
                  even from far away
                </mark>
                .
              </h1>
              <p className="mt-5 max-w-[34ch] text-xl text-muted">
                CareNest turns a spare phone on the table into a gentle helper. It notices movement in the room, and
                family can see on their own phone that all is well — so Grandma can stay independent at home.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <ButtonLink to={GET_STARTED}>Get started</ButtonLink>
                <ButtonLink to={LOG_IN} variant="outline">
                  Sign in
                </ButtonLink>
              </div>
              <ul className="mt-8 flex flex-wrap gap-3" aria-label="Why families choose CareNest">
                {["Just a phone on a table", "Nothing to wear", "Video stays on the phone"].map((item) => (
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
              From a phone on the table to an update on your phone.
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
                Add children, grandchildren, neighbours or a carer to your CareNest home. Everyone sees the same simple
                update, so nobody has to ring round to check.
              </p>
              <ButtonLink to={GET_STARTED}>Get started</ButtonLink>
            </div>
          </div>
        </section>

        {/* Who we are */}
        <section className="px-6 pb-20" aria-labelledby="team-title">
          <div className="mx-auto max-w-3xl rounded-[40px] bg-white px-8 py-12 text-center">
            <h2 id="team-title" className="text-4xl font-extrabold">
              Who we are
            </h2>
            <p className="mt-4 text-xl text-muted">
              We are a small hackathon team. Many of us have parents and grandparents who live alone, and we wanted a
              simple, kind way to stay close without cameras sending pictures anywhere or gadgets to wear.
            </p>
          </div>
        </section>

        {/* Final call to action */}
        <section className="px-6 pb-20" aria-labelledby="cta-title">
          <div className="on-dark mx-auto max-w-6xl rounded-[40px] bg-brand px-8 py-14 text-center text-white">
            <h2 id="cta-title" className="text-4xl font-extrabold">
              Ready to feel closer?
            </h2>
            <p className="mt-3 text-xl">Make an account, stand a phone on the table and press “Start watching”.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <ButtonLink to={GET_STARTED} variant="inverse">
                Get started
              </ButtonLink>
              <ButtonLink to={LOG_IN} variant="inverse-outline">
                Sign in
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
