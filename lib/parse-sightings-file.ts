import * as XLSX from "xlsx";
import { CSV_HEADER, type CsvRow } from "./types";

const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function normalizeHeader(cell: string): string {
  return String(cell ?? "").trim().replace(/^"|"$/g, "");
}

function cellToString(cell: unknown): string {
  if (cell == null) return "";
  if (cell instanceof Date) {
    const yyyy = cell.getFullYear();
    const mm = String(cell.getMonth() + 1).padStart(2, "0");
    const dd = String(cell.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
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
  return lines.map((line) => parseCsvLine(line).map(normalizeHeader));
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

export function rowsFromMatrix(matrix: string[][]): CsvRow[] {
  if (matrix.length === 0) {
    return [];
  }

  const headerCells = matrix[0].map(normalizeHeader);
  const expected = [...CSV_HEADER];
  const headerOk =
    headerCells.length >= expected.length &&
    expected.every((h, i) => headerCells[i] === h);

  if (!headerOk) {
    throw new Error(`Header must be: ${expected.join(", ")}`);
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = [...matrix[i]];
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

  return rows;
}

function extensionOf(filename: string): string {
  const lower = filename.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

function isExcelBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  // ZIP (xlsx)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  // OLE (xls)
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

  if (ext && !SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
    throw new Error(
      `Unsupported file type. Use ${SUPPORTED_EXTENSIONS.join(", ")}`,
    );
  }

  const matrix = useExcel
    ? matrixFromExcelBuffer(buffer)
    : matrixFromCsvBuffer(buffer);

  return { rows: rowsFromMatrix(matrix) };
}
