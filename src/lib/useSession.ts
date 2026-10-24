import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Who is logged in right now.
// undefined = still checking, null = nobody is logged in.
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    // getSession waits until Supabase has finished reading any email link in the address.
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}
