# Interactive flow — Step 1..n, ask, draft, score, repeat to 100%

The default `spec` mode. It drives the terminal todo list as numbered steps, asks the user the open
decisions as selectable questions, drafts to the template, scores against the rubric, and loops until
the rubric is satisfied **and** the user confirms. It resumes across sessions from the state file.

## Resume first

On start, derive the run slug (kebab-case of the product/subject). Read
`.do/adr-spec/<slug>.state.json`. If it exists, resume at the first unfinished step and tell the user
where you are picking up. If not, create it (see [state-schema.md](state-schema.md)) and start at
Step 1.

## The steps (each is a todo item shown in the terminal)

**Step 1 — Source.** Run [source-acquisition.md](source-acquisition.md). Record `source` in state.

**Step 2 — Recon / parse.** Gather the grounded material: parse the provided document, or dispatch
bounded recon subagents (reuse the axes in [catalog.md](catalog.md)). Capture findings with
file:line evidence. Mark each section `todo` in state.

**Step 3 — Decisions.** Read the template's decision-bearing sections. For each open decision the
spec must resolve, ask the user **one question at a time** using the selectable-question UI, each with
a recommended option:

> Question: "Which providers are first-class for v1?"
> Header: "Providers"
> Options:
>   - "Gemma Local + direct API adapters (Recommended)" — … why …
>   - "Gemma Local only" — … trade-off …
>   - "Gemma + Copilot SDK" — … trade-off …

Record each answer to `decisions[]` as `{ id, question, chosen, rejected, why }` — `rejected` is the
options not taken, so the ADR's *Rejected alternatives* table writes itself. Resolve blocking
decisions; bounded-assume the small ones and note the assumption (per the "judge what
blocks you" rule). One question per turn — do not flood the user.

**Step 4 — Draft.** Fill the template section by section from recon + resolved decisions. Head each
section `## N. Title`. Meet every floor; aim for the targets. Update each section's state to `draft`.

**Step 5 — Verify.** Run the scorer (`node tools/adr-spec-rubric.js <draft>.md --json`). Record the
percent in state. If below 100%, the named gaps **become the next work**: a missing decision returns
you to Step 3 (ask it); a thin section returns you to Step 4 (deepen it). Loop Steps 3–5 until the
scorer reports 100%.

**Done.** When the scorer is at 100%, show the user the draft and the gaps-closed summary and ask them
to confirm the content is right. Only when they confirm is the run done. Write the final draft path to
state. Do not commit — the user commits the output spec (the working state under `.do/` is gitignored).

## Deliverable variants

- `spec` — the single document above.
- `both` — produce the spec, then distill a `catalog` from its decision table (one ADR file per
  accepted decision, numbered per [catalog.md](catalog.md)).
