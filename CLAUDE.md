# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # Start dev server (http://localhost:3000)
npm run dev:clean     # Clear .next cache and start dev (use when hot-reload breaks)
npm run build         # Build for production (includes standalone copy + CSS verify)
npm run start         # Start production server (PORT env or 3000)
npm run lint          # ESLint via next lint
npm run setup:supabase  # Create Supabase project + run schema.sql (requires SUPABASE_ACCESS_TOKEN)
```

**Test a single image via CLI:**
```bash
npx ts-node scripts/test-single-image.ts <path-to-image>
```

## Architecture

This is a **Next.js 15 App Router** app (`output: "standalone"`) with no database ORM — Supabase is an optional side-channel for persistence.

### Request → Analysis flow

```
Browser (page.tsx)
  → POST /api/jobs (multipart: files[], optional existingCsv)
      → lib/jobs-store.ts  (in-memory Map — jobs are lost on restart)
      → lib/batch.ts       (startBatch — fire-and-forget async)
          → lib/preprocess.ts   (groupBurstIndices, isLikelyEmptyFrame via sharp)
          → lib/image.ts        (decodeToJpeg — handles HEIC via sharp)
          → lib/exif.ts         (extractDateTime from EXIF or fallback to lastModified)
          → lib/llm/analyze.ts  (analyzeImage → OpenAI vision API, structured JSON)
          → lib/burst-species.ts (reconcileBurstSpecies — propagates confident species across burst)
          → lib/persist-sightings.ts (optional Supabase insert)
          → lib/csv.ts          (buildCsv)
  → GET /api/jobs/[id]       (poll; client polls every 800ms)
  → GET /api/jobs/[id]/download  (CSV download when complete)
```

### Key design decisions

**Jobs are in-memory only.** `lib/jobs-store.ts` is a plain `Map<string, Job>`. There's no DB for job state — restarting the server clears all in-flight jobs. On **Vercel**, `POST /api/jobs` **awaits** `runBatch` and returns the finished job + CSV in one response (polling across serverless instances would 404). Local/Railway still use fire-and-forget `startBatch` + client poll.

**Burst deduplication.** Files within `BURST_GAP_MS` (default 2000ms, sorted by `lastModified`) are grouped as a "burst." Only the first (leader) frame calls the LLM; followers copy the leader's species. If the leader is "Unidentified," each follower is analyzed independently. After the burst, `reconcileBurstSpecies` propagates a confident species to any "Unidentified" rows in the same burst.

**Empty-frame skip.** Before calling the LLM, `isLikelyEmptyFrame` runs `sharp` grayscale stats. If the standard deviation is below `EMPTY_STDEV_THRESHOLD` (default 12), the frame is skipped with a canned "No animal – uniform frame" row. Controlled by `SKIP_EMPTY_FRAMES` env var.

**LLM provider abstraction.** `lib/llm/analyze.ts` uses the `openai` package pointed at either OpenAI or OpenRouter (detected by `sk-or-` key prefix or `OPENAI_BASE_URL`). Model is set via `LLM_MODEL` (default `gpt-4o-mini`). The LLM returns structured JSON via `response_format: json_schema`. Date/time is **never** sourced from the LLM — always from EXIF.

**CSV column contract.** `lib/types.ts` defines `CSV_HEADER` and `CSV_COL` indices. `CsvRow` is a 7-tuple. Everything in the pipeline — LLM output normalization, burst copy, CSV build, Supabase insert, import parsing — maps through these indices. Changing column order requires updating all of these.

**Supabase is optional.** When `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, `persistSightings` inserts only *newly analyzed* rows after each job (not rows from an uploaded existing CSV). The import endpoint (`/api/import-sightings`) handles bulk uploads separately. RLS is disabled — this is a personal/server-side-only integration.

**Import Log.** `/api/import-sightings` accepts `.xlsx`, `.xls`, or `.csv` files (parsed with `xlsx` package, server-side only — `xlsx` is excluded from the browser bundle via `next.config.ts` webpack alias). The endpoint supports a `dryRun=true` query param for preview-only.

### Components

- `app/page.tsx` — single-page client shell; manages `LocalFile[]` state, polling loop, session CSV accumulation, and view switching (`analysis` / `library` / `import`)
- `app/components/FileListTable.tsx` — file selection table with checkboxes and per-file status
- `app/components/PreviewModal.tsx` — image preview with analysis results overlay
- `app/components/ImportLogView.tsx` — Excel/CSV import to Supabase with duplicate-filename warning (tracked in localStorage)
- `app/components/LogLibraryView.tsx` — localStorage history of past runs (up to 30)

### Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `OPENAI_API_KEY` | Yes | OpenAI (`sk-...`) or OpenRouter (`sk-or-...`) key |
| `OPENAI_BASE_URL` | No | Set to `https://openrouter.ai/api/v1` for OpenRouter |
| `LLM_MODEL` | No | Default: `openai/gpt-4o-mini` |
| `LLM_CONCURRENCY` | No | Parallel LLM calls, default 2, max 5 |
| `OPENROUTER_SITE_URL` | No | Sent as `HTTP-Referer` (use your Railway or Vercel public URL) |
| `SKIP_EMPTY_FRAMES` | No | `false` to always call LLM (default `true`) |
| `EMPTY_STDEV_THRESHOLD` | No | Grayscale stdev cutoff for empty detection (default `12`) |
| `BURST_GAP_MS` | No | Burst grouping window in ms (default `2000`) |
| `DEDUPE_BURST` | No | `false` to analyze every file individually |
| `SUPABASE_URL` | No | Enables Supabase persistence when set with key below |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service role or `sb_secret_...` key (never use publishable key) |

### Deployment (Railway)

- `railway.toml` and `nixpacks.toml` configure the Railway build.
- Build runs `npm run build` which calls `node scripts/copy-standalone.mjs` (copies standalone output) and `node scripts/verify-css.mjs`.
- Start command: `npm run start` (sets `HOSTNAME=0.0.0.0`).
- Health check: `GET /api/health` — returns `{"ok":true,"supabaseConfigured":bool}`.
- `sharp` requires its platform-specific `@img/*` binaries to be included in the standalone trace; `outputFileTracingIncludes` in `next.config.ts` handles this.
