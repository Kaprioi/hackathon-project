import { createClient } from "@supabase/supabase-js";

// These come from .env.local (see .env.example). They are safe to expose in the
// browser: the anon key only allows what your Supabase row-level security permits.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase is not configured yet: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local");
}

// When someone opens an email link that has run out or was already used,
// Supabase sends them back with an error in the web address. Note it now,
// before Supabase tidies the address, so the page can explain what happened.
function readLinkError(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  for (const params of [hash, query]) {
    const error = params.get("error_description") || params.get("error_code") || params.get("error");
    if (error) return error;
  }
  return null;
}

export let authLinkError = readLinkError();

// Call once the message has been shown, so it doesn't come back later.
export function clearAuthLinkError() {
  authLinkError = null;
}

// null until the env vars are set, so the homepage still works without Supabase.
// Logins are saved in the browser, so people stay logged in after a reload.
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
