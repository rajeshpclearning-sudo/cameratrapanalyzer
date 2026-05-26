import { analyzeImage } from "./llm/analyze";
import { buildCsv, defaultCsvFilename, filenameFromUpload, parseExistingCsv } from "./csv";
import { extractDateTime } from "./exif";
import { isHeic, isSupportedImage, prepareImageForLlm } from "./image";
import { getJob, updateJob } from "./jobs-store";
import type { CsvRow, FileJobState, LlmAnalysis } from "./types";

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

function getConcurrency(): number {
  const n = parseInt(process.env.LLM_CONCURRENCY ?? "2", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 5) : 2;
}

async function processFile(
  jobId: string,
  index: number,
  buffer: Buffer,
  name: string,
  mime: string,
  lastModified: number,
): Promise<CsvRow | null> {
  const job = getJob(jobId);
  if (!job) return null;

  const files = [...job.files];
  files[index] = { ...files[index], status: "analyzing" };
  updateJob(jobId, { files });

  try {
    if (isHeic(mime, name)) {
      throw new Error("HEIC/HEIF not supported in v0 — convert to JPEG first");
    }
    if (!isSupportedImage(mime, name)) {
      throw new Error(`Unsupported file type: ${mime || "unknown"}`);
    }

    const { date, timestamp } = await extractDateTime(
      buffer,
      new Date(lastModified),
    );
    const jpeg = await prepareImageForLlm(buffer);
    const analysis = await analyzeImage(jpeg);
    const row = llmToRow(name, date, timestamp, analysis);

    const updated = getJob(jobId);
    if (updated) {
      const nextFiles = [...updated.files];
      nextFiles[index] = { name, status: "done", row };
      updateJob(jobId, {
        files: nextFiles,
        completed: updated.completed + 1,
      });
    }
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const updated = getJob(jobId);
    if (updated) {
      const nextFiles = [...updated.files];
      nextFiles[index] = { name, status: "error", error: message };
      updateJob(jobId, {
        files: nextFiles,
        completed: updated.completed + 1,
        errors: [...updated.errors, `${name}: ${message}`],
      });
    }
    return null;
  }
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export type BatchInput = {
  jobId: string;
  files: { buffer: Buffer; name: string; mime: string; lastModified: number }[];
  existingCsvBuffer?: Buffer;
  existingCsvName?: string;
};

export function startBatch(input: BatchInput): void {
  const { jobId, files, existingCsvBuffer, existingCsvName } = input;

  void (async () => {
    updateJob(jobId, { status: "running" });

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

    const concurrency = getConcurrency();
    const newRows: (CsvRow | null)[] = await runPool(
      files,
      concurrency,
      (file, index) =>
        processFile(
          jobId,
          index,
          file.buffer,
          file.name,
          file.mime,
          file.lastModified,
        ),
    );

    const appended = newRows.filter((r): r is CsvRow => r !== null);
    const allRows = [...existingRows, ...appended];
    const csvContent = buildCsv(allRows);

    updateJob(jobId, {
      status: "completed",
      csvContent,
      downloadFilename,
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
