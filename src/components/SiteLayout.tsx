import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router";
import { useLanguage } from "../i18n/useLanguage";
import { useOnline } from "../lib/useOnline";
import { Arrow } from "./ButtonLink";
import { DisplayButton, DisplayPanel } from "./DisplaySettings";
import { motionIsReduced } from "../lib/displaySettings";
import LanguagePicker from "./LanguagePicker";

// The header, footer and page frame shared by every page except the phone camera.
// Copied from the Lovable design: a sticky header that turns frosted when you
// scroll, a purple reading-progress line, a mobile menu, and a "back to top" button.

// The only pages in the app. Shown in the header on every screen size.
const navLinks = [
  { to: "/", label: "About Us" },
  { to: "/login", label: "Sign in" },
  { to: "/tracker", label: "Phone camera" },
  { to: "/dashboard", label: "Family" },
  { to: "/profile", label: "Care profile" },
  { to: "/help", label: "Help" },
];

/** The CareNest heart. It beats when you hover the logo. */
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="22" fill="#c9f0df" />
      <path
        className="origin-center [transform-box:fill-box] group-hover:animate-heartbeat"
        d="M22 33s-11-6.5-11-14a6 6 0 0 1 11-3.4A6 6 0 0 1 33 19c0 7.5-11 14-11 14z"
        fill="var(--color-brand)"
      />
    </svg>
  );
}

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const displayButton = useRef<HTMLButtonElement>(null);
  const closeDisplay = useCallback(() => {
    setDisplayOpen(false);
    displayButton.current?.focus();
  }, []);
  const { t } = useLanguage();

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(y > 12);
      setProgress(max > 0 ? Math.min(1, y / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes the mobile menu and puts focus back on its button.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${scrolled || menuOpen ? "glass shadow-soft" : "bg-transparent"}`}
      >
        <div
          className={`mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 transition-all sm:gap-4 sm:px-6 duration-300 ${scrolled ? "py-2" : "py-5"}`}
        >
          <Link to="/" className="group flex min-h-12 items-center gap-3 text-2xl font-black text-ink no-underline">
            <LogoMark />
            <span className="site-wordmark">CareNest</span>
          </Link>
          <nav aria-label="Main" className="site-nav hidden xl:block">
            <ul className="flex gap-1">
              {navLinks.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end
                    className="relative inline-flex min-h-12 items-center rounded-2xl px-3 text-lg lg:px-4 font-extrabold text-brand no-underline transition-colors hover:bg-lilac aria-[current=page]:bg-lilac aria-[current=page]:text-ink"
                  >
                    {t(link.label)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-2">
            {/* Short names on wide screens (next to the links), full names on tablets
                (next to the menu button), and inside the menu on phones. */}
            <LanguagePicker compact className="hidden xl:flex" />
            <LanguagePicker className="hidden md:flex xl:hidden" />
            <DisplayButton
              open={displayOpen}
              buttonRef={displayButton}
              onToggle={() => {
                setDisplayOpen((open) => !open);
                setMenuOpen(false);
              }}
            />
            <button
              ref={menuButton}
              type="button"
              className="site-menu-button grid h-12 w-12 place-items-center rounded-2xl bg-lilac text-brand xl:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? t("Close menu") : t("Open menu")}
              onClick={() => {
                setMenuOpen((open) => !open);
                setDisplayOpen(false);
              }}
            >
              <span className="relative block h-4 w-6" aria-hidden="true">
                <span
                  className={`absolute left-0 h-[3px] w-6 rounded-full bg-brand transition-all duration-300 ${menuOpen ? "top-[7px] rotate-45" : "top-0"}`}
                />
                <span
                  className={`absolute left-0 top-[7px] h-[3px] w-6 rounded-full bg-brand transition-opacity duration-200 ${menuOpen ? "opacity-0" : "opacity-100"}`}
                />
                <span
                  className={`absolute left-0 h-[3px] w-6 rounded-full bg-brand transition-all duration-300 ${menuOpen ? "top-[7px] -rotate-45" : "top-[14px]"}`}
                />
              </span>
            </button>
          </div>
        </div>

        {displayOpen && <DisplayPanel onClose={closeDisplay} />}

        {menuOpen && (
          <nav id="mobile-menu" aria-label="Mobile" className="site-mobile-menu animate-slide-in border-t-2 border-lilac px-6 pb-6 pt-3 xl:hidden">
            <LanguagePicker className="mb-3 md:hidden" />
            <ul className="flex flex-col gap-2">
              {navLinks.map((link, i) => (
                <li key={link.to} className="animate-slide-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <NavLink
                    to={link.to}
                    end
                    onClick={() => setMenuOpen(false)}
                    className="group flex min-h-14 items-center justify-between rounded-2xl bg-surface px-5 text-xl font-extrabold text-brand no-underline aria-[current=page]:bg-lilac aria-[current=page]:text-ink"
                  >
                    {t(link.label)}
                    <Arrow />
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* How far down the page you are. */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-1 w-full origin-left bg-brand transition-transform duration-150"
          style={{ transform: `scaleX(${progress})` }}
        />
      </header>

      <button
        type="button"
        aria-label={t("Back to top")}
        onClick={() => window.scrollTo({ top: 0, behavior: motionIsReduced() ? "auto" : "smooth" })}
        className={`fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-brand text-on-brand shadow-lift transition-all duration-300 hover:bg-brand-dark ${progress > 0.12 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path
            d="M11 17V5m-5 5 5-5 5 5"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </>
  );
}

export function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 pb-10 text-muted">
      <span className="group flex items-center gap-2 font-bold">
        <LogoMark size={28} /> © 2026 CareNest
      </span>
      <span>{t("Only the people you invite can see anything.")}</span>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
        <Link to="/help" className="inline-flex min-h-12 items-center font-bold text-brand underline underline-offset-4">
          {t("Need help?")}
        </Link>
        <Link to="/account" className="inline-flex min-h-12 items-center font-bold text-brand underline underline-offset-4">
          {t("Your account")}
        </Link>
      </nav>
    </footer>
  );
}

