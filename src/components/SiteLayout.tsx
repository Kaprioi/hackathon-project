import { useEffect } from "react";
import { Link } from "react-router";
import { textLink } from "./ButtonLink";

// The pieces every page shares: the "skip to content" link, the masthead with the
// serif CareNest wordmark and a 2px ink rule under it, and the footer.

/** Names the browser tab after the page, so it is easy to find again. */
export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — CareNest`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only bg-paper px-5 py-3 font-bold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20"
    >
      Skip to main content
    </a>
  );
}

export function Wordmark() {
  return (
    <Link to="/" className="inline-flex min-h-12 items-center font-serif text-[1.8rem] font-semibold text-ink no-underline">
      CareNest
    </Link>
  );
}

/**
 * The top of every page. `sections` are in-page links shown on wider screens only;
 * `actions` (like "Sign in") always stay visible, pushed to the right.
 */
export function Masthead({
  sections = [],
  actions,
}: {
  sections?: { href: string; label: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b-2 border-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-1 px-4 py-3 sm:px-6">
        <Wordmark />
        {sections.length > 0 && (
          <nav aria-label="On this page" className="hidden md:block">
            <ul className="flex gap-6">
              {sections.map((s) => (
                <li key={s.href}>
                  <a
                    href={s.href}
                    className="inline-flex min-h-12 items-center text-ink no-underline hover:underline"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-x-6">{actions}</div>}
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 border-t-2 border-ink">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="font-serif text-h3 font-semibold">CareNest</p>
          <p className="mt-2 max-w-[44ch] text-muted">
            A phone on the table that tells family, in plain words, how someone at home is doing. Made by a small
            hackathon team and free while we test it.
          </p>
        </div>
        <nav aria-label="Footer" className="md:col-span-7">
          <ul className="flex flex-wrap gap-x-8">
            <li>
              <Link to="/" className={textLink}>
                About Us
              </Link>
            </li>
            <li>
              <Link to="/login" className={textLink}>
                Sign in
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className={textLink}>
                Family page
              </Link>
            </li>
            <li>
              <Link to="/tracker" className={textLink}>
                Phone camera
              </Link>
            </li>
            <li>
              <Link to="/photo-credits" className={textLink}>
                Photo credits
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
