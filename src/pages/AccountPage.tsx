import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { Message, linkButton } from "../components/AuthLayout";
import { buttonVariants } from "../components/ButtonLink";
import { PasswordField, TextField } from "../components/FormFields";
import Highlight from "../components/Highlight";
import SiteLayout, { Blobs } from "../components/SiteLayout";
import { useLanguage } from "../i18n/useLanguage";
import { shownHomeName } from "../family/homeName";
import { cleanDisplayName, displayNameProblem, passwordProblems } from "../lib/account";
import { friendlyError } from "../lib/friendlyError";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";

// The Your account page: your email, the name family see, a new password,
// the family circles you are in, and log out. Only for people who are signed in.

const card = "rounded-[32px] bg-surface p-6 shadow-soft sm:p-8";
const button = `${buttonVariants.primary} self-start text-xl disabled:cursor-not-allowed disabled:opacity-70`;

interface CircleRow {
  role: "owner" | "family";
  care_circles: { name: string } | null;
}

export default function AccountPage() {
  const session = useSession();
  const { t } = useLanguage();
  const [loggingOut, setLoggingOut] = useState(false);

  // Not logged in (or Supabase isn't set up): send people to the log in page.
  if (session === null) return <Navigate to="/login" replace state={loggingOut ? { loggedOut: true } : undefined} />;
  if (session === undefined)
    return (
      <SiteLayout title="Your account">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
          <p className="text-xl text-muted">{t("Loading…")}</p>
        </div>
      </SiteLayout>
    );
  return (
    <Account
      userId={session.user.id}
      email={session.user.email ?? ""}
      loggingOut={loggingOut}
      setLoggingOut={setLoggingOut}
    />
  );
}

function Account({
  userId,
  email,
  loggingOut,
  setLoggingOut,
}: {
  userId: string;
  email: string;
  loggingOut: boolean;
  setLoggingOut: (value: boolean) => void;
}) {
  const { t } = useLanguage();
  const [logOutError, setLogOutError] = useState("");

  async function logOut() {
    setLoggingOut(true);
    setLogOutError("");
    // Once the session is gone, AccountPage takes people to the log in page.
    const { error } = await supabase!.auth.signOut();
    if (error) {
      setLoggingOut(false);
      setLogOutError("Sorry, we couldn't log you out. Please check your internet connection and try again.");
    }
  }

  return (
    <SiteLayout title="Your account">
      <section className="relative isolate min-h-screen px-4 pb-24 pt-6 sm:px-6">
        <Blobs fixed />
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <div>
            <h1 className="text-4xl font-extrabold md:text-5xl">
              <Highlight text={t("Your *account*")} />
            </h1>
            <p className="mt-2 text-lg text-muted">
              {t("Signed in as")} <strong className="text-ink">{email}</strong>
            </p>
          </div>

          <DisplayName userId={userId} />
          <ChangePassword email={email} />
          <Circles userId={userId} />

          <section aria-labelledby="logout-title" className={card}>
            <h2 id="logout-title" className="text-2xl font-extrabold">
              {t("Log out")}
            </h2>
            <p className="mt-2 text-lg text-muted">{t("On a shared computer, log out when you are done.")}</p>
            <div className="mt-4 flex flex-col gap-3">
              {logOutError && <Message kind="error">{t(logOutError)}</Message>}
              <button type="button" onClick={logOut} disabled={loggingOut} className={button}>
                {loggingOut ? t("Logging out…") : t("Log out")}
              </button>
            </div>
          </section>

          <Link to="/help" className={`${linkButton} self-start`}>
            {t("Need help? Read how CareNest works")}
          </Link>
        </div>
      </section>
    </SiteLayout>
  );
}

