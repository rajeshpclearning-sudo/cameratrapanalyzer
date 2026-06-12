import {
  isUnidentifiedSpecies,
  reconcileBurstSpecies,
} from "./burst-species";
import { analyzeImage } from "./llm/analyze";
import {
  buildCsv,
  defaultCsvFilename,
  filenameFromUpload,
  parseExistingCsv,
} from "./csv";
import { extractDateTime } from "./exif";
import { decodeToJpeg, isAcceptedImage } from "./image";
import { getJob, isJobCancelRequested, updateJob } from "./jobs-store";
import { persistSightings } from "./persist-sightings";
import {
  burstGapMs,
  emptyFrameRow,
  groupBurstIndices,
  isLikelyEmptyFrame,
} from "./preprocess";
import type { CsvRow, FileJobState, LlmAnalysis } from "./types";

const SKIP_EMPTY = process.env.SKIP_EMPTY_FRAMES !== "false";
const DEDUPE_BURST = process.env.DEDUPE_BURST !== "false";

export type BatchFile = {
  buffer: Buffer;
  name: string;
  mime: string;
  lastModified: number;
};

function llmToRow(
  photoName: string,
  date: string,
  timestamp: string,
  analysis: LlmAnalysis,
): CsvRow {
  return [
    photoName,
    date,
    timestamp,
    analysis.species_common,
    String(analysis.individual_count),
    analysis.behavior,
  ];
}

function copyAnalysisRow(
  photoName: string,
  date: string,
  timestamp: string,
  source: CsvRow,
): CsvRow {
  return [photoName, date, timestamp, source[3], source[4], source[5]];
}

function getConcurrency(): number {
  const n = parseInt(process.env.LLM_CONCURRENCY ?? "2", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 5) : 2;
}

function markFile(
  jobId: string,
  index: number,
  patch: Partial<FileJobState>,
): void {
  const job = getJob(jobId);
  if (!job) return;
  const nextFiles = [...job.files];
  nextFiles[index] = { ...nextFiles[index], ...patch };
  updateJob(jobId, {
    files: nextFiles,
    completed: job.completed + 1,
  });
}

function patchFileRow(jobId: string, index: number, row: CsvRow): void {
  const job = getJob(jobId);
  if (!job) return;
  const nextFiles = [...job.files];
  nextFiles[index] = { ...nextFiles[index], row, status: "done" };
  updateJob(jobId, { files: nextFiles });
}

function applyBurstReconciliation(
  jobId: string,
  group: number[],
  rows: (CsvRow | null)[],
): (CsvRow | null)[] {
  const { rows: reconciled, inferred } = reconcileBurstSpecies(rows);
  if (inferred === 0) return reconciled;

  for (let i = 0; i < group.length; i++) {
    const before = rows[i];
    const after = reconciled[i];
    if (before && after && before[3] !== after[3]) {
      patchFileRow(jobId, group[i]!, after);
    }
  }

  incrementStats(jobId, "burstInferred", inferred);
  return reconciled;
}

function incrementStats(
  jobId: string,
  field: "emptySkipped" | "burstCopied" | "burstInferred" | "llmCalls",
  n = 1,
): void {
  const job = getJob(jobId);
  if (!job) return;
  const stats = job.stats ?? {
    emptySkipped: 0,
    burstCopied: 0,
    burstInferred: 0,
    llmCalls: 0,
  };
  stats[field] += n;
  updateJob(jobId, { stats });
}

async function getDateTime(
  buffer: Buffer,
  lastModified: number,
): Promise<{ date: string; timestamp: string }> {
  return extractDateTime(buffer, new Date(lastModified));
}

async function processLeader(
  jobId: string,
  index: number,
  file: BatchFile,
): Promise<CsvRow> {
  const { buffer, name, mime, lastModified } = file;
  const files = [...(getJob(jobId)?.files ?? [])];
  files[index] = { ...files[index], status: "analyzing" };
  updateJob(jobId, { files });

  try {
    if (!isAcceptedImage(mime, name)) {
      throw new Error(`Unsupported file type: ${mime || "unknown"}`);
    }

    const jpeg = await decodeToJpeg(buffer);
    const { date, timestamp } = await getDateTime(jpeg, lastModified);

    if (SKIP_EMPTY && (await isLikelyEmptyFrame(jpeg))) {
      const row = emptyFrameRow(name, date, timestamp);
      markFile(jobId, index, { name, status: "skipped", row });
      incrementStats(jobId, "emptySkipped");
      return row;
    }

    const analysis = await analyzeImage(jpeg);
    incrementStats(jobId, "llmCalls");
    const row = llmToRow(name, date, timestamp, analysis);
    markFile(jobId, index, { name, status: "done", row });
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const job = getJob(jobId);
    markFile(jobId, index, { name, status: "error", error: message });
    if (job) {
      updateJob(jobId, { errors: [...job.errors, `${name}: ${message}`] });
    }
    throw err;
  }
}

