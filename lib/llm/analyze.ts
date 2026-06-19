import OpenAI from "openai";
import type { LlmAnalysis } from "../types";

const SYSTEM_PROMPT = `You analyze forest camera-trap photographs from India.
Return JSON only. Use common English species names (no scientific names).
Count only visible individuals.

When an animal IS visible:
- species_common: common name (or "Human", or "Unidentified" if unclear)
- individual_count: integer count of visible animals
- individuals_description: same count as a string (e.g. "2")
- behavior: one of foraging, moving, standing, resting, drinking, running, unknown

When NO animal is visible:
- has_animal: false
- species_common: descriptive scene text starting with "No animal –" (what is seen in the photo)
- individual_count: 0
- individuals_description: short text describing absence (e.g. "No animals visible")
- behavior: brief scene/activity description (what is seen — not "N/A" or "Not Applicable")

Other rules:
- If humans are visible: has_human true, species_common "Human" (or "Human (N individuals)" if count > 1)
- Do not guess rare species when uncertain.`;

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

function getClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!client) {
    const baseURL =
      process.env.OPENAI_BASE_URL ??
      (key.startsWith("sk-or-") ? "https://openrouter.ai/api/v1" : undefined);
    const openRouter = baseURL?.includes("openrouter.ai");
    client = new OpenAI({
      apiKey: key,
      baseURL,
      defaultHeaders: openRouter
        ? {
            "HTTP-Referer":
              process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
            "X-Title": "WildEye Analyzer",
          }
        : undefined,
    });
  }
  return client;
}

function getModel(): string {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  const key = process.env.OPENAI_API_KEY ?? "";
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
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this camera-trap image.",
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
