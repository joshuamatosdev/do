# The rubric — how a spec is scored to 100%

A `spec` is "done" only when it is **complete against the template** and the **user confirms**. The
template (`skills/adr/templates/adr-implementation-spec.template.yaml`) is the structure contract;
the rubric is its machine-checked form.

## The scorer

`tools/adr-spec-rubric.js` reads the template and scores a drafted spec:

```bash
node tools/adr-spec-rubric.js <spec.md>            # prints "completeness: NN% (covered/total)" + gaps
node tools/adr-spec-rubric.js <spec.md> --json     # machine-readable { total, covered, percent, gaps }
```

It exits `0` only at 100%. Every gap names the section and the block that fell short.

## What it checks (derived from the template, never hard-coded)

- **Section presence** — every `required: true` section appears as a `## N. Title` heading.
- **Non-stub** — a present section has real content, not a placeholder.
- **List floors** — each required list (e.g. *Non-negotiable product decisions*) has at least its
  `items.floor` bullets.
- **Table floors** — each required table's header carries its named `columns`, with at least its
  `rows.floor` data rows.
- **Paragraph floors** — prose blocks meet their `paragraphs.floor`.
- **Fenced blocks** — `diagram`, `code`, and `statemachine` blocks are present.
- **Repeating sections** — Functional Requirements meets its `count.floor`, and each item carries its
  required sub-blocks (Acceptance criteria, Required verification).

## Floors and targets, never limits

A floor is a minimum: below it fails the rubric. A target is what to aim for. **Neither is a cap** —
when the source justifies more decisions, more requirements, or more risks, produce more. The scorer
never penalizes exceeding a target; it only fails a spec that falls *below a floor*.

## 100% is necessary, not sufficient

The scorer proves the shape is complete. It does not prove the content is right — that the decisions
fit the domain, that the evidence is real, that the invariants are named. So the bar is:

**rubric says 100% AND the user confirms the content is right.**

In YOLO mode there is no user in the loop, so the adversarial verify pass stands in for the rubric
check, and the run returns its score and open gaps for a human to confirm.
