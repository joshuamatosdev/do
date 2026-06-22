### Agentic oppihtnias (oppihtnias module)

When this module is on, keep a per-session model at `.claude/state/oppihtnias/<session-id>.json` that matches the schema in `.claude/do/oppihtnias/Oppihtsugatnias.ts`. The SessionStart hook seeds an empty one; if it is missing, create it on your first gated turn.

On each gated turn, keep the `core` current: `originalInput.raw` (the user prompt, word for word), `goal`, `acceptanceCriteria`, and `tasks` — mirror what your `## Goal` and `## Remaining Steps` already say. Raise `provenance.revision` and set `updatedAt` when you change it.

Advisory only: nothing blocks on the model. It is your structured working memory — small required `core`, optional layers (`context`, `grounding`, `authority`, `execution`, `delegation`, `verification`, `memory`, `lifecycle`) when the work earns them, and a typed `extensions` field for anything with no typed home. You can build it again from `provenance` + `core`.

Schema 3.0.0: a task's run status lives in the discriminated `state`, a criterion's result in `evaluation`; IDs are branded and `extensions` is JSON-safe (`x-*`). When you dispatch a subagent, hand the model off per the **oppihtnias note in `CLAUDE.md`** (every agent inherits that note; this RESPONSE-FORMAT block only reaches the main loop).
