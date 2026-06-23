### Agentic oppihtnias (oppihtnias module)

When this module is on, keep a per-session model as a **typed TypeScript module in the OS temp folder**: `<os-temp>/claude/oppihtnias/<session-id>.<created-date>.ts`, matching the schema in `.claude/do/oppihtnias/Oppihtsugatnias.ts`. The SessionStart hook seeds an empty one and prints its exact path; if it is missing, create it on your first gated turn. A copy of `Oppihtsugatnias.ts` sits beside the model, so it `import`s `./Oppihtsugatnias` and type-checks standalone (`tsc --noEmit --strict <file>`) — the "code first, it compiles" property.

On each gated turn, keep the exported `model`'s `core` current: `originalInput.raw` (the user prompt, word for word), `goal`, `acceptanceCriteria`, and `tasks` — mirror what your `## Goal` and `## Remaining Steps` already say. Edit the object literal in place (it is `.ts`, not JSON — IDs/dates go through the `parseId`/`parseIso` constructors). Raise `provenance.revision` and set `updatedAt` when you change it.

Advisory only: nothing blocks on the model. It is your structured working memory — small required `core`, optional layers (`context`, `grounding`, `authority`, `execution`, `delegation`, `verification`, `memory`, `lifecycle`) when the work earns them, and a typed `extensions` field for anything with no typed home. You can build it again from `provenance` + `core`.

Schema 3.0.0: a task's run status lives in the discriminated `state`, a criterion's result in `evaluation`; IDs are branded and `extensions` is JSON-safe (`x-*`). When you dispatch a subagent, hand the model off per the **oppihtnias note in `CLAUDE.md`** (every agent inherits that note; this RESPONSE-FORMAT block only reaches the main loop) — pass the temp model path explicitly, it is not guessable.
