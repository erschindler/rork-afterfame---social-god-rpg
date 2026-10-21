import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

const url = import.meta.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

/** The single Supabase client. Uses the public anon key only; RLS protects every table. */
export const supabase = createClient<Database>(url ?? "http://localhost", anonKey ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
