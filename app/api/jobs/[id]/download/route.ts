import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "completed" || !job.csvContent) {
    return NextResponse.json(
      { error: "CSV not ready" },
      { status: 400 },
    );
  }

  return new NextResponse(job.csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${job.downloadFilename}"`,
    },
  });
}
