import { Link } from "react-router";
import ButtonLink from "../components/ButtonLink";
import SiteLayout, { Blobs } from "../components/SiteLayout";
import Highlight from "../components/Highlight";
import { AlertIcon, DashboardIcon, MovementIcon, PhoneOnTableIcon } from "../components/illustrations";
import type { Translate } from "../i18n/translate";
import { useLanguage } from "../i18n/useLanguage";

// The Help page: short picture steps for getting started, what the family page
// means, the privacy promise, and a few common questions.

/** A padlock: for "video stays on the phone". */
function PrivacyIcon() {
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
      <path d="M32 44V32a16 16 0 0 1 32 0v12" stroke="#1f2a37" strokeWidth="7" fill="none" strokeLinecap="round" />
      <rect x="22" y="42" width="52" height="40" rx="10" fill="#5b3cc4" />
      <circle cx="48" cy="58" r="6" fill="#fff" />
      <rect x="45" y="60" width="6" height="12" rx="3" fill="#fff" />
    </svg>
  );
}

/** The steps, in the chosen language. */
const getSteps = (t: Translate) => [
  {
    icon: <PhoneOnTableIcon />,
    title: t("Set up the phone on a table"),
    body: t("Use a spare phone. Stand it up on a table or shelf where it can see most of the room, and keep it plugged in to charge."),
  },
  {
    icon: <MovementIcon />,
    title: t("Start watching"),
    body: (
      <>
        {t("On that phone, sign in and open")}{" "}
        <Link to="/tracker" className="font-bold text-brand underline">
          {t("Phone camera")}
        </Link>
        {t(". ")}
        {t('Press "Start watching". A green "Camera on" sign stays on the screen while it works.')}
      </>
    ),
  },
  {
    icon: <DashboardIcon />,
    title: t("Add your family"),
    body: (
      <>
        {t("Each person makes their own CareNest account first. Then, on the")}{" "}
        <Link to="/dashboard" className="font-bold text-brand underline">
          {t("Family page")}
        </Link>
        {t(', type their email under "Add a family member". They will see the same news.')}
      </>
    ),
  },
  {
    icon: <AlertIcon />,
    title: t("What the news means"),
    body: t(
      "Green means all is well, like \"Moving around\". Red means the phone thinks someone may have fallen: please call or visit. A white box means the phone hasn't checked in for a few minutes — check it is on and charging.",
    ),
  },
  {
    icon: <PrivacyIcon />,
    title: t("Your privacy"),
    body: t(
      "Video and pictures never leave the phone. Family only get short notes in words, like \"Sitting still - left side\". Only the people you add can see them.",
    ),
  },
];

/** The questions, in the chosen language. */
const getFaqs = (t: Translate) => [
  {
    q: t("Does CareNest record video?"),
    a: t("No. The phone looks at the room itself and only sends short words, like \"Moving around\". No video or pictures are sent or saved anywhere."),
  },
  {
    q: t("Which phone can I use?"),
    a: t("Most smartphones from the last few years work. It needs a working camera, Wi-Fi or mobile data, and a charger."),
  },
  {
    q: t("What happens if the phone thinks someone has fallen?"),
    a: t("The \"Right now\" box on the Family page turns red and asks you to call or visit. CareNest does not call emergency services, so if you can't reach them, call someone nearby or the emergency number."),
  },
  {
    q: t("The Family page says the phone hasn't checked in. What do I do?"),
    a: t("Check the phone is switched on, plugged in, connected to the internet, and still showing the green \"Camera on\" sign. If not, open Phone camera again and press \"Start watching\"."),
  },
  {
    q: t("I forgot my password."),
    a: (
      <>
        {t("Use the")}{" "}
        <Link to="/login?mode=forgot" className="font-bold text-brand underline">
          {t("reset your password")}
        </Link>{" "}
        {t("form and we'll email you a link. Once you're signed in, you can change your password any time on")}{" "}
        <Link to="/account" className="font-bold text-brand underline">
          {t("Your account")}
        </Link>
        {t(".")}
      </>
    ),
  },
  {
    q: t("Is CareNest a medical device?"),
    a: t("No. It is a gentle helper so family can feel closer. It can miss things, so keep calling and visiting as usual."),
  },
];

export default function HelpPage() {
  const { t } = useLanguage();
  const steps = getSteps(t);
  const faqs = getFaqs(t);
  return (
    <SiteLayout title="Help and how-to">
      <section className="relative isolate px-4 pb-24 pt-6 sm:px-6">
        <Blobs fixed />
        <div className="mx-auto flex max-w-3xl flex-col gap-10">
          <div>
            <h1 className="text-4xl font-extrabold md:text-5xl">
              <Highlight text={t("Help and *how‑to*")} />
            </h1>
            <p className="mt-3 text-xl text-muted">{t("Getting started takes about five minutes. Here's how.")}</p>
          </div>

          <section aria-labelledby="steps-title">
            <h2 id="steps-title" className="text-3xl font-extrabold">
              {t("Getting started")}
            </h2>
            <ol className="mt-5 flex flex-col gap-4">
              {steps.map((step, i) => (
                <li
                  key={step.title}
                  className="flex flex-col items-start gap-4 rounded-[32px] bg-surface p-6 shadow-soft sm:flex-row sm:items-center sm:p-8"
                >
                  <span className="grid h-28 w-28 shrink-0 place-items-center rounded-3xl bg-lilac">{step.icon}</span>
                  <div>
                    <h3 className="text-2xl font-extrabold">
                      <span className="text-brand">{i + 1}.</span> {step.title}
                    </h3>
                    <p className="mt-2 text-xl">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="faq-title">
            <h2 id="faq-title" className="text-3xl font-extrabold">
              {t("Common questions")}
            </h2>
            <div className="mt-5 flex flex-col gap-3">
              {faqs.map((faq) => (
                <details key={faq.q} className="group rounded-2xl bg-surface shadow-soft">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-4 text-xl font-extrabold [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span aria-hidden="true" className="text-2xl text-brand transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="px-6 pb-5 text-xl">{faq.a}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="rounded-[32px] bg-mint p-6 sm:p-8">
            <h2 className="text-2xl font-extrabold">{t("Still stuck?")}</h2>
            <p className="mt-2 text-xl">
              {t("Ask the family member who set up CareNest, or contact the CareNest team. We're happy to help.")}
            </p>
            <ButtonLink to="/dashboard" arrow className="mt-5">
              {t("Go to the Family page")}
            </ButtonLink>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
