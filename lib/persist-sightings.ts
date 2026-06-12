import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { CsvRow } from "./types";

export type PersistSightingsResult = {
  configured: boolean;
  inserted: number;
  error?: string;
};

function rowToRecord(jobId: string, row: CsvRow) {
  const count = parseInt(row[4], 10);
  return {
    job_id: jobId,
    photo_name: row[0],
    sighting_date: row[1] || null,
    sighting_time: row[2] || null,
    species: row[3],
    individual_count: Number.isFinite(count) ? count : 0,
    behavior: row[5],
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

  const { error } = await supabase
    .from("camera_trap_sightings")
    .insert(rows.map((row) => rowToRecord(jobId, row)));

  if (error) {
    console.error("[supabase] persist sightings failed:", error.message);
    return { configured: true, inserted: 0, error: error.message };
  }

  return { configured: true, inserted: rows.length };
}
