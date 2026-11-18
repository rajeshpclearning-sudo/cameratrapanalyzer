/**
 * Canonical wildlife species names for FFS Station C8 / WildEye logs.
 * Dimension-style reference: prefer these exact strings in species_common.
 * Humans / empty / unidentified stay outside this wildlife list.
 */

export const CANONICAL_WILDLIFE_SPECIES = [
  "Spotted Deer",
  "Asian Elephant",
  "Gaur",
  "Sambar Deer",
  "Indian Muntjac",
  "Indian Hare",
  "Indian Crested Porcupine",
  "Indian Chevrotain",
  "Bonnet Macaque",
  "South-Eastern Langur",
  "Common Leopard",
  "Leopard Cat",
  "Wild Dog",
  "Tiger",
  "Indian Wild Pig",
  "Common Palm Civet",
  "Small Indian Civet",
  "Stripe-necked Mongoose",
  "Grey Mongoose",
  "Sloth Bear",
] as const;

export type CanonicalWildlifeSpecies =
  (typeof CANONICAL_WILDLIFE_SPECIES)[number];

/** Non-wildlife / special labels still allowed in logs. */
export const SPECIAL_SPECIES_LABELS = [
  "Human",
  "Human (armed)",
  "Unidentified",
] as const;

/** Map common synonyms / older labels → canonical name. */
const ALIAS_TO_CANONICAL: Record<string, CanonicalWildlifeSpecies> = {
  "spotted deer": "Spotted Deer",
  chital: "Spotted Deer",
  "axis deer": "Spotted Deer",
  elephant: "Asian Elephant",
  "asian elephant": "Asian Elephant",
  "indian elephant": "Asian Elephant",
  gaur: "Gaur",
  bison: "Gaur",
  "indian bison": "Gaur",
  sambar: "Sambar Deer",
  "sambar deer": "Sambar Deer",
  muntjac: "Indian Muntjac",
  "indian muntjac": "Indian Muntjac",
  "barking deer": "Indian Muntjac",
  "indian hare": "Indian Hare",
  hare: "Indian Hare",
  porcupine: "Indian Crested Porcupine",
  "indian crested porcupine": "Indian Crested Porcupine",
  "indian porcupine": "Indian Crested Porcupine",
  chevrotain: "Indian Chevrotain",
  "indian chevrotain": "Indian Chevrotain",
  "mouse deer": "Indian Chevrotain",
  "bonnet macaque": "Bonnet Macaque",
  macaque: "Bonnet Macaque",
  "south-eastern langur": "South-Eastern Langur",
  "southeastern langur": "South-Eastern Langur",
  "grey langur": "South-Eastern Langur",
  "gray langur": "South-Eastern Langur",
  langur: "South-Eastern Langur",
  leopard: "Common Leopard",
  "common leopard": "Common Leopard",
  "indian leopard": "Common Leopard",
  "leopard cat": "Leopard Cat",
  "wild dog": "Wild Dog",
  dhole: "Wild Dog",
  tiger: "Tiger",
  "bengal tiger": "Tiger",
  "indian wild pig": "Indian Wild Pig",
  "wild pig": "Indian Wild Pig",
  "wild boar": "Indian Wild Pig",
  boar: "Indian Wild Pig",
  "common palm civet": "Common Palm Civet",
  "palm civet": "Common Palm Civet",
  "small indian civet": "Small Indian Civet",
  "stripe-necked mongoose": "Stripe-necked Mongoose",
  "stripe necked mongoose": "Stripe-necked Mongoose",
  "grey mongoose": "Grey Mongoose",
  "gray mongoose": "Grey Mongoose",
  "indian grey mongoose": "Grey Mongoose",
  "indian gray mongoose": "Grey Mongoose",
  "sloth bear": "Sloth Bear",
};

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveCanonicalWildlifeName(
  name: string,
): CanonicalWildlifeSpecies | null {
  const key = normalizeKey(name);
  if (!key) return null;
  const aliased = ALIAS_TO_CANONICAL[key];
  if (aliased) return aliased;
  const exact = CANONICAL_WILDLIFE_SPECIES.find(
    (s) => normalizeKey(s) === key,
  );
  return exact ?? null;
}

/**
 * Normalize a species_common field (including "A + B" multi-species).
 * Leaves Human / No animal / Unidentified alone; maps wildlife aliases.
 */
export function normalizeSpeciesCommonLabel(raw: string): string {
  const text = raw?.trim() ?? "";
  if (!text) return text;

  const lower = text.toLowerCase();
  if (lower.startsWith("no animal")) return text;
  if (lower === "human (armed)" || lower.includes("human (armed)")) {
    return "Human (armed)";
  }
  if (lower === "human" || (lower.includes("human") && !lower.includes("+"))) {
    // Keep Human / Human (armed) handling to callers; only collapse plain human
    if (lower.includes("armed")) return "Human (armed)";
    if (lower === "human") return "Human";
  }
  if (lower === "unidentified") return "Unidentified";

  if (text.includes("+")) {
    return text
      .split("+")
      .map((part) => normalizeSingleWildlifeOrSpecial(part.trim()))
      .join(" + ");
  }

  return normalizeSingleWildlifeOrSpecial(text);
}

/** Banned / out-of-area labels → Unidentified (or canonical remap). */
function normalizeSingleWildlifeOrSpecial(name: string): string {
  const key = normalizeKey(name);
  if (!key) return name;

  if (
    key === "jackal" ||
    key === "golden jackal" ||
    key === "indian jackal" ||
    key.includes("jackal")
  ) {
    return "Unidentified";
  }
  if (
    key === "large indian civet" ||
    key === "large civet" ||
    key.includes("large indian civet")
  ) {
    return "Unidentified";
  }

  return resolveCanonicalWildlifeName(name) ?? name;
}

/** Markdown block injected into the vision system prompt. */
export function formatSpeciesDimensionForPrompt(): string {
  const wildlife = CANONICAL_WILDLIFE_SPECIES.map((s) => `- ${s}`).join("\n");
  return [
    "CANONICAL SPECIES NAMES (dimension / standard list — use these exact spellings in species_common):",
    wildlife,
    "",
    "Also allowed: Human, Human (armed), Unidentified, and No animal detected (empty frames).",
    "Do not invent alternate spellings (e.g. use Asian Elephant not Elephant; Indian Wild Pig not Wild Boar; Spotted Deer not Chital; Common Leopard not Leopard; Wild Dog not Dhole).",
    "Never use Jackal (absent here) or Large Indian Civet (not in Kerala).",
    "Both Grey Mongoose and Stripe-necked Mongoose occur — do not label every mongoose Stripe-necked; require a clear neck stripe for Stripe-necked.",
    "For multi-species frames, join canonical names with \" + \".",
    "If the animal is clearly wildlife but not on this list and cannot be mapped, use Unidentified.",
  ].join("\n");
}
