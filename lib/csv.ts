import { parseSightingsFile } from "./parse-sightings-file";
import { CSV_HEADER, type CsvRow } from "./types";

export function defaultCsvFilename(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `Camera_Trap_Analysis_${yyyy}-${mm}-${dd}.csv`;
}

export function filenameFromUpload(name: string): string {
  const base = name.trim() || defaultCsvFilename();
  return base.toLowerCase().endsWith(".csv") ? base : `${base}.csv`;
}

function escapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(rows: CsvRow[]): string {
  const lines = [
    CSV_HEADER.join(","),
    ...rows.map((row) => row.map(escapeField).join(",")),
  ];
  return lines.join("\n") + "\n";
}

export function parseExistingCsv(buffer: Buffer): {
  rows: CsvRow[];
  filenameHint?: string;
} {
  return parseSightingsFile(buffer, "upload.csv");
}
