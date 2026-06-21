# summarize-changes

Summarize all code changes made in the current session so they are easy to understand at a glance.

## Steps

1. Run `git diff HEAD` to see all unstaged and staged modifications against the last commit.
2. Run `git status` to identify any untracked new files.
3. Run `git log --oneline -5` to show the most recent commits for context.
4. Produce a clear, concise summary using the structure below.

## Output format

### What changed
Group changes by area (e.g. "API routes", "LLM pipeline", "UI", "Config"). For each group:
- One sentence describing what was changed and why (the intent, not just the filename).
- List only the files affected — no need to repeat line-level diffs.

### New files
List any new files added and their purpose in one line each.

### Key decisions made
Any non-obvious choices, trade-offs, or design decisions that came up during this session.

### What's next (if known)
Any follow-up tasks or known gaps left open.

Keep the whole summary under 300 words. Skip sections that are empty.
