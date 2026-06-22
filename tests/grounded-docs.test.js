const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, cpSync, readFileSync, existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const SCAFFOLD = join(__dirname, "..", "lib", "grounded-docs-scaffold");

// Build a bespoke project: the CLI plus a source with the given source.toml and
// files (relpaths under the source dir). Returns { dir, srcDir }.
function project(sourceId, toml, files) {
  const dir = mkdtempSync(join(tmpdir(), "do-ad-"));
  cpSync(join(SCAFFOLD, "grounded-docs.mjs"), join(dir, "grounded-docs.mjs"));
  const srcDir = join(dir, "sources", sourceId);
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, "source.toml"), toml);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(srcDir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, srcDir };
}
function chunkIds(dir) {
  return readFileSync(join(dir, "manifests", "chunks.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).chunk_id);
}

// Copy the scaffold into a temp project, the way the grounded-docs skill installs it.
function install() {
  const dir = mkdtempSync(join(tmpdir(), "do-agentdocs-"));
  cpSync(join(SCAFFOLD, "grounded-docs.mjs"), join(dir, "grounded-docs.mjs"));
  cpSync(join(SCAFFOLD, "sources"), join(dir, "sources"), { recursive: true });
  return dir;
}
const run = (dir, args) => execFileSync("node", [join(dir, "grounded-docs.mjs"), ...args], { encoding: "utf8", cwd: dir });

test("grounded-docs: build indexes the example source into chunks.jsonl", () => {
  const dir = install();
  const out = run(dir, ["build"]);
  assert.match(out, /built \d+ chunk/);
  assert.ok(existsSync(join(dir, "manifests", "chunks.jsonl")));
});

test("grounded-docs: chunk records carry the citation contract (id, source_path, line range)", () => {
  const dir = install();
  run(dir, ["build"]);
  const lines = readFileSync(join(dir, "manifests", "chunks.jsonl"), "utf8").split("\n").filter(Boolean);
  assert.ok(lines.length >= 1);
  const c = JSON.parse(lines[0]);
  assert.match(c.chunk_id, /^example\/.+#\d{4}$/);
  assert.equal(typeof c.source_path, "string");
  assert.ok(Number.isInteger(c.line_start) && Number.isInteger(c.line_end));
  assert.ok(c.line_end >= c.line_start);
});

test("grounded-docs: build is deterministic (same bytes across runs)", () => {
  const dir = install();
  run(dir, ["build"]);
  const a = readFileSync(join(dir, "manifests", "chunks.jsonl"), "utf8");
  run(dir, ["build"]);
  const b = readFileSync(join(dir, "manifests", "chunks.jsonl"), "utf8");
  assert.equal(a, b);
});

test("grounded-docs: lookup --json returns a ranked hit for an on-topic query", () => {
  const dir = install();
  run(dir, ["build"]);
  const hits = JSON.parse(run(dir, ["lookup", "how does the starter index documents", "--json"]));
  assert.ok(Array.isArray(hits) && hits.length >= 1);
  assert.match(hits[0].chunk_id, /^example\//);
  assert.ok(hits[0].source_path.endsWith(".md"));
});

test("grounded-docs: cite prints the chunk with source metadata", () => {
  const dir = install();
  run(dir, ["build"]);
  const id = JSON.parse(run(dir, ["lookup", "citation discipline", "--json"]))[0].chunk_id;
  const out = run(dir, ["cite", id]);
  assert.match(out, new RegExp(id.replace(/[.*+?^${}()|[\]\\#/]/g, "\\$&")));
  assert.match(out, /source:/);
});

test("grounded-docs: lookup before build fails with guidance", () => {
  const dir = install();
  assert.throws(() => run(dir, ["lookup", "anything"]));
});

// ── Review-hardening: path containment, id uniqueness, root-level globs ────────

test("grounded-docs: refuses a source root that escapes the source directory (no traversal)", () => {
  const toml = '[source]\nid = "escape"\nname = "Escape"\n[ingest.docs]\nroots = ["../../outside"]\ninclude = ["**/*.md"]\n';
  const { dir, srcDir } = project("escape", toml, {});
  // Place the secret exactly where roots="../../outside" resolves to (<dir>/outside),
  // so the test fails if containment is broken.
  const outside = join(srcDir, "..", "..", "outside");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "secret.md"), "# Secret\n\ntop secret content\n");
  const r = spawnSync("node", [join(dir, "grounded-docs.mjs"), "build"], { encoding: "utf8", cwd: dir });
  assert.match((r.stdout || "") + (r.stderr || ""), /escapes its source directory/);
  const jsonl = existsSync(join(dir, "manifests", "chunks.jsonl")) ? readFileSync(join(dir, "manifests", "chunks.jsonl"), "utf8") : "";
  assert.ok(!/top secret content/.test(jsonl), "outside file must not be indexed");
});

test("grounded-docs: chunk ids are unique for paths that would collide under a slug", () => {
  const toml = '[source]\nid = "c"\nname = "Collide"\n[ingest.docs]\nroots = ["."]\ninclude = ["**/*.md"]\n';
  const { dir } = project("c", toml, { "foo/bar.md": "# A\n\nalpha\n", "foo-bar.md": "# B\n\nbeta\n" });
  run(dir, ["build"]);
  const ids = chunkIds(dir);
  assert.equal(ids.length, new Set(ids).size, "chunk ids must be unique");
  assert.ok(ids.includes("c/foo/bar.md#0001"));
  assert.ok(ids.includes("c/foo-bar.md#0001"));
});

test("grounded-docs: **/*.md matches a root-level file (roots = ['.'])", () => {
  const toml = '[source]\nid = "r"\nname = "Root"\n[ingest.docs]\nroots = ["."]\ninclude = ["**/*.md"]\n';
  const { dir } = project("r", toml, { "README.md": "# Root\n\nroot level content\n", "nested/note.md": "# N\n\nnested content\n" });
  run(dir, ["build"]);
  const ids = chunkIds(dir);
  assert.ok(ids.includes("r/README.md#0001"), "root-level README.md must be indexed");
  assert.ok(ids.includes("r/nested/note.md#0001"));
});
