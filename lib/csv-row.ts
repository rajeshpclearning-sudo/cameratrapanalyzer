import { isHumanSpecies } from "./burst-species";
import {
  EMPTY_TRAP_FOLDER_FIELDS,
  parseTrapFolderName,
  type TrapFolderFields,
} from "./folder-meta";
import { CSV_COL, ROW_STATUS, type CsvRow, type LlmAnalysis } from "./types";

export const CSV_COLUMN_COUNT = 18;

export function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function isYes(value: string | undefined | null): boolean {
  return (value ?? "").trim().toLowerCase() === "yes";
}

export function emptyCsvRow(): CsvRow {
  return [
    "",
    "",
    "",
    "",
    "",
    "",
    "No",
    "No",
    "",
    "No",
    "",
    "No",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
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
  const next = normalizeCsvRow([...row]);
  next[CSV_COL.sourceFile] = fields.sourceFile;
  next[CSV_COL.sennaStatus] = fields.sennaStatus;
  next[CSV_COL.yearOfRemoval] = fields.yearOfRemoval;
  next[CSV_COL.trapNights] = fields.trapNights;
  return next;
}

export function reviewFlagsFromAnalysis(analysis: LlmAnalysis): {
  hasHuman: string;
  injuryOrForeignOnAnimal: string;
  injuryOrForeignNotes: string;
  needsExpertReview: string;
  expertReviewReason: string;
  foreignObjectInScene: string;
  foreignObjectNotes: string;
} {
  const human =
    Boolean(analysis.has_human) ||
    isHumanSpecies(analysis.species_common ?? "");
  return {
    hasHuman: yesNo(human),
    injuryOrForeignOnAnimal: yesNo(
      Boolean(analysis.injury_or_foreign_on_animal),
    ),
    injuryOrForeignNotes: (analysis.injury_or_foreign_notes ?? "").trim(),
    needsExpertReview: yesNo(Boolean(analysis.needs_expert_review)),
    expertReviewReason: (analysis.expert_review_reason ?? "").trim(),
    foreignObjectInScene: yesNo(Boolean(analysis.has_foreign_object_scene)),
    foreignObjectNotes: (analysis.foreign_object_notes ?? "").trim(),
  };
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
  hasHuman?: string;
  injuryOrForeignOnAnimal?: string;
  injuryOrForeignNotes?: string;
  needsExpertReview?: string;
  expertReviewReason?: string;
  foreignObjectInScene?: string;
  foreignObjectNotes?: string;
}): CsvRow {
  const fields = trapFieldsFromFolder(input.folderName);
  const hasHuman =
    input.hasHuman?.trim() ||
    (isHumanSpecies(input.species) ? "Yes" : "No");
  return [
    input.photoName,
    input.date,
    input.timestamp,
    input.species,
    input.individuals,
    input.behavior,
    hasHuman,
    input.injuryOrForeignOnAnimal?.trim() || "No",
    input.injuryOrForeignNotes ?? "",
    input.needsExpertReview?.trim() || "No",
    input.expertReviewReason ?? "",
    input.foreignObjectInScene?.trim() || "No",
    input.foreignObjectNotes ?? "",
    input.status ?? ROW_STATUS.success,
    fields.sourceFile,
    fields.sennaStatus,
    fields.yearOfRemoval,
    fields.trapNights,
  ];
}

/**
 * Ensure legacy 7- or 11-column rows become 18-column rows.
 * Old layout: … Behavior, Status, SourceFile, Senna, Year, Trap nights
 * New layout inserts Has Human + 6 review columns after Behavior.
 */
