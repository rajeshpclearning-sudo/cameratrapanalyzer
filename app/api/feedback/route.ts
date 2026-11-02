import { NextResponse } from "next/server";
import { addFeedback, listFeedback } from "@/lib/feedback-store";

export const runtime = "nodejs";

export async function GET() {
  const feedback = await listFeedback(40);
  return NextResponse.json({ feedback });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      photoName?: string;
      aiSpecies?: string;
      correctSpecies?: string;
      comment?: string;
    };

    const photoName = (body.photoName ?? "").trim();
    const comment = (body.comment ?? "").trim();
    const correctSpecies = (body.correctSpecies ?? "").trim();
    const aiSpecies = (body.aiSpecies ?? "").trim();

    if (!photoName) {
      return NextResponse.json(
        { error: "Photo name is required" },
        { status: 400 },
      );
    }
    if (!comment && !correctSpecies) {
      return NextResponse.json(
        { error: "Add a correct species and/or a comment" },
        { status: 400 },
      );
    }

    const row = await addFeedback({
      photoName,
      aiSpecies,
      correctSpecies,
      comment:
        comment ||
        `Marked incorrect. Suggested label: ${correctSpecies || "unspecified"}`,
    });

    return NextResponse.json({ ok: true, feedback: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save feedback";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
