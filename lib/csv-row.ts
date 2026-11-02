import {
  EMPTY_TRAP_FOLDER_FIELDS,
  parseTrapFolderName,
  type TrapFolderFields,
} from "./folder-meta";
import { CSV_COL, ROW_STATUS, type CsvRow } from "./types";

export function emptyCsvRow(): CsvRow {
  return ["", "", "", "", "", "", "", "", "", "", ""];
}

export function trapFieldsFromFolder(
  folderName: string | undefined | null,
): TrapFolderFields {
  if (!folderName?.trim()) return { ...EMPTY_TRAP_FOLDER_FIELDS };
  return parseTrapFolderName(folderName);
}

export function withTrapFolderFields(
  row: CsvRow,
  fields: TrapFolderFields,
): CsvRow {
  const next: CsvRow = [...row] as CsvRow;
  while (next.length < 11) next.push("");
  next[CSV_COL.sourceFile] = fields.sourceFile;
  next[CSV_COL.sennaStatus] = fields.sennaStatus;
  next[CSV_COL.yearOfRemoval] = fields.yearOfRemoval;
  next[CSV_COL.trapNights] = fields.trapNights;
  return next;
}

export function buildAnalysisCsvRow(input: {
  photoName: string;
  date: string;
  timestamp: string;
  species: string;
  individuals: string;
  behavior: string;
  status?: string;
  folderName?: string | null;
}): CsvRow {
  const fields = trapFieldsFromFolder(input.folderName);
  return [
    input.photoName,
    input.date,
    input.timestamp,
    input.species,
    input.individuals,
    input.behavior,
    input.status ?? ROW_STATUS.success,
    fields.sourceFile,
    fields.sennaStatus,
    fields.yearOfRemoval,
    fields.trapNights,
  ];
}

/** Ensure legacy 7-column rows become 11-column rows. */
export function normalizeCsvRow(row: string[]): CsvRow {
  const out = emptyCsvRow();
  for (let i = 0; i < Math.min(row.length, 11); i++) {
    out[i] = row[i] ?? "";
  }
  if (!out[CSV_COL.status]?.trim()) {
    out[CSV_COL.status] = ROW_STATUS.success;
  }
  return out;
}
