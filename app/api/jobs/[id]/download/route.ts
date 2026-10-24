import { NextResponse } from "next/server";
import {
  buildArmedHighlightSpreadsheet,
  rowsFromCsvContent,
  spreadsheetDownloadFilename,
} from "@/lib/excel-export";
import { getJob } from "@/lib/jobs-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (
    (job.status !== "completed" && job.status !== "cancelled") ||
    !job.csvContent
  ) {
    return NextResponse.json(
      { error: "CSV not ready" },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "xls").toLowerCase();

  if (format === "csv") {
    return new NextResponse(job.csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${job.downloadFilename}"`,
      },
    });
  }

  const rows = rowsFromCsvContent(job.csvContent);
  const xml = buildArmedHighlightSpreadsheet(rows);
  const xlsName = spreadsheetDownloadFilename(job.downloadFilename);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${xlsName}"`,
    },
  });
}
