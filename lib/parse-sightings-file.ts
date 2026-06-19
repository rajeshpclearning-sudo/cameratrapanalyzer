import "server-only";

import * as XLSX from "xlsx";
import { CSV_COL, CSV_HEADER, ROW_STATUS, type CsvRow } from "./types";

const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const COLUMN_COUNT = CSV_HEADER.length;

/** Normalized header alias → column index */
const HEADER_ALIASES: Record<string, number> = {
  "photo name": CSV_COL.photoName,
  date: CSV_COL.date,
  timestamp: CSV_COL.timestamp,
  "species name": CSV_COL.speciesName,
  species: CSV_COL.speciesName,
  "number of individuals": CSV_COL.individuals,
  "# individuals": CSV_COL.individuals,
  individuals: CSV_COL.individuals,
  behavior: CSV_COL.behavior,
  status: CSV_COL.status,
};

const REQUIRED_COLUMNS = [
  CSV_COL.photoName,
  CSV_COL.date,
  CSV_COL.timestamp,
  CSV_COL.speciesName,
  CSV_COL.individuals,
  CSV_COL.behavior,
];

function normalizeHeader(cell: string): string {
  return String(cell ?? "")
    .trim()
    .replace(/^"|"$/g, "")
    .toLowerCase();
}

function cellToString(cell: unknown): string {
  if (cell == null) return "";
  if (cell instanceof Date) {
    const dd = String(cell.getDate());
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const mmm = months[cell.getMonth()] ?? "Jan";
    const yyyy = cell.getFullYear();
    return `${dd}-${mmm}-${yyyy}`;
  }
  return String(cell).trim();
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

function matrixFromCsvBuffer(buffer: Buffer): string[][] {
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => parseCsvLine(line));
}

function matrixFromExcelBuffer(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  return raw.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => cellToString(cell)),
  );
}

function mapHeaderRow(headerCells: string[]): Map<number, number> {
  const mapping = new Map<number, number>();

  headerCells.forEach((cell, fileColIndex) => {
    const key = normalizeHeader(cell);
    if (!key) return;
    const colIndex = HEADER_ALIASES[key];
    if (colIndex === undefined) return;
    if (!mapping.has(colIndex)) {
      mapping.set(colIndex, fileColIndex);
    }
  });

  const missing = REQUIRED_COLUMNS.filter((col) => !mapping.has(col));
  if (missing.length > 0) {
    const names = missing.map((i) => CSV_HEADER[i]);
    throw new Error(`Missing required column(s): ${names.join(", ")}`);
  }

  return mapping;
}

function rowFromMappedCells(
  cells: string[],
  mapping: Map<number, number>,
): CsvRow {
  const row = Array.from({ length: COLUMN_COUNT }, () => "") as string[];

  mapping.forEach((fileColIndex, colIndex) => {
    row[colIndex] = cells[fileColIndex] ?? "";
  });

  if (!row[CSV_COL.status]?.trim()) {
    row[CSV_COL.status] = ROW_STATUS.success;
  }

  return row as CsvRow;
}

export function rowsFromMatrix(matrix: string[][]): CsvRow[] {
  if (matrix.length === 0) {
    return [];
  }

  const mapping = mapHeaderRow(matrix[0]);
  const rows: CsvRow[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const cells = [...matrix[i]];
    if (cells.length === 0 || cells.every((c) => !String(c).trim())) continue;
    rows.push(rowFromMappedCells(cells, mapping));
  }

  return rows;
}

function extensionOf(filename: string): string {
  const lower = filename.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

function isExcelBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  if (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return true;
  }
  return false;
}

export function parseSightingsFile(
  buffer: Buffer,
  filename: string,
): { rows: CsvRow[] } {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(
      `File too large (max ${MAX_FILE_BYTES / (1024 * 1024)} MB)`,
    );
  }

  const ext = extensionOf(filename);
  const useExcel =
    ext === ".xlsx" ||
    ext === ".xls" ||
    (ext === "" && isExcelBuffer(buffer));

  if (
    ext &&
    !SUPPORTED_EXTENSIONS.includes(
      ext as (typeof SUPPORTED_EXTENSIONS)[number],
    )
  ) {
    throw new Error(
      `Unsupported file type. Use ${SUPPORTED_EXTENSIONS.join(", ")}`,
    );
  }

  const matrix = useExcel
    ? matrixFromExcelBuffer(buffer)
    : matrixFromCsvBuffer(buffer);

  return { rows: rowsFromMatrix(matrix) };
}

export function parseExistingCsv(buffer: Buffer): {
  rows: CsvRow[];
  filenameHint?: string;
} {
  return parseSightingsFile(buffer, "upload.csv");
}
