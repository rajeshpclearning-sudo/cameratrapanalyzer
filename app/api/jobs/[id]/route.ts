import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs-store";
import type { JobPollResponse } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const body: JobPollResponse = {
    jobId: job.id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    files: job.files,
    errors: job.errors,
    csvReady: job.status === "completed" && !!job.csvContent,
    downloadFilename: job.downloadFilename,
    stats: job.stats,
  };

  return NextResponse.json(body);
}
