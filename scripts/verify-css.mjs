import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const cssDir = ".next/static/css";
let total = 0;

try {
  for (const name of readdirSync(cssDir)) {
    if (!name.endsWith(".css")) continue;
    total += statSync(join(cssDir, name)).size;
  }
} catch {
  console.error("No CSS output in .next/static/css — Tailwind/PostCSS may not have run.");
  process.exit(1);
}

if (total < 10_000) {
  console.error(
    `CSS bundle too small (${total} bytes). Expected Tailwind styles; check postcss.config and tailwind content paths.`,
  );
  process.exit(1);
}

const sample = readFileSync(
  join(cssDir, readdirSync(cssDir).find((f) => f.endsWith(".css")) ?? ""),
  "utf8",
);
if (!sample.includes(".bg-background") && !sample.includes("background")) {
  console.warn("Warning: CSS may be missing theme utilities.");
}

console.log(`CSS OK (${total} bytes in ${cssDir}).`);
