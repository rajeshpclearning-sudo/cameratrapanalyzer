import type { CsvRow } from "./types";

export function isUnidentifiedSpecies(species: string): boolean {
  return species.trim().toLowerCase() === "unidentified";
}

export function isEmptySpecies(species: string): boolean {
  const s = species.toLowerCase();
  return (
    s.includes("empty trail") ||
    s.includes("vegetation only") ||
    s.includes("low image variation")
  );
}

export function isConfidentSpecies(row: CsvRow): boolean {
  return !isUnidentifiedSpecies(row[3]) && !isEmptySpecies(row[3]);
}

/** Row looks like an animal was seen but species was not resolved. */
export function rowHasAnimal(row: CsvRow): boolean {
  if (isEmptySpecies(row[3])) return false;
  const count = parseInt(row[4], 10);
  if (Number.isFinite(count) && count > 0) return true;
  if (row[5] === "N/A") return false;
  return isUnidentifiedSpecies(row[3]);
}

export function findBurstAnchorRow(rows: (CsvRow | null)[]): CsvRow | null {
  for (const row of rows) {
    if (row && isConfidentSpecies(row)) return row;
  }
  return null;
}

export function inferSpeciesFromAnchor(row: CsvRow, anchor: CsvRow): CsvRow {
  return [row[0], row[1], row[2], anchor[3], row[4], row[5]];
}

/**
 * When one burst frame has a confident species, apply it to other frames
 * in the same burst that are "Unidentified" but clearly show an animal.
 */
export function reconcileBurstSpecies(rows: (CsvRow | null)[]): {
  rows: (CsvRow | null)[];
  inferred: number;
} {
  if (rows.length <= 1) return { rows, inferred: 0 };

  const anchor = findBurstAnchorRow(rows);
  if (!anchor) return { rows, inferred: 0 };

  let inferred = 0;
  const next = [...rows];
  for (let i = 0; i < next.length; i++) {
    const row = next[i];
    if (!row || !isUnidentifiedSpecies(row[3]) || !rowHasAnimal(row)) continue;
    next[i] = inferSpeciesFromAnchor(row, anchor);
    inferred++;
  }

  return { rows: next, inferred };
}
