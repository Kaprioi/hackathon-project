import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import ButtonLink from "../components/ButtonLink";
import { supabase } from "../lib/supabase";

// A simple placeholder for after logging in. The real family dashboard will
// replace this page later.
export default function DashboardPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = still checking

  useEffect(() => {
    if (!supabase) return setEmail(null);
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function logOut() {
    await supabase?.auth.signOut();
    navigate("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      {email === undefined ? (
        <p className="text-xl text-muted">Loading…</p>
      ) : email === null ? (
        <>
          <h1 className="text-4xl font-extrabold">Please log in first</h1>
          <p className="text-xl text-muted">You need to log in to see your family's dashboard.</p>
          <ButtonLink to="/login">Go to log in</ButtonLink>
        </>
      ) : (
        <>
          <h1 className="text-4xl font-extrabold">You're logged in</h1>
          <p className="text-xl text-muted">
            Welcome, <strong className="text-ink">{email}</strong>. Your family dashboard is coming soon.
          </p>
          <button
            type="button"
            onClick={logOut}
            className="inline-flex min-h-14 items-center justify-center rounded-2xl border-[3px] border-brand bg-white px-7 text-lg font-extrabold text-brand transition-colors hover:bg-lilac"
          >
            Log out
          </button>
        </>
      )}
    </main>
  );
}
