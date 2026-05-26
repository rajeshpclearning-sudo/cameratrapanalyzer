import OpenAI from "openai";
import type { LlmAnalysis } from "../types";

const SYSTEM_PROMPT = `You analyze forest camera-trap photographs from India.
Return JSON only. Use common English species names (no scientific names).
Count only visible individuals. Behavior must be one of: foraging, moving, standing, resting, drinking, running, unknown, N/A.

Rules:
- If no animal is visible: set has_animal false, species_common to a short scene description (e.g. "Empty trail - vegetation only"), behavior N/A, individual_count 0.
- If humans are visible: has_human true, species_common "Human" (or "Human (N individuals)" if count > 1), set behavior appropriately.
- If animal present but unclear: species_common "Unidentified", behavior unknown.
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
        behavior: {
          type: "string",
          enum: [
            "foraging",
            "moving",
            "standing",
            "resting",
            "drinking",
            "running",
            "unknown",
            "N/A",
          ],
        },
        has_animal: { type: "boolean" },
        has_human: { type: "boolean" },
      },
      required: [
        "species_common",
        "individual_count",
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
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

export async function analyzeImage(jpegBuffer: Buffer): Promise<LlmAnalysis> {
  const base64 = jpegBuffer.toString("base64");
  const openai = getClient();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
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
    max_tokens: 300,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty LLM response");
  }

  const parsed = JSON.parse(content) as LlmAnalysis;

  if (!parsed.has_animal) {
    parsed.behavior = "N/A";
    parsed.individual_count = 0;
  }

  if (parsed.has_human && !parsed.species_common.toLowerCase().includes("human")) {
    parsed.species_common = "Human";
  }

  return parsed;
}
