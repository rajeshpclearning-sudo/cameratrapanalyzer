#!/usr/bin/env node
/**
 * Delete all rows from camera_trap_sightings (uses .env.local).
 * Usage: node scripts/truncate-supabase.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // missing file
  }
  return out;
}

const env = { ...process.env, ...loadEnv(envPath) };
const url = env.SUPABASE_URL?.trim();
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { count: before, error: countErr } = await sb
  .from("camera_trap_sightings")
  .select("*", { count: "exact", head: true });

if (countErr) {
  console.error("Could not read table:", countErr.message);
  process.exit(1);
}

console.log(`Rows before: ${before ?? 0}`);

const { error: delErr } = await sb
  .from("camera_trap_sightings")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");

if (delErr) {
  console.error("Delete failed:", delErr.message);
  process.exit(1);
}

const { count: after } = await sb
  .from("camera_trap_sightings")
  .select("*", { count: "exact", head: true });

console.log(`Rows after: ${after ?? 0}`);
console.log("Done — camera_trap_sightings is empty.");
