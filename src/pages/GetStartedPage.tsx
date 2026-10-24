import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { buttonVariants } from "../components/ButtonLink";
import Highlight from "../components/Highlight";
import SiteLayout, { Blobs, LogoMark } from "../components/SiteLayout";
import { useLanguage } from "../i18n/useLanguage";
import { motionIsReduced } from "../lib/displaySettings";
import { FAMILY, GUIDE, markGuideDone } from "../lib/guide";
import { useSession } from "../lib/useSession";

// The setup guide people see right after signing in: one step at a time, it walks
// them through turning an iPhone into the phone camera on the table. The Next
// button glows so it's always clear what to press.

// The live website. A QR code for "localhost" wouldn't open on an iPhone.
const LIVE_SITE = "https://carenest-eight-bay.vercel.app";

function phoneCameraAddress(): string {
  const { hostname, origin } = window.location;
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  return `${local ? LIVE_SITE : origin}/tracker`;
}

export default function GetStartedPage() {
  const session = useSession();
  const { t } = useLanguage();
  // Not signed in: sign in first, then come straight back here.
  if (session === null) return <Navigate to={`/login?next=${GUIDE}`} replace />;
  if (session === undefined)
    return (
      <SiteLayout title="Set up your iPhone">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
          <p className="text-xl text-muted">{t("Loading…")}</p>
        </div>
      </SiteLayout>
    );
  return <Guide userId={session.user.id} />;
}

