import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router";
import AuthLayout, { Message, NotConfigured, linkButton, primaryButton } from "../components/AuthLayout";
import { PasswordField, TextField } from "../components/FormFields";
import { useLanguage } from "../i18n/useLanguage";
import { friendlyError } from "../lib/friendlyError";
import { authLinkError, clearAuthLinkError, supabase } from "../lib/supabase";
import { afterSignIn, guideDone } from "../lib/guide";
import { useSession } from "../lib/useSession";

// The things this page can do. "sent" is the "check your email" screen shown
// after signing up or asking for a password reset link.
type Mode = "sign-in" | "sign-up" | "forgot" | "sent";

const titles: Record<Mode, string> = {
  "sign-in": "Welcome back",
  "sign-up": "Create your account",
  forgot: "Reset your password",
  sent: "Check your email",
};

const intros: Record<Exclude<Mode, "sent">, string> = {
  "sign-in": "Log in to see how your family is doing.",
  "sign-up": "It only takes a minute. You can invite family afterwards.",
  forgot: "Type your email and we'll send you a link to choose a new password.",
};

const submitLabels: Record<Exclude<Mode, "sent">, string> = {
  "sign-in": "Log in",
  "sign-up": "Create account",
  forgot: "Send me the link",
};

// Where people go after logging in. A simple placeholder page for now.
export const AFTER_LOGIN = "/dashboard";
// Where the "reset your password" email link takes people.
export const RESET_PASSWORD = "/reset-password";

export default function LoginPage() {
  const session = useSession();
  const location = useLocation();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  // Links can open a particular form, like /login?mode=sign-up or /login?mode=forgot.
  const requestedMode = searchParams.get("mode");
  const [mode, setMode] = useState<Mode>(
    requestedMode === "sign-up" || requestedMode === "forgot" ? requestedMode : "sign-in",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState(authLinkError ? friendlyError(authLinkError) : "");
  const [notice, setNotice] = useState(location.state?.loggedOut ? "You've logged out. See you soon!" : "");
  // What the "check your email" screen says (English, with the email filled in when shown).
  const [sentMessage, setSentMessage] = useState({ text: "", email: "" });
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Show a "that link has run out" message only once.
  useEffect(clearAuthLinkError, []);

  function switchMode(next: Mode) {
    setMode(next);
    setPassword("");
    setFieldErrors({});
    setFormError("");
    setNotice("");
    // Move focus to the new heading so screen readers announce the change.
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;

    // Check the form ourselves so we can explain any problem in plain words.
    const errors: { email?: string; password?: string } = {};
    const needsPassword = mode !== "forgot";
    if (!email.trim()) errors.email = "Please type your email address.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      errors.email = "That doesn't look like an email address. It should look like name@example.com.";
    if (needsPassword && !password) errors.password = "Please type your password.";
    else if (needsPassword && mode === "sign-up" && password.length < 6)
      errors.password = "Please choose a password with at least 6 letters or numbers.";

    setFieldErrors(errors);
    setFormError("");
    setNotice("");
    if (errors.email || errors.password) return;

    setBusy(true);
    try {
      const cleanEmail = email.trim();
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        // On success the session changes and the redirect below takes over.
        if (error) setFormError(friendlyError(error.message));
      } else if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}${AFTER_LOGIN}` },
        });
        if (error) return setFormError(friendlyError(error.message));
        // Supabase quietly returns a user with no sign-in methods when the email is already taken.
        if (data.user?.identities?.length === 0)
          return setFormError("There is already an account with this email. Try logging in instead.");
        // With email confirmation turned on there is no session until the link is tapped.
        if (!data.session) {
          setSentMessage({
            text: "We've sent an email to {email}. Open it and tap the link inside to finish creating your account.",
            email: cleanEmail,
          });
          switchMode("sent");
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}${RESET_PASSWORD}`,
        });
        if (error) return setFormError(friendlyError(error.message));
        setSentMessage({
          text: "If there's an account for {email}, we've sent it an email. Open it and tap the link inside to choose a new password.",
          email: cleanEmail,
        });
        switchMode("sent");
      }
    } catch (err) {
      setFormError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  // Already logged in (or just logged in): back to the page that sent them here
  // (like /login?next=/tracker), else the iPhone setup guide until it's done,
  // else the family page.
  if (session)
    return <Navigate to={afterSignIn(searchParams.get("next"), guideDone(session.user.id))} replace />;

  return (
    <AuthLayout title={titles[mode]}>
      {!supabase ? (
        <NotConfigured />
      ) : session === undefined ? (
        <p className="text-xl text-muted">{t("Loading…")}</p>
      ) : mode === "sent" ? (
        <div className="flex flex-col gap-5">
          <div aria-hidden="true" className="grid h-20 w-20 place-items-center rounded-full bg-sun text-4xl">
            ✉️
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-extrabold outline-none">
            {t(titles.sent)}
          </h1>
          <p className="text-xl">{t(sentMessage.text, { email: sentMessage.email })}</p>
          <p className="rounded-2xl bg-lilac p-4 text-lg">
            <strong>{t("Can't find it?")}</strong>{" "}
            {t("It can take a few minutes to arrive. Look in your spam or junk folder too.")}
          </p>
          <button type="button" className={`${primaryButton} mt-2`} onClick={() => switchMode("sign-in")}>
            {t("Back to log in")}
          </button>
        </div>
      ) : (
        <>
          <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-extrabold outline-none">
            {t(titles[mode])}
          </h1>
          <p className="mt-3 text-xl text-muted">{t(intros[mode])}</p>

          {/* Messages are read out by screen readers as soon as they appear. */}
          <div aria-live="polite" className="mt-6 empty:hidden">
            {formError && <Message kind="error">{t(formError)}</Message>}
            {notice && <Message kind="success">{t(notice)}</Message>}
          </div>

          <form noValidate onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
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

            {mode !== "forgot" && (
              <PasswordField
                label="Password"
                hint={mode === "sign-up" ? "At least 6 letters or numbers." : undefined}
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
                {t("Forgot your password?")}
              </button>
            )}

            <button type="submit" className={`${primaryButton} mt-2`} disabled={busy}>
              {busy ? t("Please wait…") : t(submitLabels[mode])}
            </button>
          </form>

          <div className="mt-8 border-t-2 border-mint pt-6 text-lg">
            {mode === "sign-in" && (
              <p>
                {t("New to CareNest?")}{" "}
                <button type="button" className={linkButton} onClick={() => switchMode("sign-up")}>
                  {t("Create an account")}
                </button>
              </p>
            )}
            {mode === "sign-up" && (
              <p>
                {t("Already have an account?")}{" "}
                <button type="button" className={linkButton} onClick={() => switchMode("sign-in")}>
                  {t("Log in instead")}
                </button>
              </p>
            )}
            {mode === "forgot" && (
              <button type="button" className={linkButton} onClick={() => switchMode("sign-in")}>
                {t("Back to log in")}
              </button>
            )}
          </div>
        </>
      )}
    </AuthLayout>
  );
}
