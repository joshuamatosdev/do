# grounded-docs — starter scaffold

Hand-picked, indexed, citation-ready documentation for AI agents working in a project.
This is the **scaffolding** for a documentation lookup that grounds answers in pinned sources:
every lookup traces back to a source path and line range, so an answer can cite exactly where a
claim came from.

The starter is **zero-dependency** — Node standard library only — and does **lexical** search. It
works from zero. When you need semantic search, the chunks it builds are the hand-off point (see
"Adding embeddings").

## Folder map

```
grounded-docs/
  grounded-docs.mjs          the starter CLI (build / lookup / cite / grep / sources)
  source.toml.template    copy to sources/<id>/source.toml per source
  sources/                one directory per source: its source.toml + its docs
  manifests/chunks.jsonl  built index (one JSON record per chunk) — derived, gitignored
  README.md               this file
```

## Quickstart

```bash
# from the grounded-docs/ directory
node grounded-docs.mjs sources                       # list registered sources
node grounded-docs.mjs build                         # ingest sources -> manifests/chunks.jsonl
node grounded-docs.mjs lookup "your question" --top 5
node grounded-docs.mjs lookup "your question" --json # machine output for agents
node grounded-docs.mjs cite <chunk_id>               # full chunk + metadata
node grounded-docs.mjs grep "<regex>" --source <id>  # lexical regex search
```

## Adding a source

1. `mkdir -p sources/<id>` and copy `source.toml.template` to `sources/<id>/source.toml`.
2. Fill in `[source]` (id, name, purpose) and pin `[ref]` (the exact version you indexed).
3. Put the documents under the roots named in `[ingest.*]` (the starter indexes `.md`,
   `.markdown`, `.txt`).
4. Run `node grounded-docs.mjs build`, then `lookup`.

Pin every source to an exact version and record the `commit_sha`. Pinning is what makes a citation
reproducible: the same source state always yields the same chunk and line range.

## The citation contract

- **chunk_id** — `<source_id>/<source_path>#<NNNN>`, stable and easy to read. The path is the
  source-relative file path (so it is unique per file); `NNNN` is the chunk's order within that file.
- Every chunk record keeps `source_path` and `line_start`/`line_end`. A grounded answer cites the
  chunk id and that path range. If a claim has no chunk to cite, it is not grounded — say so rather
  than guess.
- Chunking is **fence-aware**: a fenced code block is never split, so code stays valid in a chunk.

## Adding embeddings (the upgrade path)

The lexical starter ranks by word match (BM25-lite). That is enough for many projects and needs
nothing installed. To add semantic search:

1. Keep `manifests/chunks.jsonl` as the source of truth — it already holds the chunk text and
   citation metadata. An embedding step reads it; it does not replace it.
2. Choose an embedding model and a vector store. Two common shapes:
   - **In-process (stays in this project's stack):** a JavaScript embedding library plus an
     in-memory or on-disk vector index. A bigger install; no separate service.
   - **Sidecar (a separate tool):** a small service that embeds the chunks and answers
     nearest-match queries; this CLI calls it and merges its hits with the lexical hits.
3. Record the model and index backend in each `source.toml` `[embed]` / `[index]` block so the
   semantic build is reproducible too.
4. Keep the same CLI contract (`lookup` / `cite`) so callers do not change — only the ranking
   behind `lookup` gets smarter.

This scaffold stops at lexical search on purpose, so it has zero dependencies. The embeddings layer
is yours to add to your project, guided by the `grounded-docs` skill.

## Out of scope

- Not a code search tool — use your editor's grep/glob for working code.
- Not real-time — sources are pinned to exact versions and built again on demand.
- Not a substitute for the upstream — when precision matters, open the cited `source_path:line`.
