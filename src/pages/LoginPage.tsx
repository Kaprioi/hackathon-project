import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import ButtonLink from "../components/ButtonLink";
import { supabase } from "../lib/supabase";

// The four things this page can do. "new-password" is shown when someone
// arrives from the "reset your password" email.
type Mode = "sign-in" | "sign-up" | "forgot" | "new-password";

const titles: Record<Mode, string> = {
  "sign-in": "Welcome back",
  "sign-up": "Create your account",
  forgot: "Reset your password",
  "new-password": "Choose a new password",
};

const intros: Record<Mode, string> = {
  "sign-in": "Log in to see how your family is doing.",
  "sign-up": "It only takes a minute. You can invite family afterwards.",
  forgot: "Type your email and we'll send you a link to choose a new password.",
  "new-password": "Type a new password below. Make it something you will remember.",
};

const submitLabels: Record<Mode, string> = {
  "sign-in": "Log in",
  "sign-up": "Create account",
  forgot: "Send me the link",
  "new-password": "Save new password",
};

// Where people go after logging in. A simple placeholder page for now.
const AFTER_LOGIN = "/dashboard";

// Dark red that passes WCAG AA contrast on white and on the cream background.
const ERROR_RED = "text-[#a61b1b]";

const buttonBase =
  "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-[3px] px-7 text-xl font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-70";
const primaryButton = `${buttonBase} border-brand bg-brand text-white shadow-[0_6px_0_var(--color-brand-dark)] hover:bg-brand-dark`;
const linkButton =
  "inline-flex min-h-12 items-center rounded-xl px-1 text-lg font-bold text-brand underline underline-offset-4 hover:text-brand-dark";

// Turn Supabase's technical error messages into plain, friendly language.
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "That email and password don't match. Please check them and try again.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email first. Look in your inbox for our message and tap the link inside.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "There is already an account with this email. Try logging in instead.";
  if (m.includes("password should be") || m.includes("password is too"))
    return "Please choose a longer password, with at least 6 letters or numbers.";
  if (m.includes("same password") || m.includes("different from the old"))
    return "Your new password must be different from your old one.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "We've had a lot of tries from you just now. Please wait a few minutes, then try again.";
  if (m.includes("invalid email") || m.includes("unable to validate email"))
    return "That doesn't look like an email address. It should look like name@example.com.";
  if (m.includes("session missing") || m.includes("expired"))
    return "This link has run out or was already used. Please ask for a new reset email.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "We couldn't connect. Please check your internet connection and try again.";
  return "Sorry, something went wrong. Please try again.";
}

