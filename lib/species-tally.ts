import { CSV_COL } from "@/lib/types";
import type { FileJobState } from "@/lib/types";

/**
 * Tallies species counts from an array of FileJobState entries.
 *
 * Only files with status "done" or "skipped" that also have a populated `row`
 * are included. The species name is taken from CSV_COL.speciesName (index 3),
 * trimmed of whitespace, and falls back to "Unknown" when empty. Results are
 * sorted descending by count.
 */
export function buildSpeciesTally(
  files: FileJobState[],
): Array<{ species: string; count: number }> {
  const counts = new Map<string, number>();
  for (const f of files) {
    if ((f.status === "done" || f.status === "skipped") && f.row) {
      const species = f.row[CSV_COL.speciesName].trim() || "Unknown";
      counts.set(species, (counts.get(species) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => b.count - a.count);
}
