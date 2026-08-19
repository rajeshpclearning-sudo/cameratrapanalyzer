import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createJob, deleteOldJobs, getJob } from "@/lib/jobs-store";
import type { FileJobState, JobPollResponse } from "@/lib/types";
import { defaultCsvFilename, filenameFromUpload } from "@/lib/csv";
import { isAcceptedImage } from "@/lib/image-accept";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILES = 50;

function initialFileStates(names: string[]): FileJobState[] {
  return names.map((name) => ({ name, status: "pending" }));
}

function jobToPollResponse(jobId: string): JobPollResponse | null {
  const job = getJob(jobId);
  if (!job) return null;

  const terminal =
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "cancelled";

  return {
    jobId: job.id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    files: job.files,
    errors: job.errors,
    csvReady:
      (job.status === "completed" || job.status === "cancelled") &&
      !!job.csvContent,
    downloadFilename: job.downloadFilename,
    stats: job.stats,
    supabase: job.supabase,
    ...(terminal && job.csvContent ? { csvContent: job.csvContent } : {}),
  };
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (err) {
    console.error("[POST /api/jobs]", err);
    const message =
      err instanceof Error ? err.message : "Failed to start analysis job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handlePost(request: Request) {
  deleteOldJobs();

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured on the server" },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const fileEntries = formData.getAll("files");
  if (fileEntries.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }
  if (fileEntries.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES} files per batch` },
      { status: 400 },
    );
  }

  const files: {
    buffer: Buffer;
    name: string;
    mime: string;
    lastModified: number;
  }[] = [];

  for (const entry of fileEntries) {
    if (!(entry instanceof File)) continue;
    const buffer = Buffer.from(await entry.arrayBuffer());
    const name = entry.name || "unknown.jpg";
    const mime = entry.type || "application/octet-stream";

    if (!isAcceptedImage(mime, name)) {
      return NextResponse.json(
        { error: `Unsupported image: ${name}` },
        { status: 400 },
      );
    }

    files.push({
      buffer,
      name,
      mime,
      lastModified: entry.lastModified || Date.now(),
    });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "No valid image files" }, { status: 400 });
  }

  let existingCsvBuffer: Buffer | undefined;
  let existingCsvName: string | undefined;
  const csvEntry = formData.get("existingCsv");
  if (csvEntry instanceof File && csvEntry.size > 0) {
    existingCsvBuffer = Buffer.from(await csvEntry.arrayBuffer());
    existingCsvName = csvEntry.name;
  }

  const jobId = randomUUID();
  const names = files.map((f) => f.name);

  createJob({
    id: jobId,
    status: "queued",
    total: files.length,
    completed: 0,
    files: initialFileStates(names),
    errors: [],
    downloadFilename: existingCsvName
      ? filenameFromUpload(existingCsvName)
      : defaultCsvFilename(),
    createdAt: Date.now(),
  });

  const { runBatch, startBatch } = await import("@/lib/batch");
  const batchInput = {
    jobId,
    files,
    existingCsvBuffer,
    existingCsvName,
  };

  // Vercel serverless: finish the batch in this request so polling another
  // instance does not 404 with "session expired".
  if (process.env.VERCEL) {
    await runBatch(batchInput);
    const body = jobToPollResponse(jobId);
    if (!body) {
      return NextResponse.json(
        { error: "Job finished but result was not available" },
        { status: 500 },
      );
    }
    return NextResponse.json(body);
  }

  startBatch(batchInput);
  return NextResponse.json({ jobId });
}
