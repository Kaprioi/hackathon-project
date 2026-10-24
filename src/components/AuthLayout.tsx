import { Link } from "react-router";
import { primaryButton, textLink } from "./ButtonLink";
import { Footer, Masthead, SkipLink, usePageTitle } from "./SiteLayout";

// Kept under their old names so the sign in pages read the same as before.
export { primaryButton, textLink as linkButton };

// The alert red from the palette: 6.98:1 on paper, 6.49:1 on the pale red tint.
export const ERROR_RED = "text-alert";

// The page frame shared by the sign in and new password pages: the masthead, then
// the form on the left and (on wider screens) a photo on the right.
export default function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  usePageTitle(title);

  return (
    <>
      <SkipLink />
      <Masthead
        actions={
          <Link to="/" className={textLink}>
            About CareNest
          </Link>
        }
      />

      {/* The minimum height keeps the footer from jumping when "Loading…" turns into the form. */}
      <main id="main" className="mx-auto grid min-h-[85vh] max-w-6xl content-start gap-12 px-4 pt-10 sm:px-6 md:grid-cols-2 md:pt-14">
        <div className="max-w-xl">{children}</div>
        <figure className="hidden md:block">
          <img
            src="/photos/woman-window-phone.jpg"
            width={934}
            height={1400}
            alt="An older woman standing by a sunny window, reading something on her phone."
            className="h-auto w-full"
          />
          <figcaption className="mt-2 text-base text-muted">
            Photo: Shixart1985, CC BY 2.0, via Wikimedia Commons.
          </figcaption>
        </figure>
      </main>
      <Footer />
    </>
  );
}

// A notice for good news or problems, with a coloured bar on the left. Screen readers read it out.
export function Message({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return kind === "error" ? (
    <p role="alert" className={`border-l-4 border-alert bg-alert-tint p-4 font-bold ${ERROR_RED}`}>
      {children}
    </p>
  ) : (
    <p role="status" className="border-l-4 border-ok bg-stone p-4 font-bold text-ink">
      {children}
    </p>
  );
}

// Shown instead of a form when the Supabase keys haven't been added yet.
export function NotConfigured() {
  return (
    <div className="flex flex-col items-start gap-5">
      <h1 className="text-h1 md:text-h1-lg">Signing in isn't ready yet</h1>
      <p className="text-lead text-muted">We're still setting this part up. Please try again a little later.</p>
      <p className="bg-stone p-4">
        <strong>For the team:</strong> add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{" "}
        <code>.env.local</code> (or to Vercel's environment variables), then restart the app.
      </p>
      <Link to="/" className={primaryButton}>
        Back to About Us
      </Link>
    </div>
  );
}
