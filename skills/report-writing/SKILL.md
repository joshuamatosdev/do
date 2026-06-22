---
name: report-writing
description: Author a deterministic engineering report — fill a JSON payload, then render it to a single self-contained HTML file with the DO report engine. Use when the user wants a delivery report, change report, security-audit report, incident report, or release report as a polished HTML artifact (not just Markdown), or says "write a report", "render a report", "build the delivery report", or "/report-writing". The engine owns all presentation; you supply only grounded data.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/report-engine/src/cli.js *)
---

# report-writing

Write a report as **data**, not as HTML. You fill a JSON payload; the DO report engine turns it into
a deterministic, single-file HTML report. You never write HTML, CSS, color, or layout — the engine
owns all of that. Your one job is grounded, well-structured data.

This pairs with the `do:docs` agent (which writes Markdown docs) — reach for the report engine when
the output must be a polished, self-contained HTML report with a fixed structure, evidence
discipline, and byte-for-byte reproducible output.

## The split that matters

- **You (author):** gather facts from git, tests, code, ADRs, and CI, then fill the payload.
- **The engine:** checks the payload against the schema and renders the HTML. It decides wording
  density, layout, ordering, severity display, anchors, and diagrams.

Every claim you write carries **evidence** — a `file:line`, a command, a commit SHA, an issue id, or
the exact word `unverified`. A claim with no evidence is not done. The schema bans presentation
fields (html/css/color/layout/order) so the data stays clean.

**Never put a secret in the payload.** Evidence is cited, not pasted. Never place a real key, token,
password, private key, connection string, or `.env` value in the payload or the rendered HTML — the
report is a self-contained file that travels. Mask the value (keep the name) and cite the `file:line`
instead of quoting the secret.

## Where the engine lives

```
${CLAUDE_SKILL_DIR}/scripts/report-engine/   (bundled with this skill)
  src/cli.js            the CLI (validate / render / golden-update)
  report.schema.json    the data contract you fill
  templates/styles.css  the default theme (override with --css)
  fixtures/             a worked sample payload + its golden hash
```

## How to use it

1. **Read the contract.** Open `${CLAUDE_SKILL_DIR}/scripts/report-engine/report.schema.json` and the worked example at
   `${CLAUDE_SKILL_DIR}/scripts/report-engine/fixtures/sample-report.json`. The sample shows every required field filled.

2. **Gather evidence first.** Run the commands, read the diff, read the tests. Do not write a claim
   you can not cite. If you have not verified something, mark it `unverified` — do not guess.

3. **Fill the payload.** Write a JSON file matching the schema. The twelve preset sections cover a
   delivery report: executive verdict, scope, change inventory, architecture impact, system impact,
   risk register, verification evidence, contract diffs, rollout/rollback, audience notes, open
   decisions, appendix.

4. **Check, then render.**
   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/report-engine/src/cli.js" validate <payload.json>
   node "${CLAUDE_SKILL_DIR}/scripts/report-engine/src/cli.js" render <payload.json> --out out/report.html
   ```
   Validation fails closed: fix every error before rendering.

## Data-driven settings

- **Audiences** are open. `meta.audiences` is any list of names; `audienceNotes` is a list of
  `{ audience, notes }`. Write for the reader you have — not a fixed three.
- **Sections** you can pick. Leave out `meta.sections` for the full preset, or set it to the ordered
  list of section ids you want. The appendix always renders last.
- **Custom sections** let you add what the preset does not cover: put `{ title, lens, items }`
  entries in `customSections`. They render just before the appendix.
- **Theme** you can replace. Pass `--css <file.css>` to render with your own theme; the default
  theme ships in `templates/`.

## Why deterministic

The engine uses no wall-clock and no random source. The same payload, with the same render inputs,
always renders the same bytes,
so a report can be hashed, diffed, and trusted as an audit artifact. The date in the report comes
from `meta.generatedAt` in the payload — you set it, never the engine. A golden-hash test guards the
engine against output drift by accident.

## Report kinds

Set `meta.reportKind` for the line under the title (e.g. "Security Audit", "Incident Report", "Release Report").
The same engine renders any of them; the kind plus the sections you select shape the report.
