# ALWAYS-READ — docs & spec compliance (`@docscheck`)

The docscheck rule. Every agent reads this before acting on code that a registered reference or
specification governs. Reached from `CLAUDE.md` and `AGENTS.md`; the pre-action hook points here.

## The rule

When you ACT on code — write, edit, review, or draw a conclusion about it — and a registered
**reference** or **specification** governs that code, you MUST look up the governing source and
verify compliance. Before the edit lands, and before you answer. Recall is not enough.

- **Reference** — any documentation the user registered in the project's docs index (via
  `do:grounded-docs` / `do:docs`), regardless of content type.
- **Specification** — a registered source backed by an official, widely-accepted governing
  standard: a car spec, a jet-engine spec, a CTDL credential, an RFC, a wire/API contract, a safety
  standard. The governing standard behind it makes it a spec — not its format. This is general:
  any field with a real spec qualifies.

## How to reach the registered sources

The sources live in the project's grounded-docs index — canonically `grounded-docs/` (the legacy
`agent-docs/` name is still recognized). Use that index's CLI; every lookup cites a `chunk_id` and a
`source_path:line` range. The Node scaffold:

```
node grounded-docs/grounded-docs.mjs sources                  # what is registered (and its pinned version)
node grounded-docs/grounded-docs.mjs lookup "<topic>" --top 5  # find the governing chunk
node grounded-docs/grounded-docs.mjs cite <chunk_id>           # the exact governing text + line range
```

If the index is a different runtime (e.g. a Python index exposes `python -m cli.agent_docs <cmd>`),
use that CLI with the same sub-commands. Or call the `do:grounded-docs` skill. If the index lives at
a non-default path, check `.claude/do.config.json`.

## Before you act

1. Decide whether a registered reference/spec governs the code you are about to change.
2. If it does, look it up (`lookup` → `cite`) and read the governing text.
3. Verify the change complies. If it does not, make it comply, or flag the conflict and stop — do
   not silently diverge from the spec.

## Before you conclude

Before you return any answer that asserts something about a spec or reference — a value, a limit, a
required field, a compliance claim — ground it against the cited source and state the citation
(`chunk_id` / `source_path:line`). If no registered source covers the claim, say so plainly —
"not grounded in a registered source" — rather than guess.

## When nothing is registered

If the project has no grounded-docs index, this rule has nothing to enforce — proceed under the
normal grounding route (the knowledge route in `.claude/do/execution-policy.yaml`). Stand an index
up with `do:grounded-docs` when the project depends on an external reference or specification.
