/**
 * Trap-folder naming (FFS):
 *   CN_7_FFS_2_23Feb2026_NR_2021_31
 *   ├──────── source file (first 5 tokens) ────────┤ ├NR/R┤ ├year┤ ├nights┤
 *
 * NR = Not Removed, R = Removed (Senna). Missing pieces are left blank.
 */

export type TrapFolderFields = {
  sourceFile: string;
  /** Full wording: "Removed" | "Not Removed" | "" */
  sennaStatus: string;
  yearOfRemoval: string;
  trapNights: string;
};

export const EMPTY_TRAP_FOLDER_FIELDS: TrapFolderFields = {
  sourceFile: "",
  sennaStatus: "",
  yearOfRemoval: "",
  trapNights: "",
};

/** Folder basename only (strip parent paths). */
export function trapFolderBasename(folderName: string): string {
  const raw = folderName.trim();
  if (!raw) return "";
  const parts = raw.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? raw;
}

export function parseTrapFolderName(folderName: string): TrapFolderFields {
  const base = trapFolderBasename(folderName);
  if (!base) return { ...EMPTY_TRAP_FOLDER_FIELDS };

  const parts = base.split("_").filter((p) => p.length > 0);
  if (parts.length === 0) return { ...EMPTY_TRAP_FOLDER_FIELDS };

  const sourceFile = parts.slice(0, Math.min(5, parts.length)).join("_");
  if (parts.length <= 5) {
    return {
      sourceFile,
      sennaStatus: "",
      yearOfRemoval: "",
      trapNights: "",
    };
  }

  let i = 5;
  let sennaStatus = "";
  const flag = parts[i]?.toUpperCase() ?? "";
  if (flag === "NR" || flag === "R") {
    sennaStatus = flag === "R" ? "Removed" : "Not Removed";
    i += 1;
  }

  const yearOfRemoval = parts[i] ?? "";
  const trapNights = parts[i + 1] ?? "";

  return {
    sourceFile,
    sennaStatus,
    yearOfRemoval,
    trapNights,
  };
}

/** Parent folder from a File's webkitRelativePath, if present. */
export function folderNameFromFile(file: File): string {
  const rel = (
    file as File & { webkitRelativePath?: string }
  ).webkitRelativePath?.trim();
  if (rel && rel.includes("/")) {
    return rel.split("/")[0] ?? "";
  }
  return "";
}
