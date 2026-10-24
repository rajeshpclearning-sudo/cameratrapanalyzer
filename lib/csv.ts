import { CSV_COL, CSV_HEADER, type CsvRow } from "./types";

/** Unique download name: CTA_<date>_<timestamp>.csv (e.g. CTA_2026-10-24_203312.csv). */
export function defaultCsvFilename(when: Date = new Date()): string {
  const yyyy = when.getFullYear();
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  const dd = String(when.getDate()).padStart(2, "0");
  const hh = String(when.getHours()).padStart(2, "0");
  const min = String(when.getMinutes()).padStart(2, "0");
  const ss = String(when.getSeconds()).padStart(2, "0");
  return `CTA_${yyyy}-${mm}-${dd}_${hh}${min}${ss}.csv`;
}

export function filenameFromUpload(name: string): string {
  const base = name.trim() || defaultCsvFilename();
  return base.toLowerCase().endsWith(".csv") ? base : `${base}.csv`;
}

/** Natural filename order: I__00071 before I__00089 before I__00120. */
export function comparePhotoNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function sortRowsByPhotoName(rows: CsvRow[]): CsvRow[] {
  return [...rows].sort((ra, rb) =>
    comparePhotoNames(
      ra[CSV_COL.photoName] ?? "",
      rb[CSV_COL.photoName] ?? "",
    ),
  );
}

function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(rows: CsvRow[]): string {
  const ordered = sortRowsByPhotoName(rows);
  const lines = [
    CSV_HEADER.join(","),
    ...ordered.map((row) => row.map(escapeField).join(",")),
  ];
  return lines.join("\n") + "\n";
}
