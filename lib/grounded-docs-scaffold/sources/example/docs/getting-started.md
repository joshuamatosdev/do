# Getting started

This is an example document so the grounded-docs starter has something to index.
Replace this source with your own once you have confirmed `build` and `lookup` work.

## What the starter does

The starter reads the documents under each registered source, splits them into
chunks, and writes one record per chunk to `manifests/chunks.jsonl`. Each chunk
keeps the source path and line range so an answer can cite exactly where a claim
came from.

## Running a lookup

Build the index, then search it:

```bash
node grounded-docs.mjs build
node grounded-docs.mjs lookup "how does the starter index documents" --top 3
node grounded-docs.mjs cite example/docs/getting-started.md#0001
```

## Citation discipline

A grounded answer points to a chunk id and its source path and line range. If a
claim has no chunk to cite, it is not grounded — say so rather than guess.
