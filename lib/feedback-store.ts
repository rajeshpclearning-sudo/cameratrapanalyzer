import "server-only";

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

export type AnalysisFeedback = {
  id: string;
  photoName: string;
  aiSpecies: string;
  correctSpecies: string;
  comment: string;
  createdAt: string;
  status: "pending" | "applied";
};

const MEMORY: AnalysisFeedback[] = [];
const LOCAL_FILE = join(process.cwd(), ".data", "analysis-feedback.json");

function readLocalFile(): AnalysisFeedback[] {
  try {
    if (!existsSync(LOCAL_FILE)) return [];
    const raw = readFileSync(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw) as AnalysisFeedback[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalFile(rows: AnalysisFeedback[]): void {
  try {
    mkdirSync(join(process.cwd(), ".data"), { recursive: true });
    writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
  } catch (err) {
    console.warn("[feedback] could not write local file:", err);
  }
}

function mergeUnique(rows: AnalysisFeedback[]): AnalysisFeedback[] {
  const byId = new Map<string, AnalysisFeedback>();
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export async function listFeedback(limit = 50): Promise<AnalysisFeedback[]> {
  const local = [...MEMORY, ...readLocalFile()];

  if (isSupabaseConfigured()) {
    const client = getSupabaseAdmin();
    if (client) {
      const { data, error } = await client
        .from("analysis_feedback")
        .select(
          "id, photo_name, ai_species, correct_species, comment, created_at, status",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!error && data) {
        const fromDb: AnalysisFeedback[] = data.map((r) => ({
          id: String(r.id),
          photoName: String(r.photo_name ?? ""),
          aiSpecies: String(r.ai_species ?? ""),
          correctSpecies: String(r.correct_species ?? ""),
          comment: String(r.comment ?? ""),
          createdAt: String(r.created_at ?? new Date().toISOString()),
          status: r.status === "applied" ? "applied" : "pending",
        }));
        return mergeUnique([...fromDb, ...local]).slice(0, limit);
      }
    }
  }

  return mergeUnique(local).slice(0, limit);
}

export async function addFeedback(input: {
  photoName: string;
  aiSpecies: string;
  correctSpecies: string;
  comment: string;
}): Promise<AnalysisFeedback> {
  const row: AnalysisFeedback = {
    id: crypto.randomUUID(),
    photoName: input.photoName.trim(),
    aiSpecies: input.aiSpecies.trim(),
    correctSpecies: input.correctSpecies.trim(),
    comment: input.comment.trim(),
    createdAt: new Date().toISOString(),
    status: "pending",
  };

  MEMORY.unshift(row);
  writeLocalFile(mergeUnique([...MEMORY, ...readLocalFile()]));

  if (isSupabaseConfigured()) {
    const client = getSupabaseAdmin();
    if (client) {
      const { error } = await client.from("analysis_feedback").insert({
        id: row.id,
        photo_name: row.photoName,
        ai_species: row.aiSpecies,
        correct_species: row.correctSpecies,
        comment: row.comment,
        created_at: row.createdAt,
        status: row.status,
      });
      if (error) {
        console.warn("[feedback] supabase insert failed:", error.message);
      }
    }
  }

  return row;
}

/** Compact block injected into the vision system prompt. */
export async function loadPendingFeedbackForPrompt(
  maxItems = 25,
): Promise<string> {
  const rows = (await listFeedback(maxItems)).filter(
    (r) => r.status === "pending",
  );
  if (rows.length === 0) return "";

  const lines = rows.map((r) => {
    const fix = r.correctSpecies
      ? `correct label "${r.correctSpecies}"`
      : "see comment for correction";
    return `- Photo ${r.photoName || "(unknown)"}: AI said "${r.aiSpecies || "—"}"; ${fix}. User note: ${r.comment || "(none)"}`;
  });

  return [
    "PENDING USER FEEDBACK (mandatory — honor these corrections on similar cases):",
    ...lines,
  ].join("\n");
}
