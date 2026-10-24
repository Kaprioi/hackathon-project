import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import AuthLayout, { Message, outlineButton } from "../components/AuthLayout";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";

// A simple placeholder for after logging in. The real family dashboard will
// replace this page later.
export default function DashboardPage() {
  const session = useSession();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  async function logOut() {
    setLoggingOut(true);
    setError("");
    // Once the session is gone, the redirect below takes people to the log in page.
    const result = await supabase?.auth.signOut();
    if (result?.error) {
      setLoggingOut(false);
      setError("Sorry, we couldn't log you out. Please check your internet connection and try again.");
    }
  }

  // Not logged in: send people to the log in page.
  if (session === null) return <Navigate to="/login" replace state={loggingOut ? { loggedOut: true } : undefined} />;

  return (
    <AuthLayout title="Your dashboard">
      {session === undefined ? (
        <p className="text-xl text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {location.state?.passwordChanged && <Message kind="success">Your new password is saved.</Message>}
          <div aria-hidden="true" className="grid h-20 w-20 place-items-center rounded-full bg-mint text-4xl">
            👋
          </div>
          <h1 className="text-4xl font-extrabold">You're logged in</h1>
          <p className="text-xl text-muted">
            Welcome, <strong className="break-all text-ink">{session.user.email}</strong>. Your family dashboard is
            coming soon.
          </p>
          {error && <Message kind="error">{error}</Message>}
          <button type="button" onClick={logOut} disabled={loggingOut} className={`${outlineButton} mt-2`}>
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      )}
    </AuthLayout>
  );
}
