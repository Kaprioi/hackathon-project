import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import AuthLayout, { Message, NotConfigured, linkButton, primaryButton } from "../components/AuthLayout";
import { PasswordField } from "../components/FormFields";
import { friendlyError } from "../lib/friendlyError";
import { authLinkError, clearAuthLinkError, supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";
import { AFTER_LOGIN } from "./LoginPage";

// People land here from the "reset your password" email. Opening that link
// logs them in for a moment so they can choose a new password.
export default function ResetPasswordPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [linkError] = useState(authLinkError);
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(clearAuthLinkError, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;

    if (!password) return setFieldError("Please type a new password.");
    if (password.length < 6) return setFieldError("Please choose a password with at least 6 letters or numbers.");
    setFieldError("");
    setFormError("");

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return setFormError(friendlyError(error.message));
      navigate(AFTER_LOGIN, { state: { passwordChanged: true } });
    } catch (err) {
      setFormError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  const title =
    session !== null ? "Choose a new password" : linkError ? "This link has run out" : "Reset your password";

  return (
    <AuthLayout title={title}>
      {!supabase ? (
        <NotConfigured />
      ) : session === undefined ? (
        <p className="text-xl text-muted">Checking your link…</p>
      ) : session === null ? (
        <div className="flex flex-col gap-5">
          <h1 className="text-4xl font-extrabold">{title}</h1>
          <p className="text-xl text-muted">
            {linkError
              ? "The link in your email has run out or was already used. That's okay — you can ask for a new one."
              : "To choose a new password, please open the link from the email we sent you, or ask for a new one."}
          </p>
          <Link to="/login?mode=forgot" className={primaryButton}>
            Send me a new link
          </Link>
          <Link to="/login" className={`${linkButton} self-center`}>
            Back to log in
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-4xl font-extrabold">{title}</h1>
          <p className="mt-3 text-xl text-muted">Type a new password below. Make it something you will remember.</p>

          <div aria-live="polite" className="mt-6 empty:hidden">
            {formError && <Message kind="error">{formError}</Message>}
          </div>

          <form noValidate onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
            {/* Lets password managers save the new password against the right account. */}
            <input type="hidden" name="username" autoComplete="username" value={session.user.email ?? ""} />
            <PasswordField
              label="New password"
              hint="At least 6 letters or numbers."
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldError("");
              }}
              error={fieldError}
            />
            <button type="submit" className={`${primaryButton} mt-2`} disabled={busy}>
              {busy ? "Please wait…" : "Save new password"}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
