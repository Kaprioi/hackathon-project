import { buttonVariants } from "./ButtonLink";
import { usePushAlerts } from "../family/usePushAlerts";
import { useLanguage } from "../i18n/useLanguage";

// "Alerts on this device" on the family page: phone notifications for a possible
// fall, even when the family page is closed. The logic is in usePushAlerts.ts.

function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        d="M12 3a6 6 0 0 0-6 6v3.6L4.3 16a1 1 0 0 0 .9 1.5h13.6a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6zm-2.5 16a2.5 2.5 0 0 0 5 0z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function PushAlerts({ circleId, userId, who }: { circleId: string; userId: string; who: string }) {
  const { lang, t } = useLanguage();
  const push = usePushAlerts({ circleId, userId, lang, who });
  const { state } = push;

  // What to say when alerts can't be turned on here.
  const why: Partial<Record<typeof state, string>> = {
    "not-set-up": "Phone alerts aren't set up on this site yet. Whoever looks after CareNest can turn them on (see the README).",
    "needs-database":
      "Phone alerts need a quick database update first. Please ask whoever set up CareNest to run the new step in the README.",
    "home-screen":
      'On iPhone or iPad, first tap the Share button, then "Add to Home Screen", and open CareNest from the new icon. Then you can turn on alerts here. This needs iOS 16.4 or newer.',
    unsupported: "This browser can't show alerts. Try Chrome, Edge, Firefox or Safari on a computer or an Android phone.",
    blocked:
      "Notifications are blocked for this site. To get alerts, allow notifications for CareNest in your browser or phone settings, then reload this page.",
  };

  return (
    <section aria-labelledby="push-title" className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <h2 id="push-title" className="text-2xl font-extrabold">
        {t("Alerts on this device")}
      </h2>
      <p className="mt-2 text-lg text-muted">
        {t("Get a notification on this phone or computer if the camera sees a possible fall, even when this page is closed.")}
      </p>

      {why[state] && <p className="mt-4 text-xl font-bold">{t(why[state])}</p>}

      {state === "off" && (
        <button
          type="button"
          onClick={push.turnOn}
          disabled={push.busy}
          className={`${buttonVariants.primary} mt-4 w-full gap-2 text-xl disabled:opacity-70 sm:w-auto`}
        >
          <BellIcon />
          {push.busy ? t("Turning on…") : t("Get alerts on this device")}
        </button>
      )}

      {state === "on" && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-xl font-extrabold text-leaf">{t("Alerts are on for this device.")}</p>
          <label className="flex min-h-12 cursor-pointer items-center gap-4 text-xl font-bold">
            <input
              type="checkbox"
              className="h-7 w-7 shrink-0 accent-brand"
              checked={push.extras.cameraOff}
              onChange={(e) => push.setExtra("cameraOff", e.target.checked)}
            />
            {t("Also tell me when the phone camera stops watching")}
          </label>
          <label className="flex min-h-12 cursor-pointer items-center gap-4 text-xl font-bold">
            <input
              type="checkbox"
              className="h-7 w-7 shrink-0 accent-brand"
              checked={push.extras.noMovement}
              onChange={(e) => push.setExtra("noMovement", e.target.checked)}
            />
            {t("Also tell me when nobody has moved for a while during the day")}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={push.sendTest}
              disabled={push.busy}
              className={`${buttonVariants.primary} text-xl disabled:opacity-70`}
            >
              {t("Send a test alert")}
            </button>
            <button
              type="button"
              onClick={push.turnOff}
              disabled={push.busy}
              className={`${buttonVariants.outline} text-xl disabled:opacity-70`}
            >
              {t("Turn off alerts on this device")}
            </button>
          </div>
        </div>
      )}

      {push.message && (
        <p role="status" className={`mt-4 text-lg font-bold ${push.message.ok ? "text-leaf" : "text-error"}`}>
          {t(push.message.text)}
        </p>
      )}

      {state !== "home-screen" && (
        <p className="mt-4 text-base text-muted">
          {t("On iPhone, alerts only work after adding CareNest to your Home Screen (iOS 16.4 or newer).")}
        </p>
      )}
    </section>
  );
}
