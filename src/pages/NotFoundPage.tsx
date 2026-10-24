import ButtonLink from "../components/ButtonLink";
import SiteLayout, { Blobs } from "../components/SiteLayout";
import { useLanguage } from "../i18n/useLanguage";

export default function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <SiteLayout title="Page not found">
      <section className="relative isolate px-4 pb-24 pt-6">
        <Blobs fixed />
        <div className="mx-auto flex max-w-xl animate-slide-in flex-col items-center gap-6 rounded-[40px] bg-surface p-7 text-center shadow-lift sm:p-10">
          <span
            aria-hidden="true"
            className="grid h-16 w-16 animate-heartbeat place-items-center rounded-full bg-peach text-3xl text-alert"
          >
            ♥
          </span>
          <h1 className="text-4xl font-extrabold">{t("Sorry, we can't find that page")}</h1>
          <p className="text-xl text-muted">{t("The page may have moved. Let's take you back to the start.")}</p>
          <ButtonLink to="/" arrow>
            {t("Go to About Us")}
          </ButtonLink>
        </div>
      </section>
    </SiteLayout>
  );
}
