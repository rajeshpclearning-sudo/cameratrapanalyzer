import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { startBatch, initialFileStates } from "@/lib/batch";
import { createJob, deleteOldJobs } from "@/lib/jobs-store";
import { defaultCsvFilename, filenameFromUpload } from "@/lib/csv";
import { isHeic, isSupportedImage } from "@/lib/image";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILES = 50;

export async function POST(request: Request) {
  deleteOldJobs();

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
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

    if (isHeic(mime, name)) {
      return NextResponse.json(
        { error: `HEIC not supported: ${name}` },
        { status: 400 },
      );
    }
    if (!isSupportedImage(mime, name)) {
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

  startBatch({
    jobId,
    files,
    existingCsvBuffer,
    existingCsvName,
  });

  return NextResponse.json({ jobId });
}
