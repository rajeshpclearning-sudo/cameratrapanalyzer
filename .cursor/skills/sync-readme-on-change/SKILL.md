---
name: sync-readme-on-change
description: Keeps README.md accurate whenever this repository changes. Use on every task that creates, edits, renames, or deletes project files (code, config, scripts, env examples, API routes, lib modules, UI). Also use after refactors, new features, deployment changes, or dependency updates—even if the user did not mention documentation.
---

# Sync README on Every Change

## Rule (non-negotiable)

Any work that **changes project files** in this repo must **also update [README.md](../../README.md)** in the **same turn** (before finishing), unless the **only** files touched are `README.md` itself or paths listed under [Skip](#skip-without-readme-update).

Do not mark the task complete until README reflects the change.

## Workflow

Copy and complete this checklist:

```
README sync:
- [ ] Identified what changed (feature, API, env, deploy, structure, behavior)
- [ ] Updated every README section affected (see map below)
- [ ] Adjusted Implementation todos checkboxes if delivery status changed
- [ ] README still matches current MVP vs planned product wording
```

### Step 1 — Classify the change

| Change type | README targets |
|-------------|----------------|
| New/changed API route or job behavior | Architecture, User flow, relevant screen spec |
| New env var or `.env.example` | Local MVP — developer setup, Railway deployment |
| UI / page / component | Screen spec: Home / Analyze, Product & screens |
| `lib/` analysis, batch, burst, export | LLM analysis, Reducing LLM token usage, Path A |
| Deploy / Railway / scripts | Railway deployment, Prerequisites |
| Folder layout | Planned project structure (keep tree accurate) |
| Feature shipped or deferred | Phased delivery, Implementation todos, Out of scope |
| Security / auth | Security |

### Step 2 — Edit surgically

- Update **facts** (commands, env vars, endpoints, file paths, behavior). Do not paraphrase the whole README.
- Keep **MVP vs planned** labels honest (`Built`, `Planned`, `Partial`).
- If behavior is user-visible, update the matching **screen spec** or flow diagram only when the flow actually changed.
- Toggle **Implementation todos** `- [x]` / `- [ ]` when work is done or explicitly deferred.

### Step 3 — Verify

- No stale commands, env names, or paths in README.
- New capabilities appear in the right section; removed capabilities are deleted or marked planned/removed.
- Do not add a separate changelog unless the user asks—integrate into existing sections.

## Skip (without README update)

- **Only** `README.md` edited (typos/docs-only pass).
- Generated artifacts: `tsconfig.tsbuildinfo`, build output, `node_modules/`.
- Binary test fixtures under `test-fixtures/` when content is unchanged and README already describes fixtures.
- `.gitignore` only, with no new conventions that affect setup or usage.

If unsure, **update README**.

## Anti-patterns

- Finishing code changes without touching README.
- Adding a vague one-line note instead of fixing the authoritative section.
- Marking planned Google/Drive features as “built” without implementation.
- Duplicating the same fact in many sections—update the canonical section and cross-link once if needed.

## Optional: hook reinforcement

For stricter enforcement in Cursor, add a project `postToolUse` or `stop` hook that reminds the agent to run this skill when `Write`/`StrReplace` touched non-README project files. See [create-hook](https://cursor.com/docs) and `.cursor/hooks.json`. The skill alone is the default contract for agents in this repo.

## Section index

Quick anchor list for [README.md](../../README.md):

- What this app does · Product & screens · Path A · Local MVP setup
- Future hosted + Drive · Architecture · User flow · LLM analysis
- Railway deployment · Planned project structure · Phased delivery
- Implementation todos · Security · Out of scope