/** A small green "Live" sign with a pulsing dot. */
export function LivePill({ children }: { children?: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm font-bold text-leaf">
      <span className="relative flex h-2 w-2">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-leaf" />
        <span className="relative h-2 w-2 rounded-full bg-leaf" />
      </span>
      {children ?? t("Live")}
    </span>
  );
}

/**
 * Soft coloured clouds that drift slowly behind a section. `fixed` pins them to
 * the screen instead, for pages whose height changes as they load, so nothing jumps.
 */
export function Blobs({ fixed = false }: { fixed?: boolean }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none ${fixed ? "fixed" : "absolute"} inset-0 -z-10`}>
      <div className="absolute -left-24 top-10 h-80 w-80 animate-blob rounded-full bg-lilac opacity-80 blur-3xl" />
      <div className="absolute right-0 top-32 h-96 w-96 animate-blob rounded-full bg-mint opacity-80 blur-3xl [animation-delay:-5s]" />
      <div className="absolute bottom-0 left-1/3 h-72 w-72 animate-blob rounded-full bg-peach opacity-70 blur-3xl [animation-delay:-9s]" />
    </div>
  );
}

/** Skip link, header, the page itself, and the footer. Names the browser tab too. */
export default function SiteLayout({ title, children }: { title?: string; children: React.ReactNode }) {
  const online = useOnline();
  const { t } = useLanguage();
  // Pages pass the English title; it is translated here.
  const tabTitle = title && t(title);
  useEffect(() => {
    if (!tabTitle) return;
    const previous = document.title;
    document.title = `${tabTitle} — CareNest`;
    return () => {
      document.title = previous;
    };
  }, [tabTitle]);

  return (
    // The footer stays at the bottom of the screen, so it doesn't jump while a page loads.
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-surface focus:px-5 focus:py-3 focus:font-bold"
      >
        {t("Skip to main content")}
      </a>
      <SiteHeader />
      {!online && (
        <p role="status" className="mx-4 mt-2 rounded-2xl bg-sun px-5 py-3 text-center text-lg font-bold text-ink">
          {t("You're offline. Check your Wi-Fi or mobile data; the page will catch up when you're back online.")}
        </p>
      )}
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
