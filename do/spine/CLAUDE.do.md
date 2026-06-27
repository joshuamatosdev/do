<!-- DO:BEGIN (managed by /do:run — do not edit inside this block; re-run /do:run setup to refresh) -->
## Engineering workflow

This project uses a portable engineering workflow (installed via `/do:run`).

- **Response format:** `.claude/RESPONSE-FORMAT.md` — match ceremony to turn tier.
- **Phase ladder & model discipline:** `.claude/do/execution-policy.yaml` — intake-triage → route → plan → gather → execute → verify → review → commit → handoff. Mechanical work → Sonnet; judgment → Opus.
- **Planning:** `superpowers:brainstorming` when only a goal exists, `superpowers:writing-plans` when a spec exists; press a plan with `do:plan-skeptic`.
- **Git safety:** harmful git commands are blocked by a hook; never `--no-verify`.
- **Grounding:** cite file:line / command output — no recall-only claims.
- **Docs & spec compliance (`@docscheck`):** when a registered reference or specification governs the code you touch, look it up in the grounded-docs index (`do:grounded-docs` / `grounded-docs/`) and verify compliance BEFORE the edit lands; ground every spec/reference claim against the cited source before you conclude. Full rule: `.claude/ALWAYS-READ.md`.
- **Emoji:** use only in user-facing output, quoted source text, UI/content artifacts that naturally use them, or a Claude Code artifact browser-tab icon when the artifact asks for one. Never in agent/skill names, routing keys, frontmatter, proof/status markers, memory, reports, or neutral engineering prose. Full rule: `do:style`.

Run `/do:run status` for the workflow dashboard.
<!-- DO:END -->
