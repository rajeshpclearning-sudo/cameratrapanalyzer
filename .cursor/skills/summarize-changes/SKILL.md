---
name: summarize-changes
description: Summarize all code changes made in the current session. Use when the user asks "what changed?", "give me a summary", or "what did we do?". Produces a grouped, human-readable summary of diffs, new files, and key decisions.
---

# Summarize Changes

Produce a clear, concise summary of everything changed in the current session.

## Steps

1. Run `git diff HEAD` to see all modifications against the last commit.
2. Run `git status` to identify untracked new files.
3. Run `git log --oneline -5` for recent commit context.
4. Write the summary using the structure below.

## Output format

### What changed
Group by area (e.g. "API routes", "LLM pipeline", "UI", "Config"). Per group:
- One sentence on what changed and why (intent, not just filenames).
- List the affected files.

### New files
Each new file and its purpose in one line.

### Key decisions made
Non-obvious choices or trade-offs from this session.

### What's next (if known)
Follow-up tasks or known gaps left open.

Keep the whole summary under 300 words. Omit empty sections.
