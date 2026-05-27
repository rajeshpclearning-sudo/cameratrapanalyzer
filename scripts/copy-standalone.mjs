import { cpSync, existsSync } from "fs";
import { join } from "path";

const standalone = ".next/standalone";
if (!existsSync(standalone)) {
  console.error("Missing .next/standalone — run next build first.");
  process.exit(1);
}

cpSync(".next/static", join(standalone, ".next/static"), { recursive: true });
if (existsSync("public")) {
  cpSync("public", join(standalone, "public"), { recursive: true });
}

console.log("Copied static assets into standalone output.");
