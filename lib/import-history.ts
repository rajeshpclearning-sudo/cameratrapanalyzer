export type ImportHistoryEntry = {
  /** Normalized key: trim + lowercase */
  filename: string;
  /** Original name for display */
  displayName: string;
  importedAt: number;
  rowCount: number;
  jobId?: string;
};

const STORAGE_KEY = "wildeye-import-history";
const MAX_ENTRIES = 100;

export function normalizeImportFilename(name: string): string {
  return name.trim().toLowerCase();
}

export function loadImportHistory(): ImportHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ImportHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordImport(entry: ImportHistoryEntry): void {
  if (typeof window === "undefined") return;
  const key = normalizeImportFilename(entry.filename);
  const list = loadImportHistory().filter((e) => e.filename !== key);
  list.unshift({ ...entry, filename: key });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
}

export function findPriorImport(filename: string): ImportHistoryEntry | null {
  const key = normalizeImportFilename(filename);
  return loadImportHistory().find((e) => e.filename === key) ?? null;
}
