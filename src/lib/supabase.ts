import { createClient } from "@supabase/supabase-js";

// These come from .env.local (see .env.example). They are safe to expose in the
// browser: the anon key only allows what your Supabase row-level security permits.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase is not configured yet: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local");
}

// null until the env vars are set, so the homepage still works without Supabase.
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
