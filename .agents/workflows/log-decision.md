---
description: How to log architectural and technical decisions made during implementation
---

# Log Decision

Every time you make a **non-trivial technical or architectural decision** while working on this codebase, you **must** append it to the decisions log at `.agents/decisions.md`.

## When to log

Log a decision whenever you:
- Choose one technology, library, or pattern over another
- Decide on a data format, schema shape, or naming convention
- Set a default value, threshold, or configuration
- Reject an alternative approach
- Resolve an ambiguity in the spec or requirements

Do **not** log trivial formatting choices, variable names, or obvious best-practice applications.

## How to log

Append a new entry to `.agents/decisions.md` using this exact format:

```markdown
### DEC-<NNN> — <Short title>
- **Date:** <YYYY-MM-DD>
- **Status:** accepted | superseded by DEC-<NNN>
- **Choice:** <What was decided, one sentence>
- **Why:** <1-2 sentences explaining the reasoning>
- **Alternatives rejected:** <Comma-separated list, or "none">
```

Rules:
1. Increment the `DEC-` number from the last entry in the file.
2. Keep each field to **1-2 sentences max** — this is a quick-reference log, not a design doc.
3. Never remove or edit past entries. If a decision is reversed, mark the old one `superseded by DEC-<NNN>` and add a new entry.
4. Read the existing decisions log **before** making a related decision to ensure consistency.
