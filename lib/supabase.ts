import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null | undefined;

function envTrim(name: string): string {
  const raw = process.env[name];
  if (!raw) return "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

/** Normalize common mis-pastes (dashboard link, bare ref, missing https, quotes). */
export function normalizeSupabaseUrl(raw: string): string | null {
  let url = raw.trim().replace(/^["']|["']$/g, "");
  if (!url) return null;

  const dashMatch = url.match(
    /supabase\.com\/dashboard\/project\/([a-z0-9]+)/i,
  );
  if (dashMatch) {
    url = `https://${dashMatch[1]}.supabase.co`;
  }

  if (/^[a-z0-9]{10,30}$/i.test(url)) {
    url = `https://${url}.supabase.co`;
  }

  if (!/^https?:\/\//i.test(url) && /\.supabase\.co/i.test(url)) {
    url = `https://${url.replace(/^\/+/, "")}`;
  }

  url = url.replace(/\/$/, "");

  if (!isValidSupabaseProjectUrl(url)) return null;
  return url;
}

/** True when env vars are set and URL looks like a project API host. */
export function isSupabaseConfigured(): boolean {
  const url = normalizeSupabaseUrl(envTrim("SUPABASE_URL"));
  const key = envTrim("SUPABASE_SERVICE_ROLE_KEY");
  return Boolean(url && key);
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

  const url = normalizeSupabaseUrl(envTrim("SUPABASE_URL"));
  const key = envTrim("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    adminClient = null;
    return null;
  }

  try {
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return adminClient;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[supabase] createClient failed:", message);
    adminClient = null;
    return null;
  }
}

export type SupabaseHealth = {
  configured: boolean;
  ok: boolean;
  rowCount?: number;
  error?: string;
};

/** Live check: can we read camera_trap_sightings with the configured key? */
export async function checkSupabaseConnection(): Promise<SupabaseHealth> {
  if (!isSupabaseConfigured()) {
    return { configured: false, ok: false };
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return {
      configured: true,
      ok: false,
      error:
        "Invalid SUPABASE_URL — use https://YOUR_PROJECT_REF.supabase.co (Settings → General), not the dashboard link.",
    };
  }

  try {
    const { count, error } = await client
      .from("camera_trap_sightings")
      .select("*", { count: "exact", head: true });

    if (error) {
      return { configured: true, ok: false, error: error.message };
    }

    return { configured: true, ok: true, rowCount: count ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { configured: true, ok: false, error: message };
  }
}
