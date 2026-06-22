---
name: adr
description: 'Produce architecture decision records for a repository, in either of two shapes — a single comprehensive ADR + Implementation Spec (an execution contract), or a catalog of one-decision-per-file ADRs. The spec runs interactively (step-tracked, selectable questions, scored against a rubric, resumable) or in YOLO mode (a team-leader workflow drives do: subagents with no prompts). Use when the user says "draft ADRs for this repo", "stand up the ADR catalog", "write the implementation spec", "/adr", "/adr spec", "/adr spec --yolo", or "/adr catalog".'
---

# adr

This skill produces architecture decision records in two shapes. Pick by what the user asked for;
when unspecified, default to `spec`, interactive.

| Deliverable | What it is |
|---|---|
| **`spec`** (default) | One comprehensive *ADR + Implementation Spec* — a single `.md` execution contract: executive direction, decision table, target architecture, functional + non-functional requirements, phased plan with exit gates, definition of done, rollout/rollback, risk register, traceability. Structure is the deterministic template at `templates/adr-implementation-spec.template.yaml`. |
| **`catalog`** | The classic ADR catalog — one decision per file under `docs/adr/NNNN-*.md`. |
| **`both`** | The spec, plus a catalog distilled from its decision table. |

| Mode | What it is |
|---|---|
| **interactive** (default) | Step-tracked in the terminal, asks the open decisions as selectable questions, scores against the rubric, loops to 100%, resumes across sessions. |
| **YOLO** (`--yolo`) | A team-leader workflow dispatches `do:` subagents to recon, resolve, draft, and verify with no prompts. |

## Naming rule (both deliverables)

Preserve established project vocabulary. Do not introduce new branding, prefixes, or canonical names
unless the project already uses them or the user approves. Confirm the canonical name if ambiguous.

## Operating constraints (both deliverables)

- Non-destructive. Do not reset, delete history, change unrelated files, or move code.
- Docs-only. Do not modify source code beyond a tiny doc-link or generated-reference fix.
- Preserve existing ADRs unless recon proves them materially wrong.
- Use the repo's existing ADR location; if none exists, default to `docs/adr`. Keep ADR filenames
  kebab-case with 4-digit numbers.
- Do not commit. Return what changed and let the user commit. (The spec's working state under `.do/`
  is gitignored; the output spec is what the user commits.)

## Routing

Parse the invocation. The first token after `/adr` selects the deliverable (`spec` | `catalog` |
`both`, default `spec`); `--yolo` selects YOLO mode; `--from <path>` names a source document.

- **`catalog`** → follow [references/catalog.md](references/catalog.md).
- **`spec`, interactive** → [references/source-acquisition.md](references/source-acquisition.md) to
  ground it (Step 0), then [references/interactive-flow.md](references/interactive-flow.md) for the
  step loop.
- **`spec --yolo`** → [references/yolo-flow.md](references/yolo-flow.md) (launches
  `workflows/adr-spec.js`).
- **`both`** → run the spec flow, then distill a catalog from its decision table.

## The structure contract and the rubric

- The spec's shape is the deterministic template:
  `templates/adr-implementation-spec.template.yaml` — 20 sections, every table column and list
  specified as **floors and targets, never limits** (mirrors a real golden spec exactly).
- Completeness is scored by `tools/adr-spec-rubric.js`, which reads the template. A spec is done when
  the scorer reports 100% **and** the user confirms the content. See
  [references/rubric.md](references/rubric.md).
- A spec run's resumable working state lives at `.do/adr-spec/<slug>.state.json` — see
  [references/state-schema.md](references/state-schema.md).
