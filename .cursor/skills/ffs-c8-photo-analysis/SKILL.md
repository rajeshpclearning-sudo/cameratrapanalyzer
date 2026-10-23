---
name: ffs-c8-photo-analysis
description: >-
  Apply Forest First Samithi (FFS) Station C8 Wayanad camera-trap species
  classification rules, and improve them from accuracy feedback. Use whenever
  analyzing camera-trap photos, editing the vision LLM prompt or species names,
  reviewing misclassified wildlife images, or when the user reports a wrong
  species, accuracy issue, false animal, or empty-frame mistake.
---

# FFS Station C8 Photo Analysis

Station: **FFS Station C8, Wayanad, Kerala** (Forest First Samithi).

## Runtime source of truth (every photo analysis)

The vision model loads rules from:

[`lib/llm/ffs-c8-rules.md`](../../../lib/llm/ffs-c8-rules.md)

injected by [`lib/llm/analyze.ts`](../../../lib/llm/analyze.ts) on **every** `analyzeImage` call.

When changing classification behavior for the live app, **edit that rules file** (not only this skill). Keep this skill’s [Corrections log](#corrections-log) in sync.

## When this skill applies

- Photo analysis / species identification work in this repo
- User reports: wrong species, wrong count, false animal, missed animal, empty-frame error, naming inconsistency
- Edits to `lib/llm/analyze.ts`, `lib/llm/ffs-c8-rules.md`, or related batch/CSV species fields

## Accuracy feedback loop (mandatory)

When the user reports an accuracy issue for a photo analysis:

1. **Read** [`lib/llm/ffs-c8-rules.md`](../../../lib/llm/ffs-c8-rules.md) and this skill.
2. **Update the rules** in `lib/llm/ffs-c8-rules.md` so the next analysis avoids the same mistake (tighten the relevant section; do not delete unrelated rules).
3. **Append** a short entry under [Corrections log](#corrections-log) in this file:
   - Date (ISO)
   - What was wrong
   - What rule/text was changed
4. **Commit and push to GitHub** on `main` (or the active branch) so Vercel redeploys with the improved rules:
   - Stage: `lib/llm/ffs-c8-rules.md`, this `SKILL.md`, and any related code
   - Commit message focuses on why (e.g. `Tighten C8 rules: prefer Stripe-necked Mongoose over Brown Mongoose`)
   - `git push` so production picks up the change
5. Follow [sync-readme-on-change](../sync-readme-on-change/SKILL.md) if README species/prompt docs need a one-line update.

Do this in the **same turn** as the fix — do not wait for the user to ask for a commit when the change is an accuracy correction to these rules.

## Classification rules (summary)

Full text lives in `lib/llm/ffs-c8-rules.md`. Apply strictly:

1. **Mongoose** — default Stripe-necked Mongoose; Yellow-throated Marten only with clear yellow/golden throat.
2. **Civet** — "Small Indian Civet" / "Common Palm Civet"; "Large Indian Civet" only with clear neck collar.
3. **Indian Chevrotain** — hooves + mouse-deer shape; do not call cat/civet.
4. **Deer** — never White-tailed Deer; use Spotted Deer/Chital, Sambar, Indian Muntjac.
5. **Primates** — "South-Eastern Langur"; "Bonnet Macaque"; uncertain only when genuinely unclear.
6. **Wild cats** — Leopard Cat (rosettes) vs Jungle Cat (plain tawny).
7. **Background animals** — need ≥2 anatomical features; eye-shine alone is not enough.
8. **Empty frames** — "No animal detected"; partial edge animal → unconfirmed partial.

## Corrections log

Append newest entries at the top.

| Date | Issue | Rule change |
|------|--------|-------------|
| _(none yet)_ | | |
