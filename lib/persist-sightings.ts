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

  if (rows.length === 0) {
    return { configured: true, inserted: 0 };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      configured: false,
      inserted: 0,
      error: "Invalid Supabase configuration (check SUPABASE_URL)",
    };
  }

  try {
    const { error } = await supabase
      .from("camera_trap_sightings")
      .insert(rows.map((row) => rowToRecord(jobId, row)));

    if (error) {
      console.error("[supabase] persist sightings failed:", error.message);
      return { configured: true, inserted: 0, error: error.message };
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
