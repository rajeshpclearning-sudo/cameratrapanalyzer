import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function envTrim(name: string): string {
  const raw = process.env[name];
  if (!raw) return "";
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function stripPastedAssignment(raw: string, name: string): string {
  const prefix = `${name}=`;
  if (raw.toUpperCase().startsWith(prefix)) {
    return raw.slice(prefix.length).trim().replace(/^["']|["']$/g, "");
  }
  return raw;
}

/** Normalize common mis-pastes (dashboard link, bare ref, missing https, quotes). */
export function normalizeSupabaseUrl(raw: string): string | null {
  let url = stripPastedAssignment(
    raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim().replace(/^["']|["']$/g, ""),
    "SUPABASE_URL",
  );
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

function keyKind(key: string): string {
  if (!key) return "missing";
  if (key.startsWith("sb_secret_")) return "sb_secret";
  if (key.startsWith("sb_publishable_")) return "sb_publishable";
  if (key.startsWith("sbp_")) return "sbp_account_token";
  if (key.startsWith("eyJ")) return "legacy_jwt";
  return `other_len_${key.length}`;
}

function formatUnknownError(err: unknown): string {
  if (err && typeof err === "object") {
    const o = err as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
      status?: number;
    };
    const parts = [o.message, o.code, o.details, o.hint]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean);
    if (o.status) parts.push(`status ${o.status}`);
    if (parts.length > 0) return parts.join(" — ");
    try {
      const dumped = JSON.stringify(err);
      if (dumped && dumped !== "{}") return dumped;
    } catch {
      // fall through
    }
  }
  if (err instanceof Error && err.message) return err.message;
  const asString = String(err ?? "");
  return asString.trim() || "unknown error (empty message)";
}

/** True when env vars are set and URL looks like a project API host. */
export function isSupabaseConfigured(): boolean {
  const url = normalizeSupabaseUrl(envTrim("SUPABASE_URL"));
  const key = stripPastedAssignment(
    envTrim("SUPABASE_SERVICE_ROLE_KEY"),
    "SUPABASE_SERVICE_ROLE_KEY",
  );
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
  const url = normalizeSupabaseUrl(envTrim("SUPABASE_URL"));
  const key = stripPastedAssignment(
    envTrim("SUPABASE_SERVICE_ROLE_KEY"),
    "SUPABASE_SERVICE_ROLE_KEY",
  );

  if (!url || !key) return null;

  try {
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[supabase] createClient failed:", message);
    return null;
  }
}

export type SupabaseHealth = {
  configured: boolean;
  ok: boolean;
  rowCount?: number;
  error?: string;
  urlHost?: string;
  keyKind?: string;
};

/** Live check: can we read camera_trap_sightings with the configured key? */
export async function checkSupabaseConnection(): Promise<SupabaseHealth> {
  const url = normalizeSupabaseUrl(envTrim("SUPABASE_URL"));
  const key = stripPastedAssignment(
    envTrim("SUPABASE_SERVICE_ROLE_KEY"),
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const meta = {
    urlHost: url ? new URL(url).hostname : undefined,
    keyKind: keyKind(key),
  };

  if (!url || !key) {
    return { configured: false, ok: false, ...meta };
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return {
      configured: true,
      ok: false,
      error:
        "Could not create Supabase client. SUPABASE_URL must be https://YOUR_PROJECT_REF.supabase.co",
      ...meta,
    };
  }

  try {
    const { count, error } = await client
      .from("camera_trap_sightings")
      .select("id", { count: "exact", head: true });

    if (error) {
      return {
        configured: true,
        ok: false,
        error: formatUnknownError(error),
        ...meta,
      };
    }

    return { configured: true, ok: true, rowCount: count ?? 0, ...meta };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      error: formatUnknownError(err),
      ...meta,
    };
  }
}
