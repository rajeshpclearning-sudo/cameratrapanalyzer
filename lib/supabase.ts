import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null | undefined;

/** Server-only Supabase client. Returns null when env vars are not set. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    adminClient = null;
    return null;
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
