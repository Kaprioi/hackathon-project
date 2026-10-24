import { Link } from "react-router";
import { buttonVariants } from "./ButtonLink";
import SiteLayout, { Blobs } from "./SiteLayout";

export const linkButton =
  "inline-flex min-h-12 items-center rounded-xl px-1 text-lg font-bold text-brand underline underline-offset-4 hover:text-brand-dark";

// The same big buttons as the homepage, stretched to the width of the card.
export const primaryButton = `${buttonVariants.primary} w-full text-xl disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0`;
export const outlineButton = `${buttonVariants.outline} w-full text-xl disabled:cursor-not-allowed disabled:opacity-70`;

// Dark red that passes WCAG AA contrast on white and on the cream background.
export const ERROR_RED = "text-error";

// The page frame shared by the log in and new password pages: the same header,
// footer and drifting colour clouds as the homepage, then one big rounded white card.
export default function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SiteLayout title={title}>
      {/* At least as tall as the screen, so the footer doesn't jump when "Loading…" turns into the form. */}
      <section className="relative isolate min-h-screen px-4 pb-24 pt-6">
        <Blobs fixed />
        <div className="mx-auto max-w-xl animate-slide-in rounded-[40px] bg-surface p-7 shadow-lift sm:p-10">
          {children}
        </div>
      </section>
    </SiteLayout>
  );
}

// A friendly coloured box for good news or problems. Screen readers read it out.
export function Message({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return kind === "error" ? (
    <p
      role="alert"
      className={`rounded-2xl border-[3px] border-error bg-error-soft p-4 text-lg font-bold ${ERROR_RED}`}
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
