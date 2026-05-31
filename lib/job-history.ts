export type JobHistoryEntry = {
  id: string;
  completedAt: number;
  downloadFilename: string;
  total: number;
  done: number;
  errors: number;
  skipped: number;
  llmCalls: number;
  burstCopied: number;
  burstInferred?: number;
  /** Stored only when CSV is small enough for localStorage */
  csvContent?: string;
};

const STORAGE_KEY = "wildeye-job-history";
const MAX_ENTRIES = 30;
const MAX_CSV_BYTES = 400_000;

export function loadJobHistory(): JobHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JobHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveJobHistory(entry: JobHistoryEntry): void {
  if (typeof window === "undefined") return;
  const list = loadJobHistory().filter((e) => e.id !== entry.id);
  list.unshift(entry);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(list.slice(0, MAX_ENTRIES)),
  );
}

export function deleteJobHistoryEntry(id: string): void {
  if (typeof window === "undefined") return;
  const list = loadJobHistory().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function clearJobHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function canStoreCsv(content: string): boolean {
  return new Blob([content]).size <= MAX_CSV_BYTES;
}

export function downloadCsvFromHistory(entry: JobHistoryEntry): void {
  if (!entry.csvContent) return;
  const blob = new Blob([entry.csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = entry.downloadFilename;
  a.click();
  URL.revokeObjectURL(url);
}
