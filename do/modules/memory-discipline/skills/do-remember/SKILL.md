---
name: do-remember
description: Save a durable fact to the project's file-based memory. Use when the user says remember this, save to memory, or a lasting user/project/feedback/reference fact comes up that is not something you can work out from the code or git history.
---

# do-remember

1. Sort into: `user` (who they are), `feedback` (how to work — include the why), `project` (ongoing goals/constraints), `reference` (external pointers).
2. Check the memory dir for an existing file that already covers it — update rather than duplicate.
3. Write one fact per file with the frontmatter from `.claude/do/MEMORY.template.md`; convert relative dates to absolute.
4. Add a one-line pointer to `MEMORY.md` (`- [Title](file.md) — hook`).
5. Do not save what the repo already records (code, history, CLAUDE.md) or what only matters this conversation.

To review already-saved memory for non-neutral language (brand leakage, charged wording) and get neutral rewrites, use `do-memory-audit`.
