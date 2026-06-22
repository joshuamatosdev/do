# Step 0 — source acquisition (spec mode)

A `spec` run is only as good as what grounds it. Before drafting a single section, settle where the
facts come from. There are three branches; pick by what the user gave you.

## Branch 1 — a source document was provided

The user named a source: `/adr spec --from <path>`, or pointed at a status report, PRD, design note,
or prior writeup. This is how the WhiskeyDroid spec was built (its `Source report` field cites
`RPT-2026-06-16-example-ide-status`).

- Read the document in full. Treat it as the primary evidence.
- Pull out: the stated direction, the current state and the gap to it, the open decisions, the
  invariants, and any file:line evidence it already cites.
- Write the state file `source`: `{ kind: "document", path: "<path>", reportId: "<id or null>",
  confidence: "<the doc's own confidence, or 'unknown'>" }`.
- Proceed to the draft flow. Where the document is thin, fall back to a light repo recon to fill the
  gap, and mark those claims with their own evidence.

## Branch 2 — no document → offer to generate a status report

When the user has no source doc, offer to generate one first:

> "I can generate a grounded status report for this repo first (recon → a deterministic HTML/JSON
> report), then build the spec from it — that's the cleanest path and matches how these specs are
> meant to be sourced. Or I can ground the spec directly from a repo recon. Which do you want?"

If they accept the report:

1. Run the `report-writing` skill to gather grounded facts, fill a `report-engine` payload, and render
   the HTML report — that skill owns the engine and its path; do not call the engine directly. The
   payload JSON is the structured source.
2. When the report returns, **auto-start the spec flow** with that report as the source — do not make
   the user re-invoke `/adr spec`. Write the state `source`: `{ kind: "report", path:
   "<payload.json>", reportId: "<meta.reportId or generatedAt>", confidence: "<report confidence>" }`.

This keeps one continuous path: recon → report → spec.

## Branch 3 — decline the report → direct repo recon

If the user declines the report (or just wants to go straight to the spec), ground the spec from a
direct repo recon — reuse the recon axes in [catalog.md](catalog.md) (purpose/structure, interfaces,
state/data, integrations, runtime/ops, security, testing). Dispatch bounded recon subagents, collect
findings with file:line evidence, and write the state `source`: `{ kind: "recon", path: null,
reportId: null, confidence: "<your recon confidence>" }`.

## After any branch

Record the resolved `source` in the state file (`.do/adr-spec/<slug>.state.json`), set `deliverable`
and `mode`, then continue to the chosen flow:
[interactive-flow.md](interactive-flow.md) or [yolo-flow.md](yolo-flow.md).
