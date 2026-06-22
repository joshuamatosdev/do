#!/usr/bin/env node
// DO grounded-docs starter — a zero-dependency lexical documentation index.
// Node standard library only. Ported from the grounded-docs pipeline pattern:
// pinned sources, deterministic chunking, citation-ready lookups.
//
// The starter does LEXICAL search (BM25-lite). It needs nothing installed and
// works from zero. To add semantic / embedding search, see README "Adding
// embeddings" — the chunks.jsonl manifest this builds is the hand-off point.
//
// Commands (run from the grounded-docs/ directory, or anywhere — paths resolve to
// this file's directory):
//   build                       ingest sources -> manifests/chunks.jsonl
//   lookup "<query>" [--top N] [--json]   rank chunks for a query
//   cite <chunk_id>             print one chunk with full metadata
//   grep <regex> [--source ID]  regex search over chunk text
//   sources                     list registered sources

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SOURCES_DIR = join(HERE, "sources");
const MANIFESTS_DIR = join(HERE, "manifests");
const CHUNKS_PATH = join(MANIFESTS_DIR, "chunks.jsonl");
const CHUNKER_VERSION = "starter-1";
const TARGET_CHARS = 1500; // ~ a few hundred tokens per chunk

// ── Minimal TOML-subset reader ────────────────────────────────────────────────
// Handles [section], [a.b] nesting, key = "string" | number | bool, and
// key = ["a", "b"] string arrays. Enough for source.toml; not a full parser.
function parseToml(text) {
  const root = {};
  let section = root;
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim(); // strip trailing comments
    if (!line || line.startsWith("#")) continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      section = root;
      for (const part of sec[1].split(".")) {
        section[part] = section[part] || {};
        section = section[part];
      }
      continue;
    }
    const kv = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (kv) section[kv[1]] = parseVal(kv[2]);
  }
  return root;
}
function parseVal(s) {
  s = s.trim();
  if (s.startsWith("[")) {
    return s.replace(/^\[|\]$/g, "").split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  if (s === "true" || s === "false") return s === "true";
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  return s.replace(/^["']|["']$/g, "");
}

// ── Source registry ───────────────────────────────────────────────────────────
function listSources() {
  if (!existsSync(SOURCES_DIR)) return [];
  return readdirSync(SOURCES_DIR).sort().flatMap((id) => {
    const tomlPath = join(SOURCES_DIR, id, "source.toml");
    if (!existsSync(tomlPath)) return [];
    const cfg = parseToml(readFileSync(tomlPath, "utf8"));
    return [{ id, dir: join(SOURCES_DIR, id), cfg }];
  });
}

// ── Deterministic file walk ───────────────────────────────────────────────────
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Translate a simple glob to a RegExp. `*` matches within one path segment;
// `**/` matches zero or more directories (so `**/*.md` also matches a root file);
// `**` matches anything.
function globToRe(p) {
  const SLASH = "\\u0000A", STAR = "\\u0000B";
  let re = p.replace(/[.+^${}()|[\]\\]/g, "\\$&"); // escape regex specials (not * or /)
  re = re.replace(/\*\*\//g, SLASH).replace(/\*\*/g, STAR).replace(/\*/g, "[^/]*");
  re = re.split(SLASH).join("(?:.*/)?").split(STAR).join(".*");
  return new RegExp("^" + re + "$");
}
function matchesGlob(rel, patterns) {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some((p) => globToRe(p).test(rel));
}

// True if `child` is inside `parent` (or is `parent`). Blocks `roots = ["../x"]`
// from indexing files outside the source directory.
function isInside(parent, child) {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(p + sep);
}

// ── Fence-aware chunker ───────────────────────────────────────────────────────
// Blocks are either a fenced code block (atomic) or a blank-line-separated
// paragraph. Blocks are packed into chunks up to TARGET_CHARS, never splitting a
// fence. Each chunk keeps its source line range for citation.
function blocksOf(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let buf = [];
  let start = 0;
  let inFence = false;
  const flush = (end) => {
    if (buf.join("").trim()) blocks.push({ text: buf.join("\n"), lineStart: start + 1, lineEnd: end });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFence = /^\s*```/.test(line);
    if (isFence) {
      if (!inFence) { flush(i); start = i; inFence = true; buf.push(line); }
      else { buf.push(line); flush(i + 1); inFence = false; }
      continue;
    }
    if (inFence) { buf.push(line); continue; }
    if (line.trim() === "") { flush(i); start = i + 1; }
    else { if (buf.length === 0) start = i; buf.push(line); }
  }
  flush(lines.length);
  return blocks;
}
function chunkFile(sourceId, relPath, text) {
  const blocks = blocksOf(text);
  const chunks = [];
  let cur = [];
  let curStart = null;
  let curEnd = null;
  let size = 0;
  let ordinal = 0;
  const emit = () => {
    if (cur.length === 0) return;
    ordinal += 1;
    // chunk_id uses the source-relative path verbatim (forward slashes) so it is
    // unique per file — no lossy slug that could collide foo/bar.md with foo-bar.md.
    chunks.push({
      chunk_id: `${sourceId}/${relPath}#${String(ordinal).padStart(4, "0")}`,
      source_id: sourceId,
      source_path: relPath,
      line_start: curStart,
      line_end: curEnd,
      text: cur.join("\n\n"),
      chunker_version: CHUNKER_VERSION,
    });
    cur = []; size = 0; curStart = null; curEnd = null;
  };
  for (const b of blocks) {
    if (size > 0 && size + b.text.length > TARGET_CHARS) emit();
    if (curStart === null) curStart = b.lineStart;
    curEnd = b.lineEnd;
    cur.push(b.text);
    size += b.text.length;
  }
  emit();
  return chunks;
}

// ── Build ─────────────────────────────────────────────────────────────────────
function build() {
  const sources = listSources();
  if (sources.length === 0) {
    console.error("no sources found under sources/. Add sources/<id>/source.toml and the docs to index.");
    process.exit(2);
  }
  const all = [];
  for (const s of sources) {
    const ingest = s.cfg.ingest || {};
    // Each [ingest.<name>] block: roots[], include[], exclude[].
    const blocks = Object.values(ingest).filter((v) => v && typeof v === "object");
    const specs = blocks.length ? blocks : [{ roots: ["."], include: ["**/*.md"], exclude: [] }];
    for (const spec of specs) {
      for (const root of spec.roots || ["."]) {
        const base = join(s.dir, root);
        if (!isInside(s.dir, base)) {
          console.error(`skip: source '${s.id}' root '${root}' escapes its source directory — refused.`);
          continue;
        }
        if (!existsSync(base)) continue;
        for (const file of walk(base)) {
          if (!isInside(s.dir, file)) continue; // belt and braces (e.g. symlinks)
          const rel = relative(s.dir, file).replace(/\\/g, "/");
          const ext = extname(file).toLowerCase();
          if (ext !== ".md" && ext !== ".markdown" && ext !== ".txt") continue;
          if (!matchesGlob(rel, spec.include)) continue;
          if ((spec.exclude || []).length && matchesGlob(rel, spec.exclude)) continue;
          const text = readFileSync(file, "utf8");
          all.push(...chunkFile(s.id, rel, text));
        }
      }
    }
  }
  mkdirSync(MANIFESTS_DIR, { recursive: true });
  const jsonl = all.map((c) => JSON.stringify(c)).join("\n") + (all.length ? "\n" : "");
  writeFileSync(CHUNKS_PATH, jsonl, "utf8");
  console.log(`built ${all.length} chunk(s) from ${sources.length} source(s) -> ${relative(HERE, CHUNKS_PATH).replace(/\\/g, "/")}`);
}

// ── Load chunks ───────────────────────────────────────────────────────────────
function loadChunks() {
  if (!existsSync(CHUNKS_PATH)) {
    console.error("no index yet — run `node grounded-docs.mjs build` first.");
    process.exit(2);
  }
  return readFileSync(CHUNKS_PATH, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const tokenize = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []);

// ── Lexical lookup (BM25-lite) ────────────────────────────────────────────────
function lookup(query, top, asJson) {
  const chunks = loadChunks();
  const qTerms = [...new Set(tokenize(query))];
  const N = chunks.length;
  const df = {};
  const docTokens = chunks.map((c) => tokenize(c.text));
  const avgLen = docTokens.reduce((a, t) => a + t.length, 0) / (N || 1);
  for (const terms of docTokens) for (const t of new Set(terms)) df[t] = (df[t] || 0) + 1;
  const k1 = 1.5, b = 0.75;
  const scored = chunks.map((c, i) => {
    const terms = docTokens[i];
    const len = terms.length || 1;
    const tf = {};
    for (const t of terms) tf[t] = (tf[t] || 0) + 1;
    let score = 0;
    for (const q of qTerms) {
      if (!tf[q]) continue;
      const idf = Math.log(1 + (N - df[q] + 0.5) / (df[q] + 0.5));
      score += idf * (tf[q] * (k1 + 1)) / (tf[q] + k1 * (1 - b + b * len / avgLen));
    }
    return { c, score };
  }).filter((x) => x.score > 0)
    .sort((a, b2) => b2.score - a.score || a.c.chunk_id.localeCompare(b2.c.chunk_id))
    .slice(0, top);

  if (asJson) {
    console.log(JSON.stringify(scored.map((x) => ({ chunk_id: x.c.chunk_id, score: Number(x.score.toFixed(4)), source_path: x.c.source_path, line_start: x.c.line_start, line_end: x.c.line_end })), null, 2));
    return;
  }
  if (scored.length === 0) { console.log("no matches."); return; }
  for (const { c, score } of scored) {
    const snip = c.text.replace(/\s+/g, " ").slice(0, 200);
    console.log(`${c.chunk_id}  [${score.toFixed(3)}]  ${c.source_path}:${c.line_start}-${c.line_end}`);
    console.log(`  ${snip}${c.text.length > 200 ? "…" : ""}\n`);
  }
}

function cite(chunkId) {
  if (!chunkId) { console.error("cite requires a <chunk_id> argument"); process.exit(2); }
  const c = loadChunks().find((x) => x.chunk_id === chunkId);
  if (!c) { console.error(`no chunk: ${chunkId}`); process.exit(1); }
  console.log(`# ${c.chunk_id}`);
  console.log(`source: ${c.source_path}:${c.line_start}-${c.line_end}  (source_id: ${c.source_id}, chunker: ${c.chunker_version})\n`);
  console.log(c.text);
}

function grepCmd(pattern, sourceId) {
  if (!pattern) { console.error("grep requires a <regex> argument"); process.exit(2); }
  let re;
  try { re = new RegExp(pattern, "i"); } catch (e) { console.error(`bad regex: ${e.message}`); process.exit(2); }
  const hits = loadChunks().filter((c) => (!sourceId || c.source_id === sourceId) && re.test(c.text));
  for (const c of hits) console.log(`${c.chunk_id}  ${c.source_path}:${c.line_start}-${c.line_end}`);
  if (hits.length === 0) console.log("no matches.");
}

function sourcesCmd() {
  const sources = listSources();
  if (sources.length === 0) { console.log("no sources registered. Add sources/<id>/source.toml."); return; }
  for (const s of sources) {
    const src = s.cfg.source || {};
    const ref = s.cfg.ref || {};
    console.log(`${s.id}  ${src.name || ""}  ${ref.commit_sha ? "@ " + ref.commit_sha.slice(0, 10) : ""}`);
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : null; };

if (cmd === "build") build();
else if (cmd === "lookup") lookup(rest[0] || "", Number(flag("--top")) || 5, process.argv.includes("--json"));
else if (cmd === "cite") cite(rest[0]);
else if (cmd === "grep") grepCmd(rest[0], flag("--source"));
else if (cmd === "sources") sourcesCmd();
else {
  console.error("usage: node grounded-docs.mjs <build|lookup|cite|grep|sources> [args]");
  process.exit(2);
}
