import { readFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import type { LlmAnalysis } from "../types";

const BASE_SYSTEM_PROMPT = `You analyze forest camera-trap photographs from India (FFS Station C8, Wayanad, Kerala).
Return JSON only. Use common English species names in species_common (scientific names may appear in the station rules for reference only — do not put them in JSON fields).
Count only visible individuals.
Apply the station classification rules below strictly — they override generic wildlife knowledge when they conflict.

When an animal IS visible (including partial bodies at the frame edge):
- has_animal: true
- species_common: best common-name guess from the station rules (e.g. "Elephant" for a large grey body leaving the frame). Prefer a species name over "Unidentified" when body size/shape/colour support a clear guess.
- individual_count: integer count of distinct animals inferred from visible parts (usually 1 for one partial body)
- individuals_description: same count as a string (e.g. "1")
- behavior: one of foraging, moving, standing, resting, drinking, running, unknown

When NO animal is visible (truly empty — no body part at all):
- has_animal: false
- species_common: "No animal detected" (or "No animal – …" with a short scene note)
- individual_count: 0
- individuals_description: short text describing absence (e.g. "No animals visible")
- behavior: brief scene/activity description (what is seen — not "N/A" or "Not Applicable")

Other rules:
- Humans: has_human true and species_common "Human" ONLY when people are clearly visible IN THIS FRAME. individual_count = number of people in this frame only. Never mark Human because a neighboring burst photo had people. Never mark "No animal detected" when people are visible.
- Do not invent rare/exotic species; for clear partial Indian wildlife (elephant, deer, etc.), do make an intelligent guess.
- Never use "Partial animal visible at frame edge — species unconfirmed" as species_common.
- For background/secondary animals, follow the station verification rules (eye-shine alone is not enough).`;

let cachedStationRules: string | null = null;

/** FFS Station C8 rules — edited when accuracy feedback improves identification. */
export function loadStationClassificationRules(): string {
  if (cachedStationRules != null) return cachedStationRules;
  const path = join(process.cwd(), "lib/llm/ffs-c8-rules.md");
  try {
    cachedStationRules = readFileSync(path, "utf8").trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[llm] could not load ffs-c8-rules.md:", message);
    cachedStationRules = "";
  }
  return cachedStationRules;
}

function buildSystemPrompt(): string {
  const rules = loadStationClassificationRules();
  if (!rules) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\n---\nSTATION CLASSIFICATION RULES (mandatory):\n\n${rules}`;
}

const responseSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "camera_trap_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        species_common: { type: "string" },
        individual_count: { type: "integer" },
        individuals_description: { type: "string" },
        behavior: { type: "string" },
        has_animal: { type: "boolean" },
        has_human: { type: "boolean" },
      },
      required: [
        "species_common",
        "individual_count",
        "individuals_description",
        "behavior",
        "has_animal",
        "has_human",
      ],
      additionalProperties: false,
    },
  },
};

let client: OpenAI | null = null;

function envTrim(name: string): string {
  const raw = process.env[name];
  if (!raw) return "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

function resolveBaseUrl(apiKey: string): string | undefined {
  const fromEnv = envTrim("OPENAI_BASE_URL");
  if (fromEnv) {
    try {
      const parsed = new URL(fromEnv);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return fromEnv.replace(/\/$/, "");
      }
    } catch {
      // fall through to key-based default
    }
  }
  if (apiKey.startsWith("sk-or-")) return "https://openrouter.ai/api/v1";
  return undefined;
}

function getClient(): OpenAI {
  const key = envTrim("OPENAI_API_KEY");
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!client) {
    const baseURL = resolveBaseUrl(key);
    const openRouter = baseURL?.includes("openrouter.ai") ?? key.startsWith("sk-or-");
    const referer = envTrim("OPENROUTER_SITE_URL") || "http://localhost:3000";
    client = new OpenAI({
      apiKey: key,
      baseURL,
      defaultHeaders: openRouter
        ? {
            "HTTP-Referer": referer,
            "X-Title": "WildEye Analyzer",
          }
        : undefined,
    });
  }
  return client;
}

function getModel(): string {
  const model = envTrim("LLM_MODEL");
  if (model) return model;
  const key = envTrim("OPENAI_API_KEY");
  if (key.startsWith("sk-or-")) return "openai/gpt-4o-mini";
  return "gpt-4o-mini";
}

function normalizeNoAnimalAnalysis(parsed: LlmAnalysis): LlmAnalysis {
  if (!parsed.individuals_description?.trim()) {
    parsed.individuals_description = "No animals visible";
  }
  if (!parsed.behavior?.trim() || parsed.behavior === "N/A") {
    parsed.behavior = "Static view; no animal activity observed";
  }
  const species = parsed.species_common.trim();
  if (!species.toLowerCase().startsWith("no animal")) {
    parsed.species_common = species
      ? `No animal – ${species}`
      : "No animal – empty scene";
  }
  parsed.individual_count = 0;
  return parsed;
}

function normalizeAnimalAnalysis(parsed: LlmAnalysis): LlmAnalysis {
  parsed.individuals_description = String(parsed.individual_count);
  return parsed;
}

export async function analyzeImage(jpegBuffer: Buffer): Promise<LlmAnalysis> {
  const base64 = jpegBuffer.toString("base64");
  const openai = getClient();

  const response = await openai.chat.completions.create({
    model: getModel(),
    messages: [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this camera-trap image using the FFS Station C8 classification rules.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64}`,
              detail: "low",
            },
          },
        ],
      },
    ],
    response_format: responseSchema,
    max_tokens: 400,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty LLM response");
  }

  const parsed = JSON.parse(content) as LlmAnalysis;

  if (!parsed.has_animal) {
    normalizeNoAnimalAnalysis(parsed);
  } else {
    normalizeAnimalAnalysis(parsed);
  }

  if (parsed.has_human && !parsed.species_common.toLowerCase().includes("human")) {
    parsed.species_common = "Human";
  }

  return parsed;
}
