import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { CSV_COL, ROW_STATUS, type CsvRow, type PersistSightingsResult } from "./types";

export type { PersistSightingsResult };

function rowToRecord(jobId: string, row: CsvRow) {
  return {
    job_id: jobId,
    photo_name: row[CSV_COL.photoName],
    sighting_date: row[CSV_COL.date] || null,
    sighting_time: row[CSV_COL.timestamp] || null,
    species: row[CSV_COL.speciesName],
    individual_count: row[CSV_COL.individuals] || "0",
    behavior: row[CSV_COL.behavior],
    status: row[CSV_COL.status]?.trim() || ROW_STATUS.success,
  };
}

/** Saves newly analyzed rows to Supabase. Returns status for job poll / UI. */
export async function persistSightings(
  jobId: string,
  rows: CsvRow[],
): Promise<PersistSightingsResult> {
  const configured = isSupabaseConfigured();
  if (!configured) {
    return { configured: false, inserted: 0 };
  }

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim()
      .replace(/^["']|["']$/g, "") ?? "";
  if (serviceKey.startsWith("sbp_")) {
    return {
      configured: true,
      inserted: 0,
      error:
        "SUPABASE_SERVICE_ROLE_KEY is an account token (sbp_...). Use the project Secret key (sb_secret_...) from Supabase → Settings → API Keys.",
    };
  }
  if (serviceKey.startsWith("sb_publishable_")) {
    return {
      configured: true,
      inserted: 0,
      error:
        "SUPABASE_SERVICE_ROLE_KEY is the publishable key. Use the Secret key (sb_secret_...) instead.",
    };
  }

  if (rows.length === 0) {
    return { configured: true, inserted: 0 };
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { configured: true, inserted: 0, error: message };
  }

  if (!supabase) {
    return {
      configured: true,
      inserted: 0,
      error:
        "Invalid SUPABASE_URL on server — use https://YOUR_PROJECT_REF.supabase.co (Settings → General), not the dashboard link. Then redeploy.",
    };
  }

  try {
    const { error } = await supabase
      .from("camera_trap_sightings")
      .insert(rows.map((row) => rowToRecord(jobId, row)));

    if (error) {
      const message = [error.message, error.code, error.details, error.hint]
        .filter((part) => typeof part === "string" && part.trim())
        .join(" — ") || "insert failed (empty error from Supabase)";
      console.error("[supabase] persist sightings failed:", message);
      return { configured: true, inserted: 0, error: message };
    }

    return { configured: true, inserted: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const friendly =
      message.includes("fetch failed") || message.includes("ENOTFOUND")
        ? `Cannot reach SUPABASE_URL (${process.env.SUPABASE_URL}). The project may be paused, deleted, or the URL/key is wrong.`
        : message;
    console.error("[supabase] persist sightings failed:", friendly);
    return { configured: true, inserted: 0, error: friendly };
  }
}
