import { Link } from "react-router";
import { primaryButton, textLink } from "../components/ButtonLink";
import { Footer, Masthead, SkipLink } from "../components/SiteLayout";

// The About Us page at "/". It reads like a printed leaflet: a photo and a plain
// headline, then sections with the heading on the left and the text on the right.
// Every claim here matches what the app does today (see src/tracker/events.ts and
// src/family/status.ts), so check those before changing the wording.

const SIGN_UP = "/login?mode=sign-up";

const sections = [
  { href: "#how", label: "How it works" },
  { href: "#alert", label: "When there's an alert" },
  { href: "#costs", label: "What it costs" },
  { href: "#who", label: "Who we are" },
];

const steps = [
  {
    lead: "Stand a spare phone on a table where it can see the room.",
    text: "Open the Phone camera page on it, sign in, and press “Start watching”. There is nothing to wear and nothing to charge on the wrist.",
  },
  {
    lead: "The phone keeps an eye on the room.",
    text: "It notices whether someone is moving about, sitting or standing still, or lying down, and which side of the room they are in. If someone goes from standing to lying down within about three seconds, it notes a possible fall.",
  },
  {
    lead: "Family see it in plain words.",
    text: "Sign in on your own phone or computer and open the family page. It says what is happening right now, for example “Moving around - left side - 2 minutes ago”, and it updates by itself.",
  },
];

// Parts for the optional moving stand, from phone-tracker/docs/SHOPPING_LIST.md (checked 17 October 2026).
const parts = [
  { name: "Lynxmotion pan-and-tilt kit, with two servo motors", price: "$48.65" },
  { name: "Adafruit ESP32 Feather V2 controller board", price: "$20.95" },
  { name: "5V power supply and plug adapters", price: "$18.92" },
  { name: "LD2410C radar sensors, pack of two", price: "$14.99" },
  { name: "Bolt and nut for the phone holder", price: "about $1" },
];