export function normalizeCsvRow(row: string[]): CsvRow {
  const out = emptyCsvRow();

  if (row.length >= CSV_COLUMN_COUNT) {
    for (let i = 0; i < CSV_COLUMN_COUNT; i++) {
      out[i] = row[i] ?? "";
    }
  } else if (row.length === 17) {
    // Intermediate 17-col shape (review flags, no Has Human): shift after behavior.
    out[CSV_COL.photoName] = row[0] ?? "";
    out[CSV_COL.date] = row[1] ?? "";
    out[CSV_COL.timestamp] = row[2] ?? "";
    out[CSV_COL.speciesName] = row[3] ?? "";
    out[CSV_COL.individuals] = row[4] ?? "";
    out[CSV_COL.behavior] = row[5] ?? "";
    out[CSV_COL.hasHuman] = isHumanSpecies(row[3] ?? "") ? "Yes" : "No";
    out[CSV_COL.injuryOrForeignOnAnimal] = row[6] ?? "No";
    out[CSV_COL.injuryOrForeignNotes] = row[7] ?? "";
    out[CSV_COL.needsExpertReview] = row[8] ?? "No";
    out[CSV_COL.expertReviewReason] = row[9] ?? "";
    out[CSV_COL.foreignObjectInScene] = row[10] ?? "No";
    out[CSV_COL.foreignObjectNotes] = row[11] ?? "";
    out[CSV_COL.status] = row[12] ?? "";
    out[CSV_COL.sourceFile] = row[13] ?? "";
    out[CSV_COL.sennaStatus] = row[14] ?? "";
    out[CSV_COL.yearOfRemoval] = row[15] ?? "";
    out[CSV_COL.trapNights] = row[16] ?? "";
  } else if (row.length === 7 || row.length === 11) {
    out[CSV_COL.photoName] = row[0] ?? "";
    out[CSV_COL.date] = row[1] ?? "";
    out[CSV_COL.timestamp] = row[2] ?? "";
    out[CSV_COL.speciesName] = row[3] ?? "";
    out[CSV_COL.individuals] = row[4] ?? "";
    out[CSV_COL.behavior] = row[5] ?? "";
    out[CSV_COL.hasHuman] = isHumanSpecies(row[3] ?? "") ? "Yes" : "No";
    out[CSV_COL.injuryOrForeignOnAnimal] = "No";
    out[CSV_COL.injuryOrForeignNotes] = "";
    out[CSV_COL.needsExpertReview] = "No";
    out[CSV_COL.expertReviewReason] = "";
    out[CSV_COL.foreignObjectInScene] = "No";
    out[CSV_COL.foreignObjectNotes] = "";
    out[CSV_COL.status] = row[6] ?? "";
    out[CSV_COL.sourceFile] = row[7] ?? "";
    out[CSV_COL.sennaStatus] = row[8] ?? "";
    out[CSV_COL.yearOfRemoval] = row[9] ?? "";
    out[CSV_COL.trapNights] = row[10] ?? "";
  } else {
    for (let i = 0; i < Math.min(row.length, CSV_COLUMN_COUNT); i++) {
      out[i] = row[i] ?? "";
    }
    if (!out[CSV_COL.hasHuman]?.trim()) {
      out[CSV_COL.hasHuman] = isHumanSpecies(out[CSV_COL.speciesName])
        ? "Yes"
        : "No";
    }
  }

  if (!out[CSV_COL.status]?.trim()) {
    out[CSV_COL.status] = ROW_STATUS.success;
  }
  if (!out[CSV_COL.hasHuman]?.trim()) {
    out[CSV_COL.hasHuman] = isHumanSpecies(out[CSV_COL.speciesName])
      ? "Yes"
      : "No";
  }
  if (!out[CSV_COL.injuryOrForeignOnAnimal]?.trim()) {
    out[CSV_COL.injuryOrForeignOnAnimal] = "No";
  }
  if (!out[CSV_COL.needsExpertReview]?.trim()) {
    out[CSV_COL.needsExpertReview] = "No";
  }
  if (!out[CSV_COL.foreignObjectInScene]?.trim()) {
    out[CSV_COL.foreignObjectInScene] = "No";
  }
  return out;
}
