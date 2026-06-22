# YOLO flow — a team leader drives the whole spec, no prompts

`/adr spec --yolo` runs the autonomous path: a team-leader workflow dispatches `do:` subagents to
recon, resolve every decision, draft every section, and adversarially verify, then assembles one
document. No questions are asked — the leader resolves what interactive mode would put to the user.

## Launch

The workflow lives at `workflows/adr-spec.js`. Launch it with the Workflow tool, passing the source
and the template path as args:

```
Workflow({
  name: "adr-spec",
  args: {
    source: "<absolute path to the status report or the repo to ground in>",
    templatePath: "${CLAUDE_PLUGIN_ROOT}/skills/adr/templates/adr-implementation-spec.template.yaml",
    product: "<product name>",
    subject: "<one-line subject>",
    version: "v1",
    primaryRepository: "<owner/repo>",
    sourceReportId: "<report id or 'none — direct recon'>",
    sourceGeneratedAt: "<date>",
    confidence: "<low|medium|high>"
  }
})
```

The workflow returns `{ markdown, sections: [{title, meetsFloors}], openGaps }`.

## What the leader does (phases)

1. **Recon** — four read-only lenses (purpose/structure, interfaces/contracts, state/data/integrations,
   runtime/ops/security/tests) gather grounded findings with file:line evidence. No files are modified.
2. **Plan** — the leader turns findings into the included section set (the 18 always-required plus any
   conditional Domain section the system justifies) and the open decisions (D-1, D-2, …).
3. **Resolve** — one agent per decision picks `chosen` (as an enforceable instruction), `rejected`, and
   `why`. This is the call interactive mode would put to the user.
4. **Draft** — one drafter per section reads the template for that section's floors and fills it,
   grounded in findings + resolved decisions.
5. **Verify** — an adversarial reviewer scores each draft against the template's floors; a section
   below floor gets one redraft.
6. **Assemble** — the leader stitches the title block, the `Field | Value` metadata table, and the
   sections in canonical order into one markdown document.

## After the run

Write the returned markdown to a file and score it for the record:

```bash
node tools/adr-spec-rubric.js <out>.md --json
```

Show the user the score and `openGaps`. YOLO has no user in the loop during the run, so this is where
a human confirms the content. The output is the same shape as an interactive spec, so the two are
directly comparable — which is what makes the golden eval (running YOLO against a known-good spec and
diffing) meaningful.