/** The h2 in the left third and the text in the right two thirds, with a thin rule on top. */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto mt-20 max-w-6xl scroll-mt-4 px-4 sm:px-6">
      <div className="grid gap-6 border-t border-rule pt-8 md:grid-cols-12">
        <h2 id={`${id}-title`} className="text-h2 md:col-span-4">
          {title}
        </h2>
        <div className="max-w-[62ch] md:col-span-8">{children}</div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <SkipLink />
      <Masthead
        sections={sections}
        actions={
          <Link to="/login" className={textLink}>
            Sign in
          </Link>
        }
      />

      <main id="main">
        {/* Photo on the left, headline on the right. On a phone the photo comes first. */}
        <section aria-labelledby="hero-title" className="mx-auto max-w-6xl md:px-6 md:pt-10">
          <div className="grid md:grid-cols-12 md:gap-12">
            <img
              src="/photos/kitchen-woman-vegetables.jpg"
              srcSet="/photos/kitchen-woman-vegetables-800.jpg 800w, /photos/kitchen-woman-vegetables.jpg 1400w"
              sizes="(min-width: 768px) 58vw, 100vw"
              width={1400}
              height={931}
              fetchPriority="high"
              alt="An older woman chopping vegetables at her kitchen counter."
              className="aspect-[4/3] h-full w-full object-cover md:col-span-7 md:aspect-auto md:max-h-[640px]"
            />
            <div className="flex flex-col items-start justify-center px-4 pt-8 sm:px-6 md:col-span-5 md:px-0 md:pt-0">
              <h1 id="hero-title" className="text-h1 md:text-h1-lg">
                A phone on her table, and a page that tells you how she is.
              </h1>
              <p className="mt-5 text-lead">
                CareNest runs on a spare phone. It watches the room for movement, and if your mother may have fallen,
                the family page says so in plain words. The camera picture never leaves the phone.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
                <a href="#how" className={primaryButton}>
                  See how it works
                </a>
                <Link to={SIGN_UP} className={textLink}>
                  or create an account
                </Link>
              </div>
            </div>
          </div>
        </section>

        <Section id="how" title="How it works">
          <ol className="flex flex-col">
            {steps.map((step, i) => (
              <li key={step.lead} className="grid grid-cols-[3rem_1fr] gap-4 border-b border-rule py-5 first:pt-0">
                <span aria-hidden="true" className="font-serif text-[2.4rem] leading-none font-semibold text-spruce">
                  {i + 1}
                </span>
                <p>
                  <strong>{step.lead}</strong> {step.text}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-6 bg-stone p-5">
            <strong>About the camera.</strong> The picture is checked on the phone itself. It is never recorded and
            never sent anywhere. Only short notes like “moving around, left side” leave the phone, and only the people
            you add to your family page can read them.
          </p>
        </Section>

        <Section id="alert" title="What happens when an alert goes off">
          <ol className="flex flex-col gap-7 border-l-[3px] border-ink pl-6">
            <li>
              <p className="font-serif text-h3 font-semibold">First</p>
              <p className="mt-1">
                The phone sees someone go from standing to lying down within about three seconds. It sends one short
                note, “Possible fall”, with the side of the room.
              </p>
            </li>
            <li>
              <p className="font-serif text-h3 font-semibold">Then</p>
              <p className="mt-1">
                The family page turns pale red for everyone who can see it, without anyone needing to reload. It says:
              </p>
              <blockquote className="mt-3 flex flex-col gap-1 bg-stone p-5 font-serif text-lead italic">
                <p>Please check on them.</p>
                <p>Possible fall - left side - just now</p>
                <p>The phone thinks someone may have fallen. Please call or visit to check they are okay.</p>
              </blockquote>
            </li>
            <li>
              <p className="font-serif text-h3 font-semibold">Next</p>
              <p className="mt-1">
                You ring her or go round. CareNest doesn't make calls or send text messages yet, so keep the family page
                somewhere you will see it.
              </p>
              <figure className="mt-4">
                <img
                  src="/photos/woman-telephone-margaret.jpg"
                  width={1400}
                  height={931}
                  loading="lazy"
                  alt="An older woman sitting in her armchair, talking on a telephone."
                  className="aspect-[3/2] w-full object-cover"
                />
              </figure>
            </li>
            <li>
              <p className="font-serif text-h3 font-semibold">If the phone goes quiet</p>
              <p className="mt-1">
                The phone checks in once a minute while it is watching. If the family page hears nothing for three
                minutes, it tells you to check that the phone is switched on and charging.
              </p>
            </li>
          </ol>
        </Section>

        <Section id="costs" title="What it costs">
          <p className="text-lead">
            <strong>CareNest is free while we test it.</strong> All you need is a spare phone with a camera and a web
            browser, and a table to stand it on.
          </p>
          <p className="mt-4">
            If you would like the optional moving stand, which turns the phone to follow the person you pick, these are
            the parts we use:
          </p>
          <table className="mt-5 w-full border-collapse">
            <caption className="sr-only">Parts for the moving stand, with prices</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Part</th>
                <th scope="col">Price</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => (
                <tr key={part.name} className="border-t border-rule">
                  <td className="py-3 pr-4">{part.name}</td>
                  <td className="py-3 text-right whitespace-nowrap tabular-nums">{part.price}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink">
                <th scope="row" className="py-3 pr-4 text-left font-bold">
                  Total
                </th>
                <td className="py-3 text-right font-bold whitespace-nowrap tabular-nums">about $104</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-4 text-muted">
            Prices as we found them on 17 October 2026, before shipping and tax. The stand connects over Bluetooth, which
            works in Chrome or Edge on a computer, or in the free Bluefy app on an iPhone.
          </p>
        </Section>

        <Section id="who" title="Who we are">
          <div className="flex flex-col gap-4">
            <p>
              We are a small hackathon team. Many of us have parents and grandparents who live on their own, and we
              wanted a simple way to know they are all right without asking them to wear anything.
            </p>
            <p>
              Dennis built the stand: a phone holder on a pan-and-tilt neck with small radar sensors, so the phone
              can turn to follow the person it is watching.
            </p>
            <p>
              CareNest is still being tested. It is not a medical alarm and it does not call anyone for you, so please
              keep any alarm you already rely on.
            </p>
          </div>
          <figure className="mt-8">
            <div className="grid grid-cols-5 gap-3">
              <img
                src="/photos/man-with-cat.jpg"
                width={1400}
                height={933}
                loading="lazy"
                alt="An older man at home holding his cat."
                className="col-span-3 h-full w-full object-cover"
              />
              <img
                src="/photos/couple-reading.jpg"
                width={931}
                height={1400}
                loading="lazy"
                alt="An older couple reading a book together on the sofa."
                className="col-span-2 h-full w-full object-cover"
              />
            </div>
            <figcaption className="mt-2 text-base text-muted">
              Not our team: photos by Shixart1985 on Wikimedia Commons. <Link to="/photo-credits">Photo credits</Link>
            </figcaption>
          </figure>
          <div className="mt-6 border-2 border-dashed border-[#a9a190] bg-stone p-6">
            <p className="font-serif italic">A photo of our team with the real stand will go here.</p>
          </div>
        </Section>
      </main>

      <Footer />
    </>
  );
}