/** The name family members see. Saved in the profiles table. */
function DisplayName({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase!
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setResult({ ok: false, text: "We couldn't load your name. Please check your internet and reload." });
        setName(data?.display_name ?? "");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = displayNameProblem(name, t);
    if (problem) return setFieldError(problem);
    setFieldError("");
    setResult(null);
    setBusy(true);
    const clean = cleanDisplayName(name);
    const { error } = await supabase!.from("profiles").update({ display_name: clean }).eq("id", userId);
    setBusy(false);
    if (error) setResult({ ok: false, text: friendlyError(error.message) });
    else {
      setName(clean);
      setResult({ ok: true, text: "Your name is saved." });
    }
  }

  return (
    <section aria-labelledby="name-title" className={card}>
      <h2 id="name-title" className="text-2xl font-extrabold">
        {t("Your name")}
      </h2>
      {/* The form shows straight away (switched off until the name arrives), so the
          boxes below don't jump down the page when it loads. */}
      <form noValidate onSubmit={save} className="mt-4 flex flex-col gap-4">
        <TextField
          label="Name"
          hint="The name your family will see."
          autoComplete="name"
          value={name}
          disabled={!loaded}
          placeholder={loaded ? undefined : t("Loading…")}
          onChange={(e) => {
            setName(e.target.value);
            setFieldError("");
            setResult(null);
          }}
          error={fieldError}
        />
        <div aria-live="polite" className="empty:hidden">
          {result && <Message kind={result.ok ? "success" : "error"}>{t(result.text)}</Message>}
        </div>
        <button type="submit" disabled={busy || !loaded} className={button}>
          {busy ? t("Saving…") : t("Save name")}
        </button>
      </form>
    </section>
  );
}

/** Checks the current password first, so nobody at an unlocked computer can change it. */
function ChangePassword({ email }: { email: string }) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<ReturnType<typeof passwordProblems>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problems = passwordProblems(current, next, again);
    setErrors(problems);
    setResult(null);
    if (Object.keys(problems).length) return;

    setBusy(true);
    try {
      const check = await supabase!.auth.signInWithPassword({ email, password: current });
      if (check.error) {
        const wrong = check.error.message.toLowerCase().includes("invalid login credentials");
        if (wrong) setErrors({ current: "That isn't your current password. Please try again." });
        else setResult({ ok: false, text: friendlyError(check.error.message) });
        return;
      }
      const { error } = await supabase!.auth.updateUser({ password: next });
      if (error) return setResult({ ok: false, text: friendlyError(error.message) });
      setCurrent("");
      setNext("");
      setAgain("");
      setResult({ ok: true, text: "Your new password is saved." });
    } catch (err) {
      setResult({ ok: false, text: friendlyError(err instanceof Error ? err.message : String(err)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="password-title" className={card}>
      <h2 id="password-title" className="text-2xl font-extrabold">
        {t("Change your password")}
      </h2>
      <form noValidate onSubmit={save} className="mt-4 flex flex-col gap-5">
        {/* Lets password managers save the new password against the right account. */}
        <input type="hidden" name="username" autoComplete="username" value={email} />
        <PasswordField
          label="Current password"
          name="current-password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setErrors({});
          }}
          error={errors.current}
        />
        <PasswordField
          label="New password"
          hint="At least 6 letters or numbers."
          name="new-password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setErrors({});
          }}
          error={errors.next}
        />
        <PasswordField
          label="New password again"
          name="confirm-password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => {
            setAgain(e.target.value);
            setErrors({});
          }}
          error={errors.again}
        />
        <div aria-live="polite" className="empty:hidden">
          {result && <Message kind={result.ok ? "success" : "error"}>{t(result.text)}</Message>}
        </div>
        <button type="submit" disabled={busy} className={button}>
          {busy ? t("Please wait…") : t("Save new password")}
        </button>
        <Link to="/login?mode=forgot" className={`${linkButton} self-start`}>
          {t("Forgot your current password?")}
        </Link>
      </form>
    </section>
  );
}

/** The family circles this account is in. Only a circle's owner can remove people from it. */
function Circles({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<CircleRow[] | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase!
      .from("care_circle_members")
      .select("role, care_circles(name)")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) return setProblem("We couldn't load your family circles. Please check your internet and reload.");
        setRows((data ?? []) as unknown as CircleRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section aria-labelledby="circles-title" className={card}>
      <h2 id="circles-title" className="text-2xl font-extrabold">
        {t("Your family circles")}
      </h2>
      {problem ? (
        <p role="alert" className="mt-3 text-lg font-bold text-error">
          {t(problem)}
        </p>
      ) : !rows ? (
        <p className="mt-2 text-lg text-muted">{t("Loading…")}</p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {rows.map((row, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream px-5 py-4">
                <span className="text-xl font-bold">{row.care_circles ? shownHomeName(row.care_circles.name, t) : t("Care circle")}</span>
                <span className="rounded-full bg-lilac px-3 py-1 text-base font-bold text-ink">
                  {row.role === "owner" ? t("Your home") : t("Family member")}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-lg text-muted">
            {t("Leaving a family circle isn't possible from this page yet. If you need to, please contact the CareNest team.")}
          </p>
        </>
      )}
    </section>
  );
}
