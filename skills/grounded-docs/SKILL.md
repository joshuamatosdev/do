---
name: grounded-docs
description: Stand up a grounded-docs index in a project from zero — install the scaffold, register sources, build a citation-ready lexical index, and run lookups. Works in a blank or an existing codebase. Teaches the citation contract and the upgrade path to embeddings/semantic search. Use when the user wants agents to answer from pinned documentation with traceable citations, says "set up agent docs", "ground answers in our docs", "build a doc index", "add doc search", or "/grounded-docs".
---

# grounded-docs

Set up a documentation lookup that grounds agent answers in pinned sources — every answer can cite a
source path and line range. You install a small scaffold into the project, register sources, build a
**lexical** index (zero dependencies, Node standard library only), and run lookups. When the project
needs semantic search, you guide adding embeddings on top of the same index.

This skill is the **installer and teacher**. The scaffold it installs lives in the plugin at
`lib/grounded-docs-scaffold/`.

## When to use it

- An agent keeps answering from memory and getting versioned details wrong — ground it in pinned docs.
- The project depends on external docs (a framework, a spec, a standard) and answers must cite the
  exact source and line.
- You want reproducible citations: pin the source version, and the same lookup always cites the same
  place.

Do not use it as a code search tool (use grep/glob for working code), and not for real-time docs
(sources are pinned and built again on demand).

## Install — from zero, blank or existing codebase

1. **Pick a home.** Default to `grounded-docs/` at the project root (the canonical name; `do` also
   recognizes the legacy `agent-docs/`). An existing project can use any path; keep it out of the
   build output, and if non-default, record it in `.claude/do.config.json`.

2. **Copy the scaffold** from the plugin into that directory:
   - `grounded-docs.mjs` (the CLI), `source.toml.template`, `README.md`, the `.gitignore`.
   - You may copy the `sources/example/` demo to confirm it runs, then delete it.

3. **Confirm it runs** before adding real sources:
   ```bash
   cd grounded-docs
   node grounded-docs.mjs build
   node grounded-docs.mjs lookup "anything in the example doc" --top 3
   ```
   If the example returns a hit with a `chunk_id` and a `source_path:line` range, the install works.

4. **Register the real sources** (replace the example):
   - `mkdir -p sources/<id>` and copy `source.toml.template` → `sources/<id>/source.toml`.
   - Fill `[source]` (id, name, purpose) and pin `[ref]` to the exact version + `commit_sha`.
   - Put the docs under the roots named in `[ingest.*]` (the starter indexes `.md`/`.markdown`/`.txt`).

5. **Build and verify:**
   ```bash
   node grounded-docs.mjs build
   node grounded-docs.mjs sources
   node grounded-docs.mjs lookup "<a question the source should answer>" --top 5
   ```

6. **Commit the right things.** Commit the CLI, the `source.toml` files, and the docs you own. The
   `.gitignore` already excludes the derived `manifests/chunks.jsonl`, `index/`, and any cloned
   upstream repos under `sources/*/repo/`. Build again on demand; do not commit the build.

## Using it

- `lookup "<query>" [--top N] [--json]` — rank chunks for a query. `--json` for agent consumption.
- `cite <chunk_id>` — print one chunk with its full source metadata.
- `grep "<regex>" [--source <id>]` — lexical regex search over chunk text.
- `sources` — list registered sources and their pinned versions.

## The citation contract — teach this to every caller

- A grounded answer cites a **chunk_id** plus its **source_path:line range**. No citation → not
  grounded; say so rather than guess.
- chunk_id is `<source_id>/<source_path>#<NNNN>` — unique per file, stable across builds for the same source version.
- Pin sources to exact versions. Pinning is what makes a citation reproducible.
- **Never index or cite a secret.** Screen every source before indexing for real secrets (keys,
  tokens, passwords, private keys, `.env` values). Reject a secret-bearing source, or mask the secret
  first — the index and every citation get shared, so a secret in a chunk leaks widely.

## Finishing the install: adding embeddings / semantic search

The starter does lexical (word-match) ranking and needs nothing installed — that is the from-zero
baseline. When the project needs semantic search, upgrade on top of the same `chunks.jsonl`:

1. Keep `manifests/chunks.jsonl` as the source of truth — it already holds chunk text + citation
   metadata. Embedding reads it; it does not replace it.
2. Choose a model and a vector store. Two shapes:
   - **In-process:** a JavaScript embedding library + an on-disk/in-memory vector index. No separate
     service; a bigger install in the project's own stack.
   - **Sidecar:** a small service that embeds the chunks and answers nearest-match queries; the
     CLI calls it and merges its hits with the lexical hits.
3. Record the model + index backend in each `source.toml` `[embed]`/`[index]` block so the semantic
   build is reproducible.
4. Keep the same `lookup`/`cite` contract — only the ranking behind `lookup` changes. Callers and the
   citation discipline stay the same.

These dependencies belong to the **target project**, not to this plugin — the plugin stays
dependency-free. The scaffold README's "Adding embeddings" section is the in-repo reference.
