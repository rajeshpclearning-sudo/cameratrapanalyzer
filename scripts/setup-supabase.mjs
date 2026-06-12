#!/usr/bin/env node
/**
 * One-time setup: create Supabase project + camera_trap_sightings table.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/setup-supabase.mjs
 *
 * Get a token: https://supabase.com/dashboard/account/tokens
 */

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API = "https://api.supabase.com/v1";
const PROJECT_NAME = "camera-trap";
const REGION = "ap-south-1"; // Mumbai

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN.\n" +
      "Create one at https://supabase.com/dashboard/account/tokens then run:\n" +
      "  SUPABASE_ACCESS_TOKEN=sbp_... node scripts/setup-supabase.mjs",
  );
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body?.message
        ? body.message
        : typeof body === "string"
          ? body
          : JSON.stringify(body);
    throw new Error(`${res.status} ${path}: ${msg}`);
  }
  return body;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const orgs = await api("/organizations");
  if (!orgs?.length) {
    throw new Error("No Supabase organizations found for this account.");
  }

  const org = orgs.length === 1 ? orgs[0] : orgs.find((o) => o.slug) ?? orgs[0];
  if (orgs.length > 1) {
    console.log(
      "Organizations:",
      orgs.map((o) => `${o.name} (${o.id})`).join(", "),
    );
    console.log(`Using: ${org.name} (${org.id})\n`);
  }

  const existing = await api("/projects");
  const found = existing?.find(
    (p) => p.name === PROJECT_NAME && p.region === REGION,
  );
  let project = found;

  if (project) {
    console.log(`Project "${PROJECT_NAME}" already exists (${project.id}).`);
  } else {
    const dbPass =
      process.env.SUPABASE_DB_PASSWORD?.trim() ||
      randomBytes(24).toString("base64url");

    console.log(`Creating project "${PROJECT_NAME}" in ${REGION} (Mumbai)...`);
    project = await api("/projects", {
      method: "POST",
      body: JSON.stringify({
        name: PROJECT_NAME,
        organization_id: org.id,
        region: REGION,
        db_pass: dbPass,
      }),
    });

    console.log(`Project ref: ${project.id}`);
    if (!process.env.SUPABASE_DB_PASSWORD) {
      console.log(
        "\nDatabase password (save this in your password manager):\n" +
          `  ${dbPass}\n`,
      );
    }
  }

  const ref = project.id;
  console.log("Waiting for project to become healthy...");
  for (let i = 0; i < 60; i++) {
    const health = await api(`/projects/${ref}/health`);
    const dbOk = health?.find?.(
      (h) => h.name === "database" && h.status === "ACTIVE",
    );
    if (dbOk) break;
    if (i === 59) throw new Error("Timed out waiting for database.");
    await sleep(5000);
  }

  const schemaPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "supabase",
    "schema.sql",
  );
  const sql = readFileSync(schemaPath, "utf8");

  console.log("Creating camera_trap_sightings table...");
  await api(`/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: sql }),
  });

  const details = await api(`/projects/${ref}`);
  const url = `https://${ref}.supabase.co`;

  console.log("\nDone!\n");
  console.log("Add to .env.local:");
  console.log(`  SUPABASE_URL=${url}`);
  console.log(
    "  SUPABASE_SERVICE_ROLE_KEY=<Project Settings → API → service_role>",
  );
  console.log(`\nDashboard: https://supabase.com/dashboard/project/${ref}`);
  console.log(`Region: ${details.region ?? REGION}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
