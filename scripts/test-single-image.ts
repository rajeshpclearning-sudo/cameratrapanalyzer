/**
 * Run one trap image through decode → EXIF → LLM → CSV row.
 * Usage: npx tsx --env-file=.env.local scripts/test-single-image.ts path/to/image.jpg
 */
import { readFileSync, writeFileSync } from "fs";
import { basename, resolve } from "path";
import { buildCsv } from "../lib/csv";
import { extractDateTime } from "../lib/exif";
import { decodeToJpeg } from "../lib/image";
import { analyzeImage } from "../lib/llm/analyze";
import type { CsvRow } from "../lib/types";

async function main(): Promise<void> {
  const imagePath = resolve(process.argv[2] ?? "test-fixtures/I__00078.png");
  const photoName = basename(imagePath);
  const raw = readFileSync(imagePath);

  console.log(`Image: ${imagePath} (${(raw.length / 1024).toFixed(1)} KB)`);

  const jpeg = await decodeToJpeg(raw);
  const { date, timestamp } = await extractDateTime(jpeg, new Date());
  console.log(`Date/time (EXIF or fallback): ${date} ${timestamp}`);

  console.log("Calling vision LLM…");
  const analysis = await analyzeImage(jpeg);
  console.log("LLM:", JSON.stringify(analysis, null, 2));

  const row: CsvRow = [
    photoName,
    date,
    timestamp,
    analysis.species_common,
    analysis.individuals_description,
    analysis.behavior,
    "Success",
  ];

  const csv = buildCsv([row]);
  const outPath = resolve("test-fixtures/last-analysis.csv");
  writeFileSync(outPath, csv, "utf-8");

  console.log("\n--- CSV (open in Excel) ---\n");
  console.log(csv);
  console.log(`Written: ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
