<!-- DO:BEGIN (managed by /do:run — do not edit inside this block; re-run /do:run setup to refresh) -->

## Engineering workflow

This project uses a portable engineering workflow (installed via `/do:run`).

- **Response format:** `.claude/RESPONSE-FORMAT.md` — match ceremony to turn tier.
- **Phase ladder & model discipline:** `.claude/do/execution-policy.yaml` — intake-triage → route → plan → gather → execute → verify → review → commit → handoff. Mechanical work → Sonnet; judgment → Opus.
- **Planning:** `superpowers:brainstorming` when only a goal exists, `superpowers:writing-plans` when a spec exists; press a plan with `do:plan-skeptic`.
- **Git safety:** harmful git commands are blocked by a hook; never `--no-verify`.
- **Grounding:** cite file:line / command output — no recall-only claims.
- **Docs & spec compliance (`@docscheck`):** when a registered reference or specification governs the code you touch, look it up in the grounded-docs index (`do:grounded-docs` / `grounded-docs/`) and verify compliance BEFORE the edit lands; ground every spec/reference claim against the cited source before you conclude. Full rule: `.claude/ALWAYS-READ.md`.

Run `/do:run status` for the workflow dashboard.

## `@docscheck` — docs & spec compliance (always read)

Before acting on code governed by a registered **reference** or **specification**, read
`do/spine/ALWAYS-READ.md` (installed as `.claude/ALWAYS-READ.md`) and verify the code complies with
the registered source — look it up in the grounded-docs index (`do:grounded-docs` / `grounded-docs/`),
cite `chunk_id` + `source_path:line`. Ground every spec/reference claim against the source before you
conclude. A reference is any doc the user registered via `do:docs`; a specification is one backed by
an official, widely-accepted governing standard (car spec, jet engine, CTDL credential, RFC, …).

## Sigles — `+name` user-invokable procedures

`+<name>` invokes a **sigle**: a named, Claude-maintained procedure (e.g. `+dod`, `+bugs`). When you
or the user types `+name`, read `SIGLES.md` and run that sigle. The catalog and how sigles work live
in `SIGLES.md`; maintain them like memories (one per concern, update don't duplicate, prune stale).
`+sigle` creates or edits them.

---

<!-- DO:END -->
