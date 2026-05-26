#!/usr/bin/env node
/**
 * Smoke-check local setup. Full analysis requires OPENAI_API_KEY in .env.local.
 * Usage: node scripts/verify-setup.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3000";

async function main() {
  const res = await fetch(base);
  if (!res.ok) {
    console.error(`FAIL: ${base} returned ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();
  if (!html.includes("Camera Trap Analyzer")) {
    console.error("FAIL: home page missing expected title");
    process.exit(1);
  }
  console.log(`OK: ${base} serves the app`);

  const jobRes = await fetch(`${base}/api/jobs`, { method: "POST", body: new FormData() });
  const jobJson = await jobRes.json();
  if (jobRes.status === 400 && jobJson.error?.includes("No files")) {
    console.log("OK: POST /api/jobs validates empty upload");
  } else {
    console.error("FAIL: expected 400 for empty jobs", jobRes.status, jobJson);
    process.exit(1);
  }

  console.log("\nNext: set OPENAI_API_KEY in .env.local, restart npm run dev, then use the browser UI.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
