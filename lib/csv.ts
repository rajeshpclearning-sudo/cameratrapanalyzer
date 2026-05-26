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

function normalizeHeader(cell: string): string {
  return cell.trim().replace(/^"|"$/g, "");
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseExistingCsv(buffer: Buffer): {
  rows: CsvRow[];
  filenameHint?: string;
} {
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [] };
  }

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader);
  const expected = [...CSV_HEADER];
  const headerOk =
    headerCells.length === expected.length &&
    headerCells.every((h, i) => h === expected[i]);

  if (!headerOk) {
    throw new Error(
      `CSV header must be: ${expected.join(", ")}`,
    );
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length === 0 || cells.every((c) => !c.trim())) continue;
    while (cells.length < 6) cells.push("");
    rows.push([
      cells[0] ?? "",
      cells[1] ?? "",
      cells[2] ?? "",
      cells[3] ?? "",
      cells[4] ?? "",
      cells[5] ?? "",
    ]);
  }

  return { rows };
}
