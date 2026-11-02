import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

function readMd(relativePath: string): string {
  try {
    return readFileSync(join(process.cwd(), relativePath), "utf8").trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[rules] could not load ${relativePath}:`, message);
    return "";
  }
}

export function loadStationRulesMarkdown(): string {
  return readMd("lib/llm/ffs-c8-rules.md");
}

export function loadCorrectionsLogMarkdown(): string {
  return readMd("lib/llm/ffs-c8-corrections-log.md");
}
