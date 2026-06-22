# DO report engine

A deterministic compiler from a JSON report payload to a single self-contained HTML file.
The engine owns **all** presentation; the report author supplies **data only**.

- **Zero outside packages** — Node standard library only (`fs`, `path`, `crypto`, `url`).
- **Deterministic** — no wall-clock, no random source. Same payload + same render inputs (theme,
  engine version) → same bytes. A golden-hash test guards against output drift.
- **Data-driven** — audiences, sections, and theme are all set by the payload or a flag.

The authoring guide is the `report-writing` skill. This README is the engine reference.

## Commands

```bash
node src/cli.js validate <payload.json>                          # validate only; exit 1 on error
node src/cli.js render   <payload.json> --out out/report.html    # validate + render
node src/cli.js render   <payload.json> --css my-theme.css       # render with a custom theme
node src/cli.js golden-update                                    # re-baseline the fixture hash
```

Exit codes: `0` ok, `1` validation failed, `2` usage/IO error.

## The contract

`report.schema.json` is the full data contract. It bans presentation fields
(html/css/colour/layout/order) so the data stays clean. Highlights:

- `meta.audiences` — open list of audience names (any string).
- `meta.sections` — optional ordered list of preset section ids to render; leave out for the full preset.
  `appendix` always renders last.
- `meta.reportKind` — the line under the title (e.g. "Security Audit"); defaults to "Engineering Delivery Report".
- `meta.lenses` — optional map from a section id to the lens label shown on it; sections default to the preset's labels.
- `audienceNotes` — a list of `{ audience, notes[] }`; any audience name works.
- `customSections` — one-off `{ title, lens, items[] }` sections, rendered before the appendix.
- every claim carries `evidence` — a `file:line`, command, commit SHA, issue id, or `unverified`.

A worked example is in `fixtures/sample-report.json`.

## Determinism

`canonicalize.js` sorts object keys and makes line endings the same before render, so key order and
editor line endings never change the output. The date comes from `meta.generatedAt` in the payload,
never from the engine clock. The golden test (`tests/report-engine.test.js`) renders the fixture
twice and checks both the determinism and the committed hash.

## Validation

`validate.js` is a small, dependency-free JSON Schema validator covering exactly the part of JSON
Schema the schema uses (`type`, `required`, `properties`, `additionalProperties`, `items`, `enum`,
`$ref`, `minLength`, `minItems`, `minimum`, `maximum`, `date-time`). If the schema ever grows past
this part, swap in a pinned validator — the engine/author contract does not change.