function TextField({
  label,
  hint,
  error,
  ...inputProps
}: {
  label: string;
  hint?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xl font-extrabold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-lg text-muted">
          {hint}
        </p>
      )}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-14 w-full rounded-2xl border-[3px] bg-white px-5 text-xl text-ink ${
          error ? "border-[#a61b1b]" : "border-muted"
        }`}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className={`text-lg font-bold ${ERROR_RED}`}>
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordField(props: Omit<React.ComponentProps<typeof TextField>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <TextField {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        className="inline-flex min-h-12 items-center gap-3 self-start rounded-xl px-1 text-lg font-bold text-brand hover:text-brand-dark"
      >
        <span
          aria-hidden="true"
          className={`grid h-7 w-7 place-items-center rounded-md border-[3px] border-brand ${visible ? "bg-brand text-white" : "bg-white"}`}
        >
          {visible ? "✓" : ""}
        </span>
        Show password
      </button>
    </div>
  );
}

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

// Shown instead of the form when the Supabase keys haven't been added yet.
function NotConfigured() {
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
      <div>
        <ButtonLink to="/">Back to the homepage</ButtonLink>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get("reset") === "1" ? "new-password" : "sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // When someone opens the link from the reset email, Supabase signs them in
  // for a moment and tells us so they can pick a new password.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") switchMode("new-password");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setPassword("");
    setFieldErrors({});
    setFormError("");
    setSuccess("");
    // Move focus to the new heading so screen readers announce the change.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;

    // Check the form ourselves so we can explain any problem in plain words.
    const errors: { email?: string; password?: string } = {};
    const needsEmail = mode !== "new-password";
    const needsPassword = mode !== "forgot";
    if (needsEmail && !email.trim()) errors.email = "Please type your email address.";
    else if (needsEmail && !/^\S+@\S+\.\S+$/.test(email.trim()))
      errors.email = "That doesn't look like an email address. It should look like name@example.com.";
    if (needsPassword && !password) errors.password = "Please type your password.";
    else if (needsPassword && mode !== "sign-in" && password.length < 6)
      errors.password = "Please choose a password with at least 6 letters or numbers.";

    setFieldErrors(errors);
    setFormError("");
    setSuccess("");
    if (errors.email || errors.password) return;

    setBusy(true);
    try {
      const cleanEmail = email.trim();
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) return setFormError(friendlyError(error.message));
        navigate(AFTER_LOGIN);
      } else if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}${AFTER_LOGIN}` },
        });
        if (error) return setFormError(friendlyError(error.message));
        // If email confirmation is turned on in Supabase there is no session yet.
        if (data.session) navigate(AFTER_LOGIN);
        else
          setSuccess(
            `Nearly done! We've sent an email to ${cleanEmail}. Open it and tap the link inside to finish creating your account.`,
          );
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/login?reset=1`,
        });
        if (error) return setFormError(friendlyError(error.message));
        setSuccess(
          `If there's an account for ${cleanEmail}, we've sent it an email. Open it and tap the link inside to choose a new password.`,
        );
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return setFormError(friendlyError(error.message));
        navigate(AFTER_LOGIN);
      }
    } catch (err) {
      setFormError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <Logo />
        <Link to="/" className={linkButton}>
          Back to homepage
        </Link>
      </header>

      <main id="main" className="px-4 pb-20 pt-4">
        <div className="mx-auto max-w-xl rounded-[40px] bg-white p-7 shadow-[0_10px_30px_rgba(31,42,55,0.08)] sm:p-10">
          {!supabase ? (
            <NotConfigured />
          ) : (
            <>
              <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-extrabold">
                {titles[mode]}
              </h1>
              <p className="mt-3 text-xl text-muted">{intros[mode]}</p>

              {/* Messages are read out by screen readers as soon as they appear. */}
              <div aria-live="polite" className="mt-6 empty:hidden">
                {formError && (
                  <p role="alert" className={`rounded-2xl border-[3px] border-[#a61b1b] bg-[#fdecec] p-4 text-lg font-bold ${ERROR_RED}`}>
                    {formError}
                  </p>
                )}
                {success && (
                  <p className="rounded-2xl border-[3px] border-leaf bg-mint p-4 text-lg font-bold text-ink">{success}</p>
                )}
              </div>

              <form noValidate onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
                {mode !== "new-password" && (
                  <TextField
                    label="Email address"
                    type="email"
                    name="email"
                    autoComplete={mode === "sign-up" ? "email" : "username"}
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setFieldErrors((f) => ({ ...f, email: undefined }));
                    }}
                    error={fieldErrors.email}
                  />
                )}

                {mode !== "forgot" && (
                  <PasswordField
                    label={mode === "new-password" ? "New password" : "Password"}
                    hint={mode === "sign-in" ? undefined : "At least 6 letters or numbers."}
                    name="password"
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFieldErrors((f) => ({ ...f, password: undefined }));
                    }}
                    error={fieldErrors.password}
                  />
                )}

                {mode === "sign-in" && (
                  <button type="button" className={`${linkButton} self-start`} onClick={() => switchMode("forgot")}>
                    Forgot your password?
                  </button>
                )}

                <button type="submit" className={`${primaryButton} mt-2`} disabled={busy}>
                  {busy ? "Please wait…" : submitLabels[mode]}
                </button>
              </form>

              <div className="mt-8 border-t-2 border-mint pt-6 text-lg">
                {mode === "sign-in" && (
                  <p>
                    New to CareNest?{" "}
                    <button type="button" className={linkButton} onClick={() => switchMode("sign-up")}>
                      Create an account
                    </button>
                  </p>
                )}
                {mode === "sign-up" && (
                  <p>
                    Already have an account?{" "}
                    <button type="button" className={linkButton} onClick={() => switchMode("sign-in")}>
                      Log in instead
                    </button>
                  </p>
                )}
                {(mode === "forgot" || mode === "new-password") && (
                  <button type="button" className={linkButton} onClick={() => switchMode("sign-in")}>
                    Back to log in
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
