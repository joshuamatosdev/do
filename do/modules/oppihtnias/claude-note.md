### Oppihtnias — shared work structure (oppihtnias module)

This project tracks each non-trivial unit of work as an **agentic oppihtnias** (schema `.claude/do/oppihtnias/Oppihtsugatnias.ts`, v3.0.0). When the module is on, **every agent** uses it — the main loop and any subagent you dispatch — so work survives compaction and hand-offs.

- The session model is a **typed TypeScript module in the OS temp folder**: `<os-temp>/claude/oppihtnias/<session-id>.<created-date>.ts` (a copy of `Oppihtsugatnias.ts` sits beside it, so the model `import`s `./Oppihtsugatnias` and type-checks standalone — `tsc --noEmit --strict <file>`). The SessionStart hook seeds it and prints the exact path; if it is missing, create it on your first gated turn. Edit the exported `model` object literal in place (it is `.ts`, not JSON — IDs/dates use the `parseId`/`parseIso` constructors).

- Keep its `core` current: `originalInput.raw` (verbatim), `goal`, `acceptanceCriteria`, `tasks` — mirror what your `## Goal` and `## Remaining Steps` already say. Bump `provenance.revision` + set `updatedAt` on change. A task's run status lives in the discriminated `state`, a criterion's result in `evaluation`.

- **Dispatch hand-off** — when you dispatch a subagent for a sub-unit of work: (1) name the model path + the subagent's assigned `tasks[].id`s in its prompt (the temp path is not guessable — pass it explicitly); (2) tell it to read the model, work its tasks, and return a fragment (its tasks' `state` + any `grounding.evidence` / `execution.decisions` it produced); (3) on return, merge the fragment back, bump `provenance.revision`, and record the exchange in `delegation.handoffs`. Fork a child model via `provenance.parentId` when a subagent owns a distinct sub-goal — lineage makes any state recreatable.

- The built-in `Explore` and `Plan` subagents do **not** inherit this file — restate the model path + their task ids inline in their dispatch prompt.

- Advisory: nothing blocks on the model. It is shared working memory; any agent can rebuild it from `provenance` + `core`.
