import { useEffect } from "react";
import { Link } from "react-router";

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

export const linkButton =
  "inline-flex min-h-12 items-center rounded-xl px-1 text-lg font-bold text-brand underline underline-offset-4 hover:text-brand-dark";

const buttonBase =
  "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-[3px] px-7 text-xl font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-70";
export const primaryButton = `${buttonBase} border-brand bg-brand text-white shadow-[0_6px_0_var(--color-brand-dark)] hover:bg-brand-dark`;
export const outlineButton = `${buttonBase} border-brand bg-white text-brand hover:bg-lilac`;

// Dark red that passes WCAG AA contrast on white and on the cream background.
export const ERROR_RED = "text-[#a61b1b]";

// The page frame shared by the log in, new password and dashboard pages:
// the same header as the homepage, then one big rounded white card.
export default function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  // Name the browser tab after the page, so it is easy to find again.
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — CareNest`;
    return () => {
      document.title = previous;
    };
  }, [title]);

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
        <Link to="/" className={linkButton}>
          Back to homepage
        </Link>
      </header>

      <main id="main" className="px-4 pb-20 pt-4">
        <div className="mx-auto max-w-xl rounded-[40px] bg-white p-7 shadow-[0_10px_30px_rgba(31,42,55,0.08)] sm:p-10">
          {children}
        </div>
      </main>
    </>
  );
}

// A friendly coloured box for good news or problems. Screen readers read it out.
export function Message({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return kind === "error" ? (
    <p
      role="alert"
      className={`rounded-2xl border-[3px] border-[#a61b1b] bg-[#fdecec] p-4 text-lg font-bold ${ERROR_RED}`}
    >
      {children}
    </p>
  ) : (
    <p role="status" className="rounded-2xl border-[3px] border-leaf bg-mint p-4 text-lg font-bold text-ink">
      {children}
    </p>
  );
}

// Shown instead of a form when the Supabase keys haven't been added yet.
export function NotConfigured() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-4xl font-extrabold">Logging in isn't ready yet</h1>
      <p className="text-xl text-muted">
        We're still setting this part up. Please try again a little later — sorry for the wait!
      </p>
      <p className="rounded-2xl bg-sun p-4 text-lg">
        <strong>For the team:</strong> add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{" "}
        <code>.env.local</code> (or to Vercel's environment variables), then restart the app.
      </p>
      <Link to="/" className={primaryButton}>
        Back to the homepage
      </Link>
    </div>
  );
}
