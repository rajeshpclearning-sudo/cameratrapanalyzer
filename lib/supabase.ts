import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null | undefined;

/** True when env vars are set and URL looks like a project API host. */
export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return false;
  return isValidSupabaseProjectUrl(url);
}

function isValidSupabaseProjectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".supabase.co") &&
      !parsed.hostname.includes("supabase.com")
    );
  } catch {
    return false;
  }
}

/** Server-only Supabase client. Returns null when env vars are not set or invalid. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    adminClient = null;
    return null;
  }

  if (!isValidSupabaseProjectUrl(url)) {
    console.warn(
      "[supabase] SUPABASE_URL must be https://YOUR_PROJECT_REF.supabase.co (not a dashboard link)",
    );
    adminClient = null;
    return null;
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
