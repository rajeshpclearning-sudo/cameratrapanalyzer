import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { CSV_COL, ROW_STATUS, type CsvRow } from "./types";

type SightingRow = {
  photo_name: string;
  sighting_date: string | null;
  sighting_time: string | null;
  species: string;
  individual_count: string | null;
  behavior: string;
  status: string | null;
  created_at?: string;
};

function recordToCsvRow(record: SightingRow): CsvRow {
  return [
    record.photo_name,
    record.sighting_date ?? "",
    record.sighting_time ?? "",
    record.species,
    record.individual_count?.trim() || "0",
    record.behavior,
    record.status?.trim() || ROW_STATUS.success,
  ];
}

/** Build a map of photo_name → CSV row from an existing log (first wins). */
export function csvRowsByPhotoName(rows: CsvRow[]): Map<string, CsvRow> {
  const map = new Map<string, CsvRow>();
  for (const row of rows) {
    const name = row[CSV_COL.photoName]?.trim();
    if (name && !map.has(name)) map.set(name, row);
  }
  return map;
}

/**
 * Look up prior sightings in Supabase by exact photo_name.
 * When duplicates exist, keeps the newest created_at.
 */
export async function lookupExistingSightings(
  photoNames: string[],
): Promise<Map<string, CsvRow>> {
  const map = new Map<string, CsvRow>();
  const unique = [...new Set(photoNames.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0 || !isSupabaseConfigured()) return map;

  const supabase = getSupabaseAdmin();
  if (!supabase) return map;

  try {
    const { data, error } = await supabase
      .from("camera_trap_sightings")
      .select(
        "photo_name, sighting_date, sighting_time, species, individual_count, behavior, status, created_at",
      )
      .in("photo_name", unique)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[supabase] lookup existing sightings failed:", error.message);
      return map;
    }

    for (const record of (data ?? []) as SightingRow[]) {
      const name = record.photo_name?.trim();
      if (name && !map.has(name)) {
        map.set(name, recordToCsvRow(record));
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[supabase] lookup existing sightings failed:", message);
  }

  return map;
}

/**
 * Merge known rows: session CSV first, then Supabase.
 * Returns photo names that should not be re-analyzed.
 */
export async function resolveAlreadyAnalyzed(
  photoNames: string[],
  existingCsvRows: CsvRow[],
): Promise<Map<string, CsvRow>> {
  const known = csvRowsByPhotoName(existingCsvRows);
  const missing = photoNames.filter((n) => !known.has(n.trim()));
  if (missing.length === 0) return known;

  const fromDb = await lookupExistingSightings(missing);
  for (const [name, row] of fromDb) {
    if (!known.has(name)) known.set(name, row);
  }
  return known;
}