function Guide({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const address = phoneCameraAddress();

  // A new step: back to the top, and tell screen readers by focusing its heading.
  // (Not when the guide first opens, only when the step changes.)
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    window.scrollTo({ top: 0, behavior: motionIsReduced() ? "auto" : "smooth" });
    heading.current?.focus();
  }, [step]);

  function finish(to: string) {
    markGuideDone(userId);
    navigate(to);
  }

  const steps: { title: string; body: React.ReactNode; picture: React.ReactNode }[] = [
    {
      title: t("You're *signed in!*"),
      body: (
        <>
          <p>{t("Now let's turn an iPhone into the camera that stands on the table. It takes about 5 minutes.")}</p>
          <p className="mt-4 font-extrabold text-ink">{t("You'll need:")}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {[t("An iPhone (an old one is perfect)"), t("Its charger"), t("Wi-Fi")].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <Tick />
                {item}
              </li>
            ))}
          </ul>
        </>
      ),
      picture: (
        <IPhone label={t("An iPhone showing CareNest")}>
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <LogoMark size={64} />
            <span className="text-lg font-black">CareNest</span>
          </div>
        </IPhone>
      ),
    },
    {
      title: t("Get the iPhone *ready*"),
      body: (
        <ol className="flex flex-col gap-3">
          <Numbered n={1}>{t("Plug it into its charger.")}</Numbered>
          <Numbered n={2}>{t("Connect it to Wi-Fi.")}</Numbered>
          <Numbered n={3}>
            {t("Stop the screen from turning off. Open")} <strong>{t("Settings")}</strong> →{" "}
            <strong>{t("Display & Brightness")}</strong> → <strong>{t("Auto-Lock")}</strong> →{" "}
            <strong>{t("Never")}</strong>.
          </Numbered>
        </ol>
      ),
      picture: (
        <IPhone label={t("The iPhone's Auto-Lock setting, set to Never")}>
          <p className="text-center text-base font-black">{t("Auto-Lock")}</p>
          <ul className="mt-3 flex flex-col overflow-hidden rounded-xl bg-cream text-sm font-bold">
            {["30 s", "1 min", "2 min", "5 min"].map((time) => (
              <li key={time} className="border-b border-lilac px-3 py-2">
                {time}
              </li>
            ))}
            <li className="flex items-center justify-between bg-lilac px-3 py-2 text-brand">
              {t("Never")} <span aria-hidden="true">✓</span>
            </li>
          </ul>
          <p className="mt-auto flex items-center justify-center gap-1 text-sm font-extrabold text-leaf">
            <span aria-hidden="true">⚡</span> {t("Charging")}
          </p>
        </IPhone>
      ),
    },
    {
      title: t("Open CareNest *on the iPhone*"),
      body: (
        <>
          <ol className="flex flex-col gap-3">
            <Numbered n={1}>
              <Highlight text={t("On the iPhone, open the *Camera* app.")} wrap={(word) => <strong>{word}</strong>} />
            </Numbered>
            <Numbered n={2}>{t("Point it at this code, like you're taking a photo.")}</Numbered>
            <Numbered n={3}>{t("Tap the yellow link that appears.")}</Numbered>
          </ol>
          <p className="mt-5">
            {t("No luck? Type this address into Safari instead:")}
            <br />
            <strong className="break-all text-ink">{address.replace(/^https?:\/\//, "")}</strong>
          </p>
          <p className="mt-4 rounded-2xl bg-lilac p-4">
            {t("Reading this on the iPhone that will stand on the table?")}{" "}
            <Link to="/tracker" className="font-extrabold text-brand underline">
              {t("Open Phone Camera here")}
            </Link>
          </p>
        </>
      ),
      picture: <QrCard address={address} label={t("Scan me with the iPhone's Camera")} />,
    },
    {
      title: t("Sign in *on the iPhone*"),
      body: (
        <p>
          {t("The iPhone opens the Phone Camera page. Tap")} <strong>{t("Sign in")}</strong>{" "}
          {t("and use the same email and password you used here.")}
        </p>
      ),
      picture: (
        <IPhone label={t("The sign in page on the iPhone")}>
          <p className="mt-4 text-center text-base font-black">{t("Welcome back")}</p>
          <div className="mt-4 flex flex-col gap-2">
            <span className="rounded-lg border-2 border-muted px-2 py-1.5 text-xs text-muted">{t("Email")}</span>
            <span className="rounded-lg border-2 border-muted px-2 py-1.5 text-xs text-muted">{t("Password")}</span>
            <span className="mt-1 rounded-lg bg-brand py-1.5 text-center text-xs font-extrabold text-on-brand">
              {t("Log in")}
            </span>
          </div>
        </IPhone>
      ),
    },
    {
      title: t("Start *watching*"),
      body: (
        <ol className="flex flex-col gap-3">
          <Numbered n={1}>
            {t("Tap")} <strong>{t("Start watching")}</strong>.
          </Numbered>
          <Numbered n={2}>
            {t("The iPhone asks to use the camera. Tap")} <strong>{t("Allow")}</strong>.
          </Numbered>
        </ol>
      ),
      picture: (
        <IPhone label={t("The iPhone asking to use the camera, with Allow highlighted")}>
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full overflow-hidden rounded-xl bg-cream text-center shadow-soft">
              <p className="px-2 pt-3 text-xs font-extrabold">{t("Allow CareNest to use the camera?")}</p>
              <div className="mt-3 grid grid-cols-2 border-t border-lilac text-xs font-bold">
                <span className="border-r border-lilac py-2 text-muted">{t("Don't Allow")}</span>
                <span className="bg-brand py-2 font-extrabold text-on-brand">{t("Allow")}</span>
              </div>
            </div>
          </div>
        </IPhone>
      ),
    },
    {
      title: t("Stand it *on a table*"),
      body: (
        <>
          <p>
            {t("Stand the iPhone up where it can see most of the room, and leave it plugged in.")}
          </p>
          <p className="mt-4 rounded-2xl bg-mint p-4 text-ink">
            {t('A green "Camera on" sign means it\'s working. Video never leaves the phone.')}
          </p>
        </>
      ),
      picture: (
        <IPhone label={t('The iPhone on the table, showing the green "Camera on" sign')} dark>
          <p className="-mx-3 -mt-2 bg-leaf px-2 py-1.5 text-center text-xs font-extrabold text-on-brand">
            ● {t("Camera on")}
          </p>
          <svg viewBox="0 0 100 120" className="mt-auto w-full" aria-hidden="true">
            <rect x="0" y="96" width="100" height="24" fill="#3b3b46" />
            <circle cx="50" cy="38" r="12" fill="#c9f0df" />
            <rect x="36" y="52" width="28" height="44" rx="12" fill="#c9f0df" />
            <rect x="30" y="30" width="40" height="70" rx="6" fill="none" stroke="#ffd84d" strokeWidth="3" />
          </svg>
        </IPhone>
      ),
    },
    {
      title: t("You're *all set!*"),
      body: (
        <>
          <p>
            {t("The iPhone is watching. Open the Family page on this computer, or on your own phone, to see how they're doing.")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="animate-glow rounded-2xl">
              <button type="button" onClick={() => finish(FAMILY)} className={buttonVariants.primary}>
                {t("Go to the Family page")}
              </button>
            </span>
            <button type="button" onClick={() => finish("/profile")} className={buttonVariants.outline}>
              {t("Fill in the Care Profile")}
            </button>
          </div>
        </>
      ),
      picture: (
        <div
          aria-hidden="true"
          className="mx-auto grid h-40 w-40 animate-pop place-items-center rounded-full bg-mint text-7xl font-black text-leaf"
        >
          ✓
        </div>
      ),
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <SiteLayout title="Set up your iPhone">
      <section className="relative isolate min-h-screen px-4 pb-24 pt-6 sm:px-6">
        <Blobs fixed />
        <div className="mx-auto max-w-4xl">
          <div key={step} className="animate-slide-in rounded-[40px] bg-surface p-7 shadow-lift sm:p-10">
            {/* How far through the guide you are. */}
            <p className="text-lg font-bold text-muted">{t("Step {n} of {total}", { n: step + 1, total: steps.length })}</p>
            <ol aria-hidden="true" className="mt-2 flex gap-2">
              {steps.map((s, i) => (
                <li
                  key={s.title}
                  className={`h-3 flex-1 rounded-full transition-colors ${i <= step ? "bg-brand" : "bg-lilac"}`}
                />
              ))}
            </ol>

            <div className="mt-8 grid items-center gap-8 md:grid-cols-[1fr_auto]">
              <div className="text-xl font-bold text-muted">
                <h1 ref={heading} tabIndex={-1} className="mb-5 text-4xl font-extrabold text-ink outline-none md:text-5xl">
                  <Highlight text={current.title} />
                </h1>
                {current.body}
              </div>
              <div className="flex justify-center">{current.picture}</div>
            </div>

            {/* On phones: full-width buttons, Next on top. */}
            {!isLast && (
              <div className="mt-10 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
                {step > 0 ? (
                  <button type="button" onClick={() => setStep(step - 1)} className={`${buttonVariants.outline} w-full sm:w-auto`}>
                    {t("Back")}
                  </button>
                ) : (
                  <span className="hidden sm:block" />
                )}
                {/* The glowing Next button: the one thing to press. */}
                <span className="animate-glow rounded-2xl">
                  <button type="button" onClick={() => setStep(step + 1)} className={`${buttonVariants.primary} w-full px-10 text-xl sm:w-auto`}>
                    {t("Next")}
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </span>
              </div>
            )}
          </div>

          <p className="mt-6 text-center">
            <button
              type="button"
              onClick={() => finish(FAMILY)}
              className="min-h-12 px-2 text-lg font-bold text-brand underline underline-offset-4 hover:text-brand-dark"
            >
              {t("Skip the guide for now")}
            </button>
          </p>
        </div>
      </section>
    </SiteLayout>
  );
}

/** A drawing of an iPhone. What's on its screen goes inside. */
function IPhone({ label, dark = false, children }: { label: string; dark?: boolean; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className="w-48 shrink-0 rounded-[2.4rem] bg-ink p-2 shadow-lift">
      <div
        className={`flex aspect-[9/19] flex-col overflow-hidden rounded-[2rem] ${dark ? "bg-[#1b1b22] text-white" : "bg-surface text-ink"}`}
      >
        {/* The little black pill at the top of the screen. */}
        <div aria-hidden="true" className={`mx-auto mt-2 h-5 w-16 shrink-0 rounded-full ${dark ? "bg-black" : "bg-ink"}`} />
        <div className="flex flex-1 flex-col px-3 pb-4 pt-2">{children}</div>
      </div>
    </div>
  );
}

/** The QR code that opens Phone Camera on the iPhone. Made on this device, nothing is sent anywhere. */
function QrCard({ address, label }: { address: string; label: string }) {
  const { t } = useLanguage();
  const [image, setImage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // Loaded only on this step, so other pages stay fast.
    import("qrcode")
      .then((m) => {
        const QR = m.default ?? m;
        return QR.toDataURL(address, { margin: 1, width: 480, color: { dark: "#1f2a37", light: "#ffffff" } });
      })
      .then((url) => !cancelled && setImage(url))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <figure className="w-64 rounded-[32px] border-[3px] border-brand bg-white p-4 text-center shadow-soft">
      {image ? (
        <img src={image} alt={label} width={224} height={224} className="mx-auto h-56 w-56" />
      ) : failed ? (
        <p role="status" className="grid h-56 place-items-center text-lg font-bold text-ink">
          {t("Sorry, the code didn't load. Type the address instead, or reload the page.")}
        </p>
      ) : (
        <div className="mx-auto h-56 w-56 animate-pulse rounded-2xl bg-lilac" />
      )}
      <figcaption className="mt-3 text-base font-extrabold text-ink">{label}</figcaption>
    </figure>
  );
}

function Numbered({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-lg font-black text-on-brand">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function Tick() {
  return (
    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mint font-black text-leaf">
      ✓
    </span>
  );
}
