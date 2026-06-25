# State schema — `.do/adr-spec/<slug>.state.json`

A `spec` run keeps its working state in one JSON file so it can resume across sessions. The file is
gitignored (`.do/` is in `.gitignore`); the committed artifact is the output spec, never the state.

`tools/adr-spec-state.js` owns reading and writing it:

- `emptyState(slug)` → a fresh state with sensible defaults.
- `writeState(file, state)` → atomic write; refuses to follow a symlink.
- `readState(file)` → the state, or `null` for a missing / oversized (> 256 KB) / symlinked / corrupt
  file (it never throws and never injects untrusted bytes — the same safety posture as the
  `do-compress` flag).

## The shape

```json
{
  "slug": "example-ide",
  "source": {
    "kind": "document | report | recon | unset",
    "path": "<path to the source doc/payload, or null>",
    "reportId": "<report id, or null>",
    "confidence": "low | medium | high | unknown"
  },
  "deliverable": "spec | catalog | both",
  "mode": "interactive | yolo",
  "sections": { "Executive Direction": "todo | draft | done", "...": "..." },
  "decisions": [
    { "id": "D-1", "question": "...", "chosen": "...", "rejected": ["..."], "why": "..." }
  ],
  "openQuestions": ["<anything still unresolved>"],
  "percent": 0,
  "draftPath": "<path to the working draft, or null>"
}
```

## Path and slug

- Slug: kebab-case of the product, plus subject when required — e.g. `example-ide`.
- Path: `.do/adr-spec/<slug>.state.json`, relative to the target repo root.
- Read it on start to resume; write it after each step so an interrupted run loses nothing.
