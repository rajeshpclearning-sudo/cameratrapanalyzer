import { NextResponse } from "next/server";
import { listFeedback } from "@/lib/feedback-store";
import {
  loadCorrectionsLogMarkdown,
  loadStationRulesMarkdown,
} from "@/lib/llm/load-rules";

export const runtime = "nodejs";

export async function GET() {
  const rulesMarkdown = loadStationRulesMarkdown();
  const correctionsMarkdown = loadCorrectionsLogMarkdown();
  const pendingFeedback = (await listFeedback(40)).filter(
    (f) => f.status === "pending",
  );

  return NextResponse.json({
    title: "FFS Station C8 — Wild animal detection rules",
    station: "Forest First Samithi, Station C8, Wayanad, Kerala",
    rulesMarkdown,
    correctionsMarkdown,
    pendingFeedback,
    updatedHint:
      "Rules update when accuracy fixes are committed to GitHub and Vercel redeploys. Pending preview feedback is used on the next analysis immediately.",
  });
}
