import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { parseSightingsFile } from "@/lib/parse-sightings-file";
import { persistSightings } from "@/lib/persist-sightings";
import type { CsvRow } from "@/lib/types";

export const runtime = "nodejs";

const SAMPLE_ROWS = 5;

export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const dryRun = formData.get("dryRun") === "true";
    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const filename = fileEntry.name || "upload.csv";

    let rows: CsvRow[];
    try {
      ({ rows } = parseSightingsFile(buffer, filename));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to parse file";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (dryRun) {
      return NextResponse.json({
        filename,
        rowCount: rows.length,
        sampleRows: rows.slice(0, SAMPLE_ROWS),
      });
    }

    const jobId = `import-${randomUUID()}`;
    const supabase = await persistSightings(jobId, rows);

    return NextResponse.json({
      filename,
      rowCount: rows.length,
      jobId,
      supabase,
    });
  } catch (err) {
    console.error("[POST /api/import-sightings]", err);
    const message =
      err instanceof Error ? err.message : "Failed to import sightings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