async function processFollower(
  jobId: string,
  index: number,
  file: BatchFile,
  leaderRow: CsvRow,
): Promise<CsvRow> {
  const files = [...(getJob(jobId)?.files ?? [])];
  files[index] = { ...files[index], status: "analyzing" };
  updateJob(jobId, { files });

  try {
    const jpeg = await decodeToJpeg(file.buffer);
    const { date, timestamp } = await getDateTime(jpeg, file.lastModified);
    const row = copyAnalysisRow(file.name, date, timestamp, leaderRow);
    markFile(jobId, index, { name: file.name, status: "done", row });
    incrementStats(jobId, "burstCopied");
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const job = getJob(jobId);
    markFile(jobId, index, {
      name: file.name,
      status: "error",
      error: message,
    });
    if (job) {
      updateJob(jobId, {
        errors: [...job.errors, `${file.name}: ${message}`],
      });
    }
    throw err;
  }
}

async function processSingle(
  jobId: string,
  index: number,
  file: BatchFile,
): Promise<CsvRow | null> {
  try {
    return await processLeader(jobId, index, file);
  } catch {
    return null;
  }
}

async function processGroup(
  jobId: string,
  group: number[],
  files: BatchFile[],
): Promise<(CsvRow | null)[]> {
  if (!DEDUPE_BURST || group.length === 1) {
    const rows: (CsvRow | null)[] = [];
    for (const idx of group) {
      rows.push(await processSingle(jobId, idx, files[idx]!));
    }
    return applyBurstReconciliation(jobId, group, rows);
  }

  const leaderIdx = group[0]!;
  let leaderRow: CsvRow | null = null;
  try {
    leaderRow = await processLeader(jobId, leaderIdx, files[leaderIdx]!);
  } catch {
    leaderRow = null;
  }

  const rows: (CsvRow | null)[] = new Array(group.length);
  rows[0] = leaderRow;

  if (!leaderRow) {
    for (let i = 1; i < group.length; i++) {
      const idx = group[i]!;
      rows[i] = await processSingle(jobId, idx, files[idx]!);
    }
    return applyBurstReconciliation(jobId, group, rows);
  }

  const leaderUnclear = isUnidentifiedSpecies(leaderRow[3]);

  for (let i = 1; i < group.length; i++) {
    const idx = group[i]!;
    try {
      if (leaderUnclear) {
        rows[i] = await processSingle(jobId, idx, files[idx]!);
      } else {
        rows[i] = await processFollower(jobId, idx, files[idx]!, leaderRow);
      }
    } catch {
      rows[i] = null;
    }
  }

  return applyBurstReconciliation(jobId, group, rows);
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export type BatchInput = {
  jobId: string;
  files: BatchFile[];
  existingCsvBuffer?: Buffer;
  existingCsvName?: string;
};

async function finalizeCancelled(
  jobId: string,
  existingRows: CsvRow[],
  downloadFilename: string,
): Promise<void> {
  const job = getJob(jobId);
  if (!job) return;

  const files = job.files.map((f) =>
    f.status === "pending" || f.status === "analyzing"
      ? { ...f, status: "skipped" as const }
      : f,
  );

  const newRows = files
    .filter((f) => f.row)
    .map((f) => f.row!);

  const supabaseResult = await persistSightings(jobId, newRows);

  updateJob(jobId, {
    status: "cancelled",
    files,
    csvContent: buildCsv([...existingRows, ...newRows]),
    downloadFilename,
    supabase: {
      saved: supabaseResult.inserted,
      configured: supabaseResult.configured,
      error: supabaseResult.error,
    },
  });
}

export function startBatch(input: BatchInput): void {
  const { jobId, files, existingCsvBuffer, existingCsvName } = input;

  void (async () => {
    updateJob(jobId, {
      status: "running",
      stats: { emptySkipped: 0, burstCopied: 0, burstInferred: 0, llmCalls: 0 },
    });

    let existingRows: CsvRow[] = [];
    let downloadFilename = defaultCsvFilename();

    try {
      if (existingCsvBuffer) {
        const parsed = parseExistingCsv(existingCsvBuffer);
        existingRows = parsed.rows;
        if (existingCsvName) {
          downloadFilename = filenameFromUpload(existingCsvName);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(jobId, {
        status: "failed",
        errors: [`CSV parse error: ${message}`],
      });
      return;
    }

    const meta = files.map((f) => ({
      name: f.name,
      lastModified: f.lastModified,
    }));
    const groups = groupBurstIndices(meta);
    const concurrency = getConcurrency();

    const groupResults = await runPool(groups, concurrency, (group) => {
      if (isJobCancelRequested(jobId)) {
        return Promise.resolve(group.map(() => null));
      }
      return processGroup(jobId, group, files);
    });

    if (isJobCancelRequested(jobId)) {
      await finalizeCancelled(jobId, existingRows, downloadFilename);
      return;
    }

    const newRows: CsvRow[] = [];
    let gi = 0;
    for (const group of groups) {
      const gRows = groupResults[gi++] ?? [];
      for (let i = 0; i < group.length; i++) {
        const row = gRows[i];
        if (row) newRows.push(row);
      }
    }

    const allRows = [...existingRows, ...newRows];
    const csvContent = buildCsv(allRows);

    const supabaseResult = await persistSightings(jobId, newRows);

    updateJob(jobId, {
      status: "completed",
      csvContent,
      downloadFilename,
      supabase: {
        saved: supabaseResult.inserted,
        configured: supabaseResult.configured,
        error: supabaseResult.error,
      },
    });
  })().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    updateJob(jobId, {
      status: "failed",
      errors: [message],
    });
  });
}

export function initialFileStates(names: string[]): FileJobState[] {
  return names.map((name) => ({ name, status: "pending" }));
}

export { burstGapMs, SKIP_EMPTY, DEDUPE_BURST };
