import { getSupabaseAdmin } from "./supabase";
import type { CsvRow } from "./types";

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

/** Saves newly analyzed rows to Supabase. Skips silently if not configured. */
export async function persistSightings(
  jobId: string,
  rows: CsvRow[],
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || rows.length === 0) return;

  const { error } = await supabase
    .from("camera_trap_sightings")
    .insert(rows.map((row) => rowToRecord(jobId, row)));

  if (error) {
    console.error("[supabase] persist sightings failed:", error.message);
  }
}
