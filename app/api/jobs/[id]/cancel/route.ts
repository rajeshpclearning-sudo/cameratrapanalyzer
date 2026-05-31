import { NextResponse } from "next/server";
import { getJob, requestJobCancel } from "@/lib/jobs-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (
    job.status === "completed" ||
    job.status === "failed" ||
    job.status === "cancelled"
  ) {
    return NextResponse.json({ ok: true, status: job.status });
  }

  requestJobCancel(id);
  return NextResponse.json({ ok: true, status: "cancelling" });
}
